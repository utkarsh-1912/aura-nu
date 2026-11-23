// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { bearer, makeHarness } from "./harness";
import { FakeProvider, ok } from "../ai/fakes";
import { CollectionMeteringStore, strictest } from "../../server/aiPolicy";
import { MemoryCollection } from "../../server/persist";
import { TIER_PERMISSIONS } from "../../src/lib/tierPermissions";

type H = Awaited<ReturnType<typeof makeHarness>>;
let h: H;
const action = async (email: string, body: object = {}, extra: Record<string, string> = {}) =>
  request(h.app).post("/api/ai/action").set({ ...(await bearer(email)), ...extra }).send(body);
const chat = async (email: string, extra: object = {}) =>
  request(h.app).post("/api/ai/chat").set(await bearer(email)).send({ messages: [{ role: "user", content: "hi" }], ...extra });
const usage = async (email: string, extra: Record<string, string> = {}) =>
  request(h.app).get("/api/usage").set({ ...(await bearer(email)), ...extra });
const waitFor = async (fn: () => Promise<boolean>, ms = 1500) => {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
};

beforeEach(async () => {
  h = await makeHarness({ now: () => Date.parse("2026-06-15T12:00:00Z") });
  h.orgs.add("org-team", "team", { "tl@t.io": "OrgOwner", "m1@t.io": "Member", "m2@t.io": "Member" });
  h.orgs.add("org-ent", "enterprise", { "e@e.io": "OrgOwner" });
  h.orgs.add("org-free", "personal", { "f@f.io": "OrgOwner" });
});

describe("AI metering", () => {
  it("returns 429 once the tier quota is used, with headers, and the handler is not reached", async () => {
    const limit = TIER_PERMISSIONS.personal.aiActionsPerMonth;
    for (let i = 0; i < limit; i++) expect((await action("solo@x.io")).status).toBe(200);
    const r = await action("solo@x.io");
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: "quota_exceeded", limit, used: limit, resetsAt: "2026-07-01T00:00:00.000Z" });
    expect(r.headers["retry-after"]).toBeDefined();
    const p = h.providers[0] as FakeProvider;
    const before = p.calls;
    expect((await chat("solo@x.io")).status).toBe(429); // the new router is metered with the same bucket
    expect(p.calls).toBe(before);
    expect((await action("someone-else@x.io")).status).toBe(200); // other tenants unaffected
  }, 60_000);

  it("is atomic under concurrency", async () => {
    const limit = TIER_PERMISSIONS.personal.aiActionsPerMonth;
    const rs = await Promise.all(Array.from({ length: limit + 15 }, () => action("race@x.io")));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(limit);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(15);
  }, 60_000);

  it("refunds the action when the handler fails with a 5xx (but not for success)", async () => {
    expect((await action("r@x.io")).status).toBe(200);
    expect((await action("r@x.io", { fail: true })).status).toBe(500);
    await waitFor(async () => (await usage("r@x.io")).body.usage.actions === 1);
    expect((await usage("r@x.io")).body.usage.actions).toBe(1);
  });

  it("also refunds when the provider is down (AI router 503)", async () => {
    const p = h.providers[0] as FakeProvider;
    p.script = [new (await import("../../src/ai/types")).AiError("AI_UNAVAILABLE", "down")];
    expect((await chat("down@x.io")).status).toBe(503);
    await waitFor(async () => (await usage("down@x.io")).body.usage.actions === 0);
  });

  it("does not charge for reads (GET /api/ai/models)", async () => {
    await request(h.app).get("/api/ai/models").set(await bearer("m@x.io"));
    expect((await usage("m@x.io")).body.usage.actions).toBe(0);
  });

  it("records token usage from the AI router and from legacy handlers", async () => {
    (h.providers[0] as FakeProvider).script = [ok("a")];
    expect((await chat("tok@x.io")).status).toBe(200);
    expect((await action("tok@x.io")).status).toBe(200);
    const u = (await usage("tok@x.io")).body.usage;
    expect(u).toMatchObject({ actions: 2, tokensIn: 1 + 10, tokensOut: 1 + 5 });
  });

  it("team members share their org's quota; enterprise is unlimited; personal orgs fall back to the user", async () => {
    await action("m1@t.io");
    await action("m2@t.io");
    const u1 = (await usage("m1@t.io")).body;
    expect(u1).toMatchObject({ scope: "org", orgId: "org-team", tier: "team", usage: { actions: 2 }, remaining: TIER_PERMISSIONS.team.aiActionsPerMonth - 2 });
    const e = (await usage("e@e.io")).body;
    expect(e).toMatchObject({ scope: "org", tier: "enterprise", remaining: null });
    expect(e.limits.aiActionsPerMonth).toBe(-1);
    const f = (await usage("f@f.io")).body;
    expect(f).toMatchObject({ scope: "user", orgId: null, tier: "personal" });
  });

  it("only honours X-Aura-Org for orgs the caller belongs to", async () => {
    const forged = (await usage("solo@x.io", { "x-aura-org": "org-ent" })).body;
    expect(forged).toMatchObject({ scope: "user", tier: "personal" });
    await action("solo@x.io", {}, { "x-aura-org": "org-ent" });
    expect((await usage("e@e.io")).body.usage.actions).toBe(0); // forged header did not bill/benefit org-ent
    expect((await usage("solo@x.io")).body.usage.actions).toBe(1);
  });

  it("GET /api/usage reports period, reset and policy", async () => {
    const u = (await usage("solo@x.io")).body;
    expect(u).toMatchObject({
      period: "2026-06", resetsAt: "2026-07-01T00:00:00.000Z", aiPolicy: "cloud-allowed",
      limits: { aiActionsPerMonth: 50, canUseAdvancedAI: false }, remaining: 50,
    });
  });
});

describe("CollectionMeteringStore", () => {
  it("never exceeds the limit, supports unlimited and refunds", async () => {
    const s = new CollectionMeteringStore(new MemoryCollection());
    const rs = await Promise.all(Array.from({ length: 30 }, () => s.tryConsume("t", "2026-06", 1, 10)));
    expect(rs.filter((r) => r.ok)).toHaveLength(10);
    expect((await s.get("t", "2026-06")).actions).toBe(10);
    await s.refund("t", "2026-06", 3);
    expect((await s.get("t", "2026-06")).actions).toBe(7);
    await s.refund("t", "2026-06", 100);
    expect((await s.get("t", "2026-06")).actions).toBe(0);
    for (let i = 0; i < 5; i++) expect((await s.tryConsume("u", "2026-06", 1, -1)).ok).toBe(true);
    expect((await s.get("u", "2026-06")).actions).toBe(5);
    expect((await s.get("u", "2026-07")).actions).toBe(0); // new period starts fresh
  });
});

describe("AI policy", () => {
  const providers = () => [new FakeProvider("cloud1", "cloud"), new FakeProvider("sh", "self-host")];

  it("strictest() ordering", () => {
    expect(strictest([])).toBe("cloud-allowed");
    expect(strictest(["cloud-allowed", "local-only", "self-host-only"])).toBe("local-only");
    expect(strictest(["self-host-only", undefined, null])).toBe("self-host-only");
  });

  it("defaults to AURA_AI_POLICY; cloud-only deployments are blocked when the default forbids the cloud", async () => {
    const strict = await makeHarness({ defaultAiPolicy: "self-host-only", providers: [new FakeProvider("cloud1", "cloud")] });
    const r = await request(strict.app).post("/api/ai/chat").set(await bearer("a@x.io")).send({ messages: [{ role: "user", content: "x" }] });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("POLICY_BLOCKED");
    expect((await chat("a@x.io")).status).toBe(200); // default harness: cloud-allowed
  });

  it("admins set a per-org policy that the AI router enforces for members; members/outsiders cannot", async () => {
    const hh = await makeHarness({ providers: providers() });
    hh.orgs.add("org-t", "team", { "boss@t.io": "OrgOwner", "emp@t.io": "Member" });
    const put = async (email: string, body: object, org = "org-t") => request(hh.app).put(`/api/org/${org}/ai-policy`).set(await bearer(email)).send(body);
    const ask = async (email: string, extra: object = {}) =>
      request(hh.app).post("/api/ai/chat").set(await bearer(email)).send({ messages: [{ role: "user", content: "x" }], ...extra });

    expect((await ask("emp@t.io")).body.provider).toBe("cloud1");
    expect((await put("emp@t.io", { policy: "self-host-only" })).status).toBe(403);
    expect((await put("out@x.io", { policy: "self-host-only" })).status).toBe(404);
    expect((await put("boss@t.io", { policy: "bogus" })).status).toBe(400);
    expect((await put("boss@t.io", {})).status).toBe(400);
    const ok1 = await put("boss@t.io", { policy: "self-host-only" });
    expect(ok1.status).toBe(200);
    expect(ok1.body).toMatchObject({ policy: "self-host-only", effective: "self-host-only" });
    expect((await ask("emp@t.io")).body.provider).toBe("sh"); // routed away from the cloud provider
    // someone outside the org is unaffected
    expect((await ask("out@x.io")).body.provider).toBe("cloud1");
    // a client cannot pick another org's (looser) policy, nor escape its own via workspaceId
    expect((await ask("emp@t.io", { workspaceId: "org-other" })).body.provider).toBe("sh");

    await put("boss@t.io", { policy: "local-only" });
    expect((await ask("emp@t.io")).status).toBe(403);
    const g = await request(hh.app).get("/api/org/org-t/ai-policy").set(await bearer("emp@t.io"));
    expect(g.body).toMatchObject({ policy: "local-only", default: "cloud-allowed", effective: "local-only" });
    expect((await request(hh.app).get("/api/org/org-t/ai-policy").set(await bearer("out@x.io"))).status).toBe(404);
    expect(hh.audits.some((a) => a.action === "ai.policy.update" && a.orgId === "org-t")).toBe(true);
  });

  it("an org cannot loosen the operator default, and multi-org members get the strictest policy", async () => {
    const hh = await makeHarness({ defaultAiPolicy: "self-host-only", providers: providers() });
    hh.orgs.add("org-a", "team", { "boss@a.io": "OrgOwner", "multi@x.io": "Member" });
    hh.orgs.add("org-b", "team", { "boss@b.io": "OrgOwner", "multi@x.io": "Member" });
    const put = async (email: string, org: string, policy: string) =>
      request(hh.app).put(`/api/org/${org}/ai-policy`).set(await bearer(email)).send({ policy });
    const loose = await put("boss@a.io", "org-a", "cloud-allowed");
    expect(loose.body.effective).toBe("self-host-only");
    expect(await hh.platform.resolvePolicy("multi@x.io")).toBe("self-host-only");
    await put("boss@b.io", "org-b", "local-only");
    expect(await hh.platform.resolvePolicy("multi@x.io")).toBe("local-only");
    expect(await hh.platform.resolvePolicy("nobody@x.io")).toBe("self-host-only");
  });
});
