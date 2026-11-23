// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import WebSocket from "ws";
import { attachCollabServer, SUBPROTOCOL, type CollabServer } from "../../server/collab/server";
import { MemoryDocStore } from "../../server/collab/docStore";
import { noteKey } from "../../server/grantStore";
import { bearer, collabAuthenticate, makeHarness, note, tokenFor } from "./harness";

type H = Awaited<ReturnType<typeof makeHarness>>;
let h: H;
let server: http.Server;
let collab: CollabServer;
let port: number;
const sockets: WebSocket[] = [];
let clockMs = Date.parse("2026-06-01T00:00:00Z");

beforeEach(async () => {
  clockMs = Date.parse("2026-06-01T00:00:00Z");
  h = await makeHarness({ now: () => clockMs });
  server = http.createServer(h.app);
  collab = attachCollabServer(server, {
    store: new MemoryDocStore(),
    access: h.platform.accessChecker, // the REAL checker: grant store + ACL resolver
    authenticate: collabAuthenticate,
    limits: { recheckMs: 40 },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await collab.close();
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

type Outcome = { status: number | "open"; ws?: WebSocket; closed?: Promise<number> };
function connect(room: string, token: string | null): Promise<Outcome> {
  return new Promise((resolve) => {
    const protocols = token ? [SUBPROTOCOL, `bearer.${token}`] : [SUBPROTOCOL];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/collab/${room}`, protocols);
    sockets.push(ws);
    const closed = new Promise<number>((r) => ws.on("close", (code) => r(code)));
    ws.on("open", () => resolve({ status: "open", ws, closed }));
    ws.on("unexpected-response", (_req, res) => resolve({ status: res.statusCode ?? 0 }));
    ws.on("error", () => undefined);
  });
}

async function seed(owner = "ann@x.io", id = "n1") {
  await request(h.app).put(`/api/v2/notes/${id}`).set(await bearer(owner)).send({ baseRev: null, note: note(id) });
  return `note:${noteKey(owner, id)}`;
}
const share = async (owner: string, id: string, email: string, role = "Viewer") =>
  request(h.app).post(`/api/v2/shares/note/${id}/grants`).set(await bearer(owner)).send({ principal: { type: "user", email }, role });

describe("collab WebSocket access through the real grant store", () => {
  it("authenticates and authorises: owner in; no/invalid token 401; stranger and unknown rooms 403", async () => {
    const room = await seed();
    expect((await connect(room, await tokenFor("ann@x.io"))).status).toBe("open");
    expect((await connect(room, null)).status).toBe(401);
    expect((await connect(room, "not-a-jwt")).status).toBe(401);
    expect((await connect(room, await tokenFor("eve@x.io"))).status).toBe(403);
    expect((await connect("note:" + "a".repeat(40), await tokenFor("ann@x.io"))).status).toBe(403); // unknown room
    expect((await connect("note:n1", await tokenFor("ann@x.io"))).status).toBe(403); // bare ids are never rooms
  });

  it("a grantee connects only after being granted, and a revoked grantee is cut off live", async () => {
    const room = await seed();
    const bob = await tokenFor("bob@x.io");
    expect((await connect(room, bob)).status).toBe(403);
    const g = await share("ann@x.io", "n1", "bob@x.io", "Editor");
    const c = await connect(room, bob);
    expect(c.status).toBe("open");
    await request(h.app).delete(`/api/v2/shares/note/n1/grants/${g.body.grant.id}`).set(await bearer("ann@x.io"));
    expect(await c.closed).toBe(4403);
    expect((await connect(room, bob)).status).toBe(403);
  });

  it("expired grants stop working for new and live connections", async () => {
    const room = await seed();
    const bob = await tokenFor("bob@x.io");
    await request(h.app).post("/api/v2/shares/note/n1/grants").set(await bearer("ann@x.io"))
      .send({ principal: { type: "user", email: "bob@x.io" }, role: "Viewer", expiresAt: clockMs + 3600_000 });
    const c = await connect(room, bob);
    expect(c.status).toBe("open");
    clockMs += 2 * 3600_000;
    expect(await c.closed).toBe(4403);
    expect((await connect(room, bob)).status).toBe(403);
  });

  it("owner A cannot reach owner B's room even with the same note id", async () => {
    const a = await seed("ann@x.io", "same");
    const b = await seed("bea@x.io", "same");
    expect(a).not.toBe(b);
    expect((await connect(b, await tokenFor("ann@x.io"))).status).toBe(403);
    expect((await connect(a, await tokenFor("bea@x.io"))).status).toBe(403);
  });

  it("deleting the note closes its room to everyone", async () => {
    const room = await seed();
    await share("ann@x.io", "n1", "bob@x.io");
    const c = await connect(room, await tokenFor("bob@x.io"));
    expect(c.status).toBe("open");
    await request(h.app).delete("/api/v2/notes/n1?baseRev=1").set(await bearer("ann@x.io"));
    expect(await c.closed).toBe(4403);
    expect((await connect(room, await tokenFor("ann@x.io"))).status).toBe(403);
  });

  it("a link bearer gets in only after redeeming", async () => {
    const room = await seed();
    const link = await request(h.app).post("/api/v2/shares/note/n1/grants").set(await bearer("ann@x.io")).send({ principal: { type: "link" }, role: "Viewer" });
    const cat = await tokenFor("cat@x.io");
    expect((await connect(room, cat)).status).toBe(403);
    await request(h.app).post("/api/v2/shares/links/redeem").set(await bearer("cat@x.io")).send({ token: link.body.token });
    expect((await connect(room, cat)).status).toBe("open");
  });
});
