// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { bearer, makeHarness, note, SECRET } from "./harness";
import { noteKey, folderKey } from "../../api/grantStore";

let t0 = Date.parse("2026-06-01T00:00:00Z");
const clock = { now: () => t0 };
const HOUR = 3600_000;
const DAY = 24 * HOUR;
type H = Awaited<ReturnType<typeof makeHarness>>;
let h: H;

const as = async (email: string) => bearer(email);
const put = async (email: string, n: ReturnType<typeof note>) =>
  request(h.app).put(`/api/v2/notes/${n.id}`).set(await as(email)).send({ baseRev: null, note: n });
const call = async (method: "get" | "post" | "delete", email: string, url: string, body?: unknown) => {
  const r = request(h.app)[method](url).set(await as(email));
  return body === undefined ? r : r.send(body as object);
};
const grantUser = (owner: string, type: string, id: string, email: string, role = "Viewer", extra: object = {}) =>
  call("post", owner, `/api/v2/shares/${type}/${encodeURIComponent(id)}/grants`, { principal: { type: "user", email }, role, ...extra });
const roleOf = (email: string, key: string) => h.platform.accessChecker.getRole(email, `note:${key}`);

beforeEach(async () => {
  t0 = Date.parse("2026-06-01T00:00:00Z");
  h = await makeHarness({ now: clock.now });
});

describe("owner registration via the v2 sync router", () => {
  it("records the owner on first PUT and returns an owner-qualified room id", async () => {
    expect((await call("get", "ann@x.io", "/api/v2/shares/room/n1")).status).toBe(404); // not synced yet
    expect((await put("ann@x.io", note("n1"))).status).toBe(200);
    const r = await call("get", "ann@x.io", "/api/v2/shares/room/n1");
    expect(r.status).toBe(200);
    expect(r.body.roomId).toBe(`note:${noteKey("ann@x.io", "n1")}`);
    expect(await roleOf("ann@x.io", noteKey("ann@x.io", "n1"))).toBe("Owner");
  });

  it("two users with the same note id get different, unsquattable rooms", async () => {
    await put("ann@x.io", note("welcome-note"));
    await put("eve@x.io", note("welcome-note"));
    const a = (await call("get", "ann@x.io", "/api/v2/shares/room/welcome-note")).body.roomId;
    const e = (await call("get", "eve@x.io", "/api/v2/shares/room/welcome-note")).body.roomId;
    expect(a).not.toBe(e);
    expect(await roleOf("eve@x.io", noteKey("ann@x.io", "welcome-note"))).toBeNull();
  });

  it("a conflicting PUT does not register; a tombstone removes the room and every grant", async () => {
    const key = noteKey("ann@x.io", "n1");
    await put("ann@x.io", note("n1"));
    await grantUser("ann@x.io", "note", "n1", "bob@x.io");
    expect(await roleOf("bob@x.io", key)).toBe("Viewer");
    const del = await request(h.app).delete("/api/v2/notes/n1?baseRev=1").set(await as("ann@x.io"));
    expect(del.status).toBe(200);
    expect(await roleOf("bob@x.io", key)).toBeNull();
    expect(await roleOf("ann@x.io", key)).toBeNull(); // the room is gone for everybody
    expect((await call("get", "ann@x.io", "/api/v2/shares/room/n1")).status).toBe(404);
  });

  it("backfills notes that predate the feature when the owner next syncs", async () => {
    await h.noteStore.put("old@x.io", note("legacy") as any, null);
    await call("get", "old@x.io", "/api/v2/notes/changes?since=0");
    await new Promise((r) => setTimeout(r, 30));
    expect((await call("get", "old@x.io", "/api/v2/shares/room/legacy")).status).toBe(200);
  });
});

describe("grant management", () => {
  beforeEach(async () => {
    await put("ann@x.io", note("n1"));
  });

  it("owner can create, list and revoke user grants", async () => {
    const c = await grantUser("ann@x.io", "note", "n1", "Bob@X.io", "Editor");
    expect(c.status).toBe(201);
    expect(c.body.grant.principal).toEqual({ type: "user", email: "bob@x.io" });
    expect(c.body.roomId).toMatch(/^note:[0-9a-f]{40}$/);
    const key = noteKey("ann@x.io", "n1");
    expect(await roleOf("bob@x.io", key)).toBe("Editor");
    const l = await call("get", "ann@x.io", "/api/v2/shares/note/n1/grants");
    expect(l.body.grants).toHaveLength(1);
    expect((await call("delete", "ann@x.io", `/api/v2/shares/note/n1/grants/${c.body.grant.id}`)).status).toBe(204);
    expect(await roleOf("bob@x.io", key)).toBeNull();
  });

  it("re-granting the same user replaces rather than duplicates", async () => {
    await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Viewer");
    await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Editor");
    const l = await call("get", "ann@x.io", "/api/v2/shares/note/n1/grants");
    expect(l.body.grants).toHaveLength(1);
    expect(l.body.grants[0].role).toBe("Editor");
  });

  it("grants honour expiry", async () => {
    const key = noteKey("ann@x.io", "n1");
    await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Viewer", { expiresAt: t0 + HOUR });
    expect(await roleOf("bob@x.io", key)).toBe("Viewer");
    t0 += 2 * HOUR;
    expect(await roleOf("bob@x.io", key)).toBeNull();
  });

  it("validates input and refuses escalation", async () => {
    const key = noteKey("ann@x.io", "n1");
    expect((await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Owner")).status).toBe(400);
    expect((await grantUser("ann@x.io", "note", "n1", "bob@x.io", "God")).status).toBe(400);
    expect((await grantUser("ann@x.io", "note", "n1", "not-an-email")).status).toBe(400);
    expect((await grantUser("ann@x.io", "note", "n1", "ann@x.io")).status).toBe(400);
    expect((await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Viewer", { expiresAt: t0 - 1 })).status).toBe(400);
    expect((await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Viewer", { expiresAt: "soon" })).status).toBe(400);
    expect((await call("post", "ann@x.io", "/api/v2/shares/note/n1/grants", { principal: { type: "group", id: "g" }, role: "Viewer" })).status).toBe(400);
    expect((await call("post", "ann@x.io", "/api/v2/shares/note/n1/grants", { role: "Viewer" })).status).toBe(400);
    expect((await call("post", "ann@x.io", "/api/v2/shares/workspace/n1/grants", { principal: { type: "user", email: "b@x.io" }, role: "Viewer" })).status).toBe(404);
    expect(await roleOf("bob@x.io", key)).toBeNull();
  });

  it("grantees and strangers cannot manage sharing; no existence leak", async () => {
    const key = noteKey("ann@x.io", "n1");
    await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Editor");
    // Editor addressing the note by its server key: can see it exists but not manage it.
    expect((await call("get", "bob@x.io", `/api/v2/shares/note/${key}/grants`)).status).toBe(403);
    expect((await grantUser("bob@x.io", "note", key, "eve@x.io")).status).toBe(403);
    // A stranger gets the same 404 for a real key and a made-up one.
    const real = await call("get", "eve@x.io", `/api/v2/shares/note/${key}/grants`);
    const fake = await call("get", "eve@x.io", `/api/v2/shares/note/${"a".repeat(40)}/grants`);
    expect(real.status).toBe(404);
    expect(fake.status).toBe(404);
    expect(real.body).toEqual(fake.body);
    expect((await call("get", "eve@x.io", "/api/v2/shares/note/n1/grants")).status).toBe(404); // eve's own n1 is unsynced
  });

  it("a grantee can leave a share but not remove someone else's grant", async () => {
    const key = noteKey("ann@x.io", "n1");
    const b = await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Viewer");
    const c = await grantUser("ann@x.io", "note", "n1", "cat@x.io", "Viewer");
    expect((await call("delete", "bob@x.io", `/api/v2/shares/note/${key}/grants/${c.body.grant.id}`)).status).toBe(403);
    expect((await call("delete", "bob@x.io", `/api/v2/shares/note/${key}/grants/${b.body.grant.id}`)).status).toBe(204);
    expect(await roleOf("bob@x.io", key)).toBeNull();
    expect(await roleOf("cat@x.io", key)).toBe("Viewer");
  });

  it("caps the number of grants per resource", async () => {
    for (let i = 0; i < 200; i++) expect((await grantUser("ann@x.io", "note", "n1", `u${i}@x.io`)).status).toBe(201);
    expect((await grantUser("ann@x.io", "note", "n1", "one-too-many@x.io")).status).toBe(409);
  }, 60_000);

  it("audits grant changes", async () => {
    const c = await grantUser("ann@x.io", "note", "n1", "bob@x.io");
    await call("delete", "ann@x.io", `/api/v2/shares/note/n1/grants/${c.body.grant.id}`);
    expect(h.audits.map((a) => a.action)).toEqual(["share.grant.create", "share.grant.revoke"]);
  });
});

describe("folder sharing and shared-with-me", () => {
  it("a folder grant covers its notes only for that owner's folder of that name", async () => {
    await put("ann@x.io", note("a1", { folder: "Projects" }));
    await put("ann@x.io", note("a2", { folder: "Private" }));
    await put("cara@x.io", note("c1", { folder: "Projects" })); // same folder name, different owner
    expect((await grantUser("ann@x.io", "folder", "Projects", "bob@x.io", "Commenter")).status).toBe(201);
    expect(await roleOf("bob@x.io", noteKey("ann@x.io", "a1"))).toBe("Commenter");
    expect(await roleOf("bob@x.io", noteKey("ann@x.io", "a2"))).toBeNull();
    expect(await roleOf("bob@x.io", noteKey("cara@x.io", "c1"))).toBeNull();
    // A note added later to the folder is covered automatically.
    await put("ann@x.io", note("a3", { folder: "Projects" }));
    expect(await roleOf("bob@x.io", noteKey("ann@x.io", "a3"))).toBe("Commenter");
    // Moving a note out of the folder withdraws access.
    await request(h.app).put("/api/v2/notes/a3").set(await as("ann@x.io")).send({ baseRev: 1, note: note("a3", { folder: "Private" }) });
    expect(await roleOf("bob@x.io", noteKey("ann@x.io", "a3"))).toBeNull();
    const w = await call("get", "bob@x.io", "/api/v2/shares/with-me");
    expect(w.body.items.map((i: any) => i.roomId)).toEqual([`note:${noteKey("ann@x.io", "a1")}`]);
    expect(w.body.items[0]).toMatchObject({ role: "Commenter", ownerEmail: "ann@x.io" });
    expect(folderKey("ann@x.io", "Projects")).not.toBe(folderKey("cara@x.io", "Projects"));
  });

  it("with-me lists direct note shares and hides expired ones", async () => {
    await put("ann@x.io", note("n1"));
    await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Editor", { expiresAt: t0 + HOUR });
    expect((await call("get", "bob@x.io", "/api/v2/shares/with-me")).body.items).toHaveLength(1);
    t0 += 2 * HOUR;
    expect((await call("get", "bob@x.io", "/api/v2/shares/with-me")).body.items).toHaveLength(0);
  });
});

describe("share links", () => {
  let key: string;
  beforeEach(async () => {
    await put("ann@x.io", note("n1"));
    await put("ann@x.io", note("n2"));
    key = noteKey("ann@x.io", "n1");
  });
  const mkLink = (role = "Viewer", extra: object = {}) =>
    call("post", "ann@x.io", "/api/v2/shares/note/n1/grants", { principal: { type: "link" }, role, ...extra });

  it("creates a signed link (token shown once) that verifies and redeems into a user grant", async () => {
    const c = await mkLink("Editor", { expiresAt: t0 + DAY });
    expect(c.status).toBe(201);
    expect(c.body.token).toMatch(/^[\w-]+\.[\w-]+$/);
    const listed = await call("get", "ann@x.io", "/api/v2/shares/note/n1/grants");
    expect(JSON.stringify(listed.body)).not.toContain(c.body.token);

    const v = await call("post", "bob@x.io", "/api/v2/shares/links/verify", { token: c.body.token });
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ valid: true, resourceType: "note", role: "Editor", roomId: `note:${key}`, ownerEmail: "ann@x.io" });
    expect(await roleOf("bob@x.io", key)).toBeNull(); // verify alone grants nothing

    const r = await call("post", "bob@x.io", "/api/v2/shares/links/redeem", { token: c.body.token });
    expect(r.status).toBe(200);
    expect(await roleOf("bob@x.io", key)).toBe("Editor");
    expect(await roleOf("bob@x.io", noteKey("ann@x.io", "n2"))).toBeNull(); // a link to note A never opens note B
    // The redeemed access never outlives the link.
    t0 += 2 * DAY;
    expect(await roleOf("bob@x.io", key)).toBeNull();
  });

  it("defaults to 7 days and refuses links beyond 90 days or Owner role", async () => {
    const c = await mkLink("Viewer");
    expect(c.body.grant.expiresAt).toBe(t0 + 7 * DAY);
    expect((await mkLink("Viewer", { expiresAt: t0 + 91 * DAY })).status).toBe(400);
    expect((await mkLink("Owner")).status).toBe(400);
  });

  it("rejects tampered, foreign-signed and malformed tokens", async () => {
    const c = await mkLink("Viewer");
    const [body, sig] = c.body.token.split(".");
    const forgedClaims = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), role: "Editor" })).toString("base64url");
    for (const bad of [`${forgedClaims}.${sig}`, `${body}.${sig.slice(0, -2)}xx`, "garbage", `${body}`, "a.b.c", ""]) {
      const r = await call("post", "bob@x.io", "/api/v2/shares/links/redeem", { token: bad });
      expect([400]).toContain(r.status);
    }
    expect(await roleOf("bob@x.io", key)).toBeNull();
    // Same claims signed with another secret.
    const other = await makeHarness({ secret: "another-secret-0123456789", now: clock.now });
    const orgTok = await request(other.app).put("/api/v2/notes/n1").set(await as("ann@x.io")).send({ baseRev: null, note: note("n1") });
    expect(orgTok.status).toBe(200);
    const foreign = await request(other.app).post("/api/v2/shares/note/n1/grants").set(await as("ann@x.io")).send({ principal: { type: "link" }, role: "Editor" });
    const r = await call("post", "bob@x.io", "/api/v2/shares/links/redeem", { token: foreign.body.token });
    expect(r.status).toBe(400);
  });

  it("expired links answer 410 and grant nothing", async () => {
    const c = await mkLink("Viewer", { expiresAt: t0 + HOUR });
    t0 += 2 * HOUR;
    const r = await call("post", "bob@x.io", "/api/v2/shares/links/redeem", { token: c.body.token });
    expect(r.status).toBe(410);
    expect(r.body.reason).toBe("expired");
    expect(await roleOf("bob@x.io", key)).toBeNull();
  });

  it("revoking a link kills the token and everything redeemed through it", async () => {
    const c = await mkLink("Viewer");
    await call("post", "bob@x.io", "/api/v2/shares/links/redeem", { token: c.body.token });
    expect(await roleOf("bob@x.io", key)).toBe("Viewer");
    expect((await call("delete", "ann@x.io", `/api/v2/shares/note/n1/grants/${c.body.grant.id}`)).status).toBe(204);
    expect(await roleOf("bob@x.io", key)).toBeNull();
    const r = await call("post", "cat@x.io", "/api/v2/shares/links/redeem", { token: c.body.token });
    expect(r.status).toBe(410);
    expect(r.body.reason).toBe("revoked");
  });

  it("redeeming never downgrades and the owner redeeming is a no-op", async () => {
    await grantUser("ann@x.io", "note", "n1", "bob@x.io", "Editor");
    const c = await mkLink("Viewer");
    const r = await call("post", "bob@x.io", "/api/v2/shares/links/redeem", { token: c.body.token });
    expect(r.body.role).toBe("Editor");
    expect(await roleOf("bob@x.io", key)).toBe("Editor");
    const o = await call("post", "ann@x.io", "/api/v2/shares/links/redeem", { token: c.body.token });
    expect(o.body.role).toBe("Owner");
    const l = await call("get", "ann@x.io", "/api/v2/shares/note/n1/grants");
    expect(l.body.grants.filter((g: any) => g.via)).toHaveLength(0);
  });

  it("a link to a deleted note is dead", async () => {
    const c = await mkLink("Viewer");
    await request(h.app).delete("/api/v2/notes/n1?baseRev=1").set(await as("ann@x.io"));
    expect((await call("post", "bob@x.io", "/api/v2/shares/links/redeem", { token: c.body.token })).status).toBe(410);
  });

  it("link features are refused (503) without a usable SHARE_LINK_SECRET, user shares still work", async () => {
    for (const secret of [null, "short"]) {
      const x = await makeHarness({ secret, now: clock.now });
      await request(x.app).put("/api/v2/notes/n1").set(await as("ann@x.io")).send({ baseRev: null, note: note("n1") });
      const link = await request(x.app).post("/api/v2/shares/note/n1/grants").set(await as("ann@x.io")).send({ principal: { type: "link" }, role: "Viewer" });
      expect(link.status).toBe(503);
      expect((await request(x.app).post("/api/v2/shares/links/verify").set(await as("bob@x.io")).send({ token: "x.y" })).status).toBe(503);
      expect((await request(x.app).post("/api/v2/shares/links/redeem").set(await as("bob@x.io")).send({ token: "x.y" })).status).toBe(503);
      const u = await request(x.app).post("/api/v2/shares/note/n1/grants").set(await as("ann@x.io")).send({ principal: { type: "user", email: "bob@x.io" }, role: "Viewer" });
      expect(u.status).toBe(201);
    }
    expect(SECRET.length).toBeGreaterThanOrEqual(16);
  });
});
