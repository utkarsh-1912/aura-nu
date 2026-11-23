import React, { useId } from "react";
import { cn } from "./cn";

const CONTROL =
  "w-full rounded-md border border-line bg-panel text-[13px] text-fg placeholder:text-fg-subtle " +
  "transition-colors hover:border-line-strong focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5l3 3 3-3' stroke='%238b8f98' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  leadingIcon?: React.ReactNode;
  trailing?: React.ReactNode;
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { leadingIcon, trailing, invalid, size = "md", className, ...rest },
  ref,
) {
  const h = size === "sm" ? "h-7" : size === "lg" ? "h-10 text-[14px]" : "h-8";
  return (
    <div className="relative flex items-center">
      {leadingIcon && <span className="pointer-events-none absolute left-2.5 flex text-fg-subtle">{leadingIcon}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, h, "px-2.5", leadingIcon && "pl-8", trailing && "pr-9", invalid && "!border-danger focus:!ring-danger/25", className)}
        {...rest}
      />
      {trailing && <span className="absolute right-2 flex items-center text-fg-subtle">{trailing}</span>}
    </div>
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, "min-h-20 px-2.5 py-2 leading-relaxed resize-y", invalid && "!border-danger", className)}
        {...rest}
      />
    );
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      style={{ backgroundImage: CHEVRON, backgroundPosition: "right 8px center", backgroundSize: "12px" }}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "h-8 px-2 pr-7 appearance-none bg-no-repeat cursor-pointer", invalid && "!border-danger", className)}
      {...rest}
    >
      {children}
    </select>
  );
});

/** Label + control + hint/error wiring in one place so every form is accessible by default. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; invalid: boolean }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[12px] font-medium text-fg-muted">
        {label}
      </label>
      {children({ id, "aria-describedby": descId, invalid: !!error })}
      {(error || hint) && (
        <p id={descId} className={cn("text-[12px]", error ? "text-danger" : "text-fg-subtle")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Accessible name (required). */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      type="button"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[16px]" : "translate-x-[2px]")} />
    </button>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-[13px] text-fg cursor-pointer", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line-strong accent-[var(--c-accent)]"
      />
      {label}
    </label>
  );
}
