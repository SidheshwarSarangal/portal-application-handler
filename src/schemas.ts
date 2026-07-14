import { z } from "zod";
import { PortalHandlerError } from "./errors";
import type { BrowserSessionArtifact, PortalHandlerInput, ResourceResponse, ResumeInput } from "./types";

function assertSize(value: unknown, maximum: number): void {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > maximum) throw new Error("oversized");
  } catch {
    throw new PortalHandlerError("INVALID_INPUT", "Input is not safely serializable or exceeds its size limit.");
  }
}

const storageState = z.object({
  cookies: z.array(z.record(z.string(), z.unknown())).max(500),
  origins: z.array(z.object({
    origin: z.string().url(),
    localStorage: z.array(z.object({ name: z.string().max(1024), value: z.string().max(64 * 1024) })).max(500)
  })).max(50)
});

const session = z.object({
  artifactVersion: z.literal(1),
  artifactId: z.string().uuid(),
  kind: z.literal("browser_session"),
  providerId: z.string().min(1).max(128),
  accountId: z.string().max(256).optional(),
  status: z.literal("connected"),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  storageState
});

const startSchema = z.object({
  runId: z.string().uuid().optional(),
  applicationLink: z.string().url().max(4096),
  sessions: z.record(z.string(), session).optional(),
  availableData: z.record(z.string(), z.unknown()).optional(),
  files: z.object({ resumePath: z.string().max(4096).optional(), coverLetterPath: z.string().max(4096).optional() }).optional(),
  policy: z.object({
    autoSubmit: z.boolean().optional(),
    reviewBeforeSubmit: z.boolean().optional(),
    trustedPlatforms: z.array(z.string().max(128)).max(30).optional(),
    minimumConfidence: z.number().min(0).max(1).optional(),
    allowSensitiveStoredValues: z.boolean().optional(),
    captureEvidence: z.enum(["never", "review", "failure"]).optional()
  }).optional(),
  limits: z.record(z.string(), z.number()).optional(),
  signal: z.custom<AbortSignal>((value) => value === undefined || value instanceof AbortSignal).optional()
});

const continuation = z.object({
  version: z.literal(1),
  runId: z.string().uuid(),
  runHandle: z.string().uuid(),
  provider: z.string().optional(),
  currentUrl: z.string().url(),
  stepIndex: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  redirects: z.number().int().nonnegative(),
  formFingerprint: z.string().optional(),
  pendingRequestId: z.string().uuid().optional(),
  actionIds: z.array(z.string()).max(200),
  leaseExpiresAt: z.string().datetime()
});

const response = z.object({
  version: z.literal(1),
  requestId: z.string().uuid(),
  runId: z.string().uuid(),
  status: z.enum(["resolved", "unavailable", "denied", "cancelled"]),
  source: z.enum(["run", "database", "session_runtime", "user"]).optional(),
  value: z.unknown().optional(),
  session: session.optional(),
  retention: z.enum(["run_only", "approved_profile_update", "do_not_store"]).optional()
});

const resumeSchema = z.object({
  continuation,
  response,
  signal: z.custom<AbortSignal>((value) => value === undefined || value instanceof AbortSignal).optional()
});

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PortalHandlerError("INVALID_INPUT", message);
  return result.data;
}

export function parseStart(value: unknown): PortalHandlerInput {
  assertSize(value, 5 * 1024 * 1024);
  return parse(startSchema as z.ZodType<PortalHandlerInput>, value, "Portal handler input is invalid.");
}

export function parseResume(value: unknown): ResumeInput {
  assertSize(value, 5 * 1024 * 1024);
  return parse(resumeSchema as z.ZodType<ResumeInput>, value, "Resume input is invalid.");
}

export function parseResourceResponse(value: unknown): ResourceResponse {
  assertSize(value, 5 * 1024 * 1024);
  return parse(response as z.ZodType<ResourceResponse>, value, "Resource response is invalid.");
}

export function parseSession(value: unknown): BrowserSessionArtifact {
  assertSize(value, 5 * 1024 * 1024);
  return parse(session as z.ZodType<BrowserSessionArtifact>, value, "Browser session artifact is invalid.");
}
