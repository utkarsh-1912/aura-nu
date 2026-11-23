import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Tiny persistence layer shared by the grant store, SCIM directory/tokens, AI policy and usage metering.
 *
 * One interface, three backends (mirroring api/noteStore.ts):
 *  - MemoryCollection : tests / ephemeral.
 *  - FileCollection   : one JSON file per key (atomic write via rename), safe for a single Node process.
 *  - MongoCollection  : native driver collection; read-modify-write uses optimistic concurrency on `_v`.
 *                       Exercised only against an in-memory fake in tests, NOT a live MongoDB.
 *
 * Stored values are flat JSON objects whose keys must not start with "_" (reserved: _id, _v).
 */

export type Filter = Record<string, unknown>;

export interface DocCollection<T extends object> {
  get(id: string): Promise<T | null>;
  set(id: string, value: T): Promise<void>;
  /** Atomically creates the doc; false if the id already exists. */
  insertIfAbsent(id: string, value: T): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  /** Equality / array-contains / {$in:[...]} filters on top-level fields only. Filters are built server-side. */
  all(filter?: Filter): Promise<Array<{ id: string; value: T }>>;
  /**
   * Atomic read-modify-write for one id. `fn` receives the current value (or null) and returns the next
   * value, or null to delete. `fn` may run more than once (optimistic retry) so it must be pure.
   */
  update(id: string, fn: (cur: T | null) => T | null): Promise<T | null>;
}

export function matches(doc: Record<string, any>, filter?: Filter): boolean {
  if (!filter) return true;
  for (const [k, v] of Object.entries(filter)) {
    const d = doc[k];
    if (v && typeof v === "object" && !Array.isArray(v) && "$in" in (v as object)) {
      const set = (v as { $in: unknown[] }).$in;
      if (Array.isArray(d) ? !d.some((x) => set.includes(x)) : !set.includes(d)) return false;
    } else if (Array.isArray(d)) {
      if (!d.includes(v)) return false;
    } else if (d !== v) return false;
  }
  return true;
}

function assertFlat(value: object) {
  for (const k of Object.keys(value)) if (k.startsWith("_")) throw new Error(`reserved key in stored value: ${k}`);
}
const clone = <T>(v: T): T => structuredClone(v);
const stripUndefined = <T extends object>(v: T): T => JSON.parse(JSON.stringify(v));

/** Serialises async work per key. */
class KeyedMutex {
  private q = new Map<string, Promise<unknown>>();
  run<R>(key: string, fn: () => Promise<R>): Promise<R> {
    const prev = this.q.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.q.set(key, tail);
    void tail.then(() => {
      if (this.q.get(key) === tail) this.q.delete(key);
    });
    return next;
  }
}

export class MemoryCollection<T extends object> implements DocCollection<T> {
  private m = new Map<string, T>();
  private mu = new KeyedMutex();
  async get(id: string) {
    const v = this.m.get(id);
    return v ? clone(v) : null;
  }
  private put(id: string, value: T) {
    assertFlat(value);
    this.m.set(id, clone(stripUndefined(value)));
  }
  set(id: string, value: T) {
    return this.mu.run(id, async () => this.put(id, value));
  }
  insertIfAbsent(id: string, value: T) {
    return this.mu.run(id, async () => {
      if (this.m.has(id)) return false;
      this.put(id, value);
      return true;
    });
  }
  remove(id: string) {
    return this.mu.run(id, async () => this.m.delete(id));
  }
  async all(filter?: Filter) {
    return [...this.m.entries()].filter(([, v]) => matches(v, filter)).map(([id, v]) => ({ id, value: clone(v) }));
  }
  update(id: string, fn: (cur: T | null) => T | null) {
    return this.mu.run(id, async () => {
      const cur = this.m.get(id);
      const next = fn(cur ? clone(cur) : null);
      if (next === null) {
        this.m.delete(id);
        return null;
      }
      this.put(id, next);
      return clone(next);
    });
  }
}

/** <dir>/<sha256(id)>.json holding { id, value }. Per-key mutex + atomic rename. */
export class FileCollection<T extends object> implements DocCollection<T> {
  private mu = new KeyedMutex();
  private seq = 0;
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }
  private file(id: string) {
    return path.join(this.dir, createHash("sha256").update(id).digest("hex") + ".json");
  }
  private async read(id: string): Promise<T | null> {
    try {
      const rec = JSON.parse(await fs.promises.readFile(this.file(id), "utf-8"));
      return rec.value as T;
    } catch (e: any) {
      if (e?.code === "ENOENT") return null;
      throw e; // corrupt file: fail loudly rather than silently losing grants/tokens
    }
  }
  private async write(id: string, value: T) {
    assertFlat(value);
    const f = this.file(id);
    const tmp = `${f}.${process.pid}.${++this.seq}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify({ id, value }), "utf-8");
    await fs.promises.rename(tmp, f);
  }
  get(id: string) {
    return this.read(id);
  }
  set(id: string, value: T) {
    return this.mu.run(id, () => this.write(id, value));
  }
  insertIfAbsent(id: string, value: T) {
    return this.mu.run(id, async () => {
      if ((await this.read(id)) !== null) return false;
      await this.write(id, value);
      return true;
    });
  }
  remove(id: string) {
    return this.mu.run(id, async () => {
      try {
        await fs.promises.unlink(this.file(id));
        return true;
      } catch (e: any) {
        if (e?.code === "ENOENT") return false;
        throw e;
      }
    });
  }
  async all(filter?: Filter) {
    const out: Array<{ id: string; value: T }> = [];
    for (const name of await fs.promises.readdir(this.dir)) {
      if (!name.endsWith(".json")) continue;
      let rec: any;
      try {
        rec = JSON.parse(await fs.promises.readFile(path.join(this.dir, name), "utf-8"));
      } catch (e: any) {
        if (e?.code === "ENOENT") continue; // removed concurrently
        throw e;
      }
      if (matches(rec.value, filter)) out.push({ id: rec.id, value: rec.value });
    }
    return out;
  }
  update(id: string, fn: (cur: T | null) => T | null) {
    return this.mu.run(id, async () => {
      const next = fn(await this.read(id));
      if (next === null) {
        try {
          await fs.promises.unlink(this.file(id));
        } catch (e: any) {
          if (e?.code !== "ENOENT") throw e;
        }
        return null;
      }
      await this.write(id, next);
      return next;
    });
  }
}

/** Structural view of a native MongoDB collection (no driver import needed). */
export interface MongoCollLike {
  findOne(f: Record<string, unknown>): Promise<any>;
  find(f: Record<string, unknown>): { toArray(): Promise<any[]> };
  insertOne(doc: Record<string, unknown>): Promise<unknown>;
  replaceOne(f: Record<string, unknown>, doc: Record<string, unknown>, opts?: Record<string, unknown>): Promise<{ matchedCount?: number }>;
  deleteOne(f: Record<string, unknown>): Promise<{ deletedCount?: number }>;
}

const strip = (d: any) => {
  const { _id, _v, ...rest } = d;
  return rest;
};

export class MongoCollection<T extends object> implements DocCollection<T> {
  /** In-process serialisation removes self-contention; `_v` CAS still protects against other processes. */
  private mu = new KeyedMutex();
  constructor(private col: MongoCollLike) {}
  async get(id: string) {
    const d = await this.col.findOne({ _id: id });
    return d ? (strip(d) as T) : null;
  }
  async set(id: string, value: T) {
    assertFlat(value);
    await this.col.replaceOne({ _id: id }, { ...stripUndefined(value), _id: id, _v: randomUUID() }, { upsert: true });
  }
  async insertIfAbsent(id: string, value: T) {
    assertFlat(value);
    try {
      await this.col.insertOne({ ...stripUndefined(value), _id: id, _v: randomUUID() });
      return true;
    } catch (e: any) {
      if (e?.code === 11000) return false;
      throw e;
    }
  }
  async remove(id: string) {
    return ((await this.col.deleteOne({ _id: id })).deletedCount ?? 0) > 0;
  }
  async all(filter?: Filter) {
    const docs = await this.col.find(filter ?? {}).toArray();
    return docs.map((d) => ({ id: String(d._id), value: strip(d) as T }));
  }
  update(id: string, fn: (cur: T | null) => T | null) {
    return this.mu.run(id, () => this.casUpdate(id, fn));
  }
  private async casUpdate(id: string, fn: (cur: T | null) => T | null): Promise<T | null> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const curDoc = await this.col.findOne({ _id: id });
      const next = fn(curDoc ? (strip(curDoc) as T) : null);
      if (next === null) {
        if (!curDoc) return null;
        const r = await this.col.deleteOne({ _id: id, _v: curDoc._v });
        if ((r.deletedCount ?? 0) > 0) return null;
        continue;
      }
      assertFlat(next);
      const doc = { ...stripUndefined(next), _id: id, _v: randomUUID() };
      if (!curDoc) {
        try {
          await this.col.insertOne(doc);
          return next;
        } catch (e: any) {
          if (e?.code === 11000) continue;
          throw e;
        }
      }
      const r = await this.col.replaceOne({ _id: id, _v: curDoc._v }, doc);
      if ((r.matchedCount ?? 0) > 0) return next;
    }
    throw new Error("persist: too much contention on " + id);
  }
}

export interface CollectionFactoryOpts {
  /** Root directory of the file backend. */
  dataDir: string;
  /** Returns the native collection when MongoDB is connected, otherwise null (-> file backend). */
  mongo?: (name: string) => MongoCollLike | null;
  /** Force the in-memory backend (tests). */
  memory?: boolean;
}

/** Collection that picks Mongo vs file per call, like the v2 note store does. */
export function createCollectionFactory(opts: CollectionFactoryOpts) {
  const cache = new Map<string, DocCollection<any>>();
  return function collection<T extends object>(name: string): DocCollection<T> {
    if (cache.has(name)) return cache.get(name)!;
    let col: DocCollection<T>;
    if (opts.memory) col = new MemoryCollection<T>();
    else {
      const file = new FileCollection<T>(path.join(opts.dataDir, name));
      let mongoWrapped: { raw: MongoCollLike; wrapped: MongoCollection<T> } | null = null;
      const pick = (): DocCollection<T> => {
        const raw = opts.mongo?.(name) ?? null;
        if (!raw) return file;
        if (!mongoWrapped || mongoWrapped.raw !== raw) mongoWrapped = { raw, wrapped: new MongoCollection<T>(raw) };
        return mongoWrapped.wrapped;
      };
      col = {
        get: (id) => pick().get(id),
        set: (id, v) => pick().set(id, v),
        insertIfAbsent: (id, v) => pick().insertIfAbsent(id, v),
        remove: (id) => pick().remove(id),
        all: (f) => pick().all(f),
        update: (id, fn) => pick().update(id, fn),
      };
    }
    cache.set(name, col);
    return col;
  };
}
