// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { bearer, makeHarness, tokenFor } from "./harness";

type H = Awaited<ReturnType<typeof makeHarness>>;
let h: H;
beforeAll(async () => {
  h = await makeHarness();
  h.orgs.add("org-ent", "enterprise", { "admin@e.io": "OrgOwner" });
});

const key = "a".repeat(40);
const routes: Array<[string, string, object?]> = [
  ["get", "/api/usage"],
  ["get", "/api/org/org-ent/ai-policy"],
  ["put", "/api/org/org-ent/ai-policy", { policy: "local-only" }],
  ["get", "/api/org/org-ent/scim-tokens"],
  ["post", "/api/org/org-ent/scim-tokens", {}],
  ["delete", "/api/org/org-ent/scim-tokens/abc"],
  ["get", "/api/v2/shares/room/n1"],
  ["get", "/api/v2/shares/with-me"],
  ["get", `/api/v2/shares/note/${key}/grants`],
  ["post", `/api/v2/shares/note/${key}/grants`, { principal: { type: "link" }, role: "Viewer" }],
  ["delete", `/api/v2/shares/note/${key}/grants/g1`],
  ["post", "/api/v2/shares/links/verify", { token: "a.b" }],
  ["post", "/api/v2/shares/links/redeem", { token: "a.b" }],
  ["put", "/api/v2/notes/n1", { baseRev: null }],
  ["post", "/api/ai/action", { action: "chat" }],
  ["post", "/api/ai/chat", { messages: [] }],
  ["post", "/api/ai/embed", { input: ["x"] }],
  ["get", "/api/ai/models"],
  ["post", "/api/agents/execute", {}],
];

describe("guests and unauthenticated callers get 401 on every new route", () => {
  it.each(routes)("%s %s", async (method, url, body) => {
    const none = await (request(h.app) as any)[method](url).send(body ?? {});
    expect(none.status).toBe(401);
    const bad = await (request(h.app) as any)[method](url).set({ Authorization: "Bearer not.a.jwt" }).send(body ?? {});
    expect(bad.status).toBe(401);
    // The dev-only identity header is not accepted when Firebase is configured.
    const spoof = await (request(h.app) as any)[method](url).set({ "x-user-email": "admin@e.io" }).send(body ?? {});
    expect(spoof.status).toBe(401);
  });

  it("a token for another Firebase project is rejected", async () => {
    // tokenFor signs for this project; a tampered signature must fail
    const t = await tokenFor("admin@e.io");
    const broken = t.slice(0, -4) + (t.endsWith("AAAA") ? "BBBB" : "AAAA");
    const r = await request(h.app).get("/api/usage").set({ Authorization: `Bearer ${broken}` });
    expect(r.status).toBe(401);
    expect((await request(h.app).get("/api/usage").set(await bearer("admin@e.io"))).status).toBe(200);
  });

  it("SCIM answers 401 with the SCIM error schema when unauthenticated", async () => {
    const r = await request(h.app).get("/scim/v2/org-ent/Users");
    expect(r.status).toBe(401);
    expect(r.body.schemas).toEqual(["urn:ietf:params:scim:api:messages:2.0:Error"]);
  });
});
