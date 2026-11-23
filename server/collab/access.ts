import { resolveRole, type ChainNode, type Grant, type ShareRole } from "../../src/core/acl";
import type { AccessChecker } from "./server";

export interface AclSource {
  /** Chain root -> leaf for a note id (workspace, folders..., note). null if the note does not exist. */
  loadChain(noteId: string): Promise<ChainNode[] | null>;
  /** Grants attached to any node of the chain. */
  loadGrants(chain: readonly ChainNode[]): Promise<Grant[]>;
  /** Group ids (e.g. SCIM groups) the user belongs to. */
  loadGroups(email: string): Promise<string[]>;
}

/**
 * AccessChecker backed by the pure ACL resolver (src/core/acl.ts). Rooms are `note:<id>`.
 * Unknown notes resolve to null (deny). Data-source errors propagate and the server fails closed.
 */
export function createAclAccessChecker(src: AclSource, now: () => number = Date.now): AccessChecker {
  return {
    async getRole(email: string, room: string): Promise<ShareRole | null> {
      if (!room.startsWith("note:")) return null;
      const chain = await src.loadChain(room.slice(5));
      if (!chain || !chain.length) return null;
      const [grants, groupIds] = await Promise.all([src.loadGrants(chain), src.loadGroups(email)]);
      return resolveRole(chain, grants, { email, groupIds }, now());
    },
  };
}
