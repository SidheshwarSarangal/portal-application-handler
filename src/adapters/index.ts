import { ConfiguredPlatformAdapter, type AdapterConfig } from "./configured";
import type { PlatformAdapter } from "../types";

const common = {
  version: "2026.07.1",
  alreadyApplied: /already applied|application (?:has been )?submitted|you applied/i,
  expired: /job (?:is )?(?:expired|closed|unavailable)|no longer accepting|position has been filled/i,
  submitted: /application (?:was |has been )?submitted|thank you for applying|application received/i,
  login: /sign in|log in|login|required to apply/i,
  applyAction: /^(?:easy )?apply(?: now)?$|start application|continue application/i
} as const;

const configs: readonly AdapterConfig[] = [
  { ...common, provider: "naukri", domains: ["www.naukri.com", "naukri.com"] },
  { ...common, provider: "foundit", domains: ["www.foundit.in", "foundit.in", "www.foundit.com", "foundit.com"] },
  { ...common, provider: "internshala", domains: ["internshala.com", "www.internshala.com"] },
  { ...common, provider: "indeed", domains: ["www.indeed.com", "in.indeed.com", "www.indeed.co.in", "indeed.com"] },
  { ...common, provider: "glassdoor", domains: ["www.glassdoor.com", "glassdoor.com", "www.glassdoor.co.in"] }
];

export function createDefaultAdapters(): readonly PlatformAdapter[] {
  return Object.freeze(configs.map((config) => new ConfiguredPlatformAdapter(config)));
}

export { ConfiguredPlatformAdapter } from "./configured";
export type { AdapterConfig } from "./configured";

