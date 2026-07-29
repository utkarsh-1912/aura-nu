import { UserTier, TierPermissions } from "../types";

export const TIER_PERMISSIONS: Record<UserTier, TierPermissions> = {
  personal: {
    maxWorkspaces: 3,
    maxMembersPerWorkspace: 1,
    maxDepartments: 0,
    canCreateDepts: false,
    canInviteMembers: false,
    canConfigureSSO: false,
    canExportAuditLogs: false,
    canAccessAdminConsole: false,
    canUseAdvancedAI: false,
    aiActionsPerMonth: 50,
    storageLimitGB: 1,
    canSetCustomDomain: false,
    prioritySupport: false,
  },
  team: {
    maxWorkspaces: 20,
    maxMembersPerWorkspace: 25,
    maxDepartments: 0,
    canCreateDepts: false,
    canInviteMembers: true,
    canConfigureSSO: false,
    canExportAuditLogs: false,
    canAccessAdminConsole: true,
    canUseAdvancedAI: true,
    aiActionsPerMonth: 500,
    storageLimitGB: 50,
    canSetCustomDomain: false,
    prioritySupport: false,
  },
  enterprise: {
    maxWorkspaces: -1, // unlimited
    maxMembersPerWorkspace: -1, // unlimited
    maxDepartments: -1, // unlimited
    canCreateDepts: true,
    canInviteMembers: true,
    canConfigureSSO: true,
    canExportAuditLogs: true,
    canAccessAdminConsole: true,
    canUseAdvancedAI: true,
    aiActionsPerMonth: -1, // unlimited
    storageLimitGB: -1, // unlimited
    canSetCustomDomain: true,
    prioritySupport: true,
  },
};

export function getTierPermissions(tier: UserTier): TierPermissions {
  return TIER_PERMISSIONS[tier];
}

export function hasPermission<K extends keyof TierPermissions>(
  tier: UserTier,
  permission: K
): boolean {
  const perms = TIER_PERMISSIONS[tier];
  const val = perms[permission];
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  return false;
}

export const TIER_LABELS: Record<UserTier, string> = {
  personal: "Personal",
  team: "Team",
  enterprise: "Enterprise",
};

export const TIER_COLORS: Record<UserTier, { bg: string; text: string; border: string; dot: string }> = {
  personal: {
    bg: "bg-slate-100 dark:bg-zinc-800",
    text: "text-slate-600 dark:text-zinc-400",
    border: "border-slate-200 dark:border-zinc-700",
    dot: "bg-slate-400",
  },
  team: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
    dot: "bg-blue-500",
  },
  enterprise: {
    bg: "bg-violet-50 dark:bg-violet-950/30",
    text: "text-violet-600 dark:text-violet-400",
    border: "border-violet-200 dark:border-violet-800",
    dot: "bg-violet-500",
  },
};

export const TIER_PRICES = {
  personal: { monthly: 0, annual: 0 },
  team: { monthly: 12, annual: 9 },
  enterprise: { monthly: 49, annual: 39 },
};
