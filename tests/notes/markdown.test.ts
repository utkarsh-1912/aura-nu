import { describe, it, expect } from "vitest";
import { markdownToHtml, htmlToMarkdown, sanitizeHtml, parseFrontmatter, stringifyFrontmatter, stripMarkdown, extractHashtags } from "../../src/core/markdown";

const rt = (md: string) => htmlToMarkdown(markdownToHtml(md));

describe("markdown round trip", () => {
  it("checklists", () => {
    const md = "- [ ] todo\n- [x] done **bold**";
    expect(rt(md)).toBe(md);
  });
  it("nested checklist", () => {
    const md = "- [ ] a\n  - [x] b";
    expect(rt(md)).toBe(md);
  });
  it("tables", () => {
    const md = "| a | b |\n| --- | --- |\n| 1 | **2** |\n| x \\| y | `z` |";
    expect(rt(md)).toBe(md);
  });
  it("fenced code with language", () => {
    const md = "```ts\nconst a = 1 < 2 && '<b>';\n\n  indented\n```";
    expect(rt(md)).toBe(md);
  });
  it("links, images, headings, lists, quotes, strike", () => {
    const md = "# Title\n\nSome *em* and ~~gone~~ [link](https://x.io \"t\") ![alt](https://x.io/i.png)\n\n1. one\n2. two\n\n- a\n- b\n\n> quote";
    expect(rt(md)).toBe(md);
  });
  it("wikilinks, aliases, headings, embeds", () => {
    const md = "See [[Project Plan]], [[Project Plan|the plan]], [[Notes#Intro]] and\n\n![[Diagram]]";
    expect(rt(md)).toBe(md);
  });
  it("ordered list start preserved", () => {
    expect(rt("3. x\n4. y")).toBe("3. x\n4. y");
  });
  it("emits TipTap task markup", () => {
    const h = markdownToHtml("- [x] a");
    expect(h).toContain('data-type="taskList"');
    expect(h).toContain('data-checked="true"');
  });
  it("handles TipTap-style task HTML", () => {
    const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>hi</p></div></li></ul>';
    expect(htmlToMarkdown(html)).toBe("- [x] hi");
  });
  it("handles TipTap-style table HTML", () => {
    const html = "<table><tbody><tr><th><p>h</p></th></tr><tr><td><p>v</p></td></tr></tbody></table>";
    expect(htmlToMarkdown(html)).toBe("| h |\n| --- |\n| v |");
  });
});

describe("sanitizeHtml", () => {
  it("strips scripts, handlers and js: urls", () => {
    const out = sanitizeHtml('<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><a href="&#106;avascript:1">m</a><img src=x onerror=alert(1)><iframe src="//e"></iframe>');
    expect(out).not.toMatch(/script|onclick|onerror|javascript|iframe|alert/i);
    expect(out).toContain("<p>a</p>");
  });
  it("blocks svg and non-raster data images, allows png data", () => {
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,AAA">')).not.toContain("data:");
    expect(sanitizeHtml('<img src="data:image/png;base64,AAA">')).toContain("data:image/png");
  });
  it("escapes stray angle brackets and survives malformed input", () => {
    expect(sanitizeHtml("1 < 2 > 0 <b")).not.toMatch(/<b$/);
    expect(() => sanitizeHtml("<a href='x' <<<>>> <script")).not.toThrow();
  });
  it("sanitises raw HTML inside markdown", () => {
    expect(markdownToHtml("hi <script>alert(1)</script> [x](javascript:alert(1))")).not.toMatch(/script|javascript/i);
  });
});

describe("frontmatter and helpers", () => {
  it("parses and stringifies", () => {
    const { data, body } = parseFrontmatter("---\ntitle: \"Hello: World\"\ntags: [a, b]\npinned: true\nlist:\n  - x\n  - y\n---\n\nBody");
    expect(data).toEqual({ title: "Hello: World", tags: ["a", "b"], pinned: true, list: ["x", "y"] });
    expect(body.trim()).toBe("Body");
    expect(parseFrontmatter(stringifyFrontmatter({ title: "T: x", tags: ["a"] }, "B")).data).toEqual({ title: "T: x", tags: ["a"] });
  });
  it("no frontmatter", () => expect(parseFrontmatter("# hi").body).toBe("# hi"));
  it("stripMarkdown / hashtags", () => {
    expect(stripMarkdown("# H\n- [ ] a [[B|bee]] **x**")).toBe("H a bee x");
    expect(extractHashtags("#One text #two/sub `#no` url#frag\n```\n#code\n```")).toEqual(["one", "two/sub"]);
  });
});
