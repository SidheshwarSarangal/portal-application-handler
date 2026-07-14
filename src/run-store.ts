import type { BrowserRuntime, ContinuationState, FilledField, HandlerLimits, PlatformAdapter, ResourceRequest, SubmissionPolicy } from "./types";

export type ActiveRun = {
  runId: string;
  handle: string;
  runtime: BrowserRuntime;
  adapter: PlatformAdapter;
  activeSessionProvider: string | undefined;
  sessions: Record<string, import("./types").BrowserSessionArtifact>;
  data: Record<string, unknown>;
  directValues: Map<string, unknown>;
  approvedFieldIds: Set<string>;
  files: { resumePath?: string; coverLetterPath?: string };
  policy: SubmissionPolicy;
  limits: HandlerLimits;
  startedAt: number;
  leaseExpiresAt: number;
  stepIndex: number;
  clicks: number;
  redirects: number;
  lastHost: string;
  actionIds: Set<string>;
  filled: FilledField[];
  pending?: ResourceRequest;
  fingerprint?: string;
  submitApproved: boolean;
  approvedFingerprint?: string;
};

export class RunStore {
  private readonly runs = new Map<string, ActiveRun>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly now: () => Date) {}
  add(run: ActiveRun): void { this.runs.set(run.handle, run); this.touch(run); }
  get(handle: string): ActiveRun | undefined {
    const run = this.runs.get(handle);
    if (!run) return undefined;
    if (run.leaseExpiresAt <= this.now().getTime()) { void this.remove(handle); return undefined; }
    return run;
  }
  touch(run: ActiveRun): void {
    run.leaseExpiresAt = this.now().getTime() + run.limits.liveLeaseMs;
    const existing = this.timers.get(run.handle);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => void this.remove(run.handle), run.limits.liveLeaseMs);
    timer.unref();
    this.timers.set(run.handle, timer);
  }
  continuation(run: ActiveRun): ContinuationState {
    return Object.freeze({
      version: 1, runId: run.runId, runHandle: run.handle, provider: run.adapter.provider,
      currentUrl: importSafeUrl(run.runtime.page.url()), stepIndex: run.stepIndex, clicks: run.clicks,
      redirects: run.redirects, ...(run.fingerprint ? { formFingerprint: run.fingerprint } : {}),
      ...(run.pending ? { pendingRequestId: run.pending.requestId } : {}),
      actionIds: Object.freeze([...run.actionIds]), leaseExpiresAt: new Date(run.leaseExpiresAt).toISOString()
    });
  }
  async remove(handle: string): Promise<void> {
    const run = this.runs.get(handle);
    this.runs.delete(handle);
    const timer = this.timers.get(handle);
    if (timer) clearTimeout(timer);
    this.timers.delete(handle);
    await run?.runtime.close();
  }
  async closeAll(): Promise<void> { await Promise.all([...this.runs.keys()].map((key) => this.remove(key))); }
}

function importSafeUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) if (/token|code|key|secret|session|auth|password/i.test(key)) url.searchParams.set(key, "[REDACTED]");
    url.hash = "";
    return url.href;
  } catch { return "invalid:"; }
}
