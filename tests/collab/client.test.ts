// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { seedFromMarkdown, exportMarkdown, applyTextDiff, fnv1a } from "../../src/collab/markdown";
import { colorForUser, listPeers, makeLocalUser, setLocalUser, uniquePeers } from "../../src/collab/presence";
import { backoffDelay, createNoteCollab, roomForNote } from "../../src/collab/provider";
import { attachCollabServer } from "../../api/collab/server";
import { MemoryDocStore } from "../../api/collab/docStore";

describe("markdown seeding", () => {
  it("seeds once, exports back", () => {
    const d = new Y.Doc();
    expect(seedFromMarkdown(d, "# Hi\n\nbody")).toBe(true);
    expect(seedFromMarkdown(d, "# Hi\n\nbody")).toBe(false);
    expect(exportMarkdown(d)).toBe("# Hi\n\nbody");
  });
  it("concurrent seeding by two clients does not duplicate", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    seedFromMarkdown(a, "same text");
    seedFromMarkdown(b, "same text"); // neither has seen the other
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(exportMarkdown(a)).toBe("same text");
    expect(exportMarkdown(b)).toBe("same text");
  });
  it("does not reseed a doc that has content or was seeded, and ignores empty", () => {
    const d = new Y.Doc();
    d.getText("body").insert(0, "x");
    expect(seedFromMarkdown(d, "y")).toBe(false);
    expect(seedFromMarkdown(new Y.Doc(), "")).toBe(false);
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });
  it("applyTextDiff makes minimal edits and preserves remote edits", () => {
    const a = new Y.Doc();
    const t = a.getText("body");
    t.insert(0, "hello world");
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    b.getText("body").insert(0, ">> "); // concurrent remote edit
    applyTextDiff(t, "hello brave world");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(a.getText("body").toString()).toBe(">> hello brave world");
    expect(b.getText("body").toString()).toBe(">> hello brave world");
    applyTextDiff(t, t.toString());
  });
});

describe("presence", () => {
  it("deterministic colours; sanitises remote states", () => {
    expect(colorForUser("a@x.io")).toBe(colorForUser("a@x.io"));
    const aw = new Awareness(new Y.Doc());
    setLocalUser(aw, makeLocalUser("me@x.io", "Me"));
    const peers = listPeers(aw);
    expect(peers).toHaveLength(1);
    expect(peers[0].isSelf).toBe(true);
    aw.setLocalStateField("user", { email: "e@x.io", name: 5, color: "red;background:url(x)" });
    const p = listPeers(aw)[0];
    expect(p.color).toMatch(/^hsl\(/);
    expect(p.name).toBe("e");
    expect(uniquePeers([p, { ...p, clientId: 2 }])).toHaveLength(1);
  });
});

describe("backoff", () => {
  it("grows, is jittered and capped", () => {
    expect(backoffDelay(0, { rand: () => 0 })).toBe(125);
    expect(backoffDelay(3, { rand: () => 1 })).toBe(2000);
    expect(backoffDelay(50, { rand: () => 1, maxMs: 5000 })).toBe(5000);
  });
  it("validates note ids", () => {
    expect(roomForNote("abc_1")).toBe("note:abc_1");
    expect(() => roomForNote("../x")).toThrow();
  });
});

describe("createNoteCollab against a real server", () => {
  const cleanup: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    for (const c of cleanup.splice(0).reverse()) await c();
  });
  async function srv(roleOf: (e: string) => "Editor" | null) {
    const server = http.createServer();
    const collab = attachCollabServer(server, {
      store: new MemoryDocStore(),
      authenticate: async (t) => (t && t !== "bad" ? { email: t + "@x.io" } : null),
      access: { getRole: async (e) => roleOf(e) },
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    cleanup.push(async () => { await collab.close(); server.closeAllConnections?.(); server.close(); });
    return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/collab`;
  }
  it("syncs two clients, then reports denied for unauthorised user", async () => {
    const url = await srv((e) => (e === "a@x.io" || e === "b@x.io" ? "Editor" : null));
    const mk = (email: string) => {
      const c = createNoteCollab({
        noteId: "n1", serverUrl: url, getToken: async () => email.split("@")[0], user: { email },
        offlinePersistence: false, WebSocketPolyfill: WebSocket as any, maxBackoffMs: 20, maxDeniedAttempts: 3,
      });
      cleanup.push(() => c.destroy());
      return c;
    };
    const a = mk("a@x.io");
    const b = mk("b@x.io");
    await Promise.all([a.whenSynced, b.whenSynced]);
    a.text.insert(0, "hi");
    const t0 = Date.now();
    while (b.text.toString() !== "hi" && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 20));
    expect(b.text.toString()).toBe("hi");
    expect(a.status).toBe("connected");

    const evil = mk("evil@x.io");
    await expect(evil.whenSynced).rejects.toThrow(/denied/);
    expect(evil.status).toBe("denied");
  }, 15000);
});
