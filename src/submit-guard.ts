import type { SubmissionPolicy } from "./types";

export type SubmitDecision = Readonly<{ allowed: boolean; review: boolean; reason: string }>;

export function decideSubmit(input: Readonly<{
  policy: SubmissionPolicy;
  provider: string;
  confidence: number;
  hasSensitive: boolean;
  hasMissingRequired: boolean;
  approved: boolean;
}>): SubmitDecision {
  if (input.hasMissingRequired) return { allowed: false, review: false, reason: "Required fields are missing." };
  if (input.hasSensitive) return { allowed: false, review: true, reason: "Sensitive answers require review." };
  if (input.policy.reviewBeforeSubmit && !input.approved) return { allowed: false, review: true, reason: "Final review is required." };
  if (!input.approved && !input.policy.autoSubmit) return { allowed: false, review: true, reason: "Auto-submit is disabled." };
  if (!input.approved && !(input.policy.trustedPlatforms ?? []).includes(input.provider)) return { allowed: false, review: true, reason: "Platform is not trusted for automatic submission." };
  if (input.confidence < (input.policy.minimumConfidence ?? 0.9)) return { allowed: false, review: true, reason: "Field confidence is below policy." };
  return { allowed: true, review: false, reason: "Submission policy passed." };
}
