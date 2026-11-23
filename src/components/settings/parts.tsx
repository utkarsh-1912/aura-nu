import React from "react";
import { cn } from "../../ui";

/** A titled group of settings rows. */
export function SettingsGroup({ title, description, children, className }: { title?: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || description) && (
        <header>
          {title && <h3 className="text-[14px] font-semibold text-fg">{title}</h3>}
          {description && <p className="mt-0.5 text-[12px] text-fg-muted">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Label + hint on the left, control on the right. Stacks on narrow widths. */
export function SettingRow({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-fg">{title}</p>
        {hint && <p className="mt-0.5 text-[12px] text-fg-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function InfoBanner({ tone = "info", children }: { tone?: "info" | "warning" | "danger"; children: React.ReactNode }) {
  const t = { info: "bg-accent-soft text-fg border-line", warning: "bg-warning-soft text-fg border-line", danger: "bg-danger-soft text-fg border-line" }[tone];
  return <div className={cn("rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed", t)}>{children}</div>;
}

export function DataTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[420px] text-left text-[12px]">
        <thead>
          <tr className="border-b border-line bg-hover text-fg-muted">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 text-fg">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
