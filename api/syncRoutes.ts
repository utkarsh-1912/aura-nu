import { Router } from "express";
import { getUserEmail } from "./auth";
import { NoteStore } from "./noteStore";
import { isValidNoteId, validateNoteInput } from "../src/core/sync";

/** null = "create", number = expected rev, undefined = malformed. */
const parseRev = (v: unknown): number | null | undefined => {
  if (v === null || v === undefined || v === "" || v === "null") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
};

/**
 * Per-note sync API (v2). Mounted behind the global auth middleware.
 *   GET    /notes/changes?since=<seq>&limit=<n>   change feed incl. tombstones
 *   PUT    /notes/:id        { baseRev: number|null, note }   409 + current on conflict
 *   DELETE /notes/:id?baseRev=<n>                  writes a tombstone, 409 on conflict
 */
export function createSyncRouter(store: NoteStore): Router {
  const r = Router();

  r.get("/notes/changes", async (req, res) => {
    const since = Number(req.query.since ?? 0);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 500);
    if (!Number.isInteger(since) || since < 0) return res.status(400).json({ error: "invalid since" });
    try {
      res.json(await store.changes(getUserEmail(req), since, limit));
    } catch (err) {
      console.error("sync changes failed:", err);
      res.status(500).json({ error: "Failed to read changes" });
    }
  });

  r.put("/notes/:id", async (req, res) => {
    const { id } = req.params;
    if (!isValidNoteId(id)) return res.status(400).json({ error: "invalid id" });
    const baseRev = parseRev(req.body?.baseRev);
    if (baseRev === undefined) return res.status(400).json({ error: "invalid baseRev" });
    const v = validateNoteInput(req.body?.note);
    if (v.ok === false) return res.status(400).json({ error: v.error });
    if (v.value.id !== id) return res.status(400).json({ error: "id mismatch" });
    try {
      const result = await store.put(getUserEmail(req), v.value, baseRev);
      if (result.status === "conflict") return res.status(409).json({ error: "conflict", current: result.current });
      res.json({ note: result.note });
    } catch (err) {
      console.error("sync put failed:", err);
      res.status(500).json({ error: "Failed to save note" });
    }
  });

  r.delete("/notes/:id", async (req, res) => {
    const { id } = req.params;
    if (!isValidNoteId(id)) return res.status(400).json({ error: "invalid id" });
    const baseRev = parseRev(req.query.baseRev);
    if (baseRev === undefined || baseRev === null) return res.status(400).json({ error: "baseRev required" });
    try {
      const result = await store.remove(getUserEmail(req), id, baseRev);
      if (result.status === "conflict") return res.status(409).json({ error: "conflict", current: result.current });
      res.json({ note: result.note });
    } catch (err) {
      console.error("sync delete failed:", err);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  return r;
}
