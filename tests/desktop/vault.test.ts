import { describe, expect, it } from "vitest";
import type { NoteInput } from "../../src/core/sync";
import { sha256Hasher } from "../../src/desktop/vault/hash";
import { dirsFromFolderPaths, folderPathOf } from "../../src/desktop/vault/folders";
import { INDEX_PATH, loadIndex, parseIndex, rebuildIndex, saveIndex, serializeIndex } from "../../src/desktop/vault";
import { markdownToNote, noteToMarkdown, splitFrontmatter } from "../../src/desktop/vault/markdown";
import { allocatePath, folderToDir, matchesStem, normalizeVaultPath, pathKey, sanitizeSegment, VaultPathError } from "../../src/desktop/vault/paths";
import { applyReconcile, reconcile } from "../../src/desktop/vault/reconcile";
import { MemoryVaultFs } from "../../src/desktop/vault/vaultFs";
import { parseYaml, serializeYaml, YamlError } from "../../src/desktop/vault/yaml";
import type { VaultIndex } from "../../src/desktop/vault";

const T0 = "2026-01-01T00:00:00.000Z";
const mk = (id: string, over: Partial<NoteInput> = {}): NoteInput => ({
  id, workspaceId: "ws", title: `Note ${id}`, content: `body of ${id}\n`, tags: [], isPinned: false, isShared: false,
  isFavorite: false, folder: "", createdAt: T0, updatedAt: T0, wordCount: 3, readingTime: 1, ...over,
});

describe("yaml subset", () => {
  it("round-trips tricky strings and lists", () => {
    const m = { a: "plain text", b: "true", c: "12", d: 'he said "hi"\nline2', e: "", f: " lead", g: "x: y # z", h: ["a", "b c", "", "null"], i: [], j: 3.5, k: false, l: null };
    expect(parseYaml(serializeYaml(m))).toEqual(m);
  });
  it("parses hand-written flow lists, single quotes, comments, CRLF", () => {
    const y = parseYaml("# c\r\ntitle: 'it''s'\r\ntags: [a, \"b, c\", d]\r\npinned: true\r\nn: ~\r\n");
    expect(y).toEqual({ title: "it's", tags: ["a", "b, c", "d"], pinned: true, n: null });
  });
  it("rejects unsupported / hostile input instead of evaluating", () => {
    for (const bad of ["a: &x 1", "a: !!js/function f", "a: |\n  x", "__proto__: 1", "a: 1\na: 2", "just text", "a: {b: 1}", 'a: "unterminated']) {
      expect(() => parseYaml(bad)).toThrow(YamlError);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it("key with empty value is null; with items is list", () => {
    expect(parseYaml("a:\nb:\n  - x\n  - y\n")).toEqual({ a: null, b: ["x", "y"] });
  });
});

describe("paths", () => {
  it("rejects traversal and absolute paths", () => {
    for (const p of ["../x", "a/../../x", "/etc/passwd", "C:\\win", "c:/x", "a\\..\\..\\b", "a\0b", "con.md", "a/NUL", "x:y", "trail."]) {
      expect(() => normalizeVaultPath(p), p).toThrow(VaultPathError);
    }
    expect(normalizeVaultPath("a\\b//./c.md")).toBe("a/b/c.md");
  });
  it("sanitizes names deterministically", () => {
    expect(sanitizeSegment("a/b:c*d?")).toBe("a-b-c-d-");
    expect(sanitizeSegment("CON")).toBe("_CON");
    expect(sanitizeSegment("nul.txt")).toBe("_nul.txt");
    expect(sanitizeSegment("..")).toBe("Untitled");
    expect(sanitizeSegment("   ")).toBe("Untitled");
    expect(sanitizeSegment("name. ")).toBe("name");
    expect(sanitizeSegment(".hidden")).toBe("_hidden");
    expect(sanitizeSegment("x".repeat(300)).length).toBe(100);
    expect(sanitizeSegment("e\u0301")).toBe("\u00e9"); // NFC
    expect(folderToDir("A/../B\\C/")).toBe("A/B/C");
    for (let i = 0; i < 200; i++) {
      const s = sanitizeSegment(String.fromCharCode(...Array.from({ length: 12 }, () => Math.floor(Math.random() * 130))));
      expect(() => normalizeVaultPath(s + ".md")).not.toThrow();
    }
  });
  it("allocates collision-free, case-insensitive names", () => {
    const taken = new Set([pathKey("Dir/Hello.md"), pathKey("Dir/hello (2).md")]);
    expect(allocatePath("Dir", "HELLO", taken)).toBe("Dir/HELLO (3).md");
    expect(matchesStem("Dir/hello (7).md", "Dir", "Hello")).toBe(true);
    expect(matchesStem("Dir/hello 7.md", "Dir", "Hello")).toBe(false);
  });
});

describe("markdown mapping", () => {
  it("round-trips a note and preserves unknown frontmatter keys", () => {
    const n = mk("n1", { title: 'Q4: "plan"', tags: ["a", "b c"], isPinned: true, status: "Draft", folder: "Work/Q4", content: "# H\n\n---\nnot frontmatter\n" });
    const text = noteToMarkdown(n, { cssclass: "wide", custom: ["x"] });
    const back = markdownToNote(text, { workspaceId: "ws", id: "z", fileStem: "s", mtimeIso: T0 });
    expect(back.note).toMatchObject({ id: "n1", title: n.title, tags: n.tags, isPinned: true, status: "Draft", folder: "Work/Q4", content: n.content });
    expect(back.extra).toEqual({ cssclass: "wide", custom: ["x"] });
    expect(noteToMarkdown(back.note, back.extra)).toBe(text);
  });
  it("plain markdown and broken frontmatter lose nothing", () => {
    const plain = markdownToNote("# Title here\r\nbody", { workspaceId: "ws", id: "i", fileStem: "stem", mtimeIso: T0 });
    expect(plain.hadId).toBe(false);
    expect(plain.note.title).toBe("Title here");
    const broken = "---\nfoo: {bad\n---\nbody";
    const p = splitFrontmatter(broken);
    expect(p.frontmatterError).toBeTruthy();
    expect(p.body).toBe(broken);
  });
  it("folder helpers handle cycles", () => {
    const fs = [{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "a" }, { id: "c", name: "C", parentId: "x" }];
    expect(folderPathOf(fs, "a").split("/").length).toBeLessThanOrEqual(2);
    expect(folderPathOf(fs, "c")).toBe("C");
    expect(dirsFromFolderPaths(["A/B"])).toEqual(["A", "A/B"]);
  });
});

describe("sha256 hasher", () => {
  it("matches known vector", async () => {
    expect(await sha256Hasher("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

let seq = 0;
const ctx = (fs: MemoryVaultFs, notes: NoteInput[], index: VaultIndex | null) => ({
  fs, hasher: sha256Hasher, notes, index, workspaceId: "ws", newId: () => `gen${++seq}`, now: () => "2026-02-03T00:00:00.000Z",
});
async function step(fs: MemoryVaultFs, notes: NoteInput[], index: VaultIndex | null) {
  const r = await reconcile(ctx(fs, notes, index));
  return { r, notes: applyReconcile(notes, r), index: r.index };
}

describe("reconcile", () => {
  it("writes new notes to disk with collision-safe names, folders and no path escape", async () => {
    const fs = new MemoryVaultFs(true);
    const notes = [
      mk("a", { title: "Hello" }), mk("b", { title: "hello" }), mk("c", { title: "../../evil", folder: "../x/CON" }),
      mk("d", { title: "CON" }),
    ];
    const { index } = await step(fs, notes, null);
    const paths = Object.keys(fs.snapshot()).sort();
    expect(paths).toContain("Hello.md");
    expect(paths).toContain("hello (2).md");
    expect(paths.every((p) => { try { normalizeVaultPath(p); return true; } catch { return false; } })).toBe(true);
    expect(paths.some((p) => p.split("/").includes(".."))).toBe(false);
    expect(Object.keys(index.notes)).toHaveLength(4);
  });

  it("propagates app edits, title renames and folder moves to disk", async () => {
    const fs = new MemoryVaultFs();
    let s = await step(fs, [mk("a", { title: "One" })], null);
    const edited = { ...s.notes[0], title: "Two", content: "new\n", folder: "F", updatedAt: "2026-01-02T00:00:00.000Z" };
    s = await step(fs, [edited], s.index);
    expect(Object.keys(fs.snapshot())).toEqual(["F/Two.md"]);
    expect(await fs.readText("F/Two.md")).toContain("new\n");
  });

  it("imports external edits, normalizing the file once", async () => {
    const fs = new MemoryVaultFs();
    let s = await step(fs, [mk("a", { title: "One" })], null);
    const text = await fs.readText("One.md");
    await fs.writeText("One.md", text.replace("body of a", "EXTERNAL EDIT").replace(/\n/g, "\r\n"));
    s = await step(fs, s.notes, s.index);
    expect(s.r.upserts[0].content).toContain("EXTERNAL EDIT");
    expect(s.r.upserts[0].updatedAt).not.toBe(T0);
    const w = fs.writes;
    const again = await step(fs, s.notes, s.index);
    expect(again.r.upserts).toHaveLength(0);
    expect(fs.writes).toBe(w);
  });

  it("detects external rename (file keeps id) and moves between folders", async () => {
    const fs = new MemoryVaultFs();
    let s = await step(fs, [mk("a", { title: "One" })], null);
    await fs.rename("One.md", "Sub/Renamed.md");
    s = await step(fs, s.notes, s.index);
    expect(s.r.events.some((e) => e.kind === "external-move")).toBe(true);
    expect(s.notes[0].folder).toBe("Sub");
    expect(s.index.notes.a.path).toBe("Sub/Renamed.md");
    expect(s.notes[0].title).toBe("One"); // title lives in frontmatter
    expect(Object.keys(fs.snapshot())).toEqual(["Sub/Renamed.md"]);
  });

  it("simultaneous edits produce a conflict file and lose nothing", async () => {
    const fs = new MemoryVaultFs();
    let s = await step(fs, [mk("a", { title: "One" })], null);
    await fs.writeText("One.md", (await fs.readText("One.md")).replace("body of a", "DISK VERSION"));
    const appEdit = { ...s.notes[0], content: "APP VERSION\n", updatedAt: "2026-01-05T00:00:00.000Z" };
    s = await step(fs, [appEdit], s.index);
    const snap = fs.snapshot();
    expect(Object.keys(snap).sort()).toEqual(["One (conflict 2026-02-03).md", "One.md"]);
    expect(snap["One.md"]).toContain("DISK VERSION");
    expect(snap["One (conflict 2026-02-03).md"]).toContain("APP VERSION");
    expect(s.notes).toHaveLength(2);
    expect(new Set(s.notes.map((n) => n.id)).size).toBe(2);
    const again = await step(fs, s.notes, s.index);
    expect(again.r.events).toHaveLength(0);
  });

  it("deletes: app delete trashes the file; file delete removes the note; edit beats delete", async () => {
    const fs = new MemoryVaultFs();
    let s = await step(fs, [mk("a", { title: "A" }), mk("b", { title: "B" }), mk("c", { title: "C" })], null);
    await fs.remove("B.md"); // file deleted, note unchanged
    const appEditC = { ...s.notes.find((n) => n.id === "c")!, content: "edited C\n", updatedAt: "2026-01-09T00:00:00.000Z" };
    await fs.remove("C.md"); // file deleted but app edited
    s = await step(fs, [s.notes[0], s.notes[1], appEditC], s.index); // A deleted from app? no: A present
    expect(s.r.removals).toEqual(["b"]);
    expect(await fs.readText("C.md")).toContain("edited C");
    // app deletes A
    const s2 = await step(fs, s.notes.filter((n) => n.id !== "a"), s.index);
    expect(Object.keys(fs.snapshot()).some((p) => p.startsWith(".aura/trash/"))).toBe(true);
    expect(fs.snapshot()["A.md"]).toBeUndefined();
    expect(s2.index.notes.a).toBeUndefined();
  });

  it("assigns ids to id-less and duplicated files and writes them back", async () => {
    const fs = new MemoryVaultFs();
    await fs.writeText("Fresh.md", "# Fresh\nhello");
    let s = await step(fs, [mk("a", { title: "A" })], null);
    await fs.writeText("A copy.md", await fs.readText("A.md")); // duplicated file => duplicate id
    s = await step(fs, s.notes, s.index);
    expect(new Set(s.notes.map((n) => n.id)).size).toBe(s.notes.length);
    expect(s.notes).toHaveLength(3);
    expect(s.index.notes.a.path).toBe("A.md");
    expect((await fs.readText("Fresh.md"))).toMatch(/^---\nid: gen/);
  });

  it("preserves unknown frontmatter keys through app edits", async () => {
    const fs = new MemoryVaultFs();
    await fs.writeText("X.md", "---\nid: x1\ntitle: X\ncustom: keepme\n---\n\nbody");
    let s = await step(fs, [], null);
    s = await step(fs, [{ ...s.notes[0], content: "changed" }], s.index);
    expect(await fs.readText("X.md")).toContain("custom: keepme");
  });

  it("index can be rebuilt from disk and persisted", async () => {
    const fs = new MemoryVaultFs();
    const s = await step(fs, [mk("a"), mk("b", { folder: "F" })], null);
    await saveIndex(fs, s.index);
    expect(await loadIndex(fs)).toEqual(s.index);
    await fs.writeText(INDEX_PATH, "{corrupt");
    expect(await loadIndex(fs)).toBeNull();
    await fs.writeText("Loose.md", "no id");
    const rb = await rebuildIndex(fs, sha256Hasher, { workspaceId: "ws", now: () => T0 });
    expect(Object.keys(rb.index.notes).sort()).toEqual(["a", "b"]);
    expect(rb.skipped).toEqual(["Loose.md"]);
    // a rebuilt index + its notes is a fixed point
    const again = await step(fs, rb.notes, rb.index);
    expect(again.r.removals).toEqual([]);
    expect(parseIndex(serializeIndex(rb.index))).toEqual(rb.index);
    expect(parseIndex('{"version":1,"notes":{"a":{"path":1}}}')).toBeNull();
  });
});

describe("reconcile property tests (randomized)", () => {
  function rng(seed: number) {
    let x = seed >>> 0;
    return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  }
  it("is idempotent, converges, and keeps app/vault ids identical under random mutations", async () => {
    for (let seed = 1; seed <= 15; seed++) {
      const rand = rng(seed);
      const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
      const fs = new MemoryVaultFs(rand() < 0.5);
      let notes: NoteInput[] = [];
      let index: VaultIndex | null = null;
      let counter = 0;
      const titles = ["Alpha", "alpha", "Beta", "CON", "a/b", "Gamma.", "Δelta"];
      const folders = ["", "F", "F/G", "H"];
      const dirPick = () => { const d = pick(folders); return d ? d + "/" : ""; };
      for (let round = 0; round < 12; round++) {
        for (let k = 0; k < 1 + Math.floor(rand() * 4); k++) {
          const files = Object.keys(fs.snapshot()).filter((p) => !p.startsWith(".aura") && /\.md$/.test(p));
          const op = Math.floor(rand() * 8);
          const stamp = `2026-03-${String(10 + (++counter % 18)).padStart(2, "0")}T00:00:00.000Z`;
          if (op === 0) notes.push(mk(`n${seed}-${++counter}`, { title: pick(titles), folder: pick(folders), content: `c${counter}\n` }));
          else if (op === 1 && notes.length) { const n = pick(notes); notes = notes.map((x) => x.id === n.id ? { ...x, content: `app${++counter}\n`, updatedAt: stamp } : x); }
          else if (op === 2 && notes.length) { const n = pick(notes); notes = notes.map((x) => x.id === n.id ? { ...x, title: pick(titles), folder: pick(folders), updatedAt: stamp } : x); }
          else if (op === 3 && notes.length) { const n = pick(notes); notes = notes.filter((x) => x.id !== n.id); }
          else if (op === 4 && files.length) { const f = pick(files); await fs.writeText(f, (await fs.readText(f)) + `\next${++counter}`); }
          else if (op === 5 && files.length) { await fs.remove(pick(files)); }
          else if (op === 6) { await fs.writeText(`${dirPick()}ext${++counter}.md`, `# ext ${counter}\nx`); }
          else if (op === 7 && files.length) { const f = pick(files); try { await fs.rename(f, `${dirPick()}mv${++counter}.md`); } catch { /* collision */ } }
        }
        const s = await step(fs, notes, index);
        notes = s.notes;
        index = s.index;
        // idempotent: nothing to do on re-run, no fs writes
        const w = fs.writes;
        const again = await step(fs, notes, index);
        expect(again.r.upserts, `seed ${seed} round ${round}`).toEqual([]);
        expect(again.r.removals).toEqual([]);
        expect(again.r.events.filter((e) => e.kind !== "external-move")).toEqual([]);
        expect(fs.writes).toBe(w);
        expect(again.index).toEqual(index);
        // consistency: ids on disk == ids in app == ids in index; paths unique case-insensitively
        const onDisk = Object.entries(fs.snapshot()).filter(([p]) => /\.md$/.test(p) && !p.startsWith(".aura"));
        const diskIds = onDisk.map(([, t]) => /^id: (.+)$/m.exec(t)![1]).sort();
        expect(diskIds).toEqual(notes.map((n) => n.id).sort());
        expect(Object.keys(index.notes).sort()).toEqual(diskIds);
        expect(new Set(onDisk.map(([p]) => pathKey(p))).size).toBe(onDisk.length);
        for (const [p] of onDisk) expect(() => normalizeVaultPath(p)).not.toThrow();
      }
    }
  }, 60_000);
});
