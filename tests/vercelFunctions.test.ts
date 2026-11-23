import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Vercel turns EVERY file under /api into a serverless function (Hobby plan allows 12).
 * Server logic lives in /server and is bundled into the single entry point api/index.ts.
 */
describe("Vercel function budget", () => {
  it("api/ contains only the single entry point", () => {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const files = walk(path.join(process.cwd(), "api")).map((f) => path.relative(process.cwd(), f).split(path.sep).join("/"));
    expect(files).toEqual(["api/index.ts"]);
  });
});
