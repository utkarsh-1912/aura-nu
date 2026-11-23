import { AsyncLocalStorage } from "node:async_hooks";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import type { AiMeter } from "./ai/router";
import type { AiPolicy } from "../src/ai/types";
import { getTierPermissions } from "../src/lib/tierPermissions";
import { getUserEmail } from "./auth";
import { createAclAccessChecker } from "./collab/access";
import type { AccessChecker } from "./collab/server";
import { MongoMeteringStore, meteringMiddleware, nextPeriodStart, periodOf, type MeteringStore, type MongoUsageCollectionLike } from "./enterprise/metering";
import { createScimRouter } from "./enterprise/scim";
import { PersistentScimDirectory, PersistentScimTokens } from "./enterprise/scimPersist";
import { AiPolicyStore, CollectionMeteringStore, isAiPolicy, strictest } from "./aiPolicy";
import { GrantStore, withOwnerRegistration, type ResourceDoc } from "./grantStore";
import type { NoteStore } from "./noteStore";
import { createCollectionFactory, type MongoCollLike } from "./persist";
import { createSharesRouter } from "./sharesRoutes";
import { ORG_ID_RE, Tenancy, type OrgDirectory, type TenantInfo } from "./tenancy";

export interface PlatformDeps {
  /** File backend root (also where tests point at a temp dir). */
  dataDir: string;
  /** Native Mongo collection by short name when connected; null/undefined -> file backend. */
  mongo?: (name: string) => MongoCollLike | null;
  /** Use in-memory collections (tests). */
  memory?: boolean;
  production: boolean;
  orgs: OrgDirectory;
  /** SHARE_LINK_SECRET. Share-link routes answer 503 unless it is >= 16 chars. */
  shareSecret?: string;
  defaultAiPolicy: AiPolicy;
  scimBaseUrl?: string;
  now?: () => number;
  /** Persist an audit record (orgId is null for personal-scope events). Must never throw. */
  audit?: (orgId: string | null, email: string, action: string, resource: string, meta?: Record<string, unknown>) => void;
  log?: (msg: string, err?: unknown) => void;
}

export interface OrgMiddleware {
  asMember: RequestHandler;
  asAdmin: RequestHandler;
}

interface MeterCtx {
  tenant: string;
  period: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createPlatform(deps: PlatformDeps) {
  const now = () => (deps.now ?? Date.now)();
  const log = deps.log ?? ((m: string, e?: unknown) => console.error(m, e));
  const collection = createCollectionFactory({ dataDir: deps.dataDir, mongo: (n) => deps.mongo?.(n) ?? null, memory: deps.memory });

  // ---- stores
  const tenancy = new Tenancy(deps.orgs, 15_000, now);
  const grants = new GrantStore(collection<ResourceDoc>("grants"), now);
  const scimDirectory = new PersistentScimDirectory({
    users: collection("scim_users"),
    groups: collection("scim_groups"),
    claims: collection("scim_claims"),
  });
  const scimTokens = new PersistentScimTokens(collection("scim_tokens"));
  const policies = new AiPolicyStore(collection("ai_policy"));

  const fileUsage = new CollectionMeteringStore(collection("usage"));
  let mongoUsage: { raw: MongoCollLike; store: MongoMeteringStore } | null = null;
  const pickUsage = (): MeteringStore => {
    const raw = deps.mongo?.("usage") ?? null;
    if (!raw) return fileUsage;
    if (!mongoUsage || mongoUsage.raw !== raw) mongoUsage = { raw, store: new MongoMeteringStore(raw as unknown as MongoUsageCollectionLike) };
    return mongoUsage.store;
  };
  const meteringStore: MeteringStore = {
    tryConsume: (...a) => pickUsage().tryConsume(...a),
    refund: (...a) => pickUsage().refund(...a),
    addTokens: (...a) => pickUsage().addTokens(...a),
    get: (...a) => pickUsage().get(...a),
  };

  // ---- collaboration access
  const loadGroups = (email: string) => scimDirectory.groupIdsForEmail(email);
  const accessChecker: AccessChecker = createAclAccessChecker(grants.aclSource(loadGroups), now);

  // ---- AI policy / metering
  async function resolvePolicy(email: string): Promise<AiPolicy> {
    // The workspace id sent by a client is deliberately ignored: honouring it would let a caller pick a looser
    // org's policy. The effective policy is the strictest of the operator default and every org the caller belongs to.
    const ms = await tenancy.memberships(email);
    const docs = await Promise.all(ms.map((m) => policies.get(m.orgId)));
    return strictest([deps.defaultAiPolicy, ...docs.map((d) => d?.policy)]);
  }

  const als = new AsyncLocalStorage<MeterCtx>();
  const metering = meteringMiddleware({
    store: meteringStore,
    tenantOf: (req) => (req as any).auraTenant?.tenant ?? null,
    tierOf: async (req) => (req as any).auraTenant.tier,
    now: () => new Date(now()),
  });

  /** Quota gate for AI endpoints. Reads (GET/HEAD/OPTIONS) are free. */
  const aiGuard: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    const email = getUserEmail(req);
    if (!email) return void res.status(401).json({ error: "Authentication required" });
    let t: TenantInfo;
    try {
      t = await tenancy.resolve(email, req.headers["x-aura-org"]);
    } catch (e) {
      log("tenant resolution failed", e);
      return void res.status(503).json({ error: "Usage metering unavailable" });
    }
    (req as any).auraTenant = t;
    als.run({ tenant: t.tenant, period: periodOf(new Date(now())) }, () => void metering(req, res, next));
  };

  /** Plugs into createAiRouter({ meter }) to add token counts to the quota record opened by aiGuard. */
  const aiMeter: AiMeter = {
    check: () => ({ allowed: true }), // quota is enforced by aiGuard before the router runs
    async record(_email, ev) {
      const ctx = als.getStore();
      if (!ctx || !ev.ok) return;
      const i = ev.usage.promptTokens ?? 0;
      const o = ev.usage.completionTokens ?? 0;
      if (i || o) await meteringStore.addTokens(ctx.tenant, ctx.period, i, o).catch(() => undefined);
    },
  };

  // ---- SCIM
  async function onDeprovision(orgId: string, user: { userName: string }) {
    const email = user.userName.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return;
    // Collect member emails first so shares given on the org's members' notes can be revoked too.
    const members = deps.orgs.available() ? await deps.orgs.memberEmails(orgId) : [];
    const removed = deps.orgs.available() ? await deps.orgs.removeMember(orgId, email) : false;
    tenancy.invalidate(email);
    const revoked = await grants.revokeUserAccess(email, members);
    deps.audit?.(orgId, "scim", "scim.user.deprovisioned", `user:${email}`, { membershipRemoved: removed, grantsRevoked: revoked });
  }

  const scimRouter = createScimRouter({
    tokens: scimTokens,
    directory: scimDirectory,
    onDeprovision,
    audit: (event, meta) => deps.audit?.(meta.orgId, "scim", event, meta.id ?? "", {}),
    baseUrl: deps.scimBaseUrl,
  });

  const sharesRouter = createSharesRouter({
    grants,
    loadGroups,
    secret: deps.shareSecret,
    now,
    audit: (email, action, resource, meta) => deps.audit?.(null, email, action, resource, meta),
  });

  const scimGate: RequestHandler = async (req, res, next) => {
    const orgId = req.params.orgId;
    if (!ORG_ID_RE.test(orgId)) return void res.status(400).json({ error: "invalid org id" });
    try {
      if (!deps.orgs.available()) {
        if (deps.production) return void res.status(503).json({ error: "Organization data store unavailable" });
        return next(); // local dev without a database
      }
      const tier = await deps.orgs.orgTier(orgId);
      if (!tier) return void res.status(404).json({ error: "Org not found" });
      if (!getTierPermissions(tier).canConfigureSSO) {
        return void res.status(403).json({ error: "feature_unavailable", detail: "SCIM provisioning requires the Enterprise plan" });
      }
      next();
    } catch (e) {
      log("scim tier gate failed", e);
      res.status(500).json({ error: "Could not verify plan" });
    }
  };

  return {
    grants, scimDirectory, scimTokens, policies, meteringStore, tenancy, accessChecker, resolvePolicy,
    aiGuard, aiMeter, scimRouter, sharesRouter, onDeprovision,
    /** Wrap the v2 NoteStore so owners are recorded for sharing. */
    withOwnerRegistration: (store: NoteStore) => withOwnerRegistration(store, grants, (m, e) => log(m, e)),

    /** Public (own bearer auth). Mount OUTSIDE the /api auth middleware. */
    mountPublic(app: Express) {
      app.use("/scim/v2", scimRouter);
    },

    /** Everything that needs a verified identity. Mount AFTER the /api auth middleware. */
    mountAuthed(app: Express, org: OrgMiddleware) {
      app.use("/api/v2/shares", sharesRouter);

      app.get("/api/usage", async (req, res) => {
        try {
          const email = getUserEmail(req);
          if (!email) return void res.status(401).json({ error: "Authentication required" });
          const t = await tenancy.resolve(email, req.headers["x-aura-org"]);
          const perms = getTierPermissions(t.tier);
          const d = new Date(now());
          const period = periodOf(d);
          const usage = await meteringStore.get(t.tenant, period);
          const limit = perms.aiActionsPerMonth;
          res.json({
            scope: t.kind, orgId: t.orgId ?? null, tier: t.tier, period, resetsAt: nextPeriodStart(d),
            limits: { aiActionsPerMonth: limit, canUseAdvancedAI: perms.canUseAdvancedAI },
            usage, remaining: limit < 0 ? null : Math.max(0, limit - usage.actions),
            aiPolicy: await resolvePolicy(email),
          });
        } catch (e) {
          log("usage failed", e);
          res.status(500).json({ error: "Could not read usage" });
        }
      });

      const orgIdOk: RequestHandler = (req, res, next) =>
        ORG_ID_RE.test(req.params.orgId) ? next() : void res.status(400).json({ error: "invalid org id" });

      app.get("/api/org/:orgId/ai-policy", orgIdOk, org.asMember, async (req, res) => {
        try {
          const doc = await policies.get(req.params.orgId);
          res.json({
            orgId: req.params.orgId, policy: doc?.policy ?? null, default: deps.defaultAiPolicy,
            effective: strictest([deps.defaultAiPolicy, doc?.policy]), updatedAt: doc?.updatedAt ?? null,
          });
        } catch (e) {
          log("ai-policy read failed", e);
          res.status(500).json({ error: "Could not read policy" });
        }
      });

      app.put("/api/org/:orgId/ai-policy", orgIdOk, org.asAdmin, async (req, res) => {
        const policy = req.body?.policy;
        if (!isAiPolicy(policy)) return void res.status(400).json({ error: "policy must be cloud-allowed, self-host-only or local-only" });
        try {
          const by = getUserEmail(req);
          const doc = await policies.set(req.params.orgId, policy, by);
          tenancy.invalidate(by);
          deps.audit?.(req.params.orgId, by, "ai.policy.update", `org:${req.params.orgId}`, { policy });
          res.json({ orgId: doc.orgId, policy: doc.policy, default: deps.defaultAiPolicy, effective: strictest([deps.defaultAiPolicy, doc.policy]), updatedAt: doc.updatedAt });
        } catch (e) {
          log("ai-policy write failed", e);
          res.status(500).json({ error: "Could not save policy" });
        }
      });

      app.get("/api/org/:orgId/scim-tokens", orgIdOk, org.asAdmin, scimGate, async (req, res) => {
        try {
          const tokens = await scimTokens.list(req.params.orgId);
          res.json({ tokens: tokens.map((t) => ({ tokenId: t.tokenId, label: t.label, createdAt: t.createdAt, createdBy: t.createdBy })) });
        } catch (e) {
          log("scim token list failed", e);
          res.status(500).json({ error: "Could not list tokens" });
        }
      });

      app.post("/api/org/:orgId/scim-tokens", orgIdOk, org.asAdmin, scimGate, async (req, res) => {
        const label = typeof req.body?.label === "string" && req.body.label.trim() ? req.body.label.trim().slice(0, 80) : "SCIM token";
        try {
          const by = getUserEmail(req);
          const minted = await scimTokens.issue(req.params.orgId, label, by);
          if (!minted) return void res.status(409).json({ error: "This organization has reached its SCIM token limit" });
          deps.audit?.(req.params.orgId, by, "scim.token.create", `scim-token:${minted.tokenId}`, {});
          res.setHeader("Cache-Control", "no-store");
          res.status(201).json({ ...minted, shownOnce: true });
        } catch (e) {
          log("scim token mint failed", e);
          res.status(500).json({ error: "Could not create token" });
        }
      });

      app.delete("/api/org/:orgId/scim-tokens/:tokenId", orgIdOk, org.asAdmin, scimGate, async (req, res) => {
        try {
          if (!(await scimTokens.revoke(req.params.orgId, req.params.tokenId))) return void res.status(404).json({ error: "Token not found" });
          deps.audit?.(req.params.orgId, getUserEmail(req), "scim.token.revoke", `scim-token:${req.params.tokenId}`, {});
          res.status(204).end();
        } catch (e) {
          log("scim token revoke failed", e);
          res.status(500).json({ error: "Could not revoke token" });
        }
      });
    },
  };
}

export type Platform = ReturnType<typeof createPlatform>;
