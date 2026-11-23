import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { importMarkdownFiles, importNotionZip, importEnex, importAppleNotesFiles, ImportError, DEFAULT_LIMITS } from "../../src/import";

describe("markdown importer", () => {
  it("frontmatter, folders, h1 title, tags, dates", () => {
    const [a, b] = importMarkdownFiles([
      { path: "Work/Q2/plan.md", content: "---\ntitle: Plan\ntags: [Roadmap, #x]\ncreated: 2025-01-02\n---\n\n# ignored?\nbody [[Other]]" },
      { path: "Inbox/idea.md", content: "# Big Idea\n\ntext #tag1", modifiedAt: "2025-03-04T00:00:00Z" },
      { path: ".obsidian/x.md", content: "hidden" },
      { path: "pic.png", content: "" },
    ], { hashtagsAsTags: true });
    expect(a.title).toBe("Plan");
    expect(a.tags).toEqual(["roadmap", "x"]);
    expect(a.folderPath).toEqual(["Work", "Q2"]);
    expect(a.createdAt).toBe("2025-01-02T00:00:00.000Z");
    expect(a.markdown).toContain("# ignored?");
    expect(b.title).toBe("Big Idea");
    expect(b.markdown).toBe("text #tag1");
    expect(b.tags).toEqual(["tag1"]);
    expect(b.updatedAt).toBe("2025-03-04T00:00:00.000Z");
    expect(a.warnings?.[0]).toMatch(/2 /);
  });
  it("blocks path traversal in folder paths", () => {
    expect(importMarkdownFiles([{ path: "../../etc/a.md", content: "x" }])[0].folderPath).toEqual(["etc"]);
  });
});

const ID = "0123456789abcdef0123456789abcdef";
describe("notion importer", () => {
  it("md + html pages, ids stripped, links -> wikilinks, attachments", () => {
    const zip = zipSync({
      [`Space ${ID}/Page One ${ID}.md`]: strToU8(`# Page One\n\nCreated: March 3, 2024 10:00 AM\nTags: A, B\n\nSee [Page Two](Page%20Two%20${ID}.md) and [web](https://x.io).\n\n- [x] done\n`),
      [`Space ${ID}/Page Two ${ID}.html`]: strToU8(`<html><head><title>Page Two</title></head><body><h1>Page Two</h1><p>Hi <b>there</b><script>alert(1)</script></p></body></html>`),
      [`Space ${ID}/Page One ${ID}/img.png`]: new Uint8Array(10),
    });
    const notes = importNotionZip(zip);
    const one = notes.find((n) => n.title === "Page One")!;
    const two = notes.find((n) => n.title === "Page Two")!;
    expect(one.folderPath).toEqual(["Space"]);
    expect(one.markdown).toContain("[[Page Two]]");
    expect(one.markdown).toContain("[web](https://x.io)");
    expect(one.markdown).toContain("- [x] done");
    expect(one.tags).toEqual(["a", "b"]);
    expect(one.createdAt).toBeDefined();
    expect(one.attachments.map((a) => a.name)).toEqual(["img.png"]);
    expect(two.markdown).toBe("Hi **there**");
    expect(two.markdown).not.toMatch(/alert|script/);
  });
  it("rejects too many entries", () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 30; i++) files[`p${i}.md`] = strToU8("# x");
    expect(() => importNotionZip(zipSync(files), { ...DEFAULT_LIMITS, maxEntries: 10 })).toThrow(ImportError);
  });
  it("aborts zip bombs by inflated size", () => {
    const bomb = zipSync({ "bomb.md": new Uint8Array(5_000_000).fill(65) }); // compresses to a few KB
    expect(bomb.length).toBeLessThan(20_000);
    expect(() => importNotionZip(bomb, { ...DEFAULT_LIMITS, maxEntryBytes: 100_000 })).toThrow(/large|expands/);
    expect(() => importNotionZip(bomb, { ...DEFAULT_LIMITS, maxTotalBytes: 100_000 })).toThrow(ImportError);
  });
  it("rejects garbage and neutralises zip-slip names", () => {
    expect(() => importNotionZip(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(ImportError);
    const n = importNotionZip(zipSync({ "../../evil.md": strToU8("# Evil\nx") }));
    expect(n[0].folderPath).toEqual([]);
  });
});

const ENEX = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="20240101T000000Z" application="Evernote">
<note><title>Groceries &amp; more</title>
<content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><div>Shopping <b>list</b></div><div><en-todo checked="true"/>milk</div><div><en-todo/>eggs</div><div><en-media hash="abc" type="image/png"/></div><script>alert(1)</script><div><a href="javascript:alert(1)">x</a> <a href="https://e.com">ok</a></div></en-note>]]></content>
<created>20240102T030405Z</created><updated>20240203T030405Z</updated>
<tag>Food</tag><tag>Home</tag>
<resource><data encoding="base64">AAAAAAAAAAAA</data><mime>image/png</mime><resource-attributes><file-name>pic.png</file-name></resource-attributes></resource>
</note>
<note><title>Second</title><content><![CDATA[<en-note>just text</en-note>]]></content></note>
</en-export>`;
describe("enex importer", () => {
  it("converts ENML, todos, tags, dates, attachments", () => {
    const [a, b] = importEnex(ENEX);
    expect(a.title).toBe("Groceries & more");
    expect(a.markdown).toContain("Shopping **list**");
    expect(a.markdown).toContain("- [x] milk\n- [ ] eggs");
    expect(a.markdown).toContain("[attachment: image/png]");
    expect(a.markdown).toContain("[ok](https://e.com)");
    expect(a.markdown).not.toMatch(/javascript|alert|script/);
    expect(a.tags).toEqual(["food", "home"]);
    expect(a.createdAt).toBe("2024-01-02T03:04:05.000Z");
    expect(a.attachments).toEqual([{ name: "pic.png", mimeType: "image/png", size: 9 }]);
    expect(b.markdown).toBe("just text");
    expect(b.createdAt).toBeUndefined();
  });
  it("rejects non-enex and does not expand entity bombs", () => {
    expect(() => importEnex("<html/>")).toThrow(ImportError);
    const bomb = `<?xml version="1.0"?><!DOCTYPE en-export [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><en-export><note><title>&b;&b;&b;</title><content>x</content></note></en-export>`;
    const r = importEnex(bomb);
    expect(JSON.stringify(r).length).toBeLessThan(10_000);
  });
});

describe("apple notes importer (html/md/txt exports)", () => {
  it("handles html, txt and md", () => {
    const notes = importAppleNotesFiles([
      { path: "iCloud/Recipes/Pasta.html", content: "<html><head><title>Pasta</title><meta name='created' content='2023-05-06T07:08:09Z'></head><body><div><h1>Pasta</h1><ul><li>boil</li></ul><script>x</script></div></body></html>" },
      { path: "iCloud/Quick.txt", content: "\n\nFirst line\nsecond line", modifiedAt: "2024-01-01T00:00:00Z" },
      { path: "iCloud/Note.md", content: "# MD note\nbody" },
      { path: "iCloud/scan.pdf", content: "" },
    ]);
    const by = (t: string) => notes.find((n) => n.title === t)!;
    expect(by("Pasta").markdown).toBe("- boil");
    expect(by("Pasta").createdAt).toBe("2023-05-06T07:08:09.000Z");
    expect(by("Pasta").folderPath).toEqual(["iCloud", "Recipes"]);
    expect(by("First line").markdown).toBe("second line");
    expect(by("First line").updatedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(by("MD note").source).toBe("apple-notes");
    expect(notes.flatMap((n) => n.warnings ?? []).join()).toMatch(/unsupported/);
  });
});
