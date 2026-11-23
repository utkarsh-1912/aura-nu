import { Router, type Request, type Response } from "express";
import {
  MAX_LINK_TTL_MS, canGrant, createShareToken, isShareRole, resolveRole, verifyShareToken,
  type ChainNode, type ShareRole,
} from "../src/core/acl";
import { getUserEmail } from "./auth";
import { nodeShareCrypto } from "./collab/crypto";
import {
  GrantStore, KEY_RE, docIdOf, folderKey, newId, noteKey, roomOf,
  type ResourceDoc, type StoredGrant,
} from "./grantStore";

export interface SharesDeps {
  grants: GrantStore;
  loadGroups: (email: string) => Promise<string[]>;
  /** HMAC secret for share links (>= 16 chars). Without it the link features answer 503. */
  secret?: string;
  now?: () => number;
  audit?: (email: string, action: string, resource: string, meta?: Record<string, unknown>) => void;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}$/;
const GRANTABLE: ShareRole[] = ["Viewer", "Commenter", "Editor"];
const MAX_USER_GRANT_TTL_MS = 5 * 365 * 24 * 3600 * 1000;
const DEFAULT_LINK_TTL_MS = 7 * 24 * 3600 * 1000;
const rank = (r: ShareRole) => ["Viewer", "Commenter", "Editor", "Owner"].indexOf(r);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

type Resolved = {
  type: "note" | "folder";
  key: string;
  doc: ResourceDoc | null;
  chain: ChainNode[];
  role: ShareRole | null;
  owner: string;
};

/** Public view of a grant (never leaks internals such as createdBy of other users' resources beyond the owner's view). */
const view = (g: StoredGrant) => ({
  id: g.id, resourceType: g.resourceType, principal: g.principal, role: g.role,
  expiresAt: g.expiresAt ?? null, createdAt: g.createdAt, createdBy: g.createdBy, via: g.via ?? null,
});

export function createSharesRouter(deps: SharesDeps): Router {
  const r = Router();
  const now = () => (deps.now ?? Date.now)();
  const secretOk = !!deps.secret && deps.secret.length >= 16;
  const g = deps.grants;

  // Defence in depth: this router is mounted behind requireAuth, but never trust that blindly.
  r.use((req, res, next) => {
    if (!getUserEmail(req)) return void res.status(401).json({ error: "Authentication required" });
    next();
  });

  const fail = (res: Response, err: unknown, msg = "Share operation failed") => {
    console.error("shares:", err);
    res.status(500).json({ error: msg });
  };

  /** Finds the resource a caller addresses and the caller's effective role on it. null = not found / no access. */
  async function resolve(caller: string, type: string, id: string): Promise<Resolved | null> {
    if (type !== "note" && type !== "folder") return null;
    if (typeof id !== "string" || !id || id.length > 200) return null;
    let key = type === "note" ? noteKey(caller, id) : folderKey(caller, id);
    let doc = await g.getDoc(type, key);
    if (!doc && KEY_RE.test(id)) {
      // Caller addressing a resource by its server-issued key (e.g. one shared with them as Owner).
      key = id;
      doc = await g.getDoc(type, key);
      if (!doc) return null;
    }
    if (!doc) {
      // Folders are created lazily on the first grant; only the owner can address their own by name.
      if (type === "note") return null;
      const seed = g.seedFolder(caller, id);
      return { type, key, doc: null, chain: [{ type: "folder", id: key, ownerEmail: seed.ownerEmail }], role: "Owner", owner: seed.ownerEmail };
    }
    if (doc.deleted) return null;
    const chain = type === "note" ? g.chainFor(key, doc) : [{ type: "folder" as const, id: key, ownerEmail: doc.ownerEmail }];
    const [grants, groupIds] = await Promise.all([g.loadGrants(chain), deps.loadGroups(caller)]);
    const role = resolveRole(chain, grants, { email: caller, groupIds }, now());
    return { type, key, doc, chain, role, owner: doc.ownerEmail };
  }

  const need = async (req: Request, res: Response, cap: "share" | "any"): Promise<Resolved | null> => {
    const caller = getUserEmail(req);
    const t = await resolve(caller, req.params.type, req.params.id);
    if (!t || !t.role) {
      res.status(404).json({ error: "Not found" }); // same answer for "missing" and "no access"
      return null;
    }
    if (cap === "share" && t.role !== "Owner") {
      res.status(403).json({ error: "Only the owner can manage sharing" });
      return null;
    }
    return t;
  };

  // ---- discovery
  r.get("/room/:noteId", async (req, res) => {
    try {
      const caller = getUserEmail(req);
      const key = noteKey(caller, req.params.noteId);
      const doc = await g.getDoc("note", key);
      if (!doc || doc.deleted) return void res.status(404).json({ error: "Note is not synced yet" });
      res.json({ roomId: roomOf(key), key });
    } catch (e) {
      fail(res, e);
    }
  });

  r.get("/with-me", async (req, res) => {
    try {
      const caller = getUserEmail(req);
      const t = now();
      const items: Array<Record<string, unknown>> = [];
      const seen = new Set<string>();
      const groupIds = await deps.loadGroups(caller);
      const addNote = (key: string, doc: ResourceDoc, role: ShareRole, expiresAt: number | null) => {
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ type: "note", key, roomId: roomOf(key), ownerEmail: doc.ownerEmail, role, expiresAt });
      };
      for (const { id, value: doc } of await g.sharedWith(caller)) {
        if (doc.deleted || items.length >= 500) continue;
        const key = id.slice(id.indexOf(":") + 1);
        const type = doc.kind;
        const chain = type === "note" ? g.chainFor(key, doc) : [{ type: "folder" as const, id: key, ownerEmail: doc.ownerEmail }];
        const grants = await g.loadGrants(chain);
        const role = resolveRole(chain, grants, { email: caller, groupIds }, t);
        if (!role) continue;
        const mine = doc.grants.filter((x) => x.principal.type === "user" && x.principal.email.toLowerCase() === caller);
        const exp = mine.length ? Math.max(...mine.map((x) => x.expiresAt ?? Infinity)) : null;
        const expiresAt = exp === null || exp === Infinity ? null : exp;
        if (type === "note") addNote(key, doc, role, expiresAt);
        else if (doc.folder) {
          for (const n of await g.notesInFolder(doc.ownerEmail, doc.folder)) {
            if (items.length >= 500) break;
            const nk = n.id.slice(n.id.indexOf(":") + 1);
            const nRole = resolveRole(g.chainFor(nk, n.value), await g.loadGrants(g.chainFor(nk, n.value)), { email: caller, groupIds }, t);
            if (nRole) addNote(nk, n.value, nRole, expiresAt);
          }
        }
      }
      res.json({ items });
    } catch (e) {
      fail(res, e);
    }
  });

  // ---- links (registered before the /:type routes so "links" is never read as a type)
  const readToken = (req: Request, res: Response): string | null => {
    if (!secretOk) {
      res.status(503).json({ error: "Share links are not configured on this server" });
      return null;
    }
    const token = isObj(req.body) ? req.body.token : undefined;
    if (typeof token !== "string" || !token || token.length > 2048) {
      res.status(400).json({ error: "token required" });
      return null;
    }
    return token;
  };

  /** Verifies signature + expiry, then checks the link still exists in the store (revocation). */
  async function checkLink(token: string) {
    const v = verifyShareToken(token, deps.secret!, nodeShareCrypto, { now: now() });
    if (v.ok === false) return { ok: false as const, status: v.reason === "expired" || v.reason === "revoked" ? 410 : 400, reason: v.reason };
    const c = v.claims;
    if ((c.rt !== "note" && c.rt !== "folder") || !KEY_RE.test(c.rid)) return { ok: false as const, status: 400, reason: "invalid" as const };
    const doc = await g.getDoc(c.rt, c.rid);
    const stored = doc && !doc.deleted ? doc.grants.find((x) => x.id === c.lid && x.principal.type === "link") : undefined;
    if (!doc || !stored) return { ok: false as const, status: 410, reason: "revoked" as const };
    if (stored.expiresAt !== undefined && !(stored.expiresAt > now())) return { ok: false as const, status: 410, reason: "expired" as const };
    // The stored grant is the source of truth for the role; the token can never exceed it.
    const role = rank(c.role) <= rank(stored.role) ? c.role : stored.role;
    return { ok: true as const, claims: c, doc, stored, role, expiresAt: Math.min(c.exp, stored.expiresAt ?? c.exp) };
  }

  r.post("/links/verify", async (req, res) => {
    const token = readToken(req, res);
    if (!token) return;
    try {
      const c = await checkLink(token);
      if (c.ok === false) return void res.status(c.status).json({ valid: false, reason: c.reason });
      res.json({
        valid: true, resourceType: c.claims.rt, role: c.role, expiresAt: c.expiresAt,
        roomId: c.claims.rt === "note" ? roomOf(c.claims.rid) : null, ownerEmail: c.doc.ownerEmail,
      });
    } catch (e) {
      fail(res, e);
    }
  });

  r.post("/links/redeem", async (req, res) => {
    const token = readToken(req, res);
    if (!token) return;
    try {
      const caller = getUserEmail(req);
      const c = await checkLink(token);
      if (c.ok === false) return void res.status(c.status).json({ valid: false, reason: c.reason });
      const { rt, rid } = c.claims;
      const out = (role: ShareRole, expiresAt: number | null) =>
        res.json({ redeemed: true, resourceType: rt, role, expiresAt, roomId: rt === "note" ? roomOf(rid) : null, ownerEmail: c.doc.ownerEmail });
      const chain = rt === "note" ? g.chainFor(rid, c.doc) : [{ type: "folder" as const, id: rid, ownerEmail: c.doc.ownerEmail }];
      const current = resolveRole(chain, await g.loadGrants(chain), { email: caller, groupIds: await deps.loadGroups(caller) }, now());
      if (current && rank(current) >= rank(c.role)) return void out(current, null); // never downgrade or duplicate
      const grant: StoredGrant = {
        id: newId(), resourceType: rt, resourceId: rid, principal: { type: "user", email: caller },
        role: c.role, expiresAt: c.expiresAt, createdBy: c.stored.createdBy, createdAt: now(), via: c.claims.lid,
      };
      if (!(await g.addGrant(rt as "note" | "folder", rid, c.doc, grant))) return void res.status(409).json({ error: "This resource has reached its share limit" });
      deps.audit?.(caller, "share.link.redeem", docIdOf(rt, rid), { role: c.role });
      out(c.role, c.expiresAt);
    } catch (e) {
      fail(res, e);
    }
  });

  // ---- grants on a resource
  r.get("/:type/:id/grants", async (req, res) => {
    try {
      const t = await need(req, res, "share");
      if (!t) return;
      const t0 = now();
      const grants = (t.doc?.grants ?? []).filter((x) => x.expiresAt === undefined || x.expiresAt > t0);
      res.json({ resourceType: t.type, key: t.key, roomId: t.type === "note" ? roomOf(t.key) : null, owner: t.owner, grants: grants.map(view) });
    } catch (e) {
      fail(res, e);
    }
  });

  r.post("/:type/:id/grants", async (req, res) => {
    try {
      const caller = getUserEmail(req);
      const t = await need(req, res, "share");
      if (!t) return;
      const body = req.body;
      if (!isObj(body) || !isObj(body.principal)) return void res.status(400).json({ error: "principal required" });
      if (!isShareRole(body.role) || !GRANTABLE.includes(body.role)) return void res.status(400).json({ error: "role must be Viewer, Commenter or Editor" });
      const role = body.role as ShareRole;
      const t0 = now();
      let expiresAt: number | undefined;
      if (body.expiresAt !== undefined && body.expiresAt !== null) {
        if (typeof body.expiresAt !== "number" || !Number.isFinite(body.expiresAt) || body.expiresAt <= t0) return void res.status(400).json({ error: "expiresAt must be a future epoch-ms timestamp" });
        expiresAt = Math.floor(body.expiresAt);
      }
      const ptype = body.principal.type;
      let principal: StoredGrant["principal"];
      const id = newId();
      if (ptype === "user") {
        const email = typeof body.principal.email === "string" ? body.principal.email.trim().toLowerCase() : "";
        if (!EMAIL_RE.test(email) || email.length > 254) return void res.status(400).json({ error: "valid principal.email required" });
        if (email === t.owner) return void res.status(400).json({ error: "The owner already has full access" });
        if (expiresAt !== undefined && expiresAt - t0 > MAX_USER_GRANT_TTL_MS) return void res.status(400).json({ error: "expiresAt too far in the future" });
        principal = { type: "user", email };
      } else if (ptype === "link") {
        if (!secretOk) return void res.status(503).json({ error: "Share links are not configured on this server" });
        expiresAt = expiresAt ?? t0 + DEFAULT_LINK_TTL_MS;
        if (expiresAt - t0 > MAX_LINK_TTL_MS) return void res.status(400).json({ error: "link expiry may be at most 90 days" });
        principal = { type: "link", linkId: id };
      } else return void res.status(400).json({ error: "principal.type must be user or link" });

      const grant: StoredGrant = {
        id, resourceType: t.type, resourceId: t.key, principal, role, ...(expiresAt !== undefined ? { expiresAt } : {}),
        createdBy: caller, createdAt: t0,
      };
      if (!canGrant(t.role, grant, t.chain)) return void res.status(403).json({ error: "Not allowed to grant this role" });
      const seed = t.doc ?? g.seedFolder(caller, req.params.id);
      if (!(await g.addGrant(t.type, t.key, seed, grant))) return void res.status(409).json({ error: "This resource has reached its share limit" });
      deps.audit?.(caller, "share.grant.create", docIdOf(t.type, t.key), { role, principal: principal.type });
      const out: Record<string, unknown> = { grant: view(grant), roomId: t.type === "note" ? roomOf(t.key) : null };
      if (principal.type === "link") {
        out.token = createShareToken({ lid: id, resourceType: t.type, resourceId: t.key, role, ttlMs: expiresAt! - t0 }, deps.secret!, nodeShareCrypto, t0);
        out.tokenShownOnce = true;
      }
      res.status(201).json(out);
    } catch (e) {
      fail(res, e);
    }
  });

  r.delete("/:type/:id/grants/:grantId", async (req, res) => {
    try {
      const caller = getUserEmail(req);
      const t = await need(req, res, "any");
      if (!t) return;
      const target = t.doc?.grants.find((x) => x.id === req.params.grantId);
      if (!target) return void res.status(404).json({ error: "Grant not found" });
      // Owners manage everything; a grantee may remove their own (direct) grant to leave a share.
      const own = target.principal.type === "user" && target.principal.email.toLowerCase() === caller;
      if (t.role !== "Owner" && !own) return void res.status(403).json({ error: "Only the owner can manage sharing" });
      await g.removeGrant(t.type, t.key, target.id);
      deps.audit?.(caller, "share.grant.revoke", docIdOf(t.type, t.key), { principal: target.principal.type });
      res.status(204).end();
    } catch (e) {
      fail(res, e);
    }
  });

  return r;
}
