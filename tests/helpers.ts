import { createHash } from "node:crypto";
import type {
  ActionSnapshot, BrowserDriver, BrowserRuntime, BrowserStorageState, FieldSnapshot,
  PagePort, PageSnapshot
} from "../src";

type FakeState = "login" | "job" | "form" | "submitted" | "expired" | "already" | "captcha";

export class FakePage implements PagePort {
  private currentUrl = "about:blank";
  private state: FakeState;
  private email = "";
  constructor(state: FakeState) { this.state = state; }
  url(): string { return this.currentUrl; }
  async goto(url: string): Promise<void> { this.currentUrl = url; }
  async snapshot(): Promise<PageSnapshot> {
    const fields: FieldSnapshot[] = this.state === "login"
      ? [field("password", "Password", "password")]
      : this.state === "form"
        ? [{ ...field("email", "Email address", "email"), value: this.email }]
        : [];
    const actions: ActionSnapshot[] = this.state === "job"
      ? [action("apply", "Apply now", "button")]
      : this.state === "form"
        ? [action("submit", "Submit application", "submit")]
        : [];
    const text = {
      login: "Sign in to apply",
      job: "Software Engineer opportunity",
      form: "Application form",
      submitted: "Thank you for applying. Application submitted.",
      expired: "This job is expired and no longer accepting applications.",
      already: "You already applied to this job.",
      captcha: "Complete CAPTCHA"
    }[this.state];
    return {
      url: this.currentUrl,
      title: text,
      text,
      fields,
      actions,
      hasCaptcha: this.state === "captcha",
      hasOtp: false,
      fingerprint: createHash("sha256").update(`${this.currentUrl}|email`).digest("hex")
    };
  }
  async click(locator: string): Promise<void> {
    if (locator.includes("apply")) this.state = "form";
    else if (locator.includes("submit")) this.state = "submitted";
  }
  async fill(_locator: string, value: string): Promise<void> { this.email = value; }
  async select(): Promise<void> {}
  async check(): Promise<void> {}
  async upload(): Promise<void> {}
  async waitForSettled(): Promise<void> {}
}

function field(id: string, label: string, inputType: string): FieldSnapshot {
  return { id, locator: `[data-field=${id}]`, tag: "input", inputType, label, placeholder: "", name: id, required: true, disabled: false, value: "", checked: false, options: [] };
}
function action(id: string, text: string, kind: ActionSnapshot["kind"]): ActionSnapshot {
  return { id, locator: `[data-action=${id}]`, text, kind, disabled: false };
}

export class FakeDriver implements BrowserDriver {
  launches = 0;
  closes = 0;
  constructor(private readonly initial: FakeState = "job") {}
  async launch(options: Readonly<{ storageState?: BrowserStorageState }>): Promise<BrowserRuntime> {
    this.launches += 1;
    const state = options.storageState ? (this.initial === "login" ? "form" : this.initial) : this.initial;
    const page = new FakePage(state);
    return { page, close: async () => { this.closes += 1; } };
  }
}

export function session(provider = "fixture") {
  return {
    artifactVersion: 1 as const,
    artifactId: "32eddb41-56d2-4ce5-a021-a72aa2182f39",
    kind: "browser_session" as const,
    providerId: provider,
    status: "connected" as const,
    createdAt: "2026-07-14T00:00:00.000Z",
    storageState: { cookies: [], origins: [] }
  };
}

