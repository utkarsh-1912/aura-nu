import React, { useState } from "react";
import { Play, Square, Check, X, ChevronDown, ChevronRight, History, Clock } from "lucide-react";
import type { NoteRef, RunRecord, StepRecord } from "../../flow/types";
import { Badge, Button, Checkbox, EmptyState, Field, Input, Segmented, Select, Textarea, cn } from "../../ui";
import type { BadgeTone } from "../../ui";

interface Props {
  dark?: boolean;
  run: RunRecord | null;
  steps: StepRecord[];
  history: RunRecord[];
  busy: boolean;
  sampleNote: NoteRef;
  onSampleChange: (n: NoteRef) => void;
  onRun: (dryRun: boolean) => void;
  onCancel: () => void;
  onDecide: (stepKey: string, approved: boolean) => void;
  onOpenRun: (id: string) => void;
  /** "mock" = stand-in model (guests); "live" = real AI API. Default mock. */
  aiMode?: "mock" | "live";
  /** Real notes the run can target; when given a source picker is shown. */
  notes?: NoteRef[];
  sourceId?: string;
  onSource?: (id: string) => void;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  completed: "success", approved: "success", failed: "danger", rejected: "danger",
  waiting: "warning", started: "accent", paused_approval: "warning", running: "accent",
  cancelled: "neutral", budget_exceeded: "danger",
};

const json = (v: unknown) => {
  const s = JSON.stringify(v, null, 2) ?? "undefined";
  return s.length > 4000 ? `${s.slice(0, 4000)}\n… (truncated)` : s;
};

export default function TestRunPanel(p: Props) {
  const [dry, setDry] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"run" | "history">("run");
  const diffs = p.steps.flatMap((s) => (s.diffs ?? []).map((d) => ({ ...d, step: s.nodeId })));
  const canCancel = p.run && (p.run.status === "running" || p.run.status === "paused_approval");

  return (
    <section aria-label="Test run" className="flex max-h-[60vh] shrink-0 flex-col border-t border-line bg-sidebar md:h-80 md:flex-row">
      <div className="flex shrink-0 flex-col gap-2 overflow-y-auto border-b border-line p-3 md:w-72 md:border-b-0 md:border-r">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <h2 className="text-[13px] font-medium text-fg">Test run</h2>
          {p.aiMode === "live"
            ? <Badge tone="success" className="font-mono text-[10px]"><span title="Calls the Aura AI API">LIVE AI</span></Badge>
            : <Badge tone="warning" className="font-mono text-[10px]"><span title="Deterministic stand-in model; sign in to use the real AI">MOCK AI</span></Badge>}
        </div>
        {p.notes && (
          <Field label="Run on" hint={p.sourceId && p.sourceId !== "sample" ? "A real note. Live runs write to your notes." : "Sandbox sample: nothing real is touched."}>
            {(f) => (
              <Select {...f} value={p.sourceId ?? "sample"} onChange={(e) => p.onSource?.(e.target.value)}>
                <option value="sample">Sample note (sandbox)</option>
                {p.notes!.map((n) => <option key={n.id} value={n.id}>{n.title || "Untitled"}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="Sample note title">
          {(f) => <Input {...f} size="sm" readOnly={!!p.sourceId && p.sourceId !== "sample"} value={p.sampleNote.title} onChange={(e) => p.onSampleChange({ ...p.sampleNote, title: e.target.value })} placeholder="Sample note title" />}
        </Field>
        <Field label="Sample note content">
          {(f) => <Textarea {...f} readOnly={!!p.sourceId && p.sourceId !== "sample"} className="font-mono text-[12px]" rows={4} value={p.sampleNote.content} onChange={(e) => p.onSampleChange({ ...p.sampleNote, content: e.target.value })} />}
        </Field>
        <Field label="Tags">
          {(f) => <Input {...f} size="sm" value={p.sampleNote.tags.join(", ")} onChange={(e) => p.onSampleChange({ ...p.sampleNote, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} placeholder="tags, comma separated" />}
        </Field>
        <Checkbox checked={dry} onChange={setDry} label="Dry run (propose diffs, write nothing)" />
        <div className="flex gap-2">
          <Button variant="primary" className="h-10 flex-1 sm:h-8" loading={p.busy} disabled={p.busy} onClick={() => p.onRun(dry)} leadingIcon={<Play size={13} />}>Run</Button>
          {canCancel && <Button variant="secondary" className="h-10 text-danger sm:h-8" onClick={p.onCancel} leadingIcon={<Square size={12} />}>Cancel</Button>}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
          <Segmented<"run" | "history">
            size="sm"
            value={tab}
            onChange={setTab}
            items={[
              { id: "run", label: "Steps" },
              { id: "history", label: `History (${p.history.length})`, icon: <History size={12} /> },
            ]}
          />
          {p.run && (
            <span className="ml-auto flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-fg-muted">
              <Badge tone={STATUS_TONE[p.run.status] ?? "neutral"}>{p.run.status}</Badge>
              {p.run.dryRun ? "dry-run · " : ""}{p.run.usage.steps} steps · {p.run.usage.tokens} tokens{p.aiMode === "live" ? "" : " (mock)"} · {Math.round(p.run.usage.activeMs)}ms
            </span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {tab === "history" && (p.history.length === 0 ? (
            <EmptyState icon={<History size={18} />} title="No runs yet" description="Run the flow to see its history here." className="py-6" />
          ) : p.history.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { p.onOpenRun(r.id); setTab("run"); }}
              className="flex min-h-10 items-center gap-3 rounded-md border border-line bg-panel px-3 py-2 text-left text-[12px] transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
              <span className="min-w-0 flex-1 truncate text-fg">{r.graph.name}{r.dryRun ? " · dry-run" : ""}</span>
              <span className="flex items-center gap-1 font-mono text-fg-subtle"><Clock size={11} aria-hidden />{new Date(r.startedAt).toLocaleTimeString()}</span>
            </button>
          )))}
          {tab === "run" && !p.run && (
            <EmptyState icon={<Play size={18} />} title="No run yet" description="Run the flow on the sample note to see each node's input and output here." className="py-6" />
          )}
          {tab === "run" && p.run?.error && <div role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">{p.run.error}</div>}
          {tab === "run" && diffs.length > 0 && (
            <div className="rounded-md border border-line bg-panel p-2">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted">Proposed changes (dry-run, nothing written)</div>
              {diffs.map((d, i) => (
                <div key={i} className="mb-1 font-mono text-[11px] text-fg"><span className="text-accent">{d.step}</span> {d.kind} → {d.target}
                  <pre className="whitespace-pre-wrap text-fg-muted">{d.before !== undefined ? `- ${JSON.stringify(d.before)}\n` : ""}+ {JSON.stringify(d.after)}</pre>
                </div>
              ))}
            </div>
          )}
          {tab === "run" && p.steps.map((s) => (
            <div key={s.key} className="rounded-md border border-line bg-panel">
              <button
                type="button"
                aria-expanded={!!open[s.key]}
                onClick={() => setOpen({ ...open, [s.key]: !open[s.key] })}
                className="flex min-h-10 w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent md:min-h-8"
              >
                {open[s.key] ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
                <span className="truncate font-medium text-fg">{s.title}</span>
                <span className="hidden truncate font-mono text-fg-subtle sm:inline">{s.key}</span>
                {s.tainted && <Badge tone="warning">untrusted input</Badge>}
                <span className="ml-auto flex items-center gap-1">
                  <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status}{s.attempts > 1 ? ` ×${s.attempts}` : ""}</Badge>
                </span>
              </button>
              {s.status === "waiting" && s.approval && (
                <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-[12px]">
                  <span className="min-w-0 flex-1 text-fg-muted">{s.approval.reason} (role: {s.approval.role})</span>
                  <Button size="sm" variant="primary" className="h-10 sm:h-7" leadingIcon={<Check size={12} />} onClick={() => p.onDecide(s.key, true)}>Approve</Button>
                  <Button size="sm" variant="danger" className="h-10 sm:h-7" leadingIcon={<X size={12} />} onClick={() => p.onDecide(s.key, false)}>Reject</Button>
                </div>
              )}
              {open[s.key] && (
                <div className={cn("grid grid-cols-1 gap-2 px-3 pb-2 sm:grid-cols-2")}>
                  <div><div className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">Input</div><pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-fg">{json(s.input)}</pre></div>
                  <div><div className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">{s.error ? "Error" : "Output"}</div><pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-fg">{s.error ?? json(s.output)}</pre></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
