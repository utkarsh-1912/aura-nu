import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Persistence for Yjs documents as an append-only update log plus compaction.
 * Implementations MUST serialise operations per room themselves or be called serially (the
 * collab server serialises per room).
 */
export interface DocStore {
  /** All stored updates for the room, oldest first (a compacted room is a single snapshot update). */
  load(room: string): Promise<Uint8Array[]>;
  append(room: string, update: Uint8Array): Promise<void>;
  /** Atomically replaces the whole log with one merged snapshot update. */
  compact(room: string, snapshot: Uint8Array): Promise<void>;
  close?(): Promise<void>;
}

export class MemoryDocStore implements DocStore {
  readonly rooms = new Map<string, Uint8Array[]>();
  async load(room: string) {
    return [...(this.rooms.get(room) ?? [])];
  }
  async append(room: string, update: Uint8Array) {
    const l = this.rooms.get(room) ?? [];
    l.push(update.slice());
    this.rooms.set(room, l);
  }
  async compact(room: string, snapshot: Uint8Array) {
    this.rooms.set(room, [snapshot.slice()]);
  }
}

/**
 * File-backed log: <dir>/<sha256(room)>.log, records are [uint32 BE length][bytes].
 * A torn trailing record (crash mid-append) is ignored on load. Compaction writes a temp file and renames.
 * Room names are hashed so they can never escape the directory.
 */
export class FileDocStore implements DocStore {
  private ready: Promise<unknown>;
  constructor(private dir: string) {
    this.ready = fs.mkdir(dir, { recursive: true });
  }
  private file(room: string) {
    return path.join(this.dir, createHash("sha256").update(room).digest("hex") + ".log");
  }
  private static frame(u: Uint8Array): Buffer {
    const b = Buffer.alloc(4 + u.length);
    b.writeUInt32BE(u.length, 0);
    Buffer.from(u).copy(b, 4);
    return b;
  }
  async load(room: string) {
    await this.ready;
    let buf: Buffer;
    try {
      buf = await fs.readFile(this.file(room));
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    const out: Uint8Array[] = [];
    let off = 0;
    while (off + 4 <= buf.length) {
      const len = buf.readUInt32BE(off);
      if (off + 4 + len > buf.length) break; // torn tail
      out.push(new Uint8Array(buf.subarray(off + 4, off + 4 + len)));
      off += 4 + len;
    }
    return out;
  }
  async append(room: string, update: Uint8Array) {
    await this.ready;
    await fs.appendFile(this.file(room), FileDocStore.frame(update));
  }
  async compact(room: string, snapshot: Uint8Array) {
    await this.ready;
    const f = this.file(room);
    const tmp = `${f}.${process.pid}.tmp`;
    await fs.writeFile(tmp, FileDocStore.frame(snapshot));
    await fs.rename(tmp, f);
  }
}

/** Minimal structural view of a Mongo collection so this file needs no driver import. */
export interface MongoCollectionLike {
  find(q: Record<string, unknown>): { sort(s: Record<string, 1 | -1>): { toArray(): Promise<any[]> } };
  insertOne(doc: Record<string, unknown>): Promise<unknown>;
  deleteMany(q: Record<string, unknown>): Promise<unknown>;
}

/**
 * Mongo adapter. UNTESTED against a live MongoDB (only the interface shape is unit-testable).
 * Docs: { room, seq, data: Buffer }. Needs a unique index on { room: 1, seq: 1 }.
 * Compaction inserts the snapshot at seq = max+1 then deletes lower seqs, so a crash between the two
 * steps leaves redundant-but-correct data (Yjs updates are idempotent).
 */
export class MongoDocStore implements DocStore {
  constructor(private col: MongoCollectionLike) {}
  async load(room: string) {
    const rows = await this.col.find({ room }).sort({ seq: 1 }).toArray();
    return rows.map((r) => new Uint8Array(r.data.buffer ?? r.data));
  }
  private async lastSeq(room: string) {
    const rows = await this.col.find({ room }).sort({ seq: -1 }).toArray();
    return rows.length ? (rows[0].seq as number) : 0;
  }
  async append(room: string, update: Uint8Array) {
    await this.col.insertOne({ room, seq: (await this.lastSeq(room)) + 1, data: Buffer.from(update) });
  }
  async compact(room: string, snapshot: Uint8Array) {
    const seq = (await this.lastSeq(room)) + 1;
    await this.col.insertOne({ room, seq, data: Buffer.from(snapshot) });
    await this.col.deleteMany({ room, seq: { $lt: seq } });
  }
}
