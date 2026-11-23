import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { MemoryMeteringStore, MongoMeteringStore, meteringMiddleware, periodOf, nextPeriodStart } from "../../server/enterprise/metering";
import type { UserTier } from "../../src/types";

function mk(tier: UserTier, opts: Partial<Parameters<typeof meteringMiddleware>[0]> = {}, handlerStatus = 200) {
  const store = new MemoryMeteringStore();
  const app = express();
  app.use((req, _res, next) => { (req as any).tenant = req.header("x-t") ?? null; next(); });
  app.post("/ai", meteringMiddleware({ store, tenantOf: (r) => (r as any).tenant, tierOf: async () => tier, ...opts }), (_req, res) => {
    res.locals.meterTokens?.(10, 20);
    res.status(handlerStatus).json({ ok: true });
  });
  return { app, store };
}

describe("metering", { timeout: 30000 }, () => {
  it("enforces the personal tier limit (50) per tenant", async () => {
    const { app, store } = mk("personal");
    for (let i = 0; i < 50; i++) expect((await request(app).post("/ai").set("x-t", "u1")).status).toBe(200);
    const r = await request(app).post("/ai").set("x-t", "u1");
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: "quota_exceeded", limit: 50, used: 50 });
    expect(r.headers["retry-after"]).toBeTruthy();
    expect((await request(app).post("/ai").set("x-t", "u2")).status).toBe(200); // other tenant unaffected
    expect((await store.get("u1", periodOf())).tokensIn).toBe(500);
  });
  it("enterprise is unlimited but still counted; unauthenticated rejected", async () => {
    const { app, store } = mk("enterprise");
    for (let i = 0; i < 60; i++) await request(app).post("/ai").set("x-t", "o1");
    expect((await store.get("o1", periodOf())).actions).toBe(60);
    expect((await request(app).post("/ai")).status).toBe(401);
  });
  it("concurrent requests never exceed the limit", async () => {
    const { app } = mk("personal", { limitOverride: () => 5 });
    const rs = await Promise.all(Array.from({ length: 20 }, () => request(app).post("/ai").set("x-t", "c")));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(5);
  });
  it("overrides may only tighten, never loosen", async () => {
    const { app } = mk("personal", { limitOverride: () => 100000 });
    let last = 200;
    for (let i = 0; i < 51; i++) last = (await request(app).post("/ai").set("x-t", "u")).status;
    expect(last).toBe(429);
  });
  it("refunds on handler 5xx", async () => {
    const { app, store } = mk("personal", {}, 500);
    await request(app).post("/ai").set("x-t", "u");
    await new Promise((r) => setTimeout(r, 20));
    expect((await store.get("u", periodOf())).actions).toBe(0);
  });
  it("fails closed when the store errors; gates advanced AI by tier", async () => {
    const bad = { tryConsume: async () => { throw new Error("db"); } } as any;
    const app = express().post("/ai", meteringMiddleware({ store: bad, tenantOf: () => "t", tierOf: async () => "team" }), (_q, r) => { r.send("x"); });
    expect((await request(app).post("/ai")).status).toBe(503);
    const { app: a2 } = mk("personal", { requireAdvancedAI: true });
    expect((await request(a2).post("/ai").set("x-t", "u")).status).toBe(403);
  });
  it("period helpers", () => {
    expect(periodOf(new Date("2026-03-31T23:59:59Z"))).toBe("2026-03");
    expect(nextPeriodStart(new Date("2026-12-15T00:00:00Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
  it("mongo adapter issues a conditional atomic $inc (shape only, UNTESTED against live Mongo)", async () => {
    const calls: any[] = [];
    const col: any = { findOneAndUpdate: async (...a: any[]) => { calls.push(a); return { actions: 3 }; }, updateOne: async () => ({}), findOne: async () => null };
    const r = await new MongoMeteringStore(col).tryConsume("t", "2026-01", 1, 50);
    expect(r).toEqual({ ok: true, used: 3 });
    expect(calls[0][0]).toMatchObject({ tenant: "t", period: "2026-01", actions: { $lte: 49 } });
  });
});
