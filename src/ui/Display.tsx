import React from "react";
import { cn } from "./cn";

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
      className={cn("animate-spin text-current", className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-hover", className)} />;
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";
const TONE: Record<BadgeTone, string> = {
  neutral: "bg-hover text-fg-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium leading-none", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex items-center justify-center min-w-5 h-5 px-1 rounded border border-line bg-panel text-[10.5px] font-sans font-medium text-fg-muted", className)}>
      {children}
    </kbd>
  );
}

const AVATAR_HUES = [262, 221, 199, 160, 32, 340, 12, 280];
function hueFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}
export function Avatar({ name, src, size = 24, className }: { name: string; src?: string; size?: number; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  const style: React.CSSProperties = { width: size, height: size, fontSize: Math.max(9, size * 0.4) };
  if (src) return <img src={src} alt={name} style={style} className={cn("rounded-full object-cover", className)} />;
  return (
    <span
      aria-label={name}
      style={{ ...style, background: `hsl(${hueFor(name)} 70% 45% / 0.16)`, color: `hsl(${hueFor(name)} 60% 42%)` }}
      className={cn("inline-flex items-center justify-center rounded-full font-semibold select-none dark:brightness-150", className)}
    >
      {initials}
    </span>
  );
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" className={cn("bg-line shrink-0", vertical ? "w-px self-stretch" : "h-px w-full", className)} />;
}

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border border-line bg-panel", className)} {...rest}>
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center gap-3 px-6 py-12", className)}>
      {icon && <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hover text-fg-muted">{icon}</div>}
      <div className="space-y-1">
        <p className="text-[14px] font-medium text-fg">{title}</p>
        {description && <p className="text-[13px] text-fg-muted max-w-xs">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

/** Underline tabs (page sections). Arrow keys move between tabs. */
export function Tabs<T extends string>({ items, value, onChange, className }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  const onKey = (e: React.KeyboardEvent) => {
    const i = items.findIndex((t) => t.id === value);
    if (e.key === "ArrowRight") onChange(items[(i + 1) % items.length].id);
    if (e.key === "ArrowLeft") onChange(items[(i - 1 + items.length) % items.length].id);
  };
  return (
    <div role="tablist" onKeyDown={onKey} className={cn("flex items-center gap-1 border-b border-line", className)}>
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={cn(
            "relative inline-flex items-center gap-1.5 h-9 px-2.5 text-[13px] font-medium transition-colors -mb-px border-b-2",
            "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent rounded-t",
            t.id === value ? "text-fg border-accent" : "text-fg-muted border-transparent hover:text-fg",
          )}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && <span className="text-[11px] text-fg-subtle">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Segmented control (view modes, small option sets). */
export function Segmented<T extends string>({ items, value, onChange, size = "md", className }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; size?: "sm" | "md"; className?: string }) {
  return (
    <div role="radiogroup" className={cn("inline-flex items-center gap-0.5 rounded-lg bg-hover p-0.5", className)}>
      {items.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={t.id === value}
          onClick={() => onChange(t.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[12.5px]",
            t.id === value ? "bg-panel text-fg shadow-soft" : "text-fg-muted hover:text-fg",
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export type ToastTone = "success" | "info" | "error";
export interface ToastItem {
  id: string;
  text: string;
  type: ToastTone;
}
const TOAST_DOT: Record<ToastTone, string> = { success: "bg-success", info: "bg-accent", error: "bg-danger" };

/** Stack of transient messages. Parent owns the list and auto-dismiss. */
export function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss?: (id: string) => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role={t.type === "error" ? "alert" : "status"} className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-raised px-3 py-2.5 shadow-pop">
          <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TOAST_DOT[t.type])} />
          <p className="flex-1 text-[13px] text-fg">{t.text}</p>
          {onDismiss && (
            <button aria-label="Dismiss" onClick={() => onDismiss(t.id)} className="text-fg-subtle hover:text-fg text-[16px] leading-none">
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
