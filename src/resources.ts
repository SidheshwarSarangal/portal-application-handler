import { randomUUID } from "node:crypto";
import { PortalHandlerError } from "./errors";
import type { ResourceRequest, ResourceResponse, Sensitivity } from "./types";

type RequestInput = Omit<ResourceRequest, "version" | "requestId" | "runId">;

export function createResourceRequest(runId: string, input: RequestInput): ResourceRequest {
  return Object.freeze({ version: 1, requestId: randomUUID(), runId, ...input });
}

export function assertResourceResponse(request: ResourceRequest, response: ResourceResponse): void {
  if (response.runId !== request.runId || response.requestId !== request.requestId) {
    throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Resource response does not match the pending request.");
  }
  if (response.status === "resolved") {
    if (!response.source) throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Resolved resource has no source.");
    if (request.kind === "session" && !response.session) {
      throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Session response does not contain a session.");
    }
    if (request.kind !== "session" && response.value === undefined) {
      throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Resolved resource has no value.");
    }
    if (!request.allowedSources.includes(response.source)) {
      throw new PortalHandlerError("RESOURCE_RESPONSE_INVALID", "Resource source is not allowed for this request.");
    }
  }
}

export function sourcesForSensitivity(sensitivity: Sensitivity): readonly ("run" | "database" | "user")[] {
  if (sensitivity === "legal" || sensitivity === "sensitive") return Object.freeze(["user"]);
  return Object.freeze(["run", "database", "user"]);
}

