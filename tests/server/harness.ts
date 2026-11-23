import express from "express";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { resolveIdentity, requireAuth, type AuthConfig } from "../../api/auth";
import { createAiRouter } from "../../api/ai/router";
import { AiRouter } from "../../src/ai/router";
import { MemoryNoteStore } from "../../api/noteStore";
import { ANY_MEMBER, ORG_ADMINS, requireOrgRole, type OrgRole } from "../../api/orgAccess";
import { createPlatform } from "../../api/platform";
import { createSyncRouter } from "../../api/syncRoutes";
import type { OrgDirectory, OrgMembership } from "../../api/tenancy";
import type { AiPolicy } from "../../src/ai/types";
import type { UserTier } from "../../src/types";
import { FakeProvider } from "../ai/fakes";
import type { NoteInput } from "../../src/core/sync";

export const PROJECT = "aura-server-test";
export const SECRET = "test-share-secret-0123456789";

let keys: Promise<{ priv: CryptoKey; cfg: AuthConfig }> | null = null;
function getKeys() {
  keys ??= (async () => {
    const kp = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    return { priv: kp.privateKey as CryptoKey, cfg: { projectId: PROJECT, production: true, jwks: createLocalJWKSet({ keys: [jwk] }) } as AuthConfig };
  })();
  return keys;
}

/** A real Firebase-shaped ID token signed by the test JWKS. */
export async function tokenFor(email: string): Promise<string> {
  const { priv } = await getKeys();
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(PROJECT)
    .setSubject("uid-" + email)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(priv);
}
export const bearer = async (email: string) => ({ Authorization: `Bearer ${await tokenFor(email)}` });

/** Authenticator for attachCollabServer using the same verification path as the REST API. */
export async function collabAuthenticate(token: string | null) {
  const { cfg } = await getKeys();
  const r = await resolveIdentity({ headers: { authorization: token ? `Bearer ${token}` : undefined } } as any, cfg);
  return r.ok ? { email: r.email } : null;
}

export class FakeOrgs implements OrgDirectory {
  orgs = new Map<string, { tier: UserTier; members: Map<string, { role: OrgRole; isOwner: boolean }> }>();
  on = true;
  add(orgId: string, tier: UserTier, members: Record<string, OrgRole>) {
    this.orgs.set(orgId, {
      tier,
      members: new Map(Object.entries(members).map(([e, role]) => [e, { role, isOwner: role === "OrgOwner" }])),
    });
  }
  available = () => this.on;
  async memberships(email: string): Promise<OrgMembership[]> {
    return [...this.orgs].filter(([, o]) => o.members.has(email)).map(([orgId, o]) => ({ orgId, tier: o.tier, role: o.members.get(email)!.role }));
  }
  async orgTier(orgId: string) {
    return this.orgs.get(orgId)?.tier ?? null;
  }
  async memberEmails(orgId: string) {
    return [...(this.orgs.get(orgId)?.members.keys() ?? [])];
  }
  async removeMember(orgId: string, email: string) {
    const m = this.orgs.get(orgId)?.members.get(email);
    if (!m || m.isOwner) return false;
    return this.orgs.get(orgId)!.members.delete(email);
  }
  async roleOf(orgId: string, email: string) {
    return this.orgs.get(orgId)?.members.get(email)?.role ?? null;
  }
}

export const note = (id: string, over: Partial<NoteInput> = {}): NoteInput => ({
  id, workspaceId: "ws1", title: "T", content: "body", tags: [], isPinned: false, isShared: false,
  isFavorite: false, folder: "General", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  wordCount: 1, readingTime: 1, ...over,
});

export interface HarnessOpts {
  secret?: string | null;
  defaultAiPolicy?: AiPolicy;
  providers?: FakeProvider[];
  now?: () => number;
}

/** Mirrors the composition in api/index.ts (public SCIM, /api auth, AI guard, authed routes, v2 sync). */
export async function makeHarness(opts: HarnessOpts = {}) {
  const { cfg } = await getKeys();
  const orgs = new FakeOrgs();
  const audits: Array<{ orgId: string | null; email: string; action: string }> = [];
  const platform = createPlatform({
    dataDir: "unused",
    memory: true,
    production: true,
    orgs,
    shareSecret: opts.secret === null ? undefined : opts.secret ?? SECRET,
    defaultAiPolicy: opts.defaultAiPolicy ?? "cloud-allowed",
    now: opts.now,
    audit: (orgId, email, action) => void audits.push({ orgId, email, action }),
    log: () => undefined,
  });
  const orgDeps = { getRole: (o: string, e: string) => orgs.roleOf(o, e), available: () => true, production: true };
  const asMember = requireOrgRole(ANY_MEMBER, orgDeps);
  const asAdmin = requireOrgRole(ORG_ADMINS, orgDeps);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  platform.mountPublic(app);
  app.use("/api", requireAuth(() => cfg));
  app.use(["/api/ai", "/api/agents/execute"], platform.aiGuard);
  platform.mountAuthed(app, { asMember, asAdmin });
  const noteStore = new MemoryNoteStore();
  app.use("/api/v2", createSyncRouter(platform.withOwnerRegistration(noteStore)));
  // Legacy-style AI endpoint: fails with 500 when asked, to exercise the refund path.
  app.post("/api/ai/action", (req, res) => {
    if (req.body?.fail) return void res.status(500).json({ error: "boom" });
    res.locals.meterTokens?.(10, 5);
    res.json({ result: "ok" });
  });
  const providers = opts.providers ?? [new FakeProvider("cloud1", "cloud")];
  app.use("/api/ai", createAiRouter({
    router: new AiRouter({ providers, sleep: async () => {} }),
    resolvePolicy: (email) => platform.resolvePolicy(email),
    meter: platform.aiMeter,
  }));
  return { app, platform, orgs, audits, providers, noteStore };
}
