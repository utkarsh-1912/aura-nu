import { randomBytes, randomUUID } from "node:crypto";
import type { DocCollection } from "../persist";
import {
  ScimConflictError, hashToken,
  type ScimDirectory, type ScimGroup, type ScimTokenStore, type ScimUser, type UserInput,
} from "./scimStore";

/**
 * Persistent SCIM directory + token store on top of api/persist.ts (Mongo when connected, files otherwise).
 * Every record carries its orgId and every lookup is keyed/filtered by it, so orgs can never see each other.
 * userName / displayName uniqueness is enforced with atomic "claim" documents (insertIfAbsent).
 */

type UserDoc = ScimUser & { orgId: string; userNameLc: string };
type GroupDoc = ScimGroup & { orgId: string; displayNameLc: string };
type ClaimDoc = { orgId: string; entityId: string };

const iso = () => new Date().toISOString();
const lc = (s: string) => s.toLowerCase();
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const pub = <T extends { orgId: string }>(d: T): Omit<T, "orgId" | "userNameLc" | "displayNameLc"> => {
  const { orgId, userNameLc, displayNameLc, ...rest } = d as any;
  return rest;
};
const page = <T>(all: T[], startIndex: number, count: number) => ({
  total: all.length,
  items: all.slice(Math.max(0, startIndex - 1), Math.max(0, startIndex - 1) + count),
});

export interface ScimCollections {
  users: DocCollection<UserDoc>;
  groups: DocCollection<GroupDoc>;
  claims: DocCollection<ClaimDoc>;
}

export class PersistentScimDirectory implements ScimDirectory {
  constructor(private c: ScimCollections) {}
  private uKey = (org: string, id: string) => `${org}:${id}`;
  private claimU = (org: string, name: string) => `${org}:u:${lc(name)}`;
  private claimG = (org: string, name: string) => `${org}:g:${lc(name)}`;

  async listUsers(org: string, q: { userName?: string; startIndex: number; count: number }) {
    const rows = await this.c.users.all({ orgId: org, ...(q.userName ? { userNameLc: lc(q.userName) } : {}) });
    const all = rows.map((r) => r.value).sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
    const p = page(all, q.startIndex, q.count);
    return { total: p.total, items: p.items.map((u) => pub(u) as ScimUser) };
  }
  async getUser(org: string, id: string) {
    const u = await this.c.users.get(this.uKey(org, id));
    return u ? (pub(u) as ScimUser) : null;
  }
  async createUser(org: string, input: UserInput) {
    const id = randomUUID();
    if (!(await this.c.claims.insertIfAbsent(this.claimU(org, input.userName), { orgId: org, entityId: id }))) throw new ScimConflictError("userName");
    const t = iso();
    const doc: UserDoc = clean({ ...input, id, orgId: org, userNameLc: lc(input.userName), active: input.active ?? true, created: t, lastModified: t });
    try {
      await this.c.users.set(this.uKey(org, id), doc);
    } catch (e) {
      await this.c.claims.remove(this.claimU(org, input.userName));
      throw e;
    }
    return pub(doc) as ScimUser;
  }
  async updateUser(org: string, id: string, patch: Partial<UserInput>) {
    const cur = await this.c.users.get(this.uKey(org, id));
    if (!cur) return null;
    const renamed = patch.userName !== undefined && lc(patch.userName) !== cur.userNameLc;
    if (renamed && !(await this.c.claims.insertIfAbsent(this.claimU(org, patch.userName!), { orgId: org, entityId: id }))) {
      throw new ScimConflictError("userName");
    }
    const next = await this.c.users.update(this.uKey(org, id), (u) =>
      u ? clean({ ...u, ...clean(patch), id, orgId: org, userNameLc: lc(patch.userName ?? u.userName), created: u.created, lastModified: iso() }) : null,
    );
    if (!next) {
      if (renamed) await this.c.claims.remove(this.claimU(org, patch.userName!));
      return null;
    }
    if (renamed) await this.c.claims.remove(this.claimU(org, cur.userName));
    return pub(next) as ScimUser;
  }
  async deleteUser(org: string, id: string) {
    const cur = await this.c.users.get(this.uKey(org, id));
    if (!cur) return false;
    await this.c.users.remove(this.uKey(org, id));
    await this.c.claims.remove(this.claimU(org, cur.userName));
    for (const row of await this.c.groups.all({ orgId: org, memberIds: id })) {
      await this.c.groups.update(row.id, (g) => (g ? { ...g, memberIds: g.memberIds.filter((m) => m !== id), lastModified: iso() } : null));
    }
    return true;
  }

  async listGroups(org: string, q: { displayName?: string; startIndex: number; count: number }) {
    const rows = await this.c.groups.all({ orgId: org, ...(q.displayName ? { displayNameLc: lc(q.displayName) } : {}) });
    const all = rows.map((r) => r.value).sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
    const p = page(all, q.startIndex, q.count);
    return { total: p.total, items: p.items.map((g) => pub(g) as ScimGroup) };
  }
  async getGroup(org: string, id: string) {
    const g = await this.c.groups.get(this.uKey(org, id));
    return g ? (pub(g) as ScimGroup) : null;
  }
  async createGroup(org: string, g: { displayName: string; externalId?: string; memberIds?: string[] }) {
    const id = randomUUID();
    if (!(await this.c.claims.insertIfAbsent(this.claimG(org, g.displayName), { orgId: org, entityId: id }))) throw new ScimConflictError("displayName");
    const t = iso();
    const doc: GroupDoc = clean({
      id, orgId: org, displayName: g.displayName, displayNameLc: lc(g.displayName), externalId: g.externalId,
      memberIds: g.memberIds ?? [], created: t, lastModified: t,
    });
    try {
      await this.c.groups.set(this.uKey(org, id), doc);
    } catch (e) {
      await this.c.claims.remove(this.claimG(org, g.displayName));
      throw e;
    }
    return pub(doc) as ScimGroup;
  }
  async updateGroup(org: string, id: string, patch: Partial<Pick<ScimGroup, "displayName" | "externalId" | "memberIds">>) {
    const cur = await this.c.groups.get(this.uKey(org, id));
    if (!cur) return null;
    const renamed = patch.displayName !== undefined && lc(patch.displayName) !== cur.displayNameLc;
    if (renamed && !(await this.c.claims.insertIfAbsent(this.claimG(org, patch.displayName!), { orgId: org, entityId: id }))) {
      throw new ScimConflictError("displayName");
    }
    const next = await this.c.groups.update(this.uKey(org, id), (x) =>
      x ? clean({ ...x, ...clean(patch), id, orgId: org, displayNameLc: lc(patch.displayName ?? x.displayName), created: x.created, lastModified: iso() }) : null,
    );
    if (renamed) await this.c.claims.remove(next ? this.claimG(org, cur.displayName) : this.claimG(org, patch.displayName!));
    return next ? (pub(next) as ScimGroup) : null;
  }
  async deleteGroup(org: string, id: string) {
    const cur = await this.c.groups.get(this.uKey(org, id));
    if (!cur) return false;
    await this.c.groups.remove(this.uKey(org, id));
    await this.c.claims.remove(this.claimG(org, cur.displayName));
    return true;
  }

  /** Group ids (`<orgId>:<groupId>`) of every ACTIVE SCIM user whose userName is `email`. Feeds the ACL group principals. */
  async groupIdsForEmail(email: string): Promise<string[]> {
    const users = await this.c.users.all({ userNameLc: lc(email) });
    const out: string[] = [];
    for (const { value: u } of users) {
      if (!u.active) continue;
      for (const g of await this.c.groups.all({ orgId: u.orgId, memberIds: u.id })) out.push(`${u.orgId}:${g.value.id}`);
    }
    return out;
  }
}

type TokenDoc = { orgId: string; tokenId: string; label: string; createdAt: string; createdBy: string };
export const MAX_SCIM_TOKENS_PER_ORG = 10;

/** Only SHA-256 hashes are stored (doc id = hash). The plaintext exists once, in the mint response. */
export class PersistentScimTokens implements ScimTokenStore {
  constructor(private col: DocCollection<TokenDoc>) {}
  async hashesFor(orgId: string) {
    return (await this.col.all({ orgId })).map((r) => r.id);
  }
  async list(orgId: string) {
    return (await this.col.all({ orgId })).map((r) => r.value).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  /** Returns null when the org is at its token limit. */
  async issue(orgId: string, label: string, createdBy: string): Promise<{ token: string; tokenId: string; label: string; createdAt: string } | null> {
    if ((await this.list(orgId)).length >= MAX_SCIM_TOKENS_PER_ORG) return null;
    const token = "scim_" + randomBytes(32).toString("base64url");
    const doc: TokenDoc = { orgId, tokenId: randomUUID(), label: label.slice(0, 80), createdAt: iso(), createdBy };
    await this.col.set(hashToken(token), doc);
    return { token, tokenId: doc.tokenId, label: doc.label, createdAt: doc.createdAt };
  }
  async revoke(orgId: string, tokenId: string): Promise<boolean> {
    const row = (await this.col.all({ orgId, tokenId }))[0];
    return row ? this.col.remove(row.id) : false;
  }
  async revokeAll(orgId: string) {
    for (const r of await this.col.all({ orgId })) await this.col.remove(r.id);
  }
}
