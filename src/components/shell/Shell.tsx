import React, { useEffect, useRef } from "react";
import { FileText, Search, Plus, Sparkles, MoreHorizontal } from "lucide-react";
import { IconButton, Spinner } from "../../ui";

/** 48px app bar used above panes on tablet/phone. */
export function TopBar({
  title,
  leading,
  trailing,
}: {
  title: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)] box-content select-none">
      <div className="flex min-w-0 items-center gap-1">
        {leading}
        <h1 className="truncate px-1 text-[14px] font-semibold text-fg">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">{trailing}</div>
    </header>
  );
}

/** Overlay drawer for the sidebar on tablet/phone. Esc and scrim close it. */
export function Drawer({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex select-none">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative flex h-full w-[min(18rem,88vw)] flex-col border-r border-line bg-sidebar shadow-pop outline-none motion-safe:animate-[drawer-in_160ms_ease-out]"
      >
        {children}
      </div>
      <style>{`@keyframes drawer-in{from{transform:translateX(-12px);opacity:.6}to{transform:none;opacity:1}}`}</style>
    </div>
  );
}

/** Pane-level overlay shown while a workspace switch is in flight. */
export function SwitchingOverlay({ label }: { label: string }) {
  return (
    <div role="status" className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-surface/90">
      <Spinner size={20} />
      <span className="text-[12px] text-fg-muted">{label}</span>
    </div>
  );
}

export type MobileTabId = "home" | "notes" | "ai" | "settings";

/** Phone bottom navigation: Notes / Search / New / AI / More. */
export function MobileTabBar({
  active,
  onNotes,
  onSearch,
  onNew,
  onAi,
  onMore,
}: {
  active: MobileTabId;
  onNotes: () => void;
  onSearch: () => void;
  onNew: () => void;
  onAi: () => void;
  onMore: () => void;
}) {
  const tab = (id: string, label: string, icon: React.ReactNode, on: boolean, onClick: () => void) => (
    <button
      key={id}
      type="button"
      onClick={onClick}
      aria-current={on ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none transition-colors focus-visible:bg-hover ${
        on ? "text-accent" : "text-fg-muted active:bg-hover"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <nav
      aria-label="Primary"
      className="z-30 flex shrink-0 items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {tab("notes", "Notes", <FileText size={18} aria-hidden />, active === "notes" || active === "home", onNotes)}
      {tab("search", "Search", <Search size={18} aria-hidden />, false, onSearch)}
      <div className="flex flex-1 items-center justify-center">
        <IconButton label="New note" variant="primary" size="lg" onClick={onNew} className="!h-10 !w-10 !rounded-full">
          <Plus size={18} />
        </IconButton>
      </div>
      {tab("ai", "AI", <Sparkles size={18} aria-hidden />, active === "ai", onAi)}
      {tab("settings", "More", <MoreHorizontal size={18} aria-hidden />, active === "settings", onMore)}
    </nav>
  );
}
