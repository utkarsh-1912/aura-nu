import { afterEach, describe, expect, it } from "vitest";
import { createTauriVaultFs, isDesktop, keychain, models, setTauriRuntime, vault } from "../../src/desktop/bridge";
import { modelsThatFit, planDownload, validateCatalog } from "../../src/desktop/modelCatalog";

afterEach(() => setTauriRuntime(null));

describe("bridge feature detection", () => {
  it("returns unavailable in the browser", async () => {
    expect(isDesktop()).toBe(false);
    expect(await vault.pick()).toEqual({ ok: false, reason: "unavailable" });
    expect(await keychain.get("k")).toEqual({ ok: false, reason: "unavailable" });
    expect(await vault.onEvent(() => {})).toEqual({ ok: false, reason: "unavailable" });
    await expect(createTauriVaultFs().readText("a.md")).rejects.toThrow(/unavailable/);
  });
  it("wraps invoke results and errors", async () => {
    const calls: Array<[string, unknown]> = [];
    setTauriRuntime({
      invoke: async (cmd, args) => { calls.push([cmd, args]); if (cmd === "keychain_get") throw "denied"; return { root: "/v", name: "v" } as never; },
      listen: async () => () => {},
    });
    expect(isDesktop()).toBe(true);
    expect(await vault.open("/v")).toEqual({ ok: true, value: { root: "/v", name: "v" } });
    expect(await keychain.get("x")).toEqual({ ok: false, reason: "error", error: "denied" });
    await models.verify("m");
    expect(calls.map((c) => c[0])).toEqual(["vault_open", "keychain_get", "models_verify"]);
  });
});

const good = {
  version: 1, allowedHosts: ["huggingface.co"],
  models: [{ id: "tiny-q4", name: "Tiny", quant: "Q4_K_M", url: "https://huggingface.co/x/y/resolve/main/tiny.gguf", sha256: "a".repeat(64), sizeBytes: 2e9, minMemoryBytes: 4e9, file: "tiny-q4.gguf", license: "apache-2.0" }],
};

describe("model catalog", () => {
  it("accepts a valid catalog", () => expect(validateCatalog(good).ok).toBe(true));
  it("rejects http, foreign hosts, missing/uppercase hash, path-like file names, duplicate ids", () => {
    const bad = { ...good, models: [
      { ...good.models[0], url: "http://huggingface.co/a" },
      { ...good.models[0], id: "b", url: "https://evil.example/a" },
      { ...good.models[0], id: "c", sha256: "A".repeat(64) },
      { ...good.models[0], id: "d", file: "../../x.gguf" },
      { ...good.models[0] },
    ] };
    const r = validateCatalog(bad);
    expect(r.ok).toBe(false);
    if ("errors" in r) expect(r.errors.length).toBeGreaterThanOrEqual(5);
  });
  it("plans downloads against quota, disk and memory", () => {
    const m = good.models[0];
    expect(planDownload(m, { usedBytes: 0, quotaBytes: 10e9, freeBytes: 50e9 }, 16e9)).toEqual({ ok: true });
    expect(planDownload(m, { usedBytes: 9e9, quotaBytes: 10e9, freeBytes: 50e9 })).toMatchObject({ ok: false, reason: "quota" });
    expect(planDownload(m, { usedBytes: 0, quotaBytes: 10e9, freeBytes: 2.5e9 })).toMatchObject({ ok: false, reason: "disk" });
    expect(planDownload(m, { usedBytes: 0, quotaBytes: 10e9, freeBytes: 50e9 }, 2e9)).toMatchObject({ ok: false, reason: "memory" });
    expect(modelsThatFit(good as never, 2e9)).toEqual([]);
  });
});
