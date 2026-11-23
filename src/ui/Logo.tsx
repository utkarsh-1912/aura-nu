import React from "react";
import { cn } from "./cn";

/**
 * Aura mark: a rounded tile holding a single stroked "A" whose crossbar is an aura dot.
 * The glyph reads as a note page being lifted (the apex), with the dot as the cursor/spark.
 * Colors come from design tokens so it themes automatically; `mono` renders in currentColor.
 */
export function LogoMark({ size = 28, mono = false, className }: { size?: number; mono?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role="img" aria-label="Aura" className={cn(className)}>
      {!mono && (
        <>
          <defs>
            <linearGradient id="aura-tile" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7a84f0" />
              <stop offset="1" stopColor="#4a53c9" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="8" fill="url(#aura-tile)" />
          <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="#fff" strokeOpacity="0.18" />
        </>
      )}
      <path d="M9 23.5 16 8l7 15.5" stroke={mono ? "currentColor" : "#fff"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="19" r="1.9" fill={mono ? "currentColor" : "#fff"} />
    </svg>
  );
}

export function Logo({ size = 28, withWordmark = true, className }: { size?: number; withWordmark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-fg" style={{ fontSize: size * 0.54 }}>
          Aura
        </span>
      )}
    </span>
  );
}
