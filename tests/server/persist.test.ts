// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileCollection, MemoryCollection, MongoCollection, createCollectionFactory, matches, type MongoCollLike } from "../../server/persist";
import { GrantStore, noteKey, roomOf, type ResourceDoc } from "../../server/grantStore";

type Doc = { n: number; tag?: string; list?: string[] };
const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "aura-persist-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** In-memory stand-in for a native Mongo collection (async, with real duplicate-key + _v semantics). */
class FakeMongo implements MongoCollLike {
  docs = new Map<string, any>();
  async findOne(f: any) {
    await Promise.resolve();
    const d = this.docs.get(f._id);
    return d ? structuredClone(d) : null;
  }
  find(f: any) {
    return { toArray: async () => [...this.docs.values()].filter((d) => matches(d, f)).map((d) => structuredClone(d)) };
  }
  async insertOne(doc: any) {
    await Promise.resolve();
    if (this.docs.has(doc._id)) throw Object.assign(new Error("dup"), { code: 11000 });
    this.docs.set(doc._id, structuredClone(doc));
    return {};
  }
  async replaceOne(f: any, doc: any, opts: any = {}) {
    await Promise.resolve();
    const cur = this.docs.get(f._id);
    if (!cur || (f._v !== undefined && cur._v !== f._v)) {
      if (opts.upsert && !cur) {
        this.docs.set(doc._id, structuredClone(doc));
        return { matchedCount: 0 };
      }
      return { matchedCount: 0 };
    }
    this.docs.set(doc._id, structuredClone(doc));
    return { matchedCount: 1 };
  }
  async deleteOne(f: any) {
    await Promise.resolve();
    const cur = this.docs.get(f._id);
    if (!cur || (f._v !== undefined && cur._v !== f._v)) return { deletedCount: 0 };
    this.docs.delete(f._id);
    return { deletedCount: 1 };
  }
}

const backends: Array<[string, () => any]> = [
  ["memory", () => new MemoryCollection<Doc>()],
  ["file", () => new FileCollection<Doc>(tmp())],
  ["mongo(fake)", () => new MongoCollection<Doc>(new FakeMongo())],
];

describe.each(backends)("DocCollection: %s", { timeout: 30_000 }, (_n, make) => {
  it("get/set/remove and insertIfAbsent", async () => {
    const c = make();
    expect(await c.get("a")).toBeNull();
    await c.set("a", { n: 1 });
    expect(await c.get("a")).toEqual({ n: 1 });
    expect(await c.insertIfAbsent("a", { n: 2 })).toBe(false);
    expect(await c.insertIfAbsent("b", { n: 3 })).toBe(true);
    expect(await c.remove("a")).toBe(true);
    expect(await c.remove("a")).toBe(false);
  });
  it("only one of many concurrent inserts wins", async () => {
    const c = make();
    const r = await Promise.all(Array.from({ length: 12 }, (_, i) => c.insertIfAbsent("k", { n: i })));
    expect(r.filter(Boolean)).toHaveLength(1);
  });
  it("update is an atomic read-modify-write under contention", async () => {
    const c = make();
    await Promise.all(Array.from({ length: 40 }, () => c.update("ctr", (cur: Doc | null) => ({ n: (cur?.n ?? 0) + 1 }))));
    expect((await c.get("ctr"))!.n).toBe(40);
  });
  it("update returning null deletes", async () => {
    const c = make();
    await c.set("a", { n: 1 });
    expect(await c.update("a", () => null)).toBeNull();
    expect(await c.get("a")).toBeNull();
  });
  it("filters: equality, array-contains, $in", async () => {
    const c = make();
    await c.set("1", { n: 1, tag: "x", list: ["p", "q"] });
    await c.set("2", { n: 2, tag: "y", list: ["q"] });
    await c.set("3", { n: 3, tag: "z" });
    expect((await c.all({ tag: "x" })).map((r: any) => r.id)).toEqual(["1"]);
    expect((await c.all({ list: "q" })).map((r: any) => r.id).sort()).toEqual(["1", "2"]);
    expect((await c.all({ tag: { $in: ["y", "z"] } })).map((r: any) => r.id).sort()).toEqual(["2", "3"]);
    expect(await c.all()).toHaveLength(3);
  });
  it("rejects reserved keys", async () => {
    await expect(make().set("a", { n: 1, _v: 1 } as any)).rejects.toThrow(/reserved/);
  });
});

describe("FileCollection durability", () => {
  it("survives a new instance and fails loudly on a corrupt file", async () => {
    const dir = tmp();
    await new FileCollection<Doc>(dir).set("a", { n: 7 });
    const again = new FileCollection<Doc>(dir);
    expect(await again.get("a")).toEqual({ n: 7 });
    const f = fs.readdirSync(dir).find((x) => x.endsWith(".json"))!;
    fs.writeFileSync(path.join(dir, f), "{not json");
    await expect(again.get("a")).rejects.toThrow();
    await expect(again.all()).rejects.toThrow();
  });
  it("never lets an id escape the directory", async () => {
    const dir = tmp();
    const c = new FileCollection<Doc>(dir);
    await c.set("../../evil", { n: 1 });
    expect(fs.readdirSync(dir).every((x) => /^[0-9a-f]{64}\.json$/.test(x))).toBe(true);
  });
});

describe("createCollectionFactory", () => {
  it("uses Mongo when a collection is provided and the file backend otherwise", async () => {
    const dir = tmp();
    const mongo = new FakeMongo();
    let active = false;
    const col = createCollectionFactory({ dataDir: dir, mongo: () => (active ? mongo : null) })<Doc>("things");
    await col.set("a", { n: 1 });
    expect(mongo.docs.size).toBe(0);
    active = true;
    await col.set("b", { n: 2 });
    expect(mongo.docs.has("b")).toBe(true);
    expect(await col.get("a")).toBeNull(); // documented: switching backends does not migrate data
  });
});

describe("GrantStore persistence", () => {
  it("grants and ownership survive a restart (file backend)", async () => {
    const dir = tmp();
    const s1 = new GrantStore(new FileCollection<ResourceDoc>(dir));
    const key = await s1.registerNote("Ann@x.io", "n1", "General");
    expect(key).toBe(noteKey("ann@x.io", "n1"));
    await s1.addGrant("note", key, (await s1.getDoc("note", key))!, {
      id: "g1", resourceType: "note", resourceId: key, principal: { type: "user", email: "bob@x.io" }, role: "Viewer", createdBy: "ann@x.io", createdAt: 1,
    });
    const s2 = new GrantStore(new FileCollection<ResourceDoc>(dir));
    const chain = await s2.loadChain(roomOf(key));
    expect(chain!.map((n) => n.type)).toEqual(["folder", "note"]);
    expect((await s2.loadGrants(chain!)).map((g) => g.id)).toEqual(["g1"]);
    expect(await s2.loadChain("note:" + "0".repeat(40))).toBeNull();
    expect(await s2.loadChain("note:short")).toBeNull();
  });
});
