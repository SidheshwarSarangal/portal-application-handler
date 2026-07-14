import type { HandlerLimits } from "./types";

export const DEFAULT_LIMITS: HandlerLimits = Object.freeze({
  maxSteps: 20,
  maxRedirects: 8,
  maxClicks: 30,
  maxFieldsPerStep: 100,
  maxFileBytes: 10 * 1024 * 1024,
  timeoutMsPerStep: 20_000,
  totalTimeoutMs: 10 * 60_000,
  liveLeaseMs: 5 * 60_000
});

export function resolveLimits(value: Partial<HandlerLimits> = {}): HandlerLimits {
  const limits = { ...DEFAULT_LIMITS, ...value };
  for (const [key, amount] of Object.entries(limits)) {
    if (!Number.isFinite(amount) || amount <= 0) throw new TypeError(`${key} must be positive.`);
  }
  return Object.freeze(limits);
}

