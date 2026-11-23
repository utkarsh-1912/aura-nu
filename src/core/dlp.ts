/**
 * Pure DLP engine: detectors, policy evaluation, redaction.
 *
 * Safety properties:
 *  - Input is capped (MAX_SCAN_CHARS); excess is reported as `truncated`, never scanned unbounded.
 *  - All built-in patterns use bounded quantifiers and no nested/overlapping repetition (ReDoS-safe).
 *  - Custom regex rules are validated (length cap, no nested quantifiers, no backreferences) and
 *    run only over the capped input.
 *  - Findings carry offsets, a type and a masked preview that never exceeds the last 4 chars;
 *    the raw matched value is never placed in findings, errors or logs. Use `redact` for output.
 */

export const MAX_SCAN_CHARS = 1_000_000;
export const MAX_CUSTOM_PATTERN_LEN = 200;

export type DlpCategory = "secret" | "pii" | "custom";
export type DlpAction = "allow" | "warn" | "redact" | "block";
const ACTION_ORDER: DlpAction[] = ["allow", "warn", "redact", "block"];

export interface Finding {
  detector: string;
  category: DlpCategory;
  start: number;
  end: number;
  /** Masked preview, e.g. "****1111". Never the full value. */
  preview: string;
}

interface Detector {
  id: string;
  category: DlpCategory;
  re: RegExp;
  /** Optional post-validation on the raw match (checksum etc.). */
  validate?: (match: string) => boolean;
}

export function luhn(digits: string): boolean {
  const d = digits.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(d)) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const dch of v) rem = (rem * 10 + (dch.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

function ssnValid(m: string): boolean {
  const [a, b, c] = m.split(/[-\s]/);
  if (!a || !b || !c) return false;
  return a !== "000" && a !== "666" && a[0] !== "9" && b !== "00" && c !== "0000";
}

export const DETECTORS: readonly Detector[] = [
  { id: "aws-access-key", category: "secret", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "github-token", category: "secret", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { id: "stripe-key", category: "secret", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,99}\b/g },
  { id: "google-api-key", category: "secret", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  {
    id: "private-key-block",
    category: "secret",
    // Bounded body: at most 8000 chars between markers, lazy but anchored by a literal terminator.
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]{0,8000}?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
  },
  { id: "jwt", category: "secret", re: /\beyJ[A-Za-z0-9_-]{8,2000}\.eyJ[A-Za-z0-9_-]{8,2000}\.[A-Za-z0-9_-]{8,2000}\b/g },
  { id: "email", category: "pii", re: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,4}\b/g },
  {
    id: "phone",
    category: "pii",
    re: /(?<![\w.])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}(?![\w.])/g,
  },
  {
    id: "credit-card",
    category: "pii",
    re: /\b\d{4}(?:[\s-]?\d{4}){2}[\s-]?\d{1,7}\b/g,
    validate: luhn,
  },
  { id: "ssn", category: "pii", re: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, validate: ssnValid },
  { id: "iban", category: "pii", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, validate: ibanValid },
];

export interface CustomRule {
  id: string;
  /** Source of a RegExp (no flags; matched globally, case-insensitive optional). */
  pattern: string;
  caseInsensitive?: boolean;
}

/** Rejects patterns likely to cause catastrophic backtracking. Conservative by design. */
export function validateCustomPattern(pattern: string): { ok: true } | { ok: false; reason: string } {
  if (typeof pattern !== "string" || !pattern) return { ok: false, reason: "empty" };
  if (pattern.length > MAX_CUSTOM_PATTERN_LEN) return { ok: false, reason: "too long" };
  if (/\\[1-9]|\\k</.test(pattern)) return { ok: false, reason: "backreferences not allowed" };
  // Quantified group that itself contains a quantifier: (a+)+ , (a*)* , (a|b+)* , (.+){2,}
  if (/\([^()]*[+*}][^()]*\)\s*(?:[+*]|\{\d+,\d*\})/.test(pattern)) return { ok: false, reason: "nested quantifier" };
  // Unbounded alternation under a quantifier with overlap risk
  if (/\([^()]*\|[^()]*\)\s*[+*]/.test(pattern)) return { ok: false, reason: "quantified alternation" };
  // Large explicit repeat counts
  for (const m of pattern.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
    if (Number(m[1]) > 1000 || (m[2] && Number(m[2]) > 1000)) return { ok: false, reason: "repeat too large" };
  }
  try {
    new RegExp(pattern);
  } catch {
    return { ok: false, reason: "invalid regex" };
  }
  return { ok: true };
}

export interface DlpPolicy {
  /** Action per detector id or category; "*" is the default. Unspecified => "allow". */
  rules: Record<string, DlpAction>;
  custom?: CustomRule[];
  /** Per custom rule action is read from rules[customRule.id]. */
}

export const DEFAULT_POLICY: DlpPolicy = {
  rules: {
    "private-key-block": "block",
    secret: "block",
    "credit-card": "redact",
    ssn: "redact",
    iban: "redact",
    pii: "warn",
    "*": "allow",
  },
};

function maskPreview(v: string): string {
  const compact = v.replace(/\s/g, "");
  if (compact.length <= 8) return "*".repeat(compact.length);
  return "****" + compact.slice(-4);
}

export interface ScanResult {
  findings: Finding[];
  truncated: boolean;
  /** Custom rules that were rejected as unsafe (ids only). */
  rejectedRules: string[];
}

export function scan(text: string, custom: readonly CustomRule[] = []): ScanResult {
  const truncated = text.length > MAX_SCAN_CHARS;
  const input = truncated ? text.slice(0, MAX_SCAN_CHARS) : text;
  const findings: Finding[] = [];
  const rejectedRules: string[] = [];

  const run = (id: string, category: DlpCategory, re: RegExp, validate?: (m: string) => boolean) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(input)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (!validate || validate(m[0])) {
        findings.push({ detector: id, category, start: m.index, end: m.index + m[0].length, preview: maskPreview(m[0]) });
      }
      if (++count > 5000) break; // bound findings per detector
    }
  };

  for (const d of DETECTORS) run(d.id, d.category, d.re, d.validate);
  for (const c of custom) {
    const v = validateCustomPattern(c.pattern);
    if (!v.ok) {
      rejectedRules.push(c.id);
      continue;
    }
    run(c.id, "custom", new RegExp(c.pattern, c.caseInsensitive ? "gi" : "g"));
  }
  findings.sort((a, b) => a.start - b.start || b.end - a.end);
  return { findings, truncated, rejectedRules };
}

function actionFor(f: Finding, policy: DlpPolicy): DlpAction {
  const r = policy.rules;
  return r[f.detector] ?? r[f.category] ?? r["*"] ?? "allow";
}

export interface Decision {
  action: DlpAction;
  findings: Array<Finding & { action: DlpAction }>;
  truncated: boolean;
  rejectedRules: string[];
  /** Present when action is "redact" (or when block/warn and a safe copy is wanted). */
  redacted?: string;
}

export function redact(text: string, findings: readonly Finding[]): string {
  const sorted = [...findings].sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  for (const f of sorted) {
    if (f.start < pos) {
      // overlapping: extend the previous redaction only if this reaches further
      if (f.end > pos) pos = f.end;
      continue;
    }
    out += text.slice(pos, f.start) + `[REDACTED:${f.detector}]`;
    pos = f.end;
  }
  return out + text.slice(pos);
}

/** Evaluates the policy: overall action = strictest action across findings. */
export function evaluate(text: string, policy: DlpPolicy = DEFAULT_POLICY): Decision {
  const { findings, truncated, rejectedRules } = scan(text, policy.custom ?? []);
  const withAction = findings.map((f) => ({ ...f, action: actionFor(f, policy) }));
  let action: DlpAction = "allow";
  for (const f of withAction) if (ACTION_ORDER.indexOf(f.action) > ACTION_ORDER.indexOf(action)) action = f.action;
  // Oversize input cannot be fully verified: never silently allow past the cap under a blocking policy.
  if (truncated && ACTION_ORDER.indexOf(action) < ACTION_ORDER.indexOf("warn")) action = "warn";
  const decision: Decision = { action, findings: withAction, truncated, rejectedRules };
  if (action === "redact") {
    decision.redacted = redact(text.slice(0, MAX_SCAN_CHARS), withAction.filter((f) => f.action === "redact" || f.action === "block"));
    if (truncated) decision.redacted += "[TRUNCATED]";
  }
  return decision;
}

/** Log-safe summary: counts per detector, no offsets into content, no values. */
export function summarizeForLog(d: Decision): { action: DlpAction; counts: Record<string, number>; truncated: boolean } {
  const counts: Record<string, number> = {};
  for (const f of d.findings) counts[f.detector] = (counts[f.detector] ?? 0) + 1;
  return { action: d.action, counts, truncated: d.truncated };
}
