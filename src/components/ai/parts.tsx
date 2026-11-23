import React from "react";
import { AlertCircle, Bot, Check, Copy, ArrowRight, Cpu, Wrench, ShieldAlert, Terminal, CheckCircle2, X } from "lucide-react";
import { Avatar, Badge, Button, Skeleton, cn } from "../../ui";
import type { BadgeTone } from "../../ui";
import type { AgentExecutionStep, AgentRun } from "../../types";

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{children}</h3>
      {right && <span className="text-[11px] text-fg-subtle">{right}</span>}
    </div>
  );
}

/** Honest "AI unavailable" banner with retry. */
export function ErrorBanner({ title = "AI is unavailable", message, onRetry, onDismiss }: { title?: string; message: string; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-line bg-danger-soft px-3 py-2.5">
      <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-fg">{title}</p>
        <p className="mt-0.5 text-[12px] text-fg-muted break-words">{message}</p>
        <p className="mt-0.5 text-[12px] text-fg-muted">Nothing was changed.</p>
        <div className="mt-2 flex gap-2">
          {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
          {onDismiss && <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>}
        </div>
      </div>
    </div>
  );
}

export function LoadingLines({ label = "Thinking" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2 rounded-lg border border-line bg-panel p-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-2.5 w-full" />
      <Skeleton className="h-2.5 w-5/6" />
      <Skeleton className="h-2.5 w-4/5" />
    </div>
  );
}

/** Flat chat row: avatar + name + content. */
export function MessageRow({
  sender,
  userName,
  text,
  error,
  actions,
}: {
  sender: "user" | "ai";
  userName: string;
  text: string;
  error?: boolean;
  actions?: React.ReactNode;
}) {
  const isAi = sender === "ai";
  return (
    <div className="flex gap-2.5">
      {isAi ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden>
          <Bot size={13} />
        </span>
      ) : (
        <Avatar name={userName} size={24} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-fg">{isAi ? "Aura" : "You"}</p>
        {error ? (
          <p className="mt-0.5 text-[13px] leading-relaxed text-danger whitespace-pre-wrap break-words">{text}</p>
        ) : (
          <p className="mt-0.5 text-[13px] leading-relaxed text-fg whitespace-pre-wrap break-words">{text}</p>
        )}
        {actions && <div className="mt-1.5 flex items-center gap-1">{actions}</div>}
      </div>
    </div>
  );
}

export function RowAction({ onClick, icon, children }: { onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent max-md:h-10"
    >
      {icon}
      {children}
    </button>
  );
}

export const RUN_TONE: Record<string, { tone: BadgeTone; label: string }> = {
  completed: { tone: "success", label: "Completed" },
  running: { tone: "accent", label: "Running" },
  awaiting_approval: { tone: "warning", label: "Awaiting approval" },
  failed: { tone: "danger", label: "Failed" },
};

export function RunStatusBadge({ status }: { status: string }) {
  const t = RUN_TONE[status] ?? { tone: "neutral" as BadgeTone, label: status.replace(/_/g, " ") };
  return <Badge tone={t.tone}>{t.label}</Badge>;
}

const STEP_ICON: Record<string, React.ReactNode> = {
  thought: <Cpu size={13} />,
  tool_call: <Wrench size={13} />,
  approval_gate: <ShieldAlert size={13} />,
  observation: <Terminal size={13} />,
  final_answer: <CheckCircle2 size={13} />,
};
const STEP_TONE: Record<string, string> = {
  thought: "text-fg-muted bg-hover",
  tool_call: "text-accent bg-accent-soft",
  approval_gate: "text-warning bg-warning-soft",
  observation: "text-fg-muted bg-hover",
  final_answer: "text-success bg-success-soft",
};

/** Timeline of agent steps with approve/reject gate. */
export function RunTimeline({
  run,
  onDecide,
  openNoteId,
  onOpenNote,
}: {
  run: AgentRun;
  openNoteId?: string;
  onDecide: (stepId: string, approve: boolean) => void;
  onOpenNote?: (id: string) => void;
}) {
  return (
    <ol className="relative space-y-3">
      {run.steps.map((step: AgentExecutionStep, i) => {
        const pending = step.type === "approval_gate" && step.toolCall?.status === "pending_approval";
        return (
          <li key={step.id} className="relative flex gap-2.5">
            {i < run.steps.length - 1 && <span className="absolute left-[11px] top-6 bottom-[-12px] w-px bg-line" aria-hidden />}
            <span className={cn("relative z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full", STEP_TONE[step.type] ?? STEP_TONE.observation)} aria-hidden>
              {STEP_ICON[step.type]}
            </span>
            <div className="min-w-0 flex-1 pb-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-[13px] font-medium text-fg break-words">{step.title}</p>
                {step.toolCall && (
                  <Badge tone={step.toolCall.status === "executed" ? "success" : step.toolCall.status === "rejected" ? "danger" : step.toolCall.status === "pending_approval" ? "warning" : "neutral"}>
                    {step.toolCall.status === "pending_approval" ? "Pending" : step.toolCall.status}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-fg-muted whitespace-pre-wrap break-words">{step.detail}</p>
              {pending && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" leadingIcon={<Check size={12} />} onClick={() => onDecide(step.id, true)} className="max-md:!h-10">
                    Approve and run
                  </Button>
                  <Button size="sm" variant="secondary" leadingIcon={<X size={12} />} onClick={() => onDecide(step.id, false)} className="max-md:!h-10">
                    Reject
                  </Button>
                </div>
              )}
              {step.type === "final_answer" && openNoteId && onOpenNote && (
                <Button size="sm" variant="subtle" className="mt-2 max-md:!h-10" trailingIcon={<ArrowRight size={11} />} onClick={() => onOpenNote(openNoteId)}>
                  Open generated note
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CopyIcon() {
  return <Copy size={12} />;
}
