import { describe, expect, it } from "vitest";
import { ConfiguredPlatformAdapter, PortalApplicationHandler } from "../src";
import { FakeDriver, session } from "./helpers";

function adapter() {
  return new ConfiguredPlatformAdapter({
    provider: "fixture", version: "1", domains: ["jobs.test"], login: /sign in/i,
    alreadyApplied: /already applied/i, expired: /expired/i, submitted: /submitted/i,
    applyAction: /apply now/i
  });
}

describe("PortalApplicationHandler", () => {
  it("asks Nodrica for a session, resumes, asks for confirmation, and submits once", async () => {
    const driver = new FakeDriver("login");
    const handler = new PortalApplicationHandler({ browserDriver: driver, adapters: [adapter()] });
    const first = await handler.start({ applicationLink: "https://jobs.test/1", availableData: { email: "candidate@example.com" } });
    expect(first).toMatchObject({ status: "needs_input", neededInput: { kind: "session", provider: "fixture" } });
    if (!first.continuation || !first.neededInput) throw new Error("missing continuation");
    const second = await handler.resume({
      continuation: first.continuation,
      response: { version: 1, requestId: first.neededInput.requestId, runId: first.runId, status: "resolved", source: "session_runtime", session: session() }
    });
    expect(second).toMatchObject({ status: "review_required", neededInput: { kind: "confirmation" } });
    if (!second.continuation || !second.neededInput) throw new Error("missing submit continuation");
    const final = await handler.resume({
      continuation: second.continuation,
      response: { version: 1, requestId: second.neededInput.requestId, runId: second.runId, status: "resolved", source: "user", value: true }
    });
    expect(final).toMatchObject({ status: "submitted", provider: "fixture" });
    expect(final.filledFields).toHaveLength(1);
    expect(driver.launches).toBe(2);
    expect(driver.closes).toBe(2);
  });

  it("auto-submits only for an explicitly trusted provider", async () => {
    const driver = new FakeDriver("form");
    const handler = new PortalApplicationHandler({ browserDriver: driver, adapters: [adapter()] });
    const result = await handler.start({
      applicationLink: "https://jobs.test/1", sessions: { fixture: session() },
      availableData: { email: "candidate@example.com" },
      policy: { autoSubmit: true, trustedPlatforms: ["fixture"] }
    });
    expect(result.status).toBe("submitted");
    expect(driver.closes).toBe(1);
  });

  it("rejects unsupported domains before launching a browser", async () => {
    const driver = new FakeDriver();
    const handler = new PortalApplicationHandler({ browserDriver: driver, adapters: [adapter()] });
    const result = await handler.start({ applicationLink: "https://unknown.test/job" });
    expect(result.status).toBe("unsupported_platform");
    expect(driver.launches).toBe(0);
  });

  it("rejects stale or mismatched resource responses and cleans up", async () => {
    const driver = new FakeDriver("login");
    const handler = new PortalApplicationHandler({ browserDriver: driver, adapters: [adapter()] });
    const first = await handler.start({ applicationLink: "https://jobs.test/1" });
    if (!first.continuation || !first.neededInput) throw new Error("missing continuation");
    const result = await handler.resume({
      continuation: first.continuation,
      response: { version: 1, requestId: "32eddb41-56d2-4ce5-a021-a72aa2182f39", runId: first.runId, status: "resolved", source: "session_runtime", session: session() }
    });
    expect(result).toMatchObject({ status: "failed", error: { code: "RESOURCE_RESPONSE_INVALID" } });
    expect(driver.closes).toBe(1);
  });

  it("reports manual challenges without attempting a bypass", async () => {
    const driver = new FakeDriver("captcha");
    const handler = new PortalApplicationHandler({ browserDriver: driver, adapters: [adapter()] });
    const result = await handler.start({ applicationLink: "https://jobs.test/1" });
    expect(result).toMatchObject({ status: "needs_input", neededInput: { kind: "manual_action", key: "captcha", allowedSources: ["user"] } });
    await handler.close();
    expect(driver.closes).toBe(1);
  });

  it("expires live continuation leases and closes their browser", async () => {
    let now = new Date("2026-07-14T00:00:00.000Z");
    const driver = new FakeDriver("login");
    const handler = new PortalApplicationHandler({ browserDriver: driver, adapters: [adapter()], now: () => now });
    const first = await handler.start({ applicationLink: "https://jobs.test/1", limits: { liveLeaseMs: 10 } });
    if (!first.continuation || !first.neededInput) throw new Error("missing continuation");
    now = new Date("2026-07-14T00:00:01.000Z");
    const result = await handler.resume({
      continuation: first.continuation,
      response: { version: 1, requestId: first.neededInput.requestId, runId: first.runId, status: "resolved", source: "session_runtime", session: session() }
    });
    expect(result).toMatchObject({ status: "failed", error: { code: "CONTINUATION_EXPIRED" } });
    expect(driver.closes).toBe(1);
  });
});
