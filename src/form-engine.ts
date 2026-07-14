import { stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { mapField, unknownFieldKey } from "./field-mapper";
import { createResourceRequest, sourcesForSensitivity } from "./resources";
import { decideSubmit } from "./submit-guard";
import type {
  FieldSnapshot,
  FilledField,
  HandlerLimits,
  PagePort,
  PageSnapshot,
  ResourceRequest,
  SubmissionPolicy
} from "./types";

export type FormRunContext = {
  runId: string;
  provider: string;
  data: Record<string, unknown>;
  directValues: Map<string, unknown>;
  approvedFieldIds: Set<string>;
  files: { resumePath?: string; coverLetterPath?: string };
  policy: SubmissionPolicy;
  limits: HandlerLimits;
  submitApproved: boolean;
  approvedFingerprint?: string;
  allowedFileRoots: readonly string[];
};

export type FormStepResult =
  | Readonly<{ type: "request"; request: ResourceRequest; confidence: number; filled: readonly FilledField[] }>
  | Readonly<{ type: "action"; locator: string; action: "next" | "submit"; confidence: number; filled: readonly FilledField[] }>
  | Readonly<{ type: "stuck"; confidence: number; filled: readonly FilledField[] }>;

function requestForField(run: FormRunContext, field: FieldSnapshot, key: string, sensitivity: "ordinary" | "personal" | "sensitive" | "legal", review: boolean): ResourceRequest {
  return createResourceRequest(run.runId, {
    kind: review ? "review" : "field_value",
    key,
    message: review ? "A portal field requires explicit review." : "A required portal field needs a value.",
    purpose: "Complete the current job application field without guessing.",
    sensitivity,
    allowedSources: review || key.startsWith("unknown.") ? ["user"] : sourcesForSensitivity(sensitivity),
    cacheHint: sensitivity === "ordinary" ? "profile_candidate" : "never",
    provider: run.provider,
    fieldId: field.id,
    inputType: field.inputType,
    options: field.options,
    required: field.required
  });
}

async function approvedFile(path: string | undefined, maximum: number, roots: readonly string[]): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    const absolute = resolve(path);
    const allowed = roots.some((root) => {
      const relation = relative(resolve(root), absolute);
      return relation === "" || (!relation.startsWith("..") && !relation.includes(":") && !relation.startsWith("/"));
    });
    if (!allowed) return undefined;
    const info = await stat(absolute);
    return info.isFile() && info.size <= maximum ? absolute : undefined;
  } catch { return undefined; }
}

function action(snapshot: PageSnapshot, pattern: RegExp) {
  return snapshot.actions.find((item) => !item.disabled && pattern.test(item.text));
}

export class FormEngine {
  async process(page: PagePort, snapshot: PageSnapshot, run: FormRunContext): Promise<FormStepResult> {
    const filled: FilledField[] = [];
    const confidences: number[] = [];
    for (const field of snapshot.fields) {
      if (field.disabled || field.value || field.checked) continue;
      const mapping = mapField(field);
      const key = mapping.key ?? unknownFieldKey(field);
      const direct = run.directValues.get(field.id);
      const fileValue = mapping.key === "resumePath" ? run.files.resumePath : mapping.key === "coverLetter" ? run.files.coverLetterPath : undefined;
      const supplied = direct ?? (mapping.key ? run.data[mapping.key] : undefined) ?? fileValue;
      const isSensitive = mapping.sensitivity === "sensitive" || mapping.sensitivity === "legal";

      if (isSensitive && !run.approvedFieldIds.has(field.id) && !(run.policy.allowSensitiveStoredValues && supplied !== undefined)) {
        return { type: "request", request: requestForField(run, field, key, mapping.sensitivity, true), confidence: mapping.confidence, filled };
      }
      if (supplied === undefined || supplied === null || supplied === "") {
        if (!field.required) continue;
        return { type: "request", request: requestForField(run, field, key, mapping.sensitivity, !mapping.key && !run.approvedFieldIds.has(field.id)), confidence: mapping.confidence, filled };
      }

      if (field.inputType === "file") {
        const configured = mapping.key === "coverLetter" ? run.files.coverLetterPath : run.files.resumePath;
        const path = await approvedFile(typeof supplied === "string" ? supplied : configured, run.limits.maxFileBytes, run.allowedFileRoots);
        if (!path) return { type: "request", request: createResourceRequest(run.runId, {
          kind: "file", key: mapping.key ?? "approvedFile", message: "An approved file is required.",
          purpose: "Upload a validated file to the application.", sensitivity: "personal",
          allowedSources: ["run", "database", "user"], cacheHint: "run_only", provider: run.provider,
          fieldId: field.id, inputType: field.inputType, required: field.required
        }), confidence: mapping.confidence, filled };
        await page.upload(field.locator, path, run.limits.timeoutMsPerStep);
      } else if (field.tag === "select") {
        await page.select(field.locator, String(supplied), run.limits.timeoutMsPerStep);
      } else if (field.inputType === "checkbox" || field.inputType === "radio") {
        await page.check(field.locator, Boolean(supplied), run.limits.timeoutMsPerStep);
      } else {
        await page.fill(field.locator, String(supplied), run.limits.timeoutMsPerStep);
      }
      confidences.push(mapping.confidence || 1);
      filled.push(Object.freeze({
        fieldId: field.id,
        key,
        label: field.label.slice(0, 256),
        confidence: mapping.confidence || 1,
        source: direct !== undefined ? "resource_response" : mapping.key === "resumePath" || mapping.key === "coverLetter" ? "file" : "available_data"
      }));
    }

    const confidence = confidences.length ? Math.min(...confidences) : 1;
    const submit = action(snapshot, /^(submit|send application|apply|finish)( application)?$/i) ?? snapshot.actions.find((item) => item.kind === "submit");
    if (submit) {
      const decision = decideSubmit({
        policy: run.policy,
        provider: run.provider,
        confidence,
        hasSensitive: false,
        hasMissingRequired: false,
        approved: run.submitApproved && run.approvedFingerprint === snapshot.fingerprint
      });
      if (!decision.allowed) {
        return {
          type: "request",
          confidence,
          filled,
          request: createResourceRequest(run.runId, {
            kind: "confirmation", key: "finalSubmit", message: decision.reason,
            purpose: "Authorize one submission for the current verified form.", sensitivity: "legal",
            allowedSources: ["user"], cacheHint: "never", provider: run.provider, required: true
          })
        };
      }
      return { type: "action", locator: submit.locator, action: "submit", confidence, filled };
    }
    const next = action(snapshot, /^(next|continue|save and continue|review)( application)?$/i);
    return next
      ? { type: "action", locator: next.locator, action: "next", confidence, filled }
      : { type: "stuck", confidence, filled };
  }
}
