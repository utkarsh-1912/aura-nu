import { describe, it, expect } from "vitest";
import { SearchIndex, tokenize, snippetToHtml } from "../../src/core/search";

const mk = () => {
  const ix = new SearchIndex();
  ix.upsert({ id: "1", title: "Quarterly planning", content: "We discuss the roadmap and budget for next quarter.", tags: ["work"], folder: "Work", workspaceId: "w1" });
  ix.upsert({ id: "2", title: "Grocery list", content: "- [ ] milk\n- [ ] eggs\n- [ ] café au lait", tags: ["home"], folder: "Home/Shopping", workspaceId: "w1" });
  ix.upsert({ id: "3", title: "Roadmap ideas", content: "Planning ideas for the product roadmap. Roadmap roadmap.", tags: ["work", "ideas"], folder: "Work/Ideas", workspaceId: "w2" });
  ix.upsert({ id: "4", title: "Old", content: "trashed roadmap", isTrashed: true, workspaceId: "w1" });
  return ix;
};

describe("tokenize", () => {
  it("folds case and diacritics", () => expect(tokenize("Café  Au-Lait don't")).toEqual(["cafe", "au", "lait", "dont"]));
});

describe("SearchIndex", () => {
  it("ranks title matches and repeated terms higher, excludes trashed", () => {
    const r = mk().search("roadmap");
    expect(r.map((x) => x.id)).toEqual(["3", "1"]);
  });
  it("prefix match on last token", () => {
    expect(mk().search("roadm").map((x) => x.id)).toContain("3");
    expect(mk().search("quarterly plan").map((x) => x.id)).toEqual(["1"]);
  });
  it("typo tolerance", () => {
    expect(mk().search("roadmpa").map((x) => x.id)).toContain("3");
    expect(mk().search("grocry").map((x) => x.id)).toEqual(["2"]);
    expect(mk().search("zzzzzz")).toEqual([]);
  });
  it("diacritic-insensitive", () => expect(mk().search("cafe").map((x) => x.id)).toEqual(["2"]));
  it("filters", () => {
    const ix = mk();
    expect(ix.search("roadmap", { workspaceId: "w2" }).map((x) => x.id)).toEqual(["3"]);
    expect(ix.search("roadmap", { tags: ["ideas"] }).map((x) => x.id)).toEqual(["3"]);
    expect(ix.search("roadmap", { folder: "Work" }).map((x) => x.id).sort()).toEqual(["1", "3"]);
    expect(ix.search("roadmap", { folder: "Work/Ideas" }).map((x) => x.id)).toEqual(["3"]);
    expect(ix.search("roadmap", { includeTrashed: true }).map((x) => x.id)).toContain("4");
  });
  it("AND vs any", () => {
    const ix = mk();
    expect(ix.search("milk roadmap")).toEqual([]);
    expect(ix.search("milk roadmap", { match: "any" }).length).toBeGreaterThan(1);
  });
  it("snippets highlight, and escape html", () => {
    const ix = new SearchIndex();
    ix.upsert({ id: "x", title: "t", content: "before <b>bold</b> needle after " + "filler ".repeat(60) });
    const h = ix.search("needle")[0];
    const html = snippetToHtml(h.snippet);
    expect(html).toContain("<mark>needle</mark>");
    expect(html).not.toContain("<b>");
  });
  it("incremental update and remove", () => {
    const ix = mk();
    ix.upsert({ id: "2", title: "Grocery list", content: "bananas", tags: [] });
    expect(ix.search("milk")).toEqual([]);
    expect(ix.search("bananas").map((x) => x.id)).toEqual(["2"]);
    ix.remove("2");
    expect(ix.search("bananas")).toEqual([]);
    expect(ix.size).toBe(3);
  });
  it("suggest", () => expect(mk().suggest("road")).toContain("roadmap"));

  it("perf sanity: 5k synthetic notes", { timeout: 90000 }, () => {
    const words = Array.from({ length: 3000 }, (_, i) => "w" + (i * 7919).toString(36));
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const ix = new SearchIndex();
    const t0 = performance.now();
    for (let i = 0; i < 5000; i++) {
      const body = Array.from({ length: 120 }, () => words[Math.floor(rnd() * words.length)]).join(" ");
      ix.upsert({ id: "n" + i, title: "Note " + words[i % words.length], content: body, tags: ["t" + (i % 20)], folder: "F" + (i % 10) });
    }
    const build = performance.now() - t0;
    const q0 = performance.now();
    for (let i = 0; i < 50; i++) ix.search(words[i * 13] + " " + words[i * 17].slice(0, 3));
    const exact = (performance.now() - q0) / 50;
    const f0 = performance.now();
    for (let i = 0; i < 10; i++) ix.search("w9zzqq" + i);
    const fuzzy = (performance.now() - f0) / 10;
    console.log(`search perf: build ${build.toFixed(0)}ms, query avg ${exact.toFixed(2)}ms, fuzzy-miss avg ${fuzzy.toFixed(2)}ms`);
    expect(ix.size).toBe(5000);
    expect(build).toBeLessThan(60000); // generous: CI/shared machines vary; real numbers are logged
    expect(exact).toBeLessThan(250);
    expect(fuzzy).toBeLessThan(500);
  });
});
