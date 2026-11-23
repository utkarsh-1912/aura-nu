import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createScimRouter } from "../../server/enterprise/scim";
import { MemoryScimDirectory, MemoryScimTokens } from "../../server/enterprise/scimStore";

const PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
let tokens: MemoryScimTokens, dir: MemoryScimDirectory, tokA: string, tokB: string, onDeprovision: any;
let app: express.Express;
const A = () => ({ Authorization: `Bearer ${tokA}` });

beforeEach(() => {
  tokens = new MemoryScimTokens();
  dir = new MemoryScimDirectory();
  tokA = tokens.issue("orgA");
  tokB = tokens.issue("orgB");
  onDeprovision = vi.fn();
  app = express().use("/scim/v2", createScimRouter({ tokens, directory: dir, onDeprovision }));
});

const mkUser = (name = "ann@a.io") => request(app).post("/scim/v2/orgA/Users").set(A()).send({ userName: name, displayName: "Ann" });

describe("SCIM auth", () => {
  it("rejects missing/wrong/cross-org tokens with SCIM error schema", async () => {
    for (const h of [{}, { Authorization: "Bearer nope" }, { Authorization: `Bearer ${tokB}` }]) {
      const r = await request(app).get("/scim/v2/orgA/Users").set(h);
      expect(r.status).toBe(401);
      expect(r.body.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
      expect(r.body.status).toBe("401");
    }
    expect((await request(app).get("/scim/v2/unknown/Users").set(A())).status).toBe(401);
    expect((await request(app).get("/scim/v2/orgA/Users").set(A())).status).toBe(200);
  });
  it("stores only hashes", async () => {
    const hashes = await tokens.hashesFor("orgA");
    expect(hashes[0]).not.toContain(tokA);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("SCIM users", () => {
  it("create, get, list+filter, conflict", async () => {
    const c = await mkUser();
    expect(c.status).toBe(201);
    expect(c.headers["content-type"]).toContain("application/scim+json");
    expect(c.body.active).toBe(true);
    expect((await request(app).get(`/scim/v2/orgA/Users/${c.body.id}`).set(A())).body.userName).toBe("ann@a.io");
    await mkUser("bob@a.io");
    const l = await request(app).get('/scim/v2/orgA/Users?filter=userName eq "ANN@a.io"').set(A());
    expect(l.body.totalResults).toBe(1);
    expect(l.body.schemas[0]).toContain("ListResponse");
    expect(l.body.Resources[0].userName).toBe("ann@a.io");
    const dup = await mkUser("ann@a.io");
    expect(dup.status).toBe(409);
    expect(dup.body.scimType).toBe("uniqueness");
    expect((await request(app).get("/scim/v2/orgA/Users?count=1").set(A())).body.itemsPerPage).toBe(1);
  });
  it("rejects unsupported filters and bad bodies", async () => {
    const f = await request(app).get('/scim/v2/orgA/Users?filter=userName co "a"').set(A());
    expect(f.status).toBe(400);
    expect(f.body.scimType).toBe("invalidFilter");
    expect((await request(app).post("/scim/v2/orgA/Users").set(A()).send({})).status).toBe(400);
    expect((await request(app).post("/scim/v2/orgA/Users").set(A()).send({ userName: "x", active: "maybe" })).status).toBe(400);
    const bad = await request(app).post("/scim/v2/orgA/Users").set(A()).set("Content-Type", "application/json").send("{nope");
    expect(bad.status).toBe(400);
    expect(bad.body.schemas[0]).toContain("Error");
  });
  it("patch active=false (incl. Azure 'False') deprovisions", async () => {
    const id = (await mkUser()).body.id;
    const r = await request(app).patch(`/scim/v2/orgA/Users/${id}`).set(A()).send({
      schemas: [PATCH], Operations: [{ op: "Replace", path: "active", value: "False" }],
    });
    expect(r.status).toBe(200);
    expect(r.body.active).toBe(false);
    expect(onDeprovision).toHaveBeenCalledTimes(1);
    // idempotent: second deactivation does not re-fire
    await request(app).patch(`/scim/v2/orgA/Users/${id}`).set(A()).send({ schemas: [PATCH], Operations: [{ op: "replace", value: { active: false } }] });
    expect(onDeprovision).toHaveBeenCalledTimes(1);
  });
  it("patch requires PatchOp schema; unknown id 404", async () => {
    const id = (await mkUser()).body.id;
    expect((await request(app).patch(`/scim/v2/orgA/Users/${id}`).set(A()).send({ Operations: [] })).status).toBe(400);
    expect((await request(app).patch("/scim/v2/orgA/Users/nope").set(A()).send({ schemas: [PATCH], Operations: [] })).status).toBe(404);
  });
  it("delete deprovisions and 404s afterwards; orgs are isolated", async () => {
    const id = (await mkUser()).body.id;
    const other = await request(app).get(`/scim/v2/orgB/Users/${id}`).set({ Authorization: `Bearer ${tokB}` });
    expect(other.status).toBe(404);
    expect((await request(app).delete(`/scim/v2/orgA/Users/${id}`).set(A())).status).toBe(204);
    expect(onDeprovision).toHaveBeenCalledTimes(1);
    expect((await request(app).get(`/scim/v2/orgA/Users/${id}`).set(A())).status).toBe(404);
    expect((await request(app).delete(`/scim/v2/orgA/Users/${id}`).set(A())).status).toBe(404);
  });
});

describe("SCIM groups", () => {
  it("create, add/remove members, rejects foreign members", async () => {
    const u = (await mkUser()).body.id;
    const g = await request(app).post("/scim/v2/orgA/Groups").set(A()).send({ displayName: "Eng", members: [{ value: u }] });
    expect(g.status).toBe(201);
    expect(g.body.members).toHaveLength(1);
    const foreign = (await request(app).post("/scim/v2/orgB/Users").set({ Authorization: `Bearer ${tokB}` }).send({ userName: "z@b.io" })).body.id;
    const bad = await request(app).patch(`/scim/v2/orgA/Groups/${g.body.id}`).set(A()).send({
      schemas: [PATCH], Operations: [{ op: "add", path: "members", value: [{ value: foreign }] }],
    });
    expect(bad.status).toBe(400);
    const rm = await request(app).patch(`/scim/v2/orgA/Groups/${g.body.id}`).set(A()).send({
      schemas: [PATCH], Operations: [{ op: "remove", path: `members[value eq "${u}"]` }],
    });
    expect(rm.body.members).toHaveLength(0);
    expect((await request(app).get('/scim/v2/orgA/Groups?filter=displayName eq "Eng"').set(A())).body.totalResults).toBe(1);
    expect((await request(app).delete(`/scim/v2/orgA/Groups/${g.body.id}`).set(A())).status).toBe(204);
  });
});
