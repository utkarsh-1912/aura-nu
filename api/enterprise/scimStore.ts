import { createHash, randomBytes, randomUUID } from "node:crypto";

export interface ScimUser {
  id: string;
  userName: string;
  externalId?: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  active: boolean;
  created: string;
  lastModified: string;
}

export interface ScimGroup {
  id: string;
  displayName: string;
  externalId?: string;
  memberIds: string[];
  created: string;
  lastModified: string;
}

export class ScimConflictError extends Error {}

export type UserInput = Partial<Omit<ScimUser, "id" | "created" | "lastModified">> & { userName: string };

/** Per-org directory. Every method is scoped by orgId; implementations must never cross orgs. */
export interface ScimDirectory {
  listUsers(orgId: string, q: { userName?: string; startIndex: number; count: number }): Promise<{ total: number; items: ScimUser[] }>;
  getUser(orgId: string, id: string): Promise<ScimUser | null>;
  createUser(orgId: string, u: UserInput): Promise<ScimUser>;
  updateUser(orgId: string, id: string, patch: Partial<UserInput>): Promise<ScimUser | null>;
  deleteUser(orgId: string, id: string): Promise<boolean>;
  listGroups(orgId: string, q: { displayName?: string; startIndex: number; count: number }): Promise<{ total: number; items: ScimGroup[] }>;
  getGroup(orgId: string, id: string): Promise<ScimGroup | null>;
  createGroup(orgId: string, g: { displayName: string; externalId?: string; memberIds?: string[] }): Promise<ScimGroup>;
  updateGroup(orgId: string, id: string, patch: Partial<Pick<ScimGroup, "displayName" | "externalId" | "memberIds">>): Promise<ScimGroup | null>;
  deleteGroup(orgId: string, id: string): Promise<boolean>;
}

export interface ScimTokenStore {
  /** SHA-256 hex hashes of the active bearer tokens of the org. Plaintext is never stored. */
  hashesFor(orgId: string): Promise<string[]>;
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export class MemoryScimTokens implements ScimTokenStore {
  private m = new Map<string, string[]>();
  /** Returns the plaintext token once; only its hash is kept. */
  issue(orgId: string): string {
    const token = "scim_" + randomBytes(32).toString("base64url");
    this.m.set(orgId, [...(this.m.get(orgId) ?? []), hashToken(token)]);
    return token;
  }
  revokeAll(orgId: string) {
    this.m.delete(orgId);
  }
  async hashesFor(orgId: string) {
    return this.m.get(orgId) ?? [];
  }
}

const now = () => new Date().toISOString();
const lc = (s: string) => s.toLowerCase();

export class MemoryScimDirectory implements ScimDirectory {
  private users = new Map<string, Map<string, ScimUser>>();
  private groups = new Map<string, Map<string, ScimGroup>>();
  private u(org: string) {
    if (!this.users.has(org)) this.users.set(org, new Map());
    return this.users.get(org)!;
  }
  private g(org: string) {
    if (!this.groups.has(org)) this.groups.set(org, new Map());
    return this.groups.get(org)!;
  }
  private page<T>(all: T[], startIndex: number, count: number) {
    return { total: all.length, items: all.slice(Math.max(0, startIndex - 1), Math.max(0, startIndex - 1) + count) };
  }
  async listUsers(org: string, q: { userName?: string; startIndex: number; count: number }) {
    let all = [...this.u(org).values()];
    if (q.userName) all = all.filter((x) => lc(x.userName) === lc(q.userName!));
    return this.page(all, q.startIndex, q.count);
  }
  async getUser(org: string, id: string) {
    return this.u(org).get(id) ?? null;
  }
  async createUser(org: string, input: UserInput) {
    if ([...this.u(org).values()].some((x) => lc(x.userName) === lc(input.userName))) throw new ScimConflictError("userName");
    const t = now();
    const u: ScimUser = { ...input, id: randomUUID(), active: input.active ?? true, created: t, lastModified: t };
    this.u(org).set(u.id, u);
    return u;
  }
  async updateUser(org: string, id: string, patch: Partial<UserInput>) {
    const cur = this.u(org).get(id);
    if (!cur) return null;
    if (patch.userName && lc(patch.userName) !== lc(cur.userName) &&
        [...this.u(org).values()].some((x) => x.id !== id && lc(x.userName) === lc(patch.userName!))) throw new ScimConflictError("userName");
    const next = { ...cur, ...patch, id, created: cur.created, lastModified: now() } as ScimUser;
    this.u(org).set(id, next);
    return next;
  }
  async deleteUser(org: string, id: string) {
    for (const g of this.g(org).values()) g.memberIds = g.memberIds.filter((m) => m !== id);
    return this.u(org).delete(id);
  }
  async listGroups(org: string, q: { displayName?: string; startIndex: number; count: number }) {
    let all = [...this.g(org).values()];
    if (q.displayName) all = all.filter((x) => lc(x.displayName) === lc(q.displayName!));
    return this.page(all, q.startIndex, q.count);
  }
  async getGroup(org: string, id: string) {
    return this.g(org).get(id) ?? null;
  }
  async createGroup(org: string, g: { displayName: string; externalId?: string; memberIds?: string[] }) {
    if ([...this.g(org).values()].some((x) => lc(x.displayName) === lc(g.displayName))) throw new ScimConflictError("displayName");
    const t = now();
    const grp: ScimGroup = { id: randomUUID(), displayName: g.displayName, externalId: g.externalId, memberIds: g.memberIds ?? [], created: t, lastModified: t };
    this.g(org).set(grp.id, grp);
    return grp;
  }
  async updateGroup(org: string, id: string, patch: Partial<Pick<ScimGroup, "displayName" | "externalId" | "memberIds">>) {
    const cur = this.g(org).get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch, lastModified: now() };
    this.g(org).set(id, next);
    return next;
  }
  async deleteGroup(org: string, id: string) {
    return this.g(org).delete(id);
  }
}
