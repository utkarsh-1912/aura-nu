/** Pure logic for the model manager (catalog validation, download planning). Framework-free. */

export interface CatalogModel {
  id: string;
  name: string;
  /** Quantization label, e.g. "Q4_K_M". */
  quant: string;
  /** HTTPS download URL (host must be in catalog.allowedHosts). */
  url: string;
  /** Lowercase hex SHA-256 of the file. Required: no hash, no download. */
  sha256: string;
  sizeBytes: number;
  /** Approx RAM/VRAM needed to run, bytes. */
  minMemoryBytes: number;
  file: string;
  license: string;
}
export interface Catalog { version: 1; allowedHosts: string[]; models: CatalogModel[] }

export type CatalogCheck = { ok: true; catalog: Catalog } | { ok: false; errors: string[] };

const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.gguf$/;
const SHA = /^[0-9a-f]{64}$/;

export function validateCatalog(raw: unknown): CatalogCheck {
  const errors: string[] = [];
  const c = raw as Partial<Catalog> | null;
  if (!c || c.version !== 1 || !Array.isArray(c.models) || !Array.isArray(c.allowedHosts)) return { ok: false, errors: ["bad catalog shape"] };
  const hosts = c.allowedHosts.map((h) => String(h).toLowerCase());
  const seen = new Set<string>();
  for (const m of c.models as CatalogModel[]) {
    const tag = `model ${m?.id}`;
    if (!m || typeof m.id !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(m.id)) { errors.push(`${tag}: bad id`); continue; }
    if (seen.has(m.id)) errors.push(`${tag}: duplicate id`);
    seen.add(m.id);
    if (!SHA.test(m.sha256)) errors.push(`${tag}: sha256 must be 64 lowercase hex`);
    if (!SAFE_FILE.test(m.file)) errors.push(`${tag}: unsafe file name`);
    if (!Number.isSafeInteger(m.sizeBytes) || m.sizeBytes <= 0) errors.push(`${tag}: bad sizeBytes`);
    try {
      const u = new URL(m.url);
      if (u.protocol !== "https:") errors.push(`${tag}: url must be https`);
      if (!hosts.includes(u.hostname.toLowerCase())) errors.push(`${tag}: host ${u.hostname} not in allowedHosts`);
    } catch { errors.push(`${tag}: bad url`); }
  }
  return errors.length ? { ok: false, errors } : { ok: true, catalog: c as Catalog };
}

export interface DiskState { usedBytes: number; quotaBytes: number; freeBytes: number }
export type DownloadPlan = { ok: true } | { ok: false; reason: "quota" | "disk" | "memory"; needBytes: number; haveBytes: number };

/** Decide whether a download may start. Keeps 1 GiB of free-disk headroom. */
export function planDownload(m: Pick<CatalogModel, "sizeBytes" | "minMemoryBytes">, disk: DiskState, systemMemoryBytes?: number): DownloadPlan {
  const headroom = 1024 ** 3;
  if (disk.usedBytes + m.sizeBytes > disk.quotaBytes) return { ok: false, reason: "quota", needBytes: m.sizeBytes, haveBytes: Math.max(0, disk.quotaBytes - disk.usedBytes) };
  if (m.sizeBytes + headroom > disk.freeBytes) return { ok: false, reason: "disk", needBytes: m.sizeBytes + headroom, haveBytes: disk.freeBytes };
  if (systemMemoryBytes !== undefined && m.minMemoryBytes > systemMemoryBytes) return { ok: false, reason: "memory", needBytes: m.minMemoryBytes, haveBytes: systemMemoryBytes };
  return { ok: true };
}

/** Models that fit this machine, largest first (a sensible default is the first entry). */
export function modelsThatFit(c: Catalog, systemMemoryBytes: number): CatalogModel[] {
  return c.models.filter((m) => m.minMemoryBytes <= systemMemoryBytes).sort((a, b) => b.sizeBytes - a.sizeBytes);
}
