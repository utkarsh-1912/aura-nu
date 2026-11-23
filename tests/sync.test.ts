import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import { isDestructiveSync, mergeNoteFields, validateNoteInput, NoteInput } from "../src/core/sync";
import { MemoryNoteStore, FileNoteStore } from "../api/noteStore";
import { createSyncRouter } from "../api/syncRoutes";
import { requireAuth } from "../api/auth";
import { requireOrgRole, ORG_ADMINS, ANY_MEMBER } from "../api/orgAccess";
import { emptyState, editNote, deleteNote, syncOnce, visibleNotes, Transport, SyncState } from "../src/core/syncEngine";

const note = (id: string, over: Partial<NoteInput> = {}): NoteInput => ({
  id, workspaceId: "ws1", title: "T", content: "body", tags: [], isPinned: false, isShared: false,
  isFavorite: false, folder: "General", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  wordCount: 1, readingTime: 1, ...over,
});

describe("validateNoteInput", () => {
  it("accepts a valid note and drops unknown keys", () => {
    const r = validateNoteInput({ ...note("a"), evil: "x", userEmail: "victim@x.io" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value)).not.toContain("userEmail");
  });
  it("rejects bad ids, oversized and mistyped fields", () => {
    expect(validateNoteInput({ ...note("../x") }).ok).toBe(false);
    expect(validateNoteInput({ ...note("a"), content: "x".repeat(2_000_001) }).ok).toBe(false);
    expect(validateNoteInput({ ...note("a"), tags: "nope" }).ok).toBe(false);
    expect(validateNoteInput({ ...note("a"), status: "Hacked" }).ok).toBe(false);
    expect(validateNoteInput(null).ok).toBe(false);
  });
});

describe("isDestructiveSync", () => {
  it("blocks wiping everything and mass deletes, allows small deletes", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    expect(isDestructiveSync(ids, [])).toBe(true);
    expect(isDestructiveSync(ids, ids.slice(0, 5))).toBe(true);
    expect(isDestructiveSync(ids, ids.slice(1))).toBe(false);
    expect(isDestructiveSync([], [])).toBe(false);
    expect(isDestructiveSync(["a"], [])).toBe(true);
  });
});

describe("mergeNoteFields", () => {
  const base = note("a");
  it("combines edits to different fields without conflict", () => {
    const m = mergeNoteFields(base, note("a", { title: "Mine" }), note("a", { isPinned: true }));
    expect(m.conflicts).toEqual([]);
    expect(m.merged.title).toBe("Mine");
    expect(m.merged.isPinned).toBe(true);
  });
  it("reports same-field conflicts and unions tags", () => {
    const m = mergeNoteFields(base, note("a", { content: "L", tags: ["x"] }), note("a", { content: "R", tags: ["y"] }));
    expect(m.conflicts).toEqual(["content"]);
    expect(m.merged.tags.sort()).toEqual(["x", "y"]);
  });
  it("detects an already-applied retry", () => {
    const edited = note("a", { title: "Same" });
    expect(mergeNoteFields(base, edited, edited).alreadyApplied).toBe(true);
  });
});

describe("NoteStore semantics (memory + file)", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "aura-store-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  for (const [name, make] of [["memory", () => new MemoryNoteStore()], ["file", () => new FileNoteStore(dir)]] as const) {
    it(`${name}: create, update with rev, conflict, tombstone, feed`, async () => {
      const s = make();
      const c = await s.put("u@x.io", note("a"), null);
      expect(c.status).toBe("ok");
      if (c.status !== "ok") return;
      expect(c.note.rev).toBe(1);

      expect((await s.put("u@x.io", note("a"), null)).status).toBe("conflict"); // duplicate create
      const u = await s.put("u@x.io", note("a", { title: "v2" }), 1);
      expect(u.status === "ok" && u.note.rev).toBe(2);
      expect((await s.put("u@x.io", note("a", { title: "stale" }), 1)).status).toBe("conflict");

      const d = await s.remove("u@x.io", "a", 2);
      expect(d.status === "ok" && d.note.deleted).toBe(true);
      const feed = await s.changes("u@x.io", 0, 10);
      expect(feed.notes).toHaveLength(1);
      expect(feed.notes[0].deleted).toBe(true);
      expect(feed.notes[0].content).toBeUndefined(); // tombstone drops content
    });

    it(`${name}: users are isolated and concurrent writes serialise`, async () => {
      const s = make();
      await s.put("a@x.io", note("shared-id"), null);
      expect((await s.changes("b@x.io", 0, 10)).notes).toHaveLength(0);
      const results = await Promise.all(Array.from({ length: 10 }, () => s.put("a@x.io", note("race"), null)));
      expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    });
  }

  it("file store persists across instances and paginates", async () => {
    const s1 = new FileNoteStore(dir);
    for (let i = 0; i < 5; i++) await s1.put("u@x.io", note(`n${i}`), null);
    const s2 = new FileNoteStore(dir);
    const p1 = await s2.changes("u@x.io", 0, 3);
    expect(p1.notes).toHaveLength(3);
    expect(p1.hasMore).toBe(true);
    const p2 = await s2.changes("u@x.io", p1.cursor, 3);
    expect(p2.notes).toHaveLength(2);
    expect(p2.hasMore).toBe(false);
  });
});

describe("sync HTTP API", () => {
  const makeApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api", requireAuth(() => ({ production: false })));
    app.use("/api/v2", createSyncRouter(new MemoryNoteStore()));
    return app;
  };
  it("PUT/GET/DELETE with 409 conflicts and validation", async () => {
    const app = makeApp();
    const h = { "x-user-email": "u@x.io" };
    const put = await request(app).put("/api/v2/notes/a").set(h).send({ baseRev: null, note: note("a") });
    expect(put.status).toBe(200);
    expect(put.body.note.rev).toBe(1);

    const stale = await request(app).put("/api/v2/notes/a").set(h).send({ baseRev: null, note: note("a") });
    expect(stale.status).toBe(409);
    expect(stale.body.current.rev).toBe(1);

    expect((await request(app).put("/api/v2/notes/a").set(h).send({ baseRev: 1, note: note("b") })).status).toBe(400);
    expect((await request(app).put("/api/v2/notes/a").set(h).send({ baseRev: "x", note: note("a") })).status).toBe(400);
    expect((await request(app).put("/api/v2/notes/a").set(h).send({ baseRev: 1, note: { id: "a" } })).status).toBe(400);

    expect((await request(app).get("/api/v2/notes/changes?since=0").set(h)).body.notes).toHaveLength(1);
    expect((await request(app).get("/api/v2/notes/changes?since=0").set({ "x-user-email": "other@x.io" })).body.notes).toHaveLength(0);

    expect((await request(app).delete("/api/v2/notes/a").set(h)).status).toBe(400); // baseRev required
    expect((await request(app).delete("/api/v2/notes/a?baseRev=1").set(h)).status).toBe(200);
    expect((await request(app).delete("/api/v2/notes/a?baseRev=1").set(h)).status).toBe(409);
  });
});

describe("requireOrgRole", () => {
  const appFor = (role: string | null, opts: { available?: boolean; production?: boolean } = {}) => {
    const app = express();
    app.use((req, _res, next) => { (req as any).userEmail = "u@x.io"; next(); });
    const deps = { getRole: async () => role as any, available: () => opts.available ?? true, production: opts.production ?? false };
    app.get("/org/:orgId/members", requireOrgRole(ANY_MEMBER, deps), (_q, r) => r.json({ ok: true }));
    app.post("/org/:orgId/invite", requireOrgRole(ORG_ADMINS, deps), (_q, r) => r.json({ ok: true }));
    return app;
  };
  it("404 for non-members, 403 for low roles, 200 for allowed", async () => {
    expect((await request(appFor(null)).get("/org/o1/members")).status).toBe(404);
    expect((await request(appFor("Member")).post("/org/o1/invite")).status).toBe(403);
    expect((await request(appFor("Member")).get("/org/o1/members")).status).toBe(200);
    expect((await request(appFor("OrgAdmin")).post("/org/o1/invite")).status).toBe(200);
  });
  it("fails closed in production without a database, open in dev", async () => {
    expect((await request(appFor(null, { available: false, production: true })).get("/org/o1/members")).status).toBe(503);
    expect((await request(appFor(null, { available: false })).get("/org/o1/members")).status).toBe(200);
  });
});

describe("syncEngine (two devices against one store)", () => {
  const transportFor = (store: MemoryNoteStore, email = "u@x.io"): Transport => ({
    changes: (since, limit) => store.changes(email, since, limit),
    put: (n, rev) => store.put(email, n, rev),
    remove: (id, rev) => store.remove(email, id, rev),
  });

  it("propagates create, edit and delete between devices", async () => {
    const store = new MemoryNoteStore();
    const t = transportFor(store);
    let A: SyncState = editNote(emptyState(), note("a", { title: "one" }));
    A = (await syncOnce(A, t)).state;
    let B = (await syncOnce(emptyState(), t)).state;
    expect(visibleNotes(B).map((n) => n.title)).toEqual(["one"]);

    B = editNote(B, { ...visibleNotes(B)[0], title: "two" });
    B = (await syncOnce(B, t)).state;
    A = (await syncOnce(A, t)).state;
    expect(visibleNotes(A)[0].title).toBe("two");

    A = deleteNote(A, "a");
    A = (await syncOnce(A, t)).state;
    B = (await syncOnce(B, t)).state;
    expect(visibleNotes(B)).toHaveLength(0);
  });

  it("merges disjoint concurrent edits and never loses a body conflict", async () => {
    const store = new MemoryNoteStore();
    const t = transportFor(store);
    let A = (await syncOnce(editNote(emptyState(), note("a")), t)).state;
    let B = (await syncOnce(emptyState(), t)).state;

    A = editNote(A, { ...visibleNotes(A)[0], isPinned: true, content: "A body" });
    B = editNote(B, { ...visibleNotes(B)[0], title: "B title", content: "B body" });
    A = (await syncOnce(A, t)).state;
    const rb = await syncOnce(B, t);
    B = rb.state;

    const merged = visibleNotes(B).find((n) => n.id === "a")!;
    expect(merged.isPinned).toBe(true);
    expect(merged.title).toBe("B title");
    expect(merged.content).toBe("B body");
    expect(rb.conflictCopies).toHaveLength(1);
    expect(rb.conflictCopies[0].content).toBe("A body"); // A's version preserved
  });

  it("edit beats delete, and a network failure keeps the edit dirty", async () => {
    const store = new MemoryNoteStore();
    const t = transportFor(store);
    let A = (await syncOnce(editNote(emptyState(), note("a")), t)).state;
    let B = (await syncOnce(emptyState(), t)).state;

    B = deleteNote(B, "a");
    await syncOnce(B, t);
    A = editNote(A, { ...visibleNotes(A)[0], title: "revived" });
    A = (await syncOnce(A, t)).state;
    expect(visibleNotes(A)[0].title).toBe("revived");

    const failing: Transport = { ...t, put: async () => { throw new Error("offline"); } };
    A = editNote(A, { ...visibleNotes(A)[0], title: "offline edit" });
    await expect(syncOnce(A, failing)).rejects.toThrow("offline");
    expect(A.entries["a"].dirty).toBe(true); // original state untouched, retry later
    A = (await syncOnce(A, t)).state;
    expect(visibleNotes((await syncOnce(emptyState(), t)).state)[0].title).toBe("offline edit");
  });
});
