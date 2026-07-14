const sensitive = /token|cookie|session|password|authorization|storage.?state|email|phone|resume|answer|value/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[REDACTED_DEPTH]";
  if (typeof value === "string") return value.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]");
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? "[REDACTED]" : redact(item, depth + 1)])
  );
}
