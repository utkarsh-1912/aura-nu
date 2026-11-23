import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NoteInput, SyncedNote } from "../src/core/sync";

export type PutResult =
  | { status: "ok"; note: SyncedNote }
  | { status: "conflict"; current: SyncedNote | null };

export interface ChangesPage {
  notes: SyncedNote[];
  /** Pass back as `since` on the next call. */
  cursor: number;
  hasMore: boolean;
}

export interface NoteStore {
  changes(email: string, since: number, limit: number): Promise<ChangesPage>;
  /** baseRev === null means "create"; otherwise it must equal the stored rev (optimistic concurrency). */
  put(email: string, input: NoteInput, baseRev: number | null): Promise<PutResult>;
  /** Writes a tombstone. Same baseRev rules as put. */
  remove(email: string, id: string, baseRev: number | null): Promise<PutResult>;
}

type Row = { rev: number; seq: number; deleted: boolean; data: Partial<NoteInput> };
type UserDb = { seq: number; notes: Record<string, Row> };

const toNote = (id: string, r: Row): SyncedNote => ({ ...r.data, id, rev: r.rev, seq: r.seq, deleted: r.deleted });

/** Shared write logic; subclasses only provide load/save of a whole user database. */
abstract class SerializedStore implements NoteStore {
  private queues = new Map<string, Promise<unknown>>();

  protected abstract load(email: string): Promise<UserDb>;
  protected abstract save(email: string, db: UserDb): Promise<void>;

  /** Runs fn exclusively per user so read-modify-write cycles never interleave. */
  private exclusive<T>(email: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(email) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.queues.set(email, next.catch(() => undefined));
    return next;
  }

  async changes(email: string, since: number, limit: number): Promise<ChangesPage> {
    const db = await this.exclusive(email, () => this.load(email));
    const rows = Object.entries(db.notes)
      .filter(([, r]) => r.seq > since)
      .sort((a, b) => a[1].seq - b[1].seq);
    const page = rows.slice(0, limit);
    return {
      notes: page.map(([id, r]) => toNote(id, r)),
      cursor: page.length ? page[page.length - 1][1].seq : since,
      hasMore: rows.length > page.length,
    };
  }

  private write(email: string, id: string, baseRev: number | null, data: Partial<NoteInput>, deleted: boolean): Promise<PutResult> {
    return this.exclusive(email, async () => {
      const db = await this.load(email);
      const cur = db.notes[id];
      const curRev = cur ? cur.rev : null;
      if (baseRev !== curRev) {
        return { status: "conflict", current: cur ? toNote(id, cur) : null } as PutResult;
      }
      db.seq += 1;
      const row: Row = { rev: (cur?.rev ?? 0) + 1, seq: db.seq, deleted, data };
      db.notes[id] = row;
      await this.save(email, db);
      return { status: "ok", note: toNote(id, row) } as PutResult;
    });
  }

  put(email: string, input: NoteInput, baseRev: number | null) {
    return this.write(email, input.id, baseRev, input, false);
  }

  remove(email: string, id: string, baseRev: number | null) {
    // Tombstone keeps only what is needed to propagate the delete; content is dropped.
    return this.write(email, id, baseRev, {}, true);
  }
}

export class MemoryNoteStore extends SerializedStore {
  private dbs = new Map<string, UserDb>();
  protected async load(email: string) {
    if (!this.dbs.has(email)) this.dbs.set(email, { seq: 0, notes: {} });
    return structuredClone(this.dbs.get(email)!);
  }
  protected async save(email: string, db: UserDb) {
    this.dbs.set(email, structuredClone(db));
  }
}

/** One JSON file per user, named by a hash of the email (no sanitising collisions), written atomically. */
export class FileNoteStore extends SerializedStore {
  constructor(private dir: string) {
    super();
    fs.mkdirSync(dir, { recursive: true });
  }
  private file(email: string) {
    const h = crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
    return path.join(this.dir, `notes-v2-${h}.json`);
  }
  protected async load(email: string): Promise<UserDb> {
    try {
      return JSON.parse(await fs.promises.readFile(this.file(email), "utf-8"));
    } catch (err: any) {
      if (err?.code === "ENOENT") return { seq: 0, notes: {} };
      throw err; // corrupt file: fail loudly rather than silently starting empty
    }
  }
  protected async save(email: string, db: UserDb) {
    const f = this.file(email);
    const tmp = `${f}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(db), "utf-8");
    await fs.promises.rename(tmp, f);
  }
}

/**
 * MongoDB-backed store. Writes are atomic per note via conditional updates.
 * NOTE: seq is allocated from a per-user counter before the note write commits, so under
 * concurrent writers a lower seq can become visible after a higher one. Clients therefore
 * re-read with a small overlap window (see syncEngine OVERLAP). Not yet exercised against a
 * live MongoDB in CI.
 */
export function createMongoNoteStore(mongoose: typeof import("mongoose")): NoteStore {
  const RowSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    id: { type: String, required: true },
    rev: { type: Number, required: true },
    seq: { type: Number, required: true },
    deleted: { type: Boolean, default: false },
    data: mongoose.Schema.Types.Mixed,
  });
  RowSchema.index({ userEmail: 1, id: 1 }, { unique: true });
  RowSchema.index({ userEmail: 1, seq: 1 });
  const RowModel: any = mongoose.models.NoteV2 || mongoose.model("NoteV2", RowSchema);

  const CounterSchema = new mongoose.Schema({ userEmail: { type: String, unique: true }, seq: Number });
  const Counter: any = mongoose.models.NoteV2Counter || mongoose.model("NoteV2Counter", CounterSchema);

  const nextSeq = async (email: string): Promise<number> => {
    const c = await Counter.findOneAndUpdate({ userEmail: email }, { $inc: { seq: 1 } }, { upsert: true, new: true });
    return c.seq;
  };
  const doc2note = (d: any): SyncedNote => ({ ...(d.data || {}), id: d.id, rev: d.rev, seq: d.seq, deleted: !!d.deleted });

  const write = async (email: string, id: string, baseRev: number | null, data: any, deleted: boolean): Promise<PutResult> => {
    const seq = await nextSeq(email);
    if (baseRev === null) {
      try {
        const d = await RowModel.create({ userEmail: email, id, rev: 1, seq, deleted, data });
        return { status: "ok", note: doc2note(d) };
      } catch (err: any) {
        if (err?.code === 11000) {
          const cur = await RowModel.findOne({ userEmail: email, id }).lean();
          return { status: "conflict", current: cur ? doc2note(cur) : null };
        }
        throw err;
      }
    }
    const d = await RowModel.findOneAndUpdate(
      { userEmail: email, id, rev: baseRev },
      { $set: { data, deleted, seq }, $inc: { rev: 1 } },
      { new: true },
    ).lean();
    if (d) return { status: "ok", note: doc2note(d) };
    const cur = await RowModel.findOne({ userEmail: email, id }).lean();
    return { status: "conflict", current: cur ? doc2note(cur) : null };
  };

  return {
    async changes(email, since, limit) {
      const docs: any[] = await RowModel.find({ userEmail: email, seq: { $gt: since } }).sort({ seq: 1 }).limit(limit + 1).lean();
      const page = docs.slice(0, limit);
      return {
        notes: page.map(doc2note),
        cursor: page.length ? page[page.length - 1].seq : since,
        hasMore: docs.length > limit,
      };
    },
    put: (email, input, baseRev) => write(email, input.id, baseRev, input, false),
    remove: (email, id, baseRev) => write(email, id, baseRev, {}, true),
  };
}
