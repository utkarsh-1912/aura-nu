import { validateJsonSchema } from "../src/ai/jsonSchema";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

export function jaccard(a: string, b: string): number {
  const A = new Set(norm(a)), B = new Set(norm(b));
  if (!A.size && !B.size) return 1;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Precision/recall/F1 with a greedy one-to-one match under `match`. Both empty => F1 1. One empty => 0. */
export function f1(predicted: string[], expected: string[], match: (p: string, e: string) => boolean = (p, e) => p.trim().toLowerCase() === e.trim().toLowerCase()) {
  if (!predicted.length && !expected.length) return { precision: 1, recall: 1, f1: 1 };
  if (!predicted.length || !expected.length) return { precision: 0, recall: 0, f1: 0 };
  const used = new Set<number>(); let tp = 0;
  for (const p of predicted) {
    const j = expected.findIndex((e, idx) => !used.has(idx) && match(p, e));
    if (j >= 0) { used.add(j); tp++; }
  }
  const precision = tp / predicted.length, recall = tp / expected.length;
  return { precision, recall, f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall) };
}

export const fuzzyMatch = (threshold = 0.5) => (p: string, e: string) => jaccard(p, e) >= threshold;

/** Fraction of keywords (case-insensitive substring) present in text. */
export function keywordCoverage(text: string, keywords: string[]): number {
  if (!keywords.length) return 1;
  const t = text.toLowerCase();
  return keywords.filter((k) => t.includes(k.toLowerCase())).length / keywords.length;
}

export function wordCount(s: string): number { return s.trim() ? s.trim().split(/\s+/).length : 0; }

export function jsonSchemaValid(value: unknown, schema: unknown): boolean { return validateJsonSchema(value, schema).length === 0; }

export function recallAtK(rankedIds: string[], relevant: string[], k: number): number {
  if (!relevant.length) return 1;
  const top = new Set(rankedIds.slice(0, k));
  return relevant.filter((r) => top.has(r)).length / relevant.length;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
