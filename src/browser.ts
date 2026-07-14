import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { PortalHandlerError } from "./errors";
import type { BrowserDriver, BrowserRuntime, PagePort, PageSnapshot } from "./types";

export class PlaywrightBrowserDriver implements BrowserDriver {
  async launch(options: Parameters<BrowserDriver["launch"]>[0]): Promise<BrowserRuntime> {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: options.headless, timeout: options.timeoutMs, chromiumSandbox: true });
      try {
        const context = await browser.newContext({
          acceptDownloads: false,
          ...(options.storageState ? { storageState: options.storageState as never } : {})
        });
        context.setDefaultTimeout(options.timeoutMs);
        context.setDefaultNavigationTimeout(options.timeoutMs);
        const allowed = new Set(options.allowedDomains.map((domain) => domain.toLowerCase()));
        await context.route("**/*", async (route) => {
          const request = route.request();
          const value = request.url();
          if (value === "about:blank" || value.startsWith("data:") || value.startsWith("blob:")) return route.continue();
          try {
            const url = new URL(value);
            const loopback = options.allowLoopbackForTesting && url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
            const privateIp = isPrivateAddress(url.hostname);
            if ((url.protocol !== "https:" && !loopback) || (privateIp && !loopback)) {
              return route.abort("blockedbyclient");
            }
            if (request.isNavigationRequest() && !allowed.has(url.hostname.toLowerCase()) && !loopback) return route.abort("blockedbyclient");
            return route.continue();
          } catch {
            return route.abort("blockedbyclient");
          }
        });
        const page = await context.newPage();
        let closed = false;
        return {
          page: new PlaywrightPagePort(page),
          async close() {
            if (closed) return;
            closed = true;
            await context.close().catch(() => undefined);
            await browser.close().catch(() => undefined);
          }
        };
      } catch (error) {
        await browser.close().catch(() => undefined);
        throw error;
      }
    } catch (cause) {
      throw new PortalHandlerError("BROWSER_FAILED", "Controlled browser could not be started.", true, { cause });
    }
  }
}

function isPrivateAddress(host: string): boolean {
  if (host === "localhost" || host.endsWith(".local") || host === "::1") return true;
  const normalized = host.toLowerCase();
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
  if (!isIP(host)) return false;
  const parts = host.split(".").map(Number);
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

class PlaywrightPagePort implements PagePort {
  constructor(private readonly page: import("playwright").Page) {}
  url(): string { return this.page.url(); }
  async goto(url: string, timeoutMs: number): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  }
  async snapshot(maxFields: number): Promise<PageSnapshot> {
    const raw = await this.page.evaluate((maximum) => {
      const visible = (element: Element): boolean => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const fields = [...document.querySelectorAll("input,select,textarea")]
        .filter((element) => visible(element) && !(element instanceof HTMLInputElement && ["hidden", "submit", "button", "reset"].includes(element.type)))
        .slice(0, maximum)
        .map((element, index) => {
          const control = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          const id = `f${index}`;
          control.setAttribute("data-pah-field", id);
          const label = "labels" in control && control.labels?.length
            ? [...control.labels].map((item) => item.textContent ?? "").join(" ").trim()
            : control.getAttribute("aria-label") ?? control.closest("label")?.textContent?.trim() ?? "";
          return {
            id,
            locator: `[data-pah-field="${id}"]`,
            tag: control.tagName.toLowerCase() as "input" | "select" | "textarea",
            inputType: control instanceof HTMLInputElement ? control.type : control.tagName.toLowerCase(),
            label: label.slice(0, 512),
            placeholder: (control.getAttribute("placeholder") ?? "").slice(0, 512),
            name: (control.getAttribute("name") ?? control.id ?? "").slice(0, 512),
            required: control.required || control.getAttribute("aria-required") === "true",
            disabled: control.disabled,
            value: control.value.slice(0, 64 * 1024),
            checked: control instanceof HTMLInputElement ? control.checked : false,
            options: control instanceof HTMLSelectElement ? [...control.options].slice(0, 200).map((item) => (item.value || item.text).slice(0, 1024)) : []
          };
        });
      const actions = [...document.querySelectorAll("button,a,input[type=submit],input[type=button]")]
        .filter(visible)
        .slice(0, 100)
        .map((element, index) => {
          const id = `a${index}`;
          element.setAttribute("data-pah-action", id);
          const input = element instanceof HTMLInputElement ? element : undefined;
          return {
            id,
            locator: `[data-pah-action="${id}"]`,
            text: (input?.value ?? element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 512),
            kind: input?.type === "submit" || element.getAttribute("type") === "submit" ? "submit" as const : element.tagName === "A" ? "link" as const : "button" as const,
            disabled: element instanceof HTMLButtonElement || element instanceof HTMLInputElement ? element.disabled : false
          };
        });
      const text = (document.body?.innerText ?? "").slice(0, 100_000);
      return {
        url: location.href,
        title: document.title,
        text,
        fields,
        actions,
        hasCaptcha: /captcha|recaptcha|hcaptcha/i.test(text) || Boolean(document.querySelector("iframe[src*=captcha], [class*=captcha], [id*=captcha]")),
        hasOtp: /one[- ]time password|verification code|enter otp/i.test(text) || Boolean(document.querySelector("input[autocomplete=one-time-code]"))
      };
    }, maxFields);
    const fingerprint = createHash("sha256")
      .update(`${raw.url}|${raw.fields.map((field) => `${field.label}|${field.name}|${field.inputType}`).join(";")}`)
      .digest("hex");
    return Object.freeze({ ...raw, fingerprint });
  }
  async click(locator: string, timeoutMs: number): Promise<void> { await this.page.locator(locator).click({ timeout: timeoutMs }); }
  async fill(locator: string, value: string, timeoutMs: number): Promise<void> { await this.page.locator(locator).fill(value, { timeout: timeoutMs }); }
  async select(locator: string, value: string, timeoutMs: number): Promise<void> { await this.page.locator(locator).selectOption({ label: value }).catch(() => this.page.locator(locator).selectOption(value)); }
  async check(locator: string, checked: boolean, timeoutMs: number): Promise<void> { await this.page.locator(locator).setChecked(checked, { timeout: timeoutMs }); }
  async upload(locator: string, path: string, timeoutMs: number): Promise<void> { await this.page.locator(locator).setInputFiles(path, { timeout: timeoutMs }); }
  async waitForSettled(timeoutMs: number): Promise<void> {
    await this.page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
    await this.page.waitForTimeout(150);
  }
}
