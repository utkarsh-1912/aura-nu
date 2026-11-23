import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: portal, scroll lock, Escape/backdrop close, focus trap, focus restore.
 * On phones it becomes a bottom sheet.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = ref.current;
    (el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return e.preventDefault();
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex w-full max-h-[92dvh] flex-col rounded-t-xl sm:rounded-xl border border-line bg-raised shadow-pop outline-none",
          "pb-[env(safe-area-inset-bottom)]",
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold text-fg">{title}</h2>
            {description && <p id={descId} className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
          </div>
          <button aria-label="Close dialog" onClick={onClose} className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}
export type MenuEntry = MenuItem | "separator";

/** Dropdown menu: click-outside, Escape, arrow-key navigation, roving focus. */
export function Menu({
  trigger,
  items,
  align = "start",
  className,
}: {
  trigger: (p: { open: boolean; toggle: () => void; props: React.HTMLAttributes<HTMLElement> & { "aria-haspopup": "menu"; "aria-expanded": boolean } }) => React.ReactNode;
  items: MenuEntry[];
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    list.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); (root.current?.querySelector("button") as HTMLElement | null)?.focus(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  };

  return (
    <div ref={root} className="relative inline-block" onKeyDown={onKey}>
      {trigger({ open, toggle: () => setOpen((o) => !o), props: { "aria-haspopup": "menu", "aria-expanded": open, onClick: () => setOpen((o) => !o) } })}
      {open && (
        <div
          ref={list}
          role="menu"
          className={cn(
            "absolute z-50 mt-1 min-w-[10rem] rounded-lg border border-line bg-raised p-1 shadow-pop",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {items.map((it, i) =>
            it === "separator" ? (
              <div key={`s${i}`} role="separator" className="my-1 h-px bg-line" />
            ) : (
              <button
                key={it.id}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect(); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 h-8 text-left text-[13px] outline-none",
                  "focus:bg-hover hover:bg-hover disabled:opacity-40",
                  it.danger ? "text-danger" : "text-fg",
                )}
              >
                {it.icon && <span className="flex text-fg-muted">{it.icon}</span>}
                <span className="flex-1 truncate">{it.label}</span>
                {it.shortcut && <span className="text-[11px] text-fg-subtle">{it.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** CSS-only tooltip; also shows on keyboard focus. Wrap a focusable control. */
export function Tooltip({ text, children, side = "top" }: { text: string; children: React.ReactNode; side?: "top" | "bottom" | "right" }) {
  const pos = side === "top" ? "bottom-full mb-1.5 left-1/2 -translate-x-1/2" : side === "bottom" ? "top-full mt-1.5 left-1/2 -translate-x-1/2" : "left-full ml-1.5 top-1/2 -translate-y-1/2";
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-[11px] font-medium text-surface opacity-0 shadow-pop transition-opacity",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100 delay-300",
          pos,
        )}
      >
        {text}
      </span>
    </span>
  );
}
