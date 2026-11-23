import React from "react";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { UserTier } from "../types";
import { TIER_LABELS } from "../lib/tierPermissions";
import { Button } from "../ui";

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
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-lg bg-surface/90 p-4">
      <div className="flex max-w-xs flex-col items-center gap-3 rounded-lg border border-line bg-raised p-5 text-center shadow-pop">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft">
          <Lock size={18} className="text-accent" aria-hidden />
        </div>
        <div>
          <p className="mb-1 text-[14px] font-semibold text-fg">{upgradeLabel} feature</p>
          <p className="text-[12px] leading-relaxed text-fg-muted">
            This feature is available on the <strong className="font-semibold text-fg">{upgradeLabel}</strong> plan and above.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={onUpgrade} leadingIcon={<Sparkles size={13} />} trailingIcon={<ArrowRight size={13} />}>
          {ctaText || defaultCta}
        </Button>
      </div>
    </div>
  );

  if (blurContent) {
    return (
      <div className="relative overflow-hidden rounded-lg">
        <div className="pointer-events-none select-none" style={{ filter: 'blur(3px)', opacity: 0.4 }} aria-hidden>
          {children}
        </div>
        <UpgradeOverlay />
      </div>
    );
  }

  return (
    <div className="relative rounded-lg">
      <UpgradeOverlay />
    </div>
  );
}
