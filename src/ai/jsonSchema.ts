// Minimal JSON-Schema subset validator (type, enum, required, properties, items,
// additionalProperties:false, min/max Length/Items, minimum/maximum). Hand-rolled: zod/ajv not installed.

export interface SchemaIssue { path: string; message: string }

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

export function validateJsonSchema(value: unknown, schema: any, path = "$"): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (!schema || typeof schema !== "object") return issues;
  const t = typeOf(value);
  if (schema.type) {
    const allowed: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = allowed.some((a) => a === t || (a === "number" && t === "integer"));
    if (!ok) { issues.push({ path, message: `expected ${allowed.join("|")}, got ${t}` }); return issues; }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e: unknown) => JSON.stringify(e) === JSON.stringify(value))) {
    issues.push({ path, message: "value not in enum" });
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) issues.push({ path, message: "string too short" });
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) issues.push({ path, message: "string too long" });
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) issues.push({ path, message: "below minimum" });
    if (typeof schema.maximum === "number" && value > schema.maximum) issues.push({ path, message: "above maximum" });
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) issues.push({ path, message: "too few items" });
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) issues.push({ path, message: "too many items" });
    if (schema.items) value.forEach((v, i) => issues.push(...validateJsonSchema(v, schema.items, `${path}[${i}]`)));
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in obj)) issues.push({ path: `${path}.${k}`, message: "required property missing" });
    const props = schema.properties ?? {};
    for (const [k, sub] of Object.entries(props)) if (k in obj) issues.push(...validateJsonSchema(obj[k], sub, `${path}.${k}`));
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(obj)) if (!(k in props)) issues.push({ path: `${path}.${k}`, message: "additional property not allowed" });
    }
  }
  return issues;
}

/** Parse text as JSON, tolerating a ```json fence. Returns undefined when unparsable. */
export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1];
  try { return { ok: true, value: JSON.parse(s) }; } catch { return { ok: false }; }
}
