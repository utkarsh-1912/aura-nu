// Model catalog types + validator (hand-rolled; zod/ajv are not installed). Framework-free.

export const ROLES = ["quick-actions", "agent-brain", "embedding", "reranker", "speech-to-text", "ocr-vision", "safety"] as const;
export type ModelRole = (typeof ROLES)[number];
export type CommercialUse = "yes" | "no" | "unknown";
/** permissive = Apache-2.0/MIT/BSD-style; custom-terms = Gemma/Llama-style bespoke licence (legal review); non-commercial = research-only etc. */
export type LicenseClass = "permissive" | "custom-terms" | "non-commercial" | "unknown";

export interface CatalogModel {
  id: string;                    // stable catalog id
  role: ModelRole;
  hfRepo: string;                // "org/name"
  license: string;               // exact license string from the HF card metadata (license or license_name)
  licenseClass: LicenseClass;
  commercialUse: CommercialUse;
  parameters: number | null;     // total parameters from HF safetensors metadata, null if not confirmed
  /** Formats observed in THIS repo (not in third-party conversions). */
  formats: string[];
  sizeBytes: number | null;      // never guessed
  sha256: string | null;         // never guessed; only set from a real download verified by a human/CI
  minRamMb: number | null;
  sourceUrl: string;
  dateChecked: string;           // YYYY-MM-DD
  verified: boolean;             // true only if every non-null field was read from the model card/API
  gated?: boolean;
  notes?: string;
}
export interface Catalog { schemaVersion: 1; generatedNote?: string; models: CatalogModel[] }

const PERMISSIVE = new Set(["apache-2.0", "mit", "bsd-2-clause", "bsd-3-clause", "isc", "cc0-1.0", "unlicense"]);
const NON_COMMERCIAL = /(^|[-_])(nc|non-?commercial|research)([-_]|$)|^qwen-research$|^cc-by-nc/i;
const KNOWN_FORMATS = new Set(["safetensors", "gguf", "onnx", "pytorch-bin", "ggml"]);

export function classifyLicense(license: string): LicenseClass {
  const l = license.trim().toLowerCase();
  if (!l) return "unknown";
  if (PERMISSIVE.has(l)) return "permissive";
  if (NON_COMMERCIAL.test(l)) return "non-commercial";
  if (/^(gemma|llama|openrail|other|bigscience)/.test(l) || l.startsWith("llama")) return "custom-terms";
  return "unknown";
}

/** Eligible for an enterprise allow-list by default: confirmed permissive licence + commercial use + verified card. */
export function enterpriseAllowListEligible(m: CatalogModel): boolean {
  return m.verified && m.licenseClass === "permissive" && m.commercialUse === "yes";
}

export function validateCatalog(input: unknown): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []; const warnings: string[] = [];
  const c = input as Catalog;
  if (!c || typeof c !== "object" || c.schemaVersion !== 1 || !Array.isArray(c.models)) return { ok: false, errors: ["catalog must be {schemaVersion:1, models:[]}"], warnings };
  const ids = new Set<string>();
  c.models.forEach((m, i) => {
    const at = `models[${i}]${m?.id ? ` (${m.id})` : ""}`;
    const err = (s: string) => errors.push(`${at}: ${s}`);
    if (!m || typeof m !== "object") return err("not an object");
    if (typeof m.id !== "string" || !m.id) err("id required"); else if (ids.has(m.id)) err("duplicate id"); else ids.add(m.id);
    if (!ROLES.includes(m.role)) err(`role must be one of ${ROLES.join(", ")}`);
    if (typeof m.hfRepo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(m.hfRepo)) err("hfRepo must be org/name");
    if (typeof m.license !== "string" || !m.license.trim()) err("license is required (exact string from the model card)");
    else {
      const cls = classifyLicense(m.license);
      if (m.licenseClass !== cls && !(cls === "unknown" && m.licenseClass === "custom-terms")) err(`licenseClass "${m.licenseClass}" inconsistent with license "${m.license}" (expected ${cls})`);
      if (cls === "non-commercial") {
        warnings.push(`${at}: non-commercial license "${m.license}" - excluded from enterprise allow-list`);
        if (m.commercialUse === "yes") err("commercialUse cannot be yes for a non-commercial license");
      }
      if (cls === "permissive" && m.commercialUse === "no") err("commercialUse=no contradicts a permissive license");
    }
    if (!["yes", "no", "unknown"].includes(m.commercialUse)) err("commercialUse must be yes|no|unknown");
    if (m.parameters !== null && !(Number.isInteger(m.parameters) && m.parameters > 0)) err("parameters must be a positive integer or null");
    if (!Array.isArray(m.formats) || m.formats.some((f) => !KNOWN_FORMATS.has(f))) err(`formats must be a subset of ${[...KNOWN_FORMATS].join(", ")}`);
    if (m.sizeBytes !== null && !(Number.isInteger(m.sizeBytes) && m.sizeBytes > 0)) err("sizeBytes must be a positive integer or null");
    if (m.minRamMb !== null && !(Number.isInteger(m.minRamMb) && m.minRamMb > 0)) err("minRamMb must be a positive integer or null");
    if (m.sha256 !== null) {
      if (typeof m.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(m.sha256)) err("sha256 must be 64 lowercase hex chars or null");
      else if (!m.verified) err("sha256 present but verified=false: hashes may only come from a verified download");
    }
    if (typeof m.sourceUrl !== "string" || !/^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+/.test(m.sourceUrl)) err("sourceUrl must be a huggingface.co model URL");
    if (typeof m.dateChecked !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(m.dateChecked)) err("dateChecked must be YYYY-MM-DD");
    if (typeof m.verified !== "boolean") err("verified must be boolean");
    if (m.verified && (m.parameters === null || m.license === "")) err("verified=true requires parameters and license to be confirmed");
    if (m.licenseClass === "custom-terms" && m.commercialUse === "yes") warnings.push(`${at}: custom-terms license marked commercialUse=yes - confirm with legal`);
  });
  return { ok: errors.length === 0, errors, warnings };
}
