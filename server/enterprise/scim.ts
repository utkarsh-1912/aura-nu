import express, { Router, type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  ScimConflictError, hashToken,
  type ScimDirectory, type ScimGroup, type ScimTokenStore, type ScimUser, type UserInput,
} from "./scimStore";

const S = {
  user: "urn:ietf:params:scim:schemas:core:2.0:User",
  group: "urn:ietf:params:scim:schemas:core:2.0:Group",
  list: "urn:ietf:params:scim:api:messages:2.0:ListResponse",
  error: "urn:ietf:params:scim:api:messages:2.0:Error",
  patch: "urn:ietf:params:scim:api:messages:2.0:PatchOp",
};
const CT = "application/scim+json";
const ORG_RE = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const MAX_COUNT = 100;

export interface ScimDeps {
  tokens: ScimTokenStore;
  directory: ScimDirectory;
  /** Called when a user is deactivated or deleted: revoke sessions / collab access / API keys here. */
  onDeprovision?: (orgId: string, user: ScimUser) => void | Promise<void>;
  /** Audit hook; receives no PII beyond ids. */
  audit?: (event: string, meta: { orgId: string; id?: string }) => void;
  /** Public base URL used in meta.location, e.g. https://api.example.com/scim/v2. */
  baseUrl?: string;
}

class ScimError extends Error {
  constructor(public status: number, public detail: string, public scimType?: string) {
    super(detail);
  }
}

function sendError(res: Response, e: ScimError) {
  res.status(e.status).type(CT).json({ schemas: [S.error], status: String(e.status), ...(e.scimType ? { scimType: e.scimType } : {}), detail: e.detail });
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false; // Azure AD sends "False"
  }
  throw new ScimError(400, "active must be a boolean", "invalidValue");
}
function str(v: unknown, field: string, max = 200): string {
  if (typeof v !== "string" || v.length > max) throw new ScimError(400, `${field} must be a string up to ${max} chars`, "invalidValue");
  return v;
}

/** Only `<attr> eq "<value>"` is supported; anything else is rejected rather than guessed. */
export function parseEqFilter(filter: unknown, allowed: string[]): { attr: string; value: string } | null {
  if (filter === undefined) return null;
  if (typeof filter !== "string" || filter.length > 300) throw new ScimError(400, "invalid filter", "invalidFilter");
  const m = /^\s*([A-Za-z]+)\s+eq\s+"((?:[^"\\]|\\.){1,254})"\s*$/i.exec(filter);
  const attr = m && allowed.find((a) => a.toLowerCase() === m[1].toLowerCase());
  if (!m || !attr) throw new ScimError(400, `Only 'eq' filters on ${allowed.join(", ")} are supported`, "invalidFilter");
  return { attr, value: m[2].replace(/\\(.)/g, "$1") };
}

function userResource(u: ScimUser, base: string, orgId: string) {
  return {
    schemas: [S.user], id: u.id, externalId: u.externalId, userName: u.userName, displayName: u.displayName,
    name: u.givenName || u.familyName ? { givenName: u.givenName, familyName: u.familyName } : undefined,
    emails: EMAIL_RE.test(u.userName) ? [{ value: u.userName, primary: true }] : [],
    active: u.active,
    meta: { resourceType: "User", created: u.created, lastModified: u.lastModified, location: `${base}/${orgId}/Users/${u.id}` },
  };
}
function groupResource(g: ScimGroup, base: string, orgId: string) {
  return {
    schemas: [S.group], id: g.id, externalId: g.externalId, displayName: g.displayName,
    members: g.memberIds.map((id) => ({ value: id, $ref: `${base}/${orgId}/Users/${id}` })),
    meta: { resourceType: "Group", created: g.created, lastModified: g.lastModified, location: `${base}/${orgId}/Groups/${g.id}` },
  };
}

function parseUserBody(b: any, requireUserName: boolean): Partial<UserInput> {
  if (!b || typeof b !== "object") throw new ScimError(400, "body required", "invalidSyntax");
  const out: Partial<UserInput> = {};
  if (b.userName !== undefined || requireUserName) {
    const u = str(b.userName, "userName", 254).trim();
    if (!u) throw new ScimError(400, "userName is required", "invalidValue");
    out.userName = u;
  }
  if (b.externalId !== undefined) out.externalId = str(b.externalId, "externalId");
  if (b.displayName !== undefined) out.displayName = str(b.displayName, "displayName");
  if (b.active !== undefined) out.active = toBool(b.active);
  if (b.name !== undefined) {
    if (typeof b.name !== "object" || !b.name) throw new ScimError(400, "name must be an object", "invalidValue");
    if (b.name.givenName !== undefined) out.givenName = str(b.name.givenName, "name.givenName");
    if (b.name.familyName !== undefined) out.familyName = str(b.name.familyName, "name.familyName");
  }
  return out;
}

/** Applies a SCIM PatchOp to a flat attribute set (supports path and no-path forms). */
function userPatch(ops: any[]): Partial<UserInput> {
  const out: Partial<UserInput> = {};
  for (const op of ops) {
    const kind = String(op?.op ?? "").toLowerCase();
    if (!["add", "replace", "remove"].includes(kind)) throw new ScimError(400, "invalid op", "invalidSyntax");
    const apply = (path: string, value: unknown) => {
      switch (path.toLowerCase()) {
        case "active": out.active = toBool(value); break;
        case "username": out.userName = str(value, "userName", 254).trim(); break;
        case "displayname": out.displayName = str(value, "displayName"); break;
        case "externalid": out.externalId = str(value, "externalId"); break;
        case "name.givenname": out.givenName = str(value, "name.givenName"); break;
        case "name.familyname": out.familyName = str(value, "name.familyName"); break;
        default: break; // unknown attributes are ignored (RFC 7644 allows servers to ignore unsupported ones)
      }
    };
    if (kind === "remove") {
      if (!op.path) throw new ScimError(400, "path required for remove", "noTarget");
      if (String(op.path).toLowerCase() === "active") throw new ScimError(400, "active cannot be removed", "mutability");
      continue;
    }
    if (op.path) apply(String(op.path), op.value);
    else if (op.value && typeof op.value === "object") {
      for (const [k, v] of Object.entries(op.value)) {
        if (k === "name" && v && typeof v === "object") for (const [nk, nv] of Object.entries(v)) apply(`name.${nk}`, nv);
        else apply(k, v);
      }
    }
  }
  return out;
}

export function createScimRouter(deps: ScimDeps): Router {
  const router = Router();
  const base = (deps.baseUrl ?? "/scim/v2").replace(/\/$/, "");
  router.use(express.json({ type: ["application/json", CT], limit: "256kb" }));

  // Authentication: per-org bearer token, compared by hash in constant time over ALL stored hashes.
  router.use("/:orgId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId;
      const m = /^Bearer\s+(\S{1,512})$/i.exec(req.headers.authorization ?? "");
      const hashes = ORG_RE.test(orgId) ? await deps.tokens.hashesFor(orgId) : [];
      const presented = Buffer.from(hashToken(m ? m[1] : ""), "hex");
      let ok = false;
      for (const h of hashes) {
        const b = Buffer.from(h, "hex");
        if (b.length === presented.length && timingSafeEqual(b, presented)) ok = true;
      }
      // Same response for unknown org, missing token and wrong token.
      if (!m || !ok) return sendError(res, new ScimError(401, "Authentication required"));
      next();
    } catch {
      sendError(res, new ScimError(500, "Internal error"));
    }
  });

  const wrap = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e: any) {
      if (e instanceof ScimError) return sendError(res, e);
      if (e instanceof ScimConflictError) return sendError(res, new ScimError(409, `${e.message} already exists`, "uniqueness"));
      sendError(res, new ScimError(500, "Internal error"));
    }
  };
  const paging = (req: Request) => {
    const si = Number(req.query.startIndex ?? 1);
    const c = Number(req.query.count ?? 50);
    if (!Number.isInteger(si) || !Number.isInteger(c) || si < 1 || c < 0) throw new ScimError(400, "invalid paging", "invalidValue");
    return { startIndex: si, count: Math.min(c, MAX_COUNT) };
  };
  const listResp = (items: any[], total: number, startIndex: number) => ({
    schemas: [S.list], totalResults: total, startIndex, itemsPerPage: items.length, Resources: items,
  });
  const org = (req: Request) => req.params.orgId;
  const notFound = () => new ScimError(404, "Resource not found");
  const out = (res: Response, status: number, body?: unknown) => {
    res.status(status).type(CT);
    body === undefined ? res.end() : res.json(body);
  };

  // ---- Users
  router.get("/:orgId/Users", wrap(async (req, res) => {
    const f = parseEqFilter(req.query.filter, ["userName"]);
    const p = paging(req);
    const r = await deps.directory.listUsers(org(req), { userName: f?.value, ...p });
    out(res, 200, listResp(r.items.map((u) => userResource(u, base, org(req))), r.total, p.startIndex));
  }));
  router.get("/:orgId/Users/:id", wrap(async (req, res) => {
    const u = await deps.directory.getUser(org(req), req.params.id);
    if (!u) throw notFound();
    out(res, 200, userResource(u, base, org(req)));
  }));
  router.post("/:orgId/Users", wrap(async (req, res) => {
    const input = parseUserBody(req.body, true) as UserInput;
    const u = await deps.directory.createUser(org(req), input);
    deps.audit?.("scim.user.create", { orgId: org(req), id: u.id });
    out(res, 201, userResource(u, base, org(req)));
  }));
  const deprovisionIfNeeded = async (orgId: string, before: ScimUser, after: ScimUser) => {
    if (before.active && !after.active) {
      deps.audit?.("scim.user.deactivate", { orgId, id: after.id });
      await deps.onDeprovision?.(orgId, after);
    }
  };
  router.put("/:orgId/Users/:id", wrap(async (req, res) => {
    const before = await deps.directory.getUser(org(req), req.params.id);
    if (!before) throw notFound();
    const body = parseUserBody(req.body, true);
    const after = await deps.directory.updateUser(org(req), req.params.id, { active: true, ...body });
    if (!after) throw notFound();
    await deprovisionIfNeeded(org(req), before, after);
    out(res, 200, userResource(after, base, org(req)));
  }));
  router.patch("/:orgId/Users/:id", wrap(async (req, res) => {
    const ops = req.body?.Operations;
    if (!req.body?.schemas?.includes?.(S.patch) || !Array.isArray(ops) || ops.length > 50) throw new ScimError(400, "Invalid PatchOp", "invalidSyntax");
    const before = await deps.directory.getUser(org(req), req.params.id);
    if (!before) throw notFound();
    const after = await deps.directory.updateUser(org(req), req.params.id, userPatch(ops));
    if (!after) throw notFound();
    await deprovisionIfNeeded(org(req), before, after);
    out(res, 200, userResource(after, base, org(req)));
  }));
  router.delete("/:orgId/Users/:id", wrap(async (req, res) => {
    const u = await deps.directory.getUser(org(req), req.params.id);
    if (!u) throw notFound();
    await deps.directory.deleteUser(org(req), u.id);
    deps.audit?.("scim.user.delete", { orgId: org(req), id: u.id });
    await deps.onDeprovision?.(org(req), { ...u, active: false });
    out(res, 204);
  }));

  // ---- Groups
  const validMembers = async (orgId: string, ids: string[]) => {
    for (const id of ids) if (!(await deps.directory.getUser(orgId, id))) throw new ScimError(400, "member is not a user of this org", "invalidValue");
    return [...new Set(ids)];
  };
  const memberIdsOf = (members: unknown): string[] => {
    if (members === undefined) return [];
    if (!Array.isArray(members) || members.length > 5000) throw new ScimError(400, "invalid members", "invalidValue");
    return members.map((m) => str(m?.value, "members.value", 64));
  };
  router.get("/:orgId/Groups", wrap(async (req, res) => {
    const f = parseEqFilter(req.query.filter, ["displayName"]);
    const p = paging(req);
    const r = await deps.directory.listGroups(org(req), { displayName: f?.value, ...p });
    out(res, 200, listResp(r.items.map((g) => groupResource(g, base, org(req))), r.total, p.startIndex));
  }));
  router.get("/:orgId/Groups/:id", wrap(async (req, res) => {
    const g = await deps.directory.getGroup(org(req), req.params.id);
    if (!g) throw notFound();
    out(res, 200, groupResource(g, base, org(req)));
  }));
  router.post("/:orgId/Groups", wrap(async (req, res) => {
    const displayName = str(req.body?.displayName, "displayName").trim();
    if (!displayName) throw new ScimError(400, "displayName required", "invalidValue");
    const memberIds = await validMembers(org(req), memberIdsOf(req.body?.members));
    const g = await deps.directory.createGroup(org(req), { displayName, externalId: req.body?.externalId, memberIds });
    deps.audit?.("scim.group.create", { orgId: org(req), id: g.id });
    out(res, 201, groupResource(g, base, org(req)));
  }));
  router.patch("/:orgId/Groups/:id", wrap(async (req, res) => {
    const ops = req.body?.Operations;
    if (!req.body?.schemas?.includes?.(S.patch) || !Array.isArray(ops) || ops.length > 50) throw new ScimError(400, "Invalid PatchOp", "invalidSyntax");
    const g = await deps.directory.getGroup(org(req), req.params.id);
    if (!g) throw notFound();
    let members = new Set(g.memberIds);
    let displayName = g.displayName;
    for (const op of ops) {
      const kind = String(op?.op ?? "").toLowerCase();
      const path = String(op?.path ?? "").toLowerCase();
      if (path === "displayname" && kind !== "remove") displayName = str(op.value, "displayName").trim();
      else if (path === "members" || path === "") {
        if (kind === "replace") members = new Set(await validMembers(org(req), memberIdsOf(op.value?.members ?? op.value)));
        else if (kind === "add") for (const id of await validMembers(org(req), memberIdsOf(op.value))) members.add(id);
        else if (kind === "remove" && op.value) for (const id of memberIdsOf(op.value)) members.delete(id);
        else if (kind === "remove") members = new Set();
      } else if (kind === "remove" && path.startsWith("members[")) {
        const m = /^members\[value eq "([^"]{1,64})"\]$/i.exec(String(op.path));
        if (!m) throw new ScimError(400, "unsupported path", "invalidPath");
        members.delete(m[1]);
      } else if (!["add", "replace", "remove"].includes(kind)) throw new ScimError(400, "invalid op", "invalidSyntax");
    }
    const upd = await deps.directory.updateGroup(org(req), g.id, { displayName, memberIds: [...members] });
    if (!upd) throw notFound();
    out(res, 200, groupResource(upd, base, org(req)));
  }));
  router.delete("/:orgId/Groups/:id", wrap(async (req, res) => {
    if (!(await deps.directory.deleteGroup(org(req), req.params.id))) throw notFound();
    deps.audit?.("scim.group.delete", { orgId: org(req), id: req.params.id });
    out(res, 204);
  }));

  // Discovery (minimal).
  router.get("/:orgId/ServiceProviderConfig", (_req, res) => {
    out(res, 200, {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true }, bulk: { supported: false }, filter: { supported: true, maxResults: MAX_COUNT },
      changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false },
      authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer token", description: "Per-organization bearer token" }],
    });
  });

  // Unknown paths and malformed JSON still use the SCIM error schema.
  router.use((_req, res) => sendError(res, new ScimError(404, "Not found")));
  router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, err?.type === "entity.too.large" ? new ScimError(413, "Payload too large") : new ScimError(400, "Malformed request", "invalidSyntax"));
  });
  return router;
}
