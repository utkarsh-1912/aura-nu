import React from "react";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { UserTier } from "../types";
import { TIER_LABELS } from "../lib/tierPermissions";

const TIER_RANK: Record<UserTier, number> = {
  personal: 0,
  team: 1,
  enterprise: 2,
};

interface TierGateProps {
  requiredTier: UserTier;
  currentTier: UserTier;
  children: React.ReactNode;
  /** If true, renders children blurred with an overlay instead of hiding them */
  blurContent?: boolean;
  /** Custom upgrade CTA text */
  ctaText?: string;
  onUpgrade?: () => void;
  theme?: "light" | "dark";
}

export default function TierGate({
  requiredTier,
  currentTier,
  children,
  blurContent = true,
  ctaText,
  onUpgrade,
  theme = "light",
}: TierGateProps) {
  const hasAccess = TIER_RANK[currentTier] >= TIER_RANK[requiredTier];

  if (hasAccess) return <>{children}</>;

  const upgradeLabel = TIER_LABELS[requiredTier];
  const defaultCta = `Upgrade to ${upgradeLabel}`;

  const UpgradeOverlay = () => (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl"
      style={{ background: theme === 'dark' ? 'rgba(9,9,11,0.82)' : 'rgba(255,255,255,0.82)', backdropFilter: 'blur(6px)' }}>
      <div className={`flex flex-col items-center gap-3 p-6 rounded-2xl border shadow-xl text-center max-w-xs
        ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center
          ${requiredTier === 'enterprise'
            ? 'bg-violet-100 dark:bg-violet-950/40'
            : 'bg-blue-100 dark:bg-blue-950/40'}` }>
          <Lock size={22} className={requiredTier === 'enterprise' ? 'text-violet-600' : 'text-blue-600'} />
        </div>
        <div>
          <p className={`text-sm font-semibold mb-1 ${theme === 'dark' ? 'text-zinc-100' : 'text-slate-900'}`}>
            {upgradeLabel} Feature
          </p>
          <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-slate-500'}`}>
            This feature is available on the <strong>{upgradeLabel}</strong> plan and above.
          </p>
        </div>
        <button
          onClick={onUpgrade}
          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-all
            ${requiredTier === 'enterprise'
              ? 'bg-violet-600 hover:bg-violet-500 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
          <Sparkles size={13} />
          {ctaText || defaultCta}
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );

  if (blurContent) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <div className="pointer-events-none select-none" style={{ filter: 'blur(3px)', opacity: 0.4 }}>
          {children}
        </div>
        <UpgradeOverlay />
      </div>
    );
  }

  return (
    <div className="relative rounded-xl">
      <UpgradeOverlay />
    </div>
  );
}
