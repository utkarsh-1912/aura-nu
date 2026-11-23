import React from "react";
import { Panel, Skeleton, cn } from "../../ui";

/** Titled card used across the dashboard. */
export function Card({
  title,
  icon,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Panel className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          {icon && <span className="flex text-fg-muted" aria-hidden>{icon}</span>}
          {title}
        </h3>
        {right && <div className="flex items-center gap-2 text-[12px] text-fg-muted">{right}</div>}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </Panel>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Panel className="px-4 py-3">
      <p className="text-[20px] font-semibold leading-tight text-fg tabular-nums">{value}</p>
      <p className="mt-0.5 text-[12px] text-fg-muted">{label}</p>
      {hint && <p className="text-[11px] text-fg-subtle">{hint}</p>}
    </Panel>
  );
}

export function StatTileSkeleton() {
  return (
    <Panel className="space-y-2 px-4 py-3">
      <Skeleton className="h-5 w-12" />
      <Skeleton className="h-3 w-20" />
    </Panel>
  );
}

/** Horizontal bar: accent fill on neutral track. */
export function BarRow({ label, count, percent, muted }: { label: string; count: number; percent: number; muted?: boolean }) {
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="truncate text-fg">{label}</span>
        <span className="shrink-0 tabular-nums text-fg-muted">{count}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${percent}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-hover"
      >
        <div className={cn("h-full rounded-full", muted ? "bg-fg-subtle" : "bg-accent")} style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
    </li>
  );
}

export function InlineEmpty({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-fg-muted">
      {icon && <span className="text-fg-subtle" aria-hidden>{icon}</span>}
      <p className="max-w-xs">{children}</p>
    </div>
  );
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
