import type { SafeError } from "./types";

export type HandlerErrorCode =
  | "INVALID_INPUT"
  | "UNSAFE_URL"
  | "UNSUPPORTED_PLATFORM"
  | "SESSION_MISSING"
  | "SESSION_EXPIRED"
  | "CAPTCHA_REQUIRED"
  | "OTP_REQUIRED"
  | "FORM_NOT_FOUND"
  | "UNKNOWN_REQUIRED_FIELD"
  | "UPLOAD_FAILED"
  | "SUBMIT_UNCONFIRMED"
  | "NAVIGATION_TIMEOUT"
  | "MAX_STEPS_REACHED"
  | "MAX_CLICKS_REACHED"
  | "MAX_REDIRECTS_REACHED"
  | "CONTINUATION_EXPIRED"
  | "RESOURCE_RESPONSE_INVALID"
  | "OPERATION_ABORTED"
  | "BROWSER_FAILED"
  | "INTERNAL_ERROR";

export class PortalHandlerError extends Error {
  constructor(
    readonly code: HandlerErrorCode,
    message: string,
    readonly retryable = false,
    options: { cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "PortalHandlerError";
  }

  safe(): SafeError {
    return Object.freeze({ code: this.code, message: this.message, retryable: this.retryable });
  }
}

export function safeError(error: unknown): SafeError {
  return error instanceof PortalHandlerError
    ? error.safe()
    : Object.freeze({
        code: "INTERNAL_ERROR",
        message: "The portal application operation could not be completed.",
        retryable: false
      });
}

