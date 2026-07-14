import { randomUUID } from "node:crypto";
import { createDefaultAdapters } from "./adapters";
import { PlaywrightBrowserDriver } from "./browser";
import { PortalHandlerError, safeError } from "./errors";
import { FormEngine } from "./form-engine";
import { resolveLimits } from "./limits";
import { silentLogger } from "./logger";
import { assertResourceResponse, createResourceRequest } from "./resources";
import { RunStore, type ActiveRun } from "./run-store";
import { parseResume, parseSession, parseStart } from "./schemas";
import { adapterFor, safeApplicationUrl, safeDisplayUrl } from "./url-policy";
import type {
  BrowserRuntime, HandlerOptions, PageSnapshot, PlatformAdapter, PortalHandlerInput,
  PortalHandlerOutput, ResourceRequest, ResumeInput
} from "./types";

export class PortalApplicationHandler {
  private readonly driver;
  private readonly adapters: readonly PlatformAdapter[];
  private readonly logger;
  private readonly now;
  private readonly store;
  private readonly forms = new FormEngine();
  private readonly headless;
  private readonly allowLoopback;
  private readonly allowedFileRoots;

  constructor(options: HandlerOptions = {}) {
    this.driver = options.browserDriver ?? new PlaywrightBrowserDriver();
    this.adapters = options.adapters ?? createDefaultAdapters();
    this.logger = options.logger ?? silentLogger;
    this.now = options.now ?? (() => new Date());
    this.store = new RunStore(this.now);
    this.headless = options.headless ?? true;
    this.allowLoopback = options.allowLoopbackForTesting ?? false;
    this.allowedFileRoots = Object.freeze([...(options.allowedFileRoots ?? [])]);
  }

  async start(raw: PortalHandlerInput): Promise<PortalHandlerOutput> {
    let input: PortalHandlerInput;
    try { input = parseStart(raw); } catch (error) { return this.failure(inputRunId(raw), error); }
    const runId = input.runId ?? randomUUID();
    let activeRun: ActiveRun | undefined;
    try {
      const url = safeApplicationUrl(input.applicationLink, this.allowLoopback);
      const adapter = adapterFor(url, this.adapters);
      if (!adapter) return this.terminal(runId, "unsupported_platform", undefined, url.href, [], 0);
      const limits = resolveLimits(input.limits);
      const sessions = { ...(input.sessions ?? {}) };
      const session = Object.values(sessions).find((item) => item.providerId === adapter.provider);
      if (session) parseSession(session);
      const usableSession = session && this.sessionCurrent(session) ? session : undefined;
      const runtime = await this.launch(usableSession?.storageState, limits.timeoutMsPerStep);
      const run: ActiveRun = {
        runId, handle: randomUUID(), runtime, adapter, activeSessionProvider: usableSession ? adapter.provider : undefined, sessions,
        data: { ...(input.availableData ?? {}) }, directValues: new Map(), approvedFieldIds: new Set(),
        files: { ...(input.files ?? {}) }, policy: { autoSubmit: false, captureEvidence: "never", ...(input.policy ?? {}) },
        limits, startedAt: this.now().getTime(), leaseExpiresAt: 0, stepIndex: 0, clicks: 0, redirects: 0,
        lastHost: url.hostname, actionIds: new Set(), filled: [], submitApproved: false
      };
      activeRun = run;
      this.store.add(run);
      await runtime.page.goto(url.href, limits.timeoutMsPerStep);
      return await this.drive(run, input.signal);
    } catch (error) {
      if (activeRun) await this.store.remove(activeRun.handle);
      return this.failure(runId, error);
    }
  }

  async resume(raw: ResumeInput): Promise<PortalHandlerOutput> {
    let input: ResumeInput;
    try { input = parseResume(raw); } catch (error) { return this.failure(inputRunId(raw), error); }
    const run = this.store.get(input.continuation.runHandle);
    if (!run || run.runId !== input.continuation.runId) return this.failure(input.continuation.runId, new PortalHandlerError("CONTINUATION_EXPIRED", "Live continuation expired; restart from the durable checkpoint.", true));
    try {
      if (!run.pending) throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Run has no pending resource request.");
      assertResourceResponse(run.pending, input.response);
      if (input.response.status !== "resolved") {
        await this.store.remove(run.handle);
        return this.failure(run.runId, new PortalHandlerError("RESOURCE_RESPONSE_INVALID", `Resource resolution ended as ${input.response.status}.`));
      }
      const request = run.pending;
      delete run.pending;
      if (request.kind === "session" && input.response.session) {
        const session = parseSession(input.response.session);
        if (session.providerId !== request.provider) throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Session provider does not match the request.");
        if (!this.sessionCurrent(session)) throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Resolved session is already expired.");
        run.sessions[session.providerId] = session;
        const currentUrl = run.runtime.page.url();
        await run.runtime.close();
        run.runtime = await this.launch(session.storageState, run.limits.timeoutMsPerStep);
        run.activeSessionProvider = session.providerId;
        await run.runtime.page.goto(currentUrl, run.limits.timeoutMsPerStep);
      } else if (request.kind === "field_value" || request.kind === "file") {
        if (!request.fieldId) throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Field response has no field binding.");
        run.directValues.set(request.fieldId, input.response.value);
      } else if (request.kind === "review") {
        if (input.response.value !== true) throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Review was not approved.");
        if (request.fieldId) run.approvedFieldIds.add(request.fieldId);
      } else if (request.kind === "confirmation") {
        if (input.response.value !== true) throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Submission was not approved.");
        if (!run.fingerprint) throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Submission form fingerprint is missing.");
        run.submitApproved = true;
        run.approvedFingerprint = run.fingerprint;
      }
      this.store.touch(run);
      return await this.drive(run, input.signal);
    } catch (error) { await this.store.remove(run.handle); return this.failure(run.runId, error); }
  }

  async close(): Promise<void> { await this.store.closeAll(); }

  private async drive(run: ActiveRun, signal?: AbortSignal): Promise<PortalHandlerOutput> {
    while (true) {
      this.assertBudgets(run, signal);
      const snapshot = await run.runtime.page.snapshot(run.limits.maxFieldsPerStep);
      run.fingerprint = snapshot.fingerprint;
      const url = safeApplicationUrl(snapshot.url, this.allowLoopback);
      if (url.hostname !== run.lastHost) {
        run.redirects += 1;
        run.lastHost = url.hostname;
      }
      const adapter = adapterFor(url, this.adapters);
      if (!adapter) return await this.finish(run, "unsupported_platform", snapshot.url);
      if (adapter.provider !== run.adapter.provider) {
        run.adapter = adapter;
        const targetSession = run.sessions[adapter.provider];
        if (targetSession && this.sessionCurrent(targetSession) && run.activeSessionProvider !== adapter.provider) {
          const currentUrl = snapshot.url;
          await run.runtime.close();
          run.runtime = await this.launch(targetSession.storageState, run.limits.timeoutMsPerStep);
          run.activeSessionProvider = adapter.provider;
          await run.runtime.page.goto(currentUrl, run.limits.timeoutMsPerStep);
          continue;
        }
      }
      if (snapshot.hasCaptcha || snapshot.hasOtp) {
        return this.pause(run, createResourceRequest(run.runId, {
          kind: "manual_action", key: snapshot.hasCaptcha ? "captcha" : "otp",
          message: snapshot.hasCaptcha ? "Complete the CAPTCHA in the controlled browser." : "Complete the OTP verification in the controlled browser.",
          purpose: "Continue without bypassing a manual security challenge.", sensitivity: "legal",
          allowedSources: ["user"], cacheHint: "never", provider: adapter.provider, required: true
        }));
      }
      const decision = adapter.inspect(snapshot);
      this.logger.debug("portal.state", { runId: run.runId, provider: adapter.provider, state: decision.state });
      if (decision.state === "already_applied") return await this.finish(run, "already_applied", snapshot.url);
      if (decision.state === "job_expired") return await this.finish(run, "job_expired", snapshot.url);
      if (decision.state === "submitted") return await this.finish(run, "submitted", snapshot.url, { confirmationText: "Application submission was detected.", confirmationUrl: snapshot.url });
      if (decision.state === "login_required") return this.pause(run, this.sessionRequest(run, adapter.provider));
      if (decision.state === "unknown") throw new PortalHandlerError("FORM_NOT_FOUND", "The current portal step could not be understood safely.", true);
      if (decision.state === "job_page") {
        if (!decision.actionLocator) throw new PortalHandlerError("FORM_NOT_FOUND", "No safe apply action was found.", true);
        await this.clickOnce(run, decision.actionLocator, "apply");
        continue;
      }

      const form = await this.forms.process(run.runtime.page, snapshot, {
        runId: run.runId, provider: adapter.provider, data: run.data, directValues: run.directValues,
        approvedFieldIds: run.approvedFieldIds, files: run.files, policy: run.policy, limits: run.limits,
        submitApproved: run.submitApproved, allowedFileRoots: this.allowedFileRoots,
        ...(run.approvedFingerprint ? { approvedFingerprint: run.approvedFingerprint } : {})
      });
      if (form.type === "request") {
        run.filled.push(...form.filled);
        return this.pause(run, form.request, form.confidence);
      }
      run.filled.push(...form.filled);
      if (form.type === "stuck") throw new PortalHandlerError("FORM_NOT_FOUND", "No safe next or submit action was found.", true);
      await this.clickOnce(run, form.locator, form.action);
      run.stepIndex += 1;
      if (form.action === "submit") {
        const after = await run.runtime.page.snapshot(run.limits.maxFieldsPerStep);
        const state = run.adapter.inspect(after).state;
        return state === "submitted"
          ? await this.finish(run, "submitted", after.url, { confirmationText: "Application submission was detected.", confirmationUrl: after.url })
          : await this.finish(run, "submitted_unconfirmed", after.url);
      }
    }
  }

  private sessionRequest(run: ActiveRun, provider: string): ResourceRequest {
    const existing = run.sessions[provider];
    return createResourceRequest(run.runId, {
      kind: "session", key: `session.${provider}`, message: existing ? `${provider} session is expired or rejected.` : `${provider} session is required.`,
      purpose: "Open the application portal with the correct authenticated account.", sensitivity: "sensitive",
      allowedSources: ["session_runtime", "user"], cacheHint: "run_only", provider,
      ...(existing?.accountId ? { accountId: existing.accountId } : {}), required: true
    });
  }

  private pause(run: ActiveRun, request: ResourceRequest, confidence?: number): PortalHandlerOutput {
    run.pending = request;
    this.store.touch(run);
    return Object.freeze({
      version: 1, runId: run.runId, status: request.kind === "review" || request.kind === "confirmation" ? "review_required" : "needs_input",
      provider: run.adapter.provider, finalUrl: safeDisplayUrl(run.runtime.page.url()), stepsCompleted: run.stepIndex,
      ...(confidence !== undefined ? { confidence } : {}), filledFields: Object.freeze([...run.filled]),
      neededInput: request, continuation: this.store.continuation(run)
    });
  }

  private async clickOnce(run: ActiveRun, locator: string, purpose: string): Promise<void> {
    const actionId = `${run.stepIndex}:${purpose}:${run.fingerprint ?? "unknown"}`;
    if (run.actionIds.has(actionId)) throw new PortalHandlerError("FORM_NOT_FOUND", "The same portal action was requested twice.", true);
    run.actionIds.add(actionId);
    run.clicks += 1;
    await run.runtime.page.click(locator, run.limits.timeoutMsPerStep);
    await run.runtime.page.waitForSettled(run.limits.timeoutMsPerStep);
  }

  private assertBudgets(run: ActiveRun, signal?: AbortSignal): void {
    if (signal?.aborted) throw new PortalHandlerError("OPERATION_ABORTED", "Portal operation was cancelled.");
    if (run.stepIndex >= run.limits.maxSteps) throw new PortalHandlerError("MAX_STEPS_REACHED", "Maximum form steps reached.");
    if (run.clicks >= run.limits.maxClicks) throw new PortalHandlerError("MAX_CLICKS_REACHED", "Maximum clicks reached.");
    if (run.redirects > run.limits.maxRedirects) throw new PortalHandlerError("MAX_REDIRECTS_REACHED", "Maximum redirects reached.");
    if (this.now().getTime() - run.startedAt > run.limits.totalTimeoutMs) throw new PortalHandlerError("NAVIGATION_TIMEOUT", "Total application time limit reached.", true);
  }

  private async launch(storageState: import("./types").BrowserStorageState | undefined, timeoutMs: number): Promise<BrowserRuntime> {
    return this.driver.launch({
      ...(storageState ? { storageState } : {}), headless: this.headless, timeoutMs,
      allowedDomains: Object.freeze([...new Set(this.adapters.flatMap((adapter) => adapter.domains))]),
      ...(this.allowLoopback ? { allowLoopbackForTesting: true } : {})
    });
  }

  private sessionCurrent(session: import("./types").BrowserSessionArtifact): boolean {
    return !session.expiresAt || new Date(session.expiresAt).getTime() > this.now().getTime();
  }

  private async finish(run: ActiveRun, status: PortalHandlerOutput["status"], finalUrl: string, evidence?: PortalHandlerOutput["evidence"]): Promise<PortalHandlerOutput> {
    const output = this.terminal(run.runId, status, run.adapter.provider, finalUrl, run.filled, run.stepIndex, evidence);
    await this.store.remove(run.handle);
    return output;
  }

  private terminal(runId: string, status: PortalHandlerOutput["status"], provider: string | undefined, finalUrl: string | undefined, filled: PortalHandlerOutput["filledFields"], steps: number, evidence?: PortalHandlerOutput["evidence"]): PortalHandlerOutput {
    const safeEvidence = evidence ? Object.freeze({
      ...(evidence.confirmationText ? { confirmationText: evidence.confirmationText } : {}),
      ...(evidence.confirmationUrl ? { confirmationUrl: safeDisplayUrl(evidence.confirmationUrl) } : {})
    }) : undefined;
    return Object.freeze({ version: 1, runId, status, ...(provider ? { provider } : {}), ...(finalUrl ? { finalUrl: safeDisplayUrl(finalUrl) } : {}), stepsCompleted: steps, filledFields: Object.freeze([...filled]), ...(safeEvidence ? { evidence: safeEvidence } : {}) });
  }

  private failure(runId: string, error: unknown): PortalHandlerOutput {
    return Object.freeze({ version: 1, runId, status: error instanceof PortalHandlerError && error.code === "UNSUPPORTED_PLATFORM" ? "unsupported_platform" : "failed", stepsCompleted: 0, filledFields: [], error: safeError(error) });
  }
}

function inputRunId(value: unknown): string {
  if (value && typeof value === "object" && "runId" in value && typeof value.runId === "string") return value.runId;
  if (value && typeof value === "object" && "continuation" in value) {
    const continuation = value.continuation;
    if (continuation && typeof continuation === "object" && "runId" in continuation && typeof continuation.runId === "string") return continuation.runId;
  }
  return randomUUID();
}
