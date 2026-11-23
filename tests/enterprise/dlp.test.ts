import { describe, it, expect } from "vitest";
import { scan, evaluate, redact, luhn, ibanValid, validateCustomPattern, summarizeForLog, MAX_SCAN_CHARS } from "../../src/core/dlp";

// Fixtures are assembled at runtime so secret scanners do not flag this file.
const AWS = "AK" + "IA" + "IOSFODNN7EXAMPLE";
const GH = "ghp_" + "a".repeat(36);
const STRIPE = "sk_" + "live_" + "A1b2C3d4E5f6G7h8I9j0";
const GOOGLE = "AI" + "za" + "SyA1234567890abcdefghijklmnopqrstuv";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JWT = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "1234567890" })}.abcdefghijklmnop`;
const PK = "-----BEGIN RSA PRIVATE" + " KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE" + " KEY-----";

const ids = (t: string) => scan(t).findings.map((f) => f.detector);

describe("detectors: positives", () => {
  it("secrets", () => {
    expect(ids(`key ${AWS}`)).toContain("aws-access-key");
    expect(ids(GH)).toContain("github-token");
    expect(ids(STRIPE)).toContain("stripe-key");
    expect(ids(GOOGLE)).toContain("google-api-key");
    expect(ids(JWT)).toContain("jwt");
    expect(ids(`x\n${PK}\ny`)).toContain("private-key-block");
  });
  it("pii", () => {
    expect(ids("mail bob.smith@example.co.uk now")).toContain("email");
    expect(ids("call +1 415-555-2671 or (415) 555-2671")).toEqual(["phone", "phone"]);
    expect(ids("card 4111 1111 1111 1111")).toContain("credit-card");
    expect(ids("ssn 123-45-6789")).toContain("ssn");
    expect(ids("iban GB82 WEST 1234 5698 7654 32")).toContain("iban");
  });
});

describe("detectors: negatives", () => {
  it("rejects invalid checksums and lookalikes", () => {
    expect(ids("card 4111 1111 1111 1112")).not.toContain("credit-card");
    expect(ids("ssn 000-12-3456 and 666-12-3456 and 900-12-3456")).not.toContain("ssn");
    expect(ids("iban GB82 WEST 1234 5698 7654 33")).not.toContain("iban");
    expect(ids("AKIA short")).toEqual([]);
    expect(ids("just a normal note about meetings at 3pm, ref 2024-11-05")).toEqual([]);
    expect(ids("version 1.2.3 build 20240101")).toEqual([]);
  });
  it("luhn / iban helpers", () => {
    expect(luhn("4111111111111111")).toBe(true);
    expect(luhn("1234")).toBe(false);
    expect(ibanValid("DE89370400440532013000")).toBe(true);
    expect(ibanValid("DE89370400440532013001")).toBe(false);
  });
});

describe("policy engine", () => {
  const text = `email a@b.io and card 4111 1111 1111 1111`;
  it("strictest action wins; redact never leaks", () => {
    const d = evaluate(text, { rules: { email: "warn", "credit-card": "redact" } });
    expect(d.action).toBe("redact");
    expect(d.redacted).toContain("[REDACTED:credit-card]");
    expect(d.redacted).not.toContain("4111");
    expect(d.redacted).toContain("a@b.io");
  });
  it("block on secrets by default policy", () => {
    expect(evaluate(`k=${AWS}`).action).toBe("block");
    expect(evaluate("plain").action).toBe("allow");
  });
  it("findings and log summary never contain the value", () => {
    const d = evaluate(`k=${AWS} card 4111 1111 1111 1111`);
    const blob = JSON.stringify(d.findings) + JSON.stringify(summarizeForLog(d));
    expect(blob).not.toContain(AWS);
    expect(blob).not.toContain("4111 1111 1111 1111");
    expect(blob).not.toContain("IOSFODNN7EXAMPLE");
  });
  it("redact handles overlapping findings", () => {
    const out = redact("abcdefghij", [
      { detector: "a", category: "custom", start: 1, end: 6, preview: "" },
      { detector: "b", category: "custom", start: 4, end: 8, preview: "" },
    ]);
    expect(out).toBe("a[REDACTED:a]ij");
  });
});

describe("custom rules and ReDoS safety", () => {
  it("applies safe custom rules", () => {
    const d = evaluate("project CODENAME-ORION is secret", {
      rules: { codename: "block" },
      custom: [{ id: "codename", pattern: "CODENAME-[A-Z]{3,10}" }],
    });
    expect(d.action).toBe("block");
  });
  it("rejects dangerous patterns", () => {
    for (const p of ["(a+)+$", "(a*)*b", "(a|aa)+c", "(.+)+x", "(a)\\1", "a{1,100000}", "x".repeat(300), "("]) {
      expect(validateCustomPattern(p).ok, p).toBe(false);
    }
    expect(validateCustomPattern("[A-Z]{3}-\\d{4}").ok).toBe(true);
    const d = evaluate("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!", { rules: {}, custom: [{ id: "bad", pattern: "(a+)+$" }] });
    expect(d.rejectedRules).toEqual(["bad"]);
  });
  it("built-ins stay fast on adversarial and oversized input", () => {
    const evil = "a".repeat(200_000) + "@" + "b".repeat(200_000);
    const t0 = Date.now();
    scan(evil);
    scan("1".repeat(300_000));
    scan("-----BEGIN PRIVATE KEY-----" + "x".repeat(300_000));
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it("caps input and reports truncation (never silently allow)", () => {
    const big = "x".repeat(MAX_SCAN_CHARS + 10);
    const d = evaluate(big, { rules: {} });
    expect(d.truncated).toBe(true);
    expect(d.action).toBe("warn");
  });
});
