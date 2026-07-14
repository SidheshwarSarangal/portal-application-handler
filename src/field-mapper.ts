import { createHash } from "node:crypto";
import type { FieldSnapshot, Sensitivity } from "./types";

export type CandidateKey =
  | "fullName" | "firstName" | "lastName" | "email" | "phone" | "currentCity"
  | "address" | "linkedinUrl" | "portfolioUrl" | "yearsExperience" | "currentCompany"
  | "currentTitle" | "expectedCompensation" | "noticePeriod" | "workAuthorization"
  | "sponsorship" | "relocation" | "coverLetter" | "resumePath";

export type FieldMapping = Readonly<{
  key?: CandidateKey;
  confidence: number;
  sensitivity: Sensitivity;
  reason: string;
}>;

const rules: readonly Readonly<{ key: CandidateKey; pattern: RegExp; sensitivity: Sensitivity; confidence: number }>[] = [
  { key: "email", pattern: /\b(e-?mail)\b/i, sensitivity: "personal", confidence: 0.99 },
  { key: "phone", pattern: /\b(phone|mobile|contact number)\b/i, sensitivity: "personal", confidence: 0.98 },
  { key: "firstName", pattern: /\b(first|given) name\b/i, sensitivity: "personal", confidence: 0.98 },
  { key: "lastName", pattern: /\b(last|family|sur)name\b/i, sensitivity: "personal", confidence: 0.98 },
  { key: "fullName", pattern: /\b(full name|your name|candidate name)\b/i, sensitivity: "personal", confidence: 0.94 },
  { key: "currentCity", pattern: /\b(current )?(city|location)\b/i, sensitivity: "personal", confidence: 0.88 },
  { key: "linkedinUrl", pattern: /linkedin/i, sensitivity: "personal", confidence: 0.99 },
  { key: "portfolioUrl", pattern: /\b(portfolio|website|github)\b/i, sensitivity: "ordinary", confidence: 0.9 },
  { key: "yearsExperience", pattern: /\b(years?.*(experience)|experience.*years?)\b/i, sensitivity: "ordinary", confidence: 0.91 },
  { key: "currentCompany", pattern: /\b(current|present).*(company|employer)\b/i, sensitivity: "ordinary", confidence: 0.9 },
  { key: "currentTitle", pattern: /\b(current|present).*(title|role|designation)\b/i, sensitivity: "ordinary", confidence: 0.9 },
  { key: "expectedCompensation", pattern: /\b(expected|desired).*(salary|ctc|compensation)\b/i, sensitivity: "sensitive", confidence: 0.95 },
  { key: "noticePeriod", pattern: /\bnotice period\b/i, sensitivity: "sensitive", confidence: 0.98 },
  { key: "workAuthorization", pattern: /\b(work|employment).*(authori[sz]|permit|eligible)\b/i, sensitivity: "legal", confidence: 0.92 },
  { key: "sponsorship", pattern: /\b(sponsor|visa)\b/i, sensitivity: "legal", confidence: 0.94 },
  { key: "relocation", pattern: /\brelocat/i, sensitivity: "sensitive", confidence: 0.95 },
  { key: "coverLetter", pattern: /\bcover letter\b/i, sensitivity: "ordinary", confidence: 0.98 },
  { key: "resumePath", pattern: /\b(resume|cv)\b/i, sensitivity: "personal", confidence: 0.99 }
];

const alwaysSensitive = /disab|veteran|gender|race|ethnic|religion|criminal|background check|consent|declaration|terms|signature/i;

export function mapField(field: FieldSnapshot): FieldMapping {
  const text = `${field.label} ${field.placeholder} ${field.name}`.trim();
  if (alwaysSensitive.test(text)) return Object.freeze({ confidence: 0, sensitivity: "legal", reason: "Sensitive or legal question requires explicit review." });
  const rule = rules.find((entry) => entry.pattern.test(text));
  return rule
    ? Object.freeze({ key: rule.key, confidence: rule.confidence, sensitivity: rule.sensitivity, reason: `Matched controlled key ${rule.key}.` })
    : Object.freeze({ confidence: 0, sensitivity: "ordinary", reason: "No controlled field mapping matched." });
}

export function unknownFieldKey(field: FieldSnapshot): string {
  return `unknown.${createHash("sha256").update(`${field.label}|${field.name}|${field.inputType}`).digest("hex").slice(0, 12)}`;
}

