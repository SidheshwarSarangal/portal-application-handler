import { PortalApplicationHandler, type PortalHandlerOutput, type ResourceResponse } from "../src";

const handler = new PortalApplicationHandler({
  headless: false,
  allowedFileRoots: ["/app/approved-application-files"]
});

export async function applyThroughNodrica(applicationLink: string): Promise<PortalHandlerOutput> {
  let result = await handler.start({
    applicationLink,
    availableData: await nodrica.profile.applicationData(),
    sessions: await nodrica.sessions.availableArtifacts(),
    files: await nodrica.files.applicationFiles(),
    policy: { autoSubmit: false }
  });

  while ((result.status === "needs_input" || result.status === "review_required") && result.neededInput && result.continuation) {
    const response: ResourceResponse = await nodrica.resources.resolve(result.neededInput);
    result = await handler.resume({ continuation: result.continuation, response });
  }
  return result;
}

declare const nodrica: {
  profile: { applicationData(): Promise<Record<string, unknown>> };
  sessions: { availableArtifacts(): Promise<Record<string, import("../src").BrowserSessionArtifact>> };
  files: { applicationFiles(): Promise<{ resumePath?: string; coverLetterPath?: string }> };
  resources: { resolve(request: import("../src").ResourceRequest): Promise<ResourceResponse> };
};
