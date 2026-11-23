import { createHash, randomUUID } from "node:crypto";
import type { ChainNode, Grant, ResourceType } from "../src/core/acl";
import type { AclSource } from "./collab/access";
import type { NoteStore } from "./noteStore";
import type { DocCollection } from "./persist";

/**
 * Ownership + share grants for collaboration.
 *
 * Notes in the v2 NoteStore are per-user (two users can both have a note called "welcome-note"), so a
 * collab room must be owner-qualified. A room is `note:<key>` with key = sha256(owner, noteId)[0..40):
 * unguessable, collision-free across owners, and it cannot be squatted (the owner is part of the hash).
 * The server records `owner` the first time a note passes through PUT /api/v2 (see withOwnerRegistration).
 * Folders are keyed the same way (owner + folder name), so "General" of user A never inherits grants
 * given on "General" of user B.
 */

export const KEY_RE = /^[0-9a-f]{40}$/;
export const MAX_GRANTS_PER_RESOURCE = 200;

const norm = (e: string) => e.trim().toLowerCase();
const h40 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);
export const noteKey = (owner: string, noteId: string) => h40(`note\n${norm(owner)}\n${noteId}`);
export const folderKey = (owner: string, folder: string) => h40(`folder\n${norm(owner)}\n${folder}`);
export const roomOf = (key: string) => `note:${key}`;
export const docIdOf = (type: ResourceType, key: string) => `${type}:${key}`;

export type StoredGrant = Grant & {
  createdBy: string;
  createdAt: number;
  /** Link id this grant was redeemed through; revoking the link revokes these too. */
  via?: string;
};

export interface ResourceDoc {
  kind: "note" | "folder";
  ownerEmail: string;
  /** Owner's own note id (notes only). */
  noteId?: string;
  /** Notes: the folder the note currently sits in. Folders: the folder name. */
  folder?: string;
  deleted?: boolean;
  grants: StoredGrant[];
  /** Lower-case emails holding a user grant (denormalised so "shared with me" is a lookup, not a scan). */
  grantees: string[];
  createdAt: number;
}

const granteesOf = (grants: StoredGrant[]) =>
  [...new Set(grants.filter((g) => g.principal.type === "user").map((g) => norm((g.principal as { email: string }).email)))];
const live = (g: StoredGrant, now: number) => g.expiresAt === undefined || g.expiresAt > now;

export class GrantStore {
  /** In-process memo so repeated PUTs of an unchanged note cost no store write. */
  private seen = new Map<string, string>();
  constructor(private col: DocCollection<ResourceDoc>, private now: () => number = Date.now) {}

  // ----- ownership registration
  async registerNote(owner: string, noteId: string, folder: string): Promise<string> {
    const key = noteKey(owner, noteId);
    const sig = `${folder}`;
    if (this.seen.get(key) === sig) return key;
    await this.col.update(docIdOf("note", key), (cur) =>
      cur
        ? { ...cur, folder, deleted: false }
        : { kind: "note", ownerEmail: norm(owner), noteId, folder, grants: [], grantees: [], createdAt: this.now() },
    );
    if (this.seen.size > 50_000) this.seen.clear();
    this.seen.set(key, sig);
    return key;
  }

  /** Tombstoned notes lose their room and every grant. */
  async markNoteDeleted(owner: string, noteId: string): Promise<void> {
    const key = noteKey(owner, noteId);
    this.seen.delete(key);
    await this.col.update(docIdOf("note", key), (cur) => (cur ? { ...cur, deleted: true, grants: [], grantees: [] } : null));
  }

  getDoc(type: ResourceType, key: string) {
    return this.col.get(docIdOf(type, key));
  }

  // ----- AclSource (for createAclAccessChecker)
  async loadChain(room: string): Promise<ChainNode[] | null> {
    if (!room.startsWith("note:")) return null;
    const key = room.slice(5);
    if (!KEY_RE.test(key)) return null;
    const doc = await this.getDoc("note", key);
    if (!doc || doc.deleted) return null;
    return this.chainFor(key, doc);
  }

  chainFor(key: string, doc: ResourceDoc): ChainNode[] {
    const chain: ChainNode[] = [];
    if (doc.folder) chain.push({ type: "folder", id: folderKey(doc.ownerEmail, doc.folder), ownerEmail: doc.ownerEmail });
    chain.push({ type: "note", id: key, ownerEmail: doc.ownerEmail });
    return chain;
  }

  async loadGrants(chain: readonly ChainNode[]): Promise<Grant[]> {
    const docs = await Promise.all(chain.map((n) => (n.type === "workspace" ? null : this.getDoc(n.type, n.id))));
    return docs.flatMap((d) => d?.grants ?? []);
  }

  aclSource(loadGroups: (email: string) => Promise<string[]>): AclSource {
    // createAclAccessChecker strips the "note:" prefix before calling loadChain.
    return { loadChain: (id) => this.loadChain(roomOf(id)), loadGrants: (c) => this.loadGrants(c), loadGroups };
  }

  // ----- grant mutation (callers must have authorised the actor)
  /** Adds a grant; replaces an existing direct user grant for the same email. Returns false when the resource is full. */
  async addGrant(type: "note" | "folder", key: string, seed: ResourceDoc, grant: StoredGrant): Promise<boolean> {
    let full = false;
    const now = this.now();
    await this.col.update(docIdOf(type, key), (cur) => {
      full = false;
      const doc = cur ?? seed;
      let grants = doc.grants.filter((g) => live(g, now));
      if (grant.principal.type === "user") {
        const e = norm(grant.principal.email);
        grants = grants.filter((g) => !(g.principal.type === "user" && !g.via && norm(g.principal.email) === e));
      }
      if (grants.length >= MAX_GRANTS_PER_RESOURCE) {
        full = true;
        return cur;
      }
      grants.push(grant);
      return { ...doc, grants, grantees: granteesOf(grants) };
    });
    return !full;
  }

  /** Removes a grant (and, for a link, every grant redeemed through it). Returns the removed grant. */
  async removeGrant(type: "note" | "folder", key: string, grantId: string): Promise<StoredGrant | null> {
    let removed: StoredGrant | null = null;
    await this.col.update(docIdOf(type, key), (cur) => {
      removed = null;
      if (!cur) return null;
      const target = cur.grants.find((g) => g.id === grantId);
      if (!target) return cur;
      removed = target;
      const grants = cur.grants.filter((g) => g.id !== grantId && !(target.principal.type === "link" && g.via === grantId));
      return { ...cur, grants, grantees: granteesOf(grants) };
    });
    return removed;
  }

  // ----- lookups
  async sharedWith(email: string) {
    return this.col.all({ grantees: norm(email) });
  }

  async notesInFolder(owner: string, folder: string) {
    const rows = await this.col.all({ ownerEmail: norm(owner), folder });
    return rows.filter((r) => r.value.kind === "note" && !r.value.deleted);
  }

  /**
   * Revokes every direct grant `email` holds on resources owned by `owners` (used on SCIM deprovision).
   * Returns the number of grants removed.
   */
  async revokeUserAccess(email: string, owners: string[]): Promise<number> {
    const e = norm(email);
    const ownerSet = new Set(owners.map(norm));
    let n = 0;
    for (const row of await this.col.all({ grantees: e })) {
      if (!ownerSet.has(row.value.ownerEmail)) continue;
      await this.col.update(row.id, (cur) => {
        if (!cur) return null;
        const grants = cur.grants.filter((g) => !(g.principal.type === "user" && norm(g.principal.email) === e));
        n += cur.grants.length - grants.length;
        return { ...cur, grants, grantees: granteesOf(grants) };
      });
    }
    return n;
  }

  seedFolder(owner: string, folder: string): ResourceDoc {
    return { kind: "folder", ownerEmail: norm(owner), folder, grants: [], grantees: [], createdAt: this.now() };
  }
}

export const newId = () => randomUUID();

/**
 * Wraps the v2 NoteStore so a note's owner is recorded when it first passes through PUT, tombstones
 * drop the room and its grants, and notes that predate this feature are backfilled the first time their
 * owner syncs them. Registration failures are logged but never fail a sync (the note is saved; it just
 * cannot be shared until the next successful write).
 */
export function withOwnerRegistration(store: NoteStore, grants: GrantStore, log: (msg: string, err: unknown) => void = () => undefined): NoteStore {
  const safeFolder = (v: unknown) => (typeof v === "string" && v ? v : "General");
  return {
    async changes(email, since, limit) {
      const page = await store.changes(email, since, limit);
      for (const n of page.notes) {
        if (!n.deleted) void grants.registerNote(email, n.id, safeFolder(n.folder)).catch((e) => log("owner backfill failed", e));
      }
      return page;
    },
    async put(email, input, baseRev) {
      const r = await store.put(email, input, baseRev);
      if (r.status === "ok") {
        try {
          await grants.registerNote(email, input.id, safeFolder(input.folder));
        } catch (e) {
          log("owner registration failed", e);
        }
      }
      return r;
    },
    async remove(email, id, baseRev) {
      const r = await store.remove(email, id, baseRev);
      if (r.status === "ok") {
        try {
          await grants.markNoteDeleted(email, id);
        } catch (e) {
          log("owner tombstone failed", e);
        }
      }
      return r;
    },
  };
}
