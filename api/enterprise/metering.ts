import type { NextFunction, Request, Response } from "express";
import { getTierPermissions } from "../../src/lib/tierPermissions";
import type { UserTier } from "../../src/types";

export interface UsageSnapshot {
  actions: number;
  tokensIn: number;
  tokensOut: number;
}

export interface MeteringStore {
  /**
   * ATOMIC check-and-increment of AI actions for (tenant, period). Must never let concurrent calls
   * exceed `limit`. limit < 0 means unlimited (still counted). Returns the post-update count.
   */
  tryConsume(tenant: string, period: string, amount: number, limit: number): Promise<{ ok: boolean; used: number }>;
  refund(tenant: string, period: string, amount: number): Promise<void>;
  addTokens(tenant: string, period: string, tokensIn: number, tokensOut: number): Promise<void>;
  get(tenant: string, period: string): Promise<UsageSnapshot>;
}

export const periodOf = (d: Date = new Date()) => d.toISOString().slice(0, 7); // UTC "YYYY-MM"
export function nextPeriodStart(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

export class MemoryMeteringStore implements MeteringStore {
  private m = new Map<string, UsageSnapshot>();
  private row(t: string, p: string) {
    const k = `${t}|${p}`;
    if (!this.m.has(k)) this.m.set(k, { actions: 0, tokensIn: 0, tokensOut: 0 });
    return this.m.get(k)!;
  }
  async tryConsume(t: string, p: string, amount: number, limit: number) {
    const r = this.row(t, p); // single-threaded JS: this read-modify-write is atomic
    if (limit >= 0 && r.actions + amount > limit) return { ok: false, used: r.actions };
    r.actions += amount;
    return { ok: true, used: r.actions };
  }
  async refund(t: string, p: string, amount: number) {
    const r = this.row(t, p);
    r.actions = Math.max(0, r.actions - amount);
  }
  async addTokens(t: string, p: string, i: number, o: number) {
    const r = this.row(t, p);
    r.tokensIn += i;
    r.tokensOut += o;
  }
  async get(t: string, p: string) {
    return { ...this.row(t, p) };
  }
}

/** Minimal structural view of a Mongo collection (no driver import needed). */
export interface MongoUsageCollectionLike {
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, opts: Record<string, unknown>): Promise<any>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown>;
  findOne(filter: Record<string, unknown>): Promise<any>;
}

/**
 * Mongo store. UNTESTED against a live MongoDB. Docs: { tenant, period, actions, tokensIn, tokensOut }
 * with a unique index on { tenant: 1, period: 1 }. tryConsume is a single conditional $inc
 * (filter `actions <= limit - amount`), so it is atomic under concurrency; when the filter does not
 * match, either the quota is exhausted or the doc is missing (first use), which is resolved by an
 * upsert attempt that tolerates the duplicate-key race.
 */
export class MongoMeteringStore implements MeteringStore {
  constructor(private col: MongoUsageCollectionLike) {}
  async tryConsume(tenant: string, period: string, amount: number, limit: number) {
    const key = { tenant, period };
    if (limit < 0) {
      const d = await this.col.findOneAndUpdate(key, { $inc: { actions: amount } }, { upsert: true, returnDocument: "after" });
      return { ok: true, used: d?.actions ?? amount };
    }
    if (amount > limit) return { ok: false, used: (await this.get(tenant, period)).actions };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const d = await this.col.findOneAndUpdate(
          { ...key, actions: { $lte: limit - amount } },
          { $inc: { actions: amount } },
          { upsert: true, returnDocument: "after" },
        );
        return { ok: true, used: d?.actions ?? amount };
      } catch (e: any) {
        if (e?.code !== 11000) throw e;
        // Duplicate key on upsert means the doc exists but the conditional filter failed: quota exhausted.
        return { ok: false, used: (await this.get(tenant, period)).actions };
      }
    }
    return { ok: false, used: (await this.get(tenant, period)).actions };
  }
  async refund(tenant: string, period: string, amount: number) {
    await this.col.updateOne({ tenant, period, actions: { $gte: amount } }, { $inc: { actions: -amount } });
  }
  async addTokens(tenant: string, period: string, i: number, o: number) {
    await this.col.updateOne({ tenant, period }, { $inc: { tokensIn: i, tokensOut: o } }, { upsert: true });
  }
  async get(tenant: string, period: string) {
    const d = await this.col.findOne({ tenant, period });
    return { actions: d?.actions ?? 0, tokensIn: d?.tokensIn ?? 0, tokensOut: d?.tokensOut ?? 0 };
  }
}

export interface MeteringDeps {
  store: MeteringStore;
  /** Tenant id (org id or user email) derived from the AUTHENTICATED request, never from client input. */
  tenantOf: (req: Request) => string | null;
  /** Tier of that tenant, read server-side. */
  tierOf: (req: Request) => Promise<UserTier>;
  /** Actions consumed by this request (default 1). */
  cost?: (req: Request) => number;
  /** Optional per-tenant override of the monthly action limit (e.g. an admin-set AI policy cap). */
  limitOverride?: (req: Request, tierLimit: number) => Promise<number | null> | number | null;
  /** Require the tier's canUseAdvancedAI flag. */
  requireAdvancedAI?: boolean;
  now?: () => Date;
}

/**
 * Express middleware: enforces the tier's aiActionsPerMonth BEFORE the handler runs.
 * Fails closed: store errors -> 503. Server errors (>=500) from the handler refund the action.
 * Handlers can report tokens via res.locals.meterTokens(in, out).
 */
export function meteringMiddleware(deps: MeteringDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenant = deps.tenantOf(req);
    if (!tenant) return res.status(401).json({ error: "Authentication required" });
    const now = (deps.now ?? (() => new Date()))();
    const period = periodOf(now);
    const cost = Math.max(1, Math.floor(deps.cost?.(req) ?? 1));
    try {
      const perms = getTierPermissions(await deps.tierOf(req));
      if (deps.requireAdvancedAI && !perms.canUseAdvancedAI) {
        return res.status(403).json({ error: "feature_unavailable", detail: "Advanced AI is not included in this plan" });
      }
      let limit = perms.aiActionsPerMonth;
      const ov = await deps.limitOverride?.(req, limit);
      if (typeof ov === "number" && ov >= 0 && (limit < 0 || ov < limit)) limit = ov; // overrides may only tighten
      const r = await deps.store.tryConsume(tenant, period, cost, limit);
      res.setHeader("X-Aura-AI-Quota-Limit", limit < 0 ? "unlimited" : String(limit));
      res.setHeader("X-Aura-AI-Quota-Used", String(r.used));
      if (!r.ok) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((Date.parse(nextPeriodStart(now)) - now.getTime()) / 1000))));
        return res.status(429).json({ error: "quota_exceeded", limit, used: r.used, resetsAt: nextPeriodStart(now) });
      }
      res.locals.meterTokens = (i: number, o: number) =>
        deps.store.addTokens(tenant, period, Math.max(0, Math.floor(i) || 0), Math.max(0, Math.floor(o) || 0)).catch(() => undefined);
      res.on("finish", () => {
        if (res.statusCode >= 500) void deps.store.refund(tenant, period, cost).catch(() => undefined);
      });
      next();
    } catch {
      res.status(503).json({ error: "Usage metering unavailable" });
    }
  };
}
