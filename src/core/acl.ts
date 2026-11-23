/**
 * Pure access-control model for shared workspaces / folders / notes.
 * Framework-free: runs in web, desktop, server and tests.
 *
 * RULES (authoritative):
 *  1. Roles are ordered Viewer < Commenter < Editor < Owner and map onto WorkspaceRole.
 *  2. A resource chain is ordered root -> leaf, e.g. [workspace, folder, subfolder, note].
 *  3. ALLOW grants are inherited down the chain; the effective allow is the HIGHEST
 *     applicable role. A node marked `restricted` stops allows from ABOVE it from
 *     applying (allows on the node itself and below still apply).
 *  4. DENY grants override allows at any depth. A deny with role R caps the principal
 *     strictly below R: deny Viewer = no access, deny Commenter = at most Viewer,
 *     deny Editor = at most Commenter, deny Owner = at most Editor. Strictest deny wins.
 *  5. The resource owner (ownerEmail on any node in the chain, e.g. the note author or the
 *     workspace owner) is Owner and exempt from deny, so nobody can be locked out of their data.
 *  6. Grants with a past `expiresAt` are ignored. Links must carry a bounded expiry.
 *  7. Link principals only count when a verified link claim is presented, and links are
 *     clamped to Editor (links can never confer Owner).
 *  8. Everything fails closed: unknown roles/principals/shapes yield no access.
 */
import type { WorkspaceRole } from "../types";

export type ShareRole = "Viewer" | "Commenter" | "Editor" | "Owner";
export type ResourceType = "workspace" | "folder" | "note";
export const ROLE_ORDER: readonly ShareRole[] = ["Viewer", "Commenter", "Editor", "Owner"];

export type Principal =
  | { type: "user"; email: string }
  | { type: "group"; id: string }
  | { type: "link"; linkId: string };

export interface Grant {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  principal: Principal;
  role: ShareRole;
  /** Default "allow". */
  effect?: "allow" | "deny";
  /** Epoch ms. */
  expiresAt?: number;
}

export interface ChainNode {
  type: ResourceType;
  id: string;
  ownerEmail?: string;
  restricted?: boolean;
}

export interface Subject {
  email: string;
  groupIds?: readonly string[];
  /** Verified link claims (see verifyShareToken). */
  link?: LinkClaims | null;
}

export type Capability = "read" | "comment" | "write" | "share" | "delete";

const CAPS: Record<ShareRole, readonly Capability[]> = {
  Viewer: ["read"],
  Commenter: ["read", "comment"],
  Editor: ["read", "comment", "write"],
  Owner: ["read", "comment", "write", "share", "delete"],
};

export function isShareRole(v: unknown): v is ShareRole {
  return typeof v === "string" && (ROLE_ORDER as readonly string[]).includes(v);
}
const rank = (r: ShareRole) => ROLE_ORDER.indexOf(r);

export function roleCan(role: ShareRole | null, cap: Capability): boolean {
  return !!role && CAPS[role].includes(cap);
}

/** ShareRole -> WorkspaceRole (src/types.ts); the names are a subset, so identity. */
export function toWorkspaceRole(r: ShareRole): WorkspaceRole {
  return r;
}
/** WorkspaceRole -> ShareRole. Unknown values map to null (no access). */
export function fromWorkspaceRole(r: WorkspaceRole | string): ShareRole | null {
  switch (r) {
    case "Owner":
    case "Admin":
      return "Owner";
    case "Manager":
    case "Editor":
    case "Contributor":
      return "Editor";
    case "Commenter":
      return "Commenter";
    case "Viewer":
    case "Guest":
      return "Viewer";
    default:
      return null;
  }
}

const norm = (e: string) => e.trim().toLowerCase();

function principalMatches(p: Principal, s: Subject): boolean {
  switch (p?.type) {
    case "user":
      return typeof p.email === "string" && norm(p.email) === norm(s.email);
    case "group":
      return !!s.groupIds && s.groupIds.includes(p.id);
    case "link":
      return !!s.link && s.link.lid === p.linkId;
    default:
      return false;
  }
}

/** Effective role the subject holds on this chain, or null. See rules above. */
export function resolveRole(
  chain: readonly ChainNode[],
  grants: readonly Grant[],
  subject: Subject,
  now: number = Date.now(),
): ShareRole | null {
  if (!chain.length || !subject.email) return null;
  const email = norm(subject.email);
  if (chain.some((n) => n.ownerEmail && norm(n.ownerEmail) === email)) return "Owner";

  let floor = 0;
  chain.forEach((n, i) => {
    if (n.restricted) floor = i;
  });

  let best: ShareRole | null = null;
  let cap: ShareRole = "Owner";
  let denyAll = false;

  chain.forEach((node, depth) => {
    for (const g of grants) {
      if (g.resourceType !== node.type || g.resourceId !== node.id) continue;
      if (!isShareRole(g.role)) continue;
      if (g.expiresAt !== undefined && !(g.expiresAt > now)) continue;
      if (!principalMatches(g.principal, subject)) continue;
      if (g.effect === "deny") {
        if (g.role === "Viewer") denyAll = true;
        else {
          const lower = ROLE_ORDER[rank(g.role) - 1];
          if (rank(lower) < rank(cap)) cap = lower;
        }
      } else if (g.effect === undefined || g.effect === "allow") {
        if (depth < floor) continue;
        let role = g.role;
        if (g.principal.type === "link" && rank(role) > rank("Editor")) role = "Editor";
        if (!best || rank(role) > rank(best)) best = role;
      }
    }
  });

  if (denyAll || !best) return null;
  return rank(best) > rank(cap) ? cap : best;
}

export function can(
  chain: readonly ChainNode[],
  grants: readonly Grant[],
  subject: Subject,
  cap: Capability,
  now?: number,
): boolean {
  return roleCan(resolveRole(chain, grants, subject, now), cap);
}

/**
 * Privilege-escalation guard for creating grants: the actor needs "share", cannot grant
 * above their own role, links never exceed Editor, and denies cannot target the owner.
 */
export function canGrant(actorRole: ShareRole | null, requested: Grant, chain: readonly ChainNode[]): boolean {
  if (!roleCan(actorRole, "share") || !isShareRole(requested.role)) return false;
  if (requested.principal.type === "link" && rank(requested.role) > rank("Editor")) return false;
  if (requested.effect === "deny" && requested.principal.type === "user") {
    const t = norm(requested.principal.email);
    if (chain.some((n) => n.ownerEmail && norm(n.ownerEmail) === t)) return false;
  }
  return rank(requested.role) <= rank(actorRole!);
}

// ---------------------------------------------------------------- share links

export interface ShareCrypto {
  /** HMAC-SHA256 returning base64url (no padding). */
  hmac(secret: string, data: string): string;
  /** Constant-time string equality. */
  equals(a: string, b: string): boolean;
}

export interface LinkClaims {
  v: 1;
  lid: string;
  rt: ResourceType;
  rid: string;
  role: ShareRole;
  iat: number;
  exp: number;
}

export const MAX_LINK_TTL_MS = 90 * 24 * 3600 * 1000;

const b64uEnc = (s: string) =>
  btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uDec = (s: string) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return decodeURIComponent(escape(atob(p)));
};

export function createShareToken(
  input: { lid: string; resourceType: ResourceType; resourceId: string; role: ShareRole; ttlMs: number },
  secret: string,
  crypto: ShareCrypto,
  now: number = Date.now(),
): string {
  if (!secret || secret.length < 16) throw new Error("share secret too short");
  if (!isShareRole(input.role) || input.role === "Owner") throw new Error("links cannot grant Owner");
  if (!(input.ttlMs > 0) || input.ttlMs > MAX_LINK_TTL_MS) throw new Error("invalid link ttl");
  const claims: LinkClaims = {
    v: 1, lid: input.lid, rt: input.resourceType, rid: input.resourceId,
    role: input.role, iat: now, exp: now + input.ttlMs,
  };
  const body = b64uEnc(JSON.stringify(claims));
  return `${body}.${crypto.hmac(secret, body)}`;
}

export type LinkVerifyResult =
  | { ok: true; claims: LinkClaims }
  | { ok: false; reason: "malformed" | "signature" | "expired" | "revoked" | "invalid" };

export function verifyShareToken(
  token: string,
  secret: string,
  crypto: ShareCrypto,
  opts: { now?: number; revoked?: ReadonlySet<string> } = {},
): LinkVerifyResult {
  const now = opts.now ?? Date.now();
  if (typeof token !== "string" || token.length > 2048) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  // Verify the signature BEFORE parsing anything.
  if (!crypto.equals(crypto.hmac(secret, parts[0]), parts[1])) return { ok: false, reason: "signature" };
  let c: any;
  try {
    c = JSON.parse(b64uDec(parts[0]));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    !c || c.v !== 1 || typeof c.lid !== "string" || !c.lid ||
    !["workspace", "folder", "note"].includes(c.rt) || typeof c.rid !== "string" ||
    !isShareRole(c.role) || c.role === "Owner" ||
    typeof c.iat !== "number" || typeof c.exp !== "number" || c.exp - c.iat > MAX_LINK_TTL_MS
  ) return { ok: false, reason: "invalid" };
  if (!(c.exp > now)) return { ok: false, reason: "expired" };
  if (opts.revoked?.has(c.lid)) return { ok: false, reason: "revoked" };
  return { ok: true, claims: c as LinkClaims };
}

/**
 * Turns verified claims into a synthetic grant, only if the claimed resource is
 * on the requested chain (a link to note A never opens note B).
 */
export function linkClaimsToGrant(claims: LinkClaims, chain: readonly ChainNode[]): Grant | null {
  if (!chain.some((n) => n.type === claims.rt && n.id === claims.rid)) return null;
  return {
    id: `link:${claims.lid}`, resourceType: claims.rt, resourceId: claims.rid,
    principal: { type: "link", linkId: claims.lid }, role: claims.role, expiresAt: claims.exp,
  };
}

/** Resolve for a link bearer: stored grants + the link's own synthetic grant. */
export function resolveRoleWithLink(
  chain: readonly ChainNode[],
  grants: readonly Grant[],
  subject: Subject,
  claims: LinkClaims | null,
  now?: number,
): ShareRole | null {
  const lg = claims ? linkClaimsToGrant(claims, chain) : null;
  return resolveRole(chain, lg ? [...grants, lg] : grants, { ...subject, link: lg ? claims : null }, now);
}
