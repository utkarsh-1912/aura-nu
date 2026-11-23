import type { UserTier } from "../src/types";

/**
 * Who pays for / is limited by a request. Always derived from AUTHENTICATED state (the verified email
 * plus server-side org membership); the only client hint is an org id, which is honoured only if the
 * caller is a member of it.
 */

export interface OrgMembership {
  orgId: string;
  tier: UserTier;
  role: string;
}

export interface OrgDirectory {
  /** false when no org database is reachable (local dev without Mongo): everyone is a personal user. */
  available(): boolean;
  memberships(email: string): Promise<OrgMembership[]>;
  orgTier(orgId: string): Promise<UserTier | null>;
  memberEmails(orgId: string): Promise<string[]>;
  /** Removes a non-owner member. Returns true if a membership was removed. */
  removeMember(orgId: string, email: string): Promise<boolean>;
}

export interface TenantInfo {
  /** Quota bucket: org id for team/enterprise orgs, the user's email otherwise. */
  tenant: string;
  kind: "org" | "user";
  orgId?: string;
  tier: UserTier;
}

const TIER_RANK: Record<UserTier, number> = { personal: 0, team: 1, enterprise: 2 };
export const ORG_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export class Tenancy {
  private cache = new Map<string, { at: number; v: OrgMembership[] }>();
  constructor(private orgs: OrgDirectory, private ttlMs = 15_000, private clock: () => number = Date.now) {}

  async memberships(email: string): Promise<OrgMembership[]> {
    const k = email.toLowerCase();
    const hit = this.cache.get(k);
    if (hit && this.clock() - hit.at < this.ttlMs) return hit.v;
    const v = this.orgs.available() ? await this.orgs.memberships(k) : [];
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(k, { at: this.clock(), v });
    return v;
  }

  invalidate(email: string) {
    this.cache.delete(email.toLowerCase());
  }

  async resolve(email: string, preferredOrg?: unknown): Promise<TenantInfo> {
    const ms = await this.memberships(email);
    const paid = ms.filter((m) => m.tier !== "personal");
    let pick: OrgMembership | undefined;
    if (typeof preferredOrg === "string" && ORG_ID_RE.test(preferredOrg)) pick = paid.find((m) => m.orgId === preferredOrg);
    if (!pick) pick = [...paid].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || a.orgId.localeCompare(b.orgId))[0];
    if (pick) return { tenant: pick.orgId, kind: "org", orgId: pick.orgId, tier: pick.tier };
    return { tenant: email.toLowerCase(), kind: "user", tier: "personal" };
  }
}
