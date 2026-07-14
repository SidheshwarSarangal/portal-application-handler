import type { ActionSnapshot, NavigationDecision, PageSnapshot, PlatformAdapter, PlatformState } from "../types";

export type AdapterConfig = Readonly<{
  provider: string;
  version: string;
  domains: readonly string[];
  login: RegExp;
  alreadyApplied: RegExp;
  expired: RegExp;
  submitted: RegExp;
  applyAction: RegExp;
}>;

function firstAction(actions: readonly ActionSnapshot[], pattern: RegExp): ActionSnapshot | undefined {
  return actions.find((action) => !action.disabled && pattern.test(action.text));
}

export class ConfiguredPlatformAdapter implements PlatformAdapter {
  readonly provider: string;
  readonly version: string;
  readonly domains: readonly string[];
  constructor(private readonly config: AdapterConfig) {
    this.provider = config.provider;
    this.version = config.version;
    this.domains = Object.freeze([...config.domains]);
  }
  canHandle(url: URL): boolean { return this.domains.includes(url.hostname.toLowerCase()); }
  inspect(snapshot: PageSnapshot): NavigationDecision {
    const state = this.detect(snapshot);
    if (state !== "job_page") return { state, reason: `${this.provider} page signal: ${state}.` };
    const action = firstAction(snapshot.actions, this.config.applyAction);
    return action
      ? { state, actionLocator: action.locator, reason: "Recognized application action." }
      : { state: "unknown", reason: "No safe application action was recognized." };
  }
  private detect(snapshot: PageSnapshot): PlatformState {
    const text = `${snapshot.title}\n${snapshot.text}`;
    if (this.config.alreadyApplied.test(text)) return "already_applied";
    if (this.config.expired.test(text)) return "job_expired";
    if (this.config.submitted.test(text)) return "submitted";
    if (this.config.login.test(text) && snapshot.fields.some((field) => /password|email|phone/i.test(`${field.inputType} ${field.label}`))) return "login_required";
    if (snapshot.fields.length > 0 && (snapshot.actions.some((action) => /submit|continue|next|save/i.test(action.text)) || snapshot.fields.some((field) => field.required))) return "form";
    return "job_page";
  }
}

