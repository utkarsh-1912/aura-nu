import { describe, it, expect } from "vitest";
import { parseLinks, rewriteLinks, LinkIndex } from "../../src/core/links";

describe("parseLinks", () => {
  it("parses targets, headings, aliases, embeds", () => {
    const l = parseLinks("a [[One]] b [[Two#H|alias]] ![[Img]]");
    expect(l.map((x) => [x.target, x.heading, x.alias, x.embed])).toEqual([
      ["One", "", "", false], ["Two", "H", "alias", false], ["Img", "", "", true],
    ]);
  });
  it("ignores code", () => {
    expect(parseLinks("`[[a]]`\n```\n[[b]]\n```\n[[c]]").map((x) => x.target)).toEqual(["c"]);
  });
});

describe("rewriteLinks", () => {
  it("rewrites matching links only, keeping heading/alias/embed", () => {
    const r = rewriteLinks("[[old name]] [[Old Name#H|x]] ![[OLD NAME]] [[other]] `[[old name]]`", "Old Name", "New");
    expect(r.markdown).toBe("[[New]] [[New#H|x]] ![[New]] [[other]] `[[old name]]`");
    expect(r.changed).toBe(3);
  });
});

describe("LinkIndex", () => {
  const mk = () => {
    const ix = new LinkIndex();
    ix.upsert({ id: "a", title: "Alpha", content: "see [[Beta]] and [[Missing]]" });
    ix.upsert({ id: "b", title: "Beta", content: "back to [[alpha|A]]" });
    ix.upsert({ id: "c", title: "Gamma", content: "I talk about Alpha in plain text, and `Alpha` in code" });
    ix.upsert({ id: "d", title: "Delta", content: "nothing" });
    return ix;
  };
  it("backlinks, unresolved, edges", () => {
    const ix = mk();
    expect(ix.backlinks("b").map((x) => x.sourceId)).toEqual(["a"]);
    expect(ix.backlinks("a").map((x) => x.sourceId)).toEqual(["b"]);
    expect([...ix.unresolved().keys()]).toEqual(["missing"]);
    expect(ix.edges()).toHaveLength(2);
  });
  it("unlinked mentions skip existing links and code", () => {
    const ix = mk();
    const m = ix.unlinkedMentions("a");
    expect(m.map((x) => x.sourceId)).toEqual(["c"]);
  });
  it("orphans", () => {
    expect(mk().orphans()).toEqual(["c", "d"]);
  });
  it("incremental update and remove", () => {
    const ix = mk();
    ix.upsert({ id: "d", title: "Delta", content: "[[Alpha]]" });
    expect(ix.backlinks("a").map((x) => x.sourceId)).toEqual(["b", "d"]);
    ix.remove("b");
    expect(ix.backlinks("a").map((x) => x.sourceId)).toEqual(["d"]);
    expect(ix.unresolved().has("beta")).toBe(true);
  });
  it("rename rewrites inbound links in other notes", () => {
    const ix = mk();
    const ch = ix.rename("b", "Beta Prime");
    expect(ch.find((c) => c.id === "a")?.content).toBe("see [[Beta Prime]] and [[Missing]]");
    expect(ix.backlinks("b").map((x) => x.sourceId)).toEqual(["a"]);
    expect(ix.unresolved().has("beta")).toBe(false);
  });
});
