import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { classifyLicense, enterpriseAllowListEligible, validateCatalog, ROLES, type CatalogModel } from "../../models/catalog";

const catalog = JSON.parse(readFileSync("models/catalog.json", "utf8"));
const base = (): CatalogModel => ({ ...catalog.models[0] });
const wrap = (m: any) => ({ schemaVersion: 1, models: [m] });

describe("models/catalog.json", () => {
  it("is valid, covers every role, never contains hashes/sizes", () => {
    const v = validateCatalog(catalog);
    expect(v.errors).toEqual([]);
    for (const r of ROLES) expect(catalog.models.some((m: CatalogModel) => m.role === r)).toBe(true);
    expect(catalog.models.every((m: CatalogModel) => m.sha256 === null && m.sizeBytes === null)).toBe(true);
  });
  it("flags non-commercial and excludes it from the enterprise allow-list", () => {
    const v = validateCatalog(catalog);
    expect(v.warnings.some((w) => w.includes("qwen-research"))).toBe(true);
    const eligible = catalog.models.filter(enterpriseAllowListEligible).map((m: CatalogModel) => m.id);
    expect(eligible).not.toContain("vision-qwen2-5-vl-3b");
    expect(eligible).not.toContain("embed-embeddinggemma-300m");
    expect(eligible).not.toContain("embed-bge-m3"); // unverified
    expect(eligible).toContain("embed-qwen3-0-6b");
  });
});

describe("validateCatalog", () => {
  it("rejects missing license", () => {
    expect(validateCatalog(wrap({ ...base(), license: "" })).ok).toBe(false);
    const m: any = base(); delete m.license;
    expect(validateCatalog(wrap(m)).errors.join()).toMatch(/license is required/);
  });
  it("rejects invented sha256 on unverified entries and malformed hashes", () => {
    expect(validateCatalog(wrap({ ...base(), verified: false, parameters: null, sha256: "a".repeat(64) })).ok).toBe(false);
    expect(validateCatalog(wrap({ ...base(), sha256: "xyz" })).ok).toBe(false);
    expect(validateCatalog(wrap({ ...base(), sha256: "a".repeat(64) })).ok).toBe(true);
  });
  it("rejects commercialUse=yes for non-commercial licenses and mismatched classes", () => {
    expect(validateCatalog(wrap({ ...base(), license: "cc-by-nc-4.0", licenseClass: "non-commercial", commercialUse: "yes" })).ok).toBe(false);
    expect(validateCatalog(wrap({ ...base(), license: "mit", licenseClass: "non-commercial" })).ok).toBe(false);
    expect(validateCatalog(wrap({ ...base(), license: "cc-by-nc-4.0", licenseClass: "non-commercial", commercialUse: "no" })).ok).toBe(true);
  });
  it("rejects bad role, repo, url, duplicate ids, unknown formats, verified without params", () => {
    expect(validateCatalog(wrap({ ...base(), role: "magic" })).ok).toBe(false);
    expect(validateCatalog(wrap({ ...base(), hfRepo: "nope" })).ok).toBe(false);
    expect(validateCatalog(wrap({ ...base(), sourceUrl: "http://evil.example/x" })).ok).toBe(false);
    expect(validateCatalog(wrap({ ...base(), formats: ["exe"] })).ok).toBe(false);
    expect(validateCatalog(wrap({ ...base(), parameters: null, verified: true })).ok).toBe(false);
    expect(validateCatalog({ schemaVersion: 1, models: [base(), base()] }).errors.join()).toMatch(/duplicate/);
    expect(validateCatalog({}).ok).toBe(false);
  });
  it("classifyLicense", () => {
    expect(classifyLicense("apache-2.0")).toBe("permissive");
    expect(classifyLicense("gemma")).toBe("custom-terms");
    expect(classifyLicense("llama3.2")).toBe("custom-terms");
    expect(classifyLicense("qwen-research")).toBe("non-commercial");
    expect(classifyLicense("cc-by-nc-sa-4.0")).toBe("non-commercial");
    expect(classifyLicense("")).toBe("unknown");
  });
});
