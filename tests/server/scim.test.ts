// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { bearer, makeHarness, note } from "./harness";
import { noteKey } from "../../api/grantStore";

type H = Awaited<ReturnType<typeof makeHarness>>;
let h: H;
const PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const ERR = "urn:ietf:params:scim:api:messages:2.0:Error";

const api = async (method: "get" | "post" | "put" | "delete", email: string, url: string, body?: unknown) => {
  const r = request(h.app)[method](url).set(await bearer(email));
  return body === undefined ? r : r.send(body as object);
};
const mint = async (email: string, orgId: string, label = "idp") => api("post", email, `/api/org/${orgId}/scim-tokens`, { label });
const S = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/scim+json" });

beforeEach(async () => {
  h = await makeHarness();
  h.orgs.add("org-ent", "enterprise", { "owner@e.io": "OrgOwner", "admin@e.io": "OrgAdmin", "ann@e.io": "Member", "bob@e.io": "Member" });
  h.orgs.add("org-team", "team", { "tl@t.io": "OrgOwner" });
  h.orgs.add("org-ent2", "enterprise", { "o2@e2.io": "OrgOwner" });
});

describe("SCIM token administration", () => {
  it("is admin-only, enterprise-only, shows the token once and stores only a hash", async () => {
    expect((await mint("ann@e.io", "org-ent")).status).toBe(403); // member
    expect((await mint("stranger@x.io", "org-ent")).status).toBe(404); // non-member: indistinguishable from unknown org
    const team = await mint("tl@t.io", "org-team");
    expect(team.status).toBe(403);
    expect(team.body.error).toBe("feature_unavailable");

    const m = await mint("admin@e.io", "org-ent", "Okta");
    expect(m.status).toBe(201);
    expect(m.body.token).toMatch(/^scim_/);
    expect(m.headers["cache-control"]).toBe("no-store");
    const list = await api("get", "admin@e.io", "/api/org/org-ent/scim-tokens");
    expect(JSON.stringify(list.body)).not.toContain(m.body.token);
    expect(list.body.tokens).toEqual([expect.objectContaining({ tokenId: m.body.tokenId, label: "Okta" })]);
    const hashes = await h.platform.scimTokens.hashesFor("org-ent");
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes[0]).not.toContain(m.body.token);
    expect(h.audits.some((a) => a.action === "scim.token.create" && a.orgId === "org-ent")).toBe(true);
  });

  it("revokes tokens and caps how many an org can hold", async () => {
    const m = await mint("admin@e.io", "org-ent");
    expect((await request(h.app).get("/scim/v2/org-ent/Users").set(S(m.body.token))).status).toBe(200);
    expect((await api("delete", "ann@e.io", `/api/org/org-ent/scim-tokens/${m.body.tokenId}`)).status).toBe(403);
    expect((await api("delete", "admin@e.io", `/api/org/org-ent/scim-tokens/${m.body.tokenId}`)).status).toBe(204);
    expect((await api("delete", "admin@e.io", `/api/org/org-ent/scim-tokens/${m.body.tokenId}`)).status).toBe(404);
    expect((await request(h.app).get("/scim/v2/org-ent/Users").set(S(m.body.token))).status).toBe(401);
    for (let i = 0; i < 10; i++) expect((await mint("admin@e.io", "org-ent")).status).toBe(201);
    expect((await mint("admin@e.io", "org-ent")).status).toBe(409);
  });

  it("rejects a malformed org id", async () => {
    expect((await mint("admin@e.io", "bad%20id")).status).toBe(400);
  });
});

describe("SCIM endpoint auth (outside the /api auth middleware)", () => {
  it("uses its own per-org bearer: no/wrong/cross-org/Firebase tokens all get the SCIM 401", async () => {
    const a = (await mint("admin@e.io", "org-ent")).body.token;
    await h.platform.scimTokens.issue("org-ent2", "x", "t");
    for (const hdr of [{}, { Authorization: "Bearer nope" }, await bearer("admin@e.io")]) {
      const r = await request(h.app).get("/scim/v2/org-ent/Users").set(hdr);
      expect(r.status).toBe(401);
      expect(r.body.schemas).toEqual([ERR]);
    }
    expect((await request(h.app).get("/scim/v2/org-ent2/Users").set(S(a))).status).toBe(401); // another org's endpoint
    expect((await request(h.app).get("/scim/v2/org-ent/Users").set(S(a))).status).toBe(200);
  });
});

describe("SCIM directory persistence and isolation", () => {
  it("creates users with uniqueness, filters, and never crosses orgs", async () => {
    const a = (await mint("admin@e.io", "org-ent")).body.token;
    const b = (await h.platform.scimTokens.issue("org-ent2", "x", "t"))!.token;
    const c = await request(h.app).post("/scim/v2/org-ent/Users").set(S(a)).send({ userName: "new@e.io", displayName: "New" });
    expect(c.status).toBe(201);
    expect((await request(h.app).post("/scim/v2/org-ent/Users").set(S(a)).send({ userName: "NEW@e.io" })).status).toBe(409);
    // the same userName is fine in a different org, and invisible to the first
    expect((await request(h.app).post("/scim/v2/org-ent2/Users").set(S(b)).send({ userName: "new@e.io" })).status).toBe(201);
    expect((await request(h.app).get(`/scim/v2/org-ent2/Users/${c.body.id}`).set(S(b))).status).toBe(404);
    const l = await request(h.app).get('/scim/v2/org-ent/Users?filter=userName eq "new@e.io"').set(S(a));
    expect(l.body.totalResults).toBe(1);
    expect((await request(h.app).get("/scim/v2/org-ent/Users").set(S(a))).body.totalResults).toBe(1);
    // rename frees the old name and claims the new one
    const p = await request(h.app).patch(`/scim/v2/org-ent/Users/${c.body.id}`).set(S(a))
      .send({ schemas: [PATCH], Operations: [{ op: "replace", path: "userName", value: "renamed@e.io" }] });
    expect(p.status).toBe(200);
    expect((await request(h.app).post("/scim/v2/org-ent/Users").set(S(a)).send({ userName: "new@e.io" })).status).toBe(201);
    expect((await request(h.app).post("/scim/v2/org-ent/Users").set(S(a)).send({ userName: "renamed@e.io" })).status).toBe(409);
  });

  it("groups: members must be users of the same org; membership feeds the ACL group ids", async () => {
    const a = (await mint("admin@e.io", "org-ent")).body.token;
    const u = await request(h.app).post("/scim/v2/org-ent/Users").set(S(a)).send({ userName: "ann@e.io" });
    const g = await request(h.app).post("/scim/v2/org-ent/Groups").set(S(a)).send({ displayName: "Eng", members: [{ value: u.body.id }] });
    expect(g.status).toBe(201);
    expect((await request(h.app).post("/scim/v2/org-ent/Groups").set(S(a)).send({ displayName: "Bad", members: [{ value: "nope" }] })).status).toBe(400);
    expect(await h.platform.scimDirectory.groupIdsForEmail("ANN@e.io")).toEqual([`org-ent:${g.body.id}`]);
    expect(await h.platform.scimDirectory.groupIdsForEmail("other@e.io")).toEqual([]);
    // deleting the user removes them from the group
    await request(h.app).delete(`/scim/v2/org-ent/Users/${u.body.id}`).set(S(a));
    expect(await h.platform.scimDirectory.groupIdsForEmail("ann@e.io")).toEqual([]);
    expect((await request(h.app).get(`/scim/v2/org-ent/Groups/${g.body.id}`).set(S(a))).body.members).toEqual([]);
  });
});

describe("SCIM deprovisioning revokes real access", () => {
  async function setup() {
    const tok = (await mint("admin@e.io", "org-ent")).body.token as string;
    const scimUser = await request(h.app).post("/scim/v2/org-ent/Users").set(S(tok)).send({ userName: "ann@e.io" });
    // bob (org member) shares a note with ann; an outsider also shares one with ann.
    await request(h.app).put("/api/v2/notes/b1").set(await bearer("bob@e.io")).send({ baseRev: null, note: note("b1") });
    await request(h.app).put("/api/v2/notes/x1").set(await bearer("outsider@x.io")).send({ baseRev: null, note: note("x1") });
    await api("post", "bob@e.io", "/api/v2/shares/note/b1/grants", { principal: { type: "user", email: "ann@e.io" }, role: "Editor" });
    await api("post", "outsider@x.io", "/api/v2/shares/note/x1/grants", { principal: { type: "user", email: "ann@e.io" }, role: "Viewer" });
    return { tok, id: scimUser.body.id as string, bobKey: noteKey("bob@e.io", "b1"), outKey: noteKey("outsider@x.io", "x1") };
  }

  it("active=false removes the org membership and the shares org members gave the user (once)", async () => {
    const s = await setup();
    expect(await h.orgs.roleOf("org-ent", "ann@e.io")).toBe("Member");
    expect(await h.platform.accessChecker.getRole("ann@e.io", `note:${s.bobKey}`)).toBe("Editor");
    expect((await h.platform.tenancy.resolve("ann@e.io")).orgId).toBe("org-ent"); // warm the membership cache

    const r = await request(h.app).patch(`/scim/v2/org-ent/Users/${s.id}`).set(S(s.tok))
      .send({ schemas: [PATCH], Operations: [{ op: "replace", path: "active", value: "False" }] });
    expect(r.status).toBe(200);
    expect(r.body.active).toBe(false);
    expect(await h.orgs.roleOf("org-ent", "ann@e.io")).toBeNull();
    expect(await h.platform.accessChecker.getRole("ann@e.io", `note:${s.bobKey}`)).toBeNull();
    expect((await h.platform.tenancy.resolve("ann@e.io")).kind).toBe("user"); // cache was invalidated
    // an unrelated outsider's share is the outsider's business and is left alone
    expect(await h.platform.accessChecker.getRole("ann@e.io", `note:${s.outKey}`)).toBe("Viewer");
    expect(h.audits.filter((a) => a.action === "scim.user.deprovisioned")).toHaveLength(1);
  });

  it("DELETE deprovisions too, and an org owner cannot be deprovisioned away", async () => {
    const s = await setup();
    expect((await request(h.app).delete(`/scim/v2/org-ent/Users/${s.id}`).set(S(s.tok))).status).toBe(204);
    expect(await h.orgs.roleOf("org-ent", "ann@e.io")).toBeNull();
    expect(await h.platform.accessChecker.getRole("ann@e.io", `note:${s.bobKey}`)).toBeNull();

    const o = await request(h.app).post("/scim/v2/org-ent/Users").set(S(s.tok)).send({ userName: "owner@e.io" });
    await request(h.app).patch(`/scim/v2/org-ent/Users/${o.body.id}`).set(S(s.tok))
      .send({ schemas: [PATCH], Operations: [{ op: "replace", path: "active", value: false }] });
    expect(await h.orgs.roleOf("org-ent", "owner@e.io")).toBe("OrgOwner");
  });

  it("deactivated users stop contributing SCIM group ids", async () => {
    const s = await setup();
    const g = await request(h.app).post("/scim/v2/org-ent/Groups").set(S(s.tok)).send({ displayName: "G", members: [{ value: s.id }] });
    expect(await h.platform.scimDirectory.groupIdsForEmail("ann@e.io")).toEqual([`org-ent:${g.body.id}`]);
    await request(h.app).put(`/scim/v2/org-ent/Users/${s.id}`).set(S(s.tok)).send({ userName: "ann@e.io", active: false });
    expect(await h.platform.scimDirectory.groupIdsForEmail("ann@e.io")).toEqual([]);
  });
});
