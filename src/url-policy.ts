import { isIP } from "node:net";
import { PortalHandlerError } from "./errors";
import type { PlatformAdapter } from "./types";

function isPrivateIp(host: string): boolean {
  if (!isIP(host)) return false;
  if (host === "::1") return true;
  const values = host.split(".").map(Number);
  const a = values[0] ?? -1;
  const b = values[1] ?? -1;
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export function safeApplicationUrl(value: string, allowLoopback = false): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new PortalHandlerError("UNSAFE_URL", "Application URL is invalid."); }
  if (url.username || url.password) throw new PortalHandlerError("UNSAFE_URL", "URL credentials are forbidden.");
  const loopback = allowLoopback && url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !loopback) throw new PortalHandlerError("UNSAFE_URL", "Application URL must use HTTPS.");
  if (isPrivateIp(url.hostname) && !loopback) throw new PortalHandlerError("UNSAFE_URL", "Private-network URLs are forbidden.");
  return url;
}

export function adapterFor(url: URL, adapters: readonly PlatformAdapter[]): PlatformAdapter | undefined {
  return adapters.find((adapter) => adapter.canHandle(url));
}

export function safeDisplayUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|code|key|secret|session|auth|password/i.test(key)) url.searchParams.set(key, "[REDACTED]");
    }
    url.hash = "";
    return url.href;
  } catch { return "invalid:"; }
}
