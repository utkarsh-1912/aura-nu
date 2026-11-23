import type { JsonSchema } from "./types";

/** Validate a value against the JSON-Schema subset in types.ts. Returns error strings with paths. */
export function validateJson(schema: JsonSchema, value: unknown, path = "$", depth = 0): string[] {
  const errs: string[] = [];
  if (depth > 10) return [`${path}: nested too deeply`];
  const t = schema.type;
  const typeOk = (): boolean => {
    switch (t) {
      case undefined: return true;
      case "string": return typeof value === "string";
      case "number": return typeof value === "number" && Number.isFinite(value);
      case "integer": return typeof value === "number" && Number.isInteger(value);
      case "boolean": return typeof value === "boolean";
      case "null": return value === null;
      case "array": return Array.isArray(value);
      case "object": return !!value && typeof value === "object" && !Array.isArray(value);
    }
  };
  if (!typeOk()) return [`${path}: expected ${t}, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`];
  if (schema.enum && !schema.enum.some((e) => e === value)) errs.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errs.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errs.push(`${path}: longer than ${schema.maxLength}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validateJson(schema.items!, v, `${path}[${i}]`, depth + 1)));
  }
  if (t === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const r of schema.required ?? []) if (!(r in obj) || obj[r] === undefined) errs.push(`${path}.${r}: required`);
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k];
      if (sub) errs.push(...validateJson(sub, v, `${path}.${k}`, depth + 1));
      else if (schema.additionalProperties === false) errs.push(`${path}.${k}: unexpected property`);
    }
  }
  return errs;
}
