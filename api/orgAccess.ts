import type { NextFunction, Request, Response } from "express";
import { getUserEmail } from "./auth";

export type OrgRole = "OrgOwner" | "OrgAdmin" | "BillingAdmin" | "DeptLead" | "Member";

export const ANY_MEMBER: OrgRole[] = ["OrgOwner", "OrgAdmin", "BillingAdmin", "DeptLead", "Member"];
export const ORG_ADMINS: OrgRole[] = ["OrgOwner", "OrgAdmin"];
export const BILLING: OrgRole[] = ["OrgOwner", "OrgAdmin", "BillingAdmin"];

export interface OrgAccessDeps {
  /** Returns the caller's role in the org, or null if not a member. Throws if membership can't be determined. */
  getRole: (orgId: string, email: string) => Promise<OrgRole | null>;
  /** When false (no database), access can't be verified: only allowed outside production. */
  available: () => boolean;
  production: boolean;
}

/**
 * Authorises access to /api/org/:orgId/* by org membership. Must run after requireAuth.
 * Non-members get 404 (not 403) so org ids can't be probed.
 */
export function requireOrgRole(allowed: OrgRole[], deps: OrgAccessDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!deps.available()) {
      if (deps.production) return res.status(503).json({ error: "Organization data store unavailable" });
      return next(); // local dev without a database serves mock data
    }
    try {
      const role = await deps.getRole(req.params.orgId, getUserEmail(req));
      if (!role) return res.status(404).json({ error: "Org not found" });
      if (!allowed.includes(role)) return res.status(403).json({ error: "Insufficient role" });
      next();
    } catch (err) {
      console.error("org access check failed:", err);
      res.status(500).json({ error: "Could not verify organization access" });
    }
  };
}
