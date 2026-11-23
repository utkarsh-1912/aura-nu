import { describe, it, expect } from "vitest";
import { parseFlag, readFlag, writeFlag } from "../../src/features/flags";
import { NoteIndexer, isEncryptedContent } from "../../src/features/indexes/noteIndexer";
import { applyRenameChanges } from "../../src/features/indexes/rename";
import { applyContentChange, makeNote, resolveFolderPath } from "../../src/features/noteUtils";
import { classifyFiles, planImport } from "../../src/features/import/plan";
import { parseLaunchIntent, stashIntent, consumeIntent, applyShare, shareToMarkdown, readAndClearShare, SHARE_CACHE } from "../../src/features/pwa/shareTarget";
import { parseSmartFolders } from "../../src/features/smartFolders/store";
import { formToRule, ruleToForm } from "../../src/features/smartFolders/form";
import { rankTitleSuggestions } from "../../src/features/editor/wikiSuggest";
import { quickNoteFromPayload, folderIdToPath, mergeReconcile } from "../../src/features/desktop/folderMap";
import { encryptNote, removeEncryption, isEncryptedNote } from "../../src/features/encryption/helpers";
import { lockText } from "../../src/core/vaultCrypto";
import { searchNotes } from "../../src/features/search/searchNotes";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const n = (id: string, title: string, content = "", extra: object = {}): any => ({
  ...makeNote({ id, workspaceId: "w", title, content, folder: "f1" }, new Date("2026-01-01")), ...extra,
});

describe("flags", () => {
  it("defaults off, only true/1 enable", () => {
    expect(parseFlag(null)).toBe(false);
    expect(parseFlag("false")).toBe(false);
    expect(parseFlag("true")).toBe(true);
    const s = mem();
    expect(readFlag("k", s)).toBe(false);
    writeFlag("k", true, s);
    expect(readFlag("k", s)).toBe(true);
    expect(readFlag("k", null)).toBe(false);
  });
});

describe("NoteIndexer", () => {
  it("builds incrementally and handles update/remove", () => {
    const ix = new NoteIndexer();
    const a = n("a", "Alpha", "see [[Beta]]");
    const b = n("b", "Beta", "hello world");
    expect(ix.sync([a, b])).toBe(2);
    ix.flush();
    expect(ix.link.backlinks("b").length).toBe(1);
    expect(ix.search.search("hello").map((h) => h.id)).toEqual(["b"]);
    expect(ix.sync([a, { ...b, content: "changed text" }])).toBe(1);
    ix.flush();
    expect(ix.search.search("hello")).toEqual([]);
    expect(ix.sync([a])).toBe(1);
    ix.flush();
    expect(ix.indexed).toBe(1);
    expect(ix.sync([a])).toBe(0);
  });
  it("respects the time budget", () => {
    const ix = new NoteIndexer();
    ix.sync(Array.from({ length: 50 }, (_, i) => n(`n${i}`, `T${i}`, "x")));
    let t = 0;
    const left = ix.step(2, () => t++);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(50);
  });
  it("never indexes encrypted bodies", async () => {
    const env = await lockText("secret zebra", "pw-pw-pw-pw", { iterations: 100000 });
    expect(isEncryptedContent(env)).toBe(true);
    const ix = new NoteIndexer();
    ix.sync([n("e", "Vault", env)]);
    ix.flush();
    expect(ix.search.search("zebra")).toEqual([]);
    expect(ix.search.search("vault").length).toBe(1);
  });
  it("plans a rename against the old title even if the index already has the new one", () => {
    const ix = new NoteIndexer();
    const a = n("a", "Alpha", "x");
    const b = n("b", "Beta", "link to [[Alpha]]");
    ix.sync([a, b]);
    ix.flush();
    ix.sync([{ ...a, title: "Alpha 2" }, b]);
    ix.flush();
    const changes = ix.planRename("a", "Alpha", "Alpha 2");
    const res = applyRenameChanges([{ ...a, title: "Alpha 2" }, b], changes, "a");
    expect(res.rewritten).toBe(1);
    expect(res.notes[1].content).toBe("link to [[Alpha 2]]");
  });
});

describe("search wrapper", () => {
  it("supports #tag filters and null for punctuation", () => {
    const ix = new NoteIndexer();
    ix.sync([n("a", "Plan", "roadmap", { tags: ["work"] }), n("b", "Plan B", "roadmap", { tags: [] })]);
    ix.flush();
    expect(searchNotes(ix.search, "roadmap #work")!.order).toEqual(["a"]);
    expect(searchNotes(ix.search, "?!")).toBeNull();
  });
});

describe("note utils", () => {
  it("applyContentChange mirrors legacy history/count rules", () => {
    const r = applyContentChange(n("a", "T", "one"), "one two three four five six seven eight nine ten eleven twelve thirteen", new Date("2026-02-01"));
    expect(r.wordCount).toBe(13);
    expect(r.versionHistory![0].content).toBe("one");
    expect(r.updatedAt).toContain("2026-02-01");
    expect(applyContentChange(r, r.content + "!", new Date()).versionHistory!.length).toBe(1 + 1);
  });
  it("resolveFolderPath reuses and creates nested folders", () => {
    let i = 0;
    const r = resolveFolderPath(["work", "Plans"], [{ id: "x", workspaceId: "w", name: "Work" }], "w", () => `f${++i}`);
    expect(r.created.length).toBe(1);
    expect(r.created[0].parentId).toBe("x");
    expect(r.folderId).toBe(r.created[0].id);
  });
});

describe("import planning", () => {
  it("classifies by extension and source", () => {
    const files = ["a.md", "b.zip", "c.enex", "d.html", ".x/e.md", "f.pdf"].map((path) => ({ path, size: 1 }));
    const auto = classifyFiles(files, "auto");
    expect(auto.groups.map((g) => g.kind).sort()).toEqual(["apple", "evernote", "markdown", "notion"]);
    expect(auto.skipped.length).toBe(2);
    expect(classifyFiles(files, "apple").groups[0].paths).toEqual(["a.md", "d.html"]);
  });
  it("maps imported notes to folders and notes", () => {
    let i = 0;
    const plan = planImport([
      { title: "A", markdown: "one two", tags: ["t"], folderPath: ["Proj", "Sub"], attachments: [{ name: "x", size: 1 }], source: "notion", createdAt: "2020-01-01T00:00:00.000Z" },
      { title: "B", markdown: "", tags: [], folderPath: [], attachments: [], source: "markdown" },
    ], [], "w", () => `id${++i}`);
    expect(plan.newFolders.length).toBe(2);
    expect(plan.notes[0].wordCount).toBe(2);
    expect(plan.notes[0].createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(plan.notes[1].folder).toBe("f-general");
    expect(plan.warnings[0]).toMatch(/attachment/);
  });
});

describe("share target + launch intents", () => {
  it("parses intents and expires them", () => {
    expect(parseLaunchIntent("/", "?share=1")!.kind).toBe("share");
    expect(parseLaunchIntent("/", "?action=quick-note")!.kind).toBe("quick-note");
    expect(parseLaunchIntent("/", "?action=evil")).toBeNull();
    const s = mem();
    stashIntent({ kind: "new-note", at: 1000 }, s);
    expect(consumeIntent(s, 1000 + 11 * 60_000)).toBeNull();
    stashIntent({ kind: "new-note", at: 1000 }, s);
    expect(consumeIntent(s, 2000)!.kind).toBe("new-note");
    expect(consumeIntent(s, 2000)).toBeNull();
  });
  const payload = {
    title: "", text: "hello\nmore", url: "https://example.com/p", at: 1,
    files: [
      { name: "n.txt", type: "text/plain", size: 3, bytes: new TextEncoder().encode("txt").buffer as ArrayBuffer },
      { name: "a.pdf", type: "application/pdf", size: 9 },
    ],
  };
  it("creates or appends", () => {
    const md = shareToMarkdown(payload);
    expect(md.title).toBe("hello");
    expect(md.markdown).toContain("[https://example.com/p]");
    expect(md.markdown).toContain("txt");
    expect(md.notes.length).toBe(1);
    const base = n("a", "T", "body");
    const created = applyShare([base], payload, { workspaceId: "w", folder: "f1", newId: () => "new" });
    expect(created.noteId).toBe("new");
    expect(created.notes.length).toBe(2);
    const appended = applyShare([base], payload, { workspaceId: "w", folder: "f1", newId: () => "new", targetId: "a" });
    expect(appended.notes.length).toBe(1);
    expect(appended.notes[0].content.startsWith("body\n\nhello")).toBe(true);
  });
  it("reads then deletes the cache", async () => {
    const store = new Map<string, Response>([["/__share/meta", new Response(JSON.stringify({ title: "t", text: "x", url: "", at: Date.now() }))]]);
    let deleted = "";
    const caches = {
      open: async () => ({ match: async (k: string) => store.get(k), delete: async () => true }),
      delete: async (nm: string) => { deleted = nm; return true; },
    };
    const p = await readAndClearShare(caches as any);
    expect(p!.title).toBe("t");
    expect(deleted).toBe(SHARE_CACHE);
    expect(await readAndClearShare(undefined)).toBeNull();
  });
});

describe("smart folders", () => {
  it("parse drops invalid entries", () => {
    const raw = JSON.stringify([
      { id: "1", name: "ok", rule: { type: "cond", field: "pinned", op: "is", value: true } },
      { id: "2", name: "bad", rule: { type: "cond", field: "nope", op: "is" } },
      5,
    ]);
    expect(parseSmartFolders(raw).map((f) => f.id)).toEqual(["1"]);
    expect(parseSmartFolders("{")).toEqual([]);
  });
  it("form <-> rule round trip", () => {
    const r = formToRule({ match: "or", conds: [{ field: "tag", op: "has", value: "a, #b" }, { field: "pinned", op: "is", value: "true" }, { field: "wordCount", op: "gt", value: "5" }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = ruleToForm(r.rule)!;
      expect(f.match).toBe("or");
      expect(f.conds[0].value).toBe("a, b");
    }
    expect(formToRule({ match: "and", conds: [] }).ok).toBe(false);
    expect(formToRule({ match: "and", conds: [{ field: "wordCount", op: "gt", value: "x" }] }).ok).toBe(false);
  });
});

describe("wiki suggestions", () => {
  it("ranks prefix first, offers create, hides trashed", () => {
    const notes = [{ id: "1", title: "Project Alpha" }, { id: "2", title: "Alpha" }, { id: "3", title: "Alphabet", isTrashed: true }];
    const r = rankTitleSuggestions(notes, "alp", "x");
    expect(r.map((s) => s.title)).toEqual(["Alpha", "Project Alpha", "alp"]);
    expect(r[2].kind).toBe("create");
    expect(rankTitleSuggestions(notes, "Alpha", "2").some((s) => s.kind === "create")).toBe(false);
  });
});

describe("desktop mapping", () => {
  it("quick note payload", () => {
    expect(quickNoteFromPayload({ text: "  ", createdAt: "1" })).toBeNull();
    const q = quickNoteFromPayload({ text: "# Hi\nbody", createdAt: "1700000000000" })!;
    expect(q.title).toBe("Hi");
    expect(q.createdAt).toBe(new Date(1700000000000).toISOString());
  });
  it("folder paths and merge", () => {
    const folders = [{ id: "a", workspaceId: "w", name: "A" }, { id: "b", workspaceId: "w", name: "B", parentId: "a" }];
    expect(folderIdToPath(folders, "b")).toBe("A/B");
    const x = n("x", "X");
    const y = n("y", "Y");
    expect(mergeReconcile([x, y], [{ ...x, title: "X2" }, n("z", "Z")], ["y"]).map((m) => m.title)).toEqual(["X2", "Z"]);
  });
});

describe("encryption helper", () => {
  it("encrypts, wipes history, and decrypts", async () => {
    const note = { ...n("a", "T", "top secret"), versionHistory: [{ timestamp: "t", content: "old plaintext" }] };
    const enc = await encryptNote(note, "correct horse");
    expect(isEncryptedNote(enc)).toBe(true);
    expect(enc.isLocked).toBe(true);
    expect(enc.versionHistory).toEqual([]);
    expect(enc.content).not.toContain("secret");
    await expect(removeEncryption(enc, "wrong")).rejects.toThrow();
    const back = await removeEncryption(enc, "correct horse");
    expect(back.content).toBe("top secret");
    expect(back.isLocked).toBe(false);
  }, 60000);
});
