import React, { useEffect, useState } from "react";
import { Trash2, XCircle, AlertTriangle } from "lucide-react";
import type { FlowNode, ToolName, ValidationIssue, AgentMode, AiTask, TriggerKind } from "../../flow/types";
import { TOOL_NAMES } from "../../flow/types";
import { NODE_META } from "./FlowNodeView";
import { Button, Field, Input, Select, Textarea, cn } from "../../ui";

const TRIGGERS: TriggerKind[] = ["manual", "note.created", "note.updated", "note.tagged", "note.published", "schedule", "webhook", "folder.changed"];
const TASKS: AiTask[] = ["summarize", "extract", "classify", "rewrite", "embed", "custom"];
const MODES: AgentMode[] = ["act", "approve_writes", "propose_only"];

interface Props {
  node: FlowNode;
  issues: ValidationIssue[];
  dark?: boolean;
  allowedTools: ToolName[];
  onChange: (n: FlowNode) => void;
  onDelete: () => void;
}

function JsonField({ label, value, onCommit }: { label: string; value: unknown; onCommit: (v: any) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [err, setErr] = useState<string | undefined>(undefined);
  useEffect(() => setText(JSON.stringify(value ?? {}, null, 2)), [value]);
  return (
    <Field label={label} error={err}>
      {(p) => (
        <Textarea
          {...p}
          value={text}
          rows={6}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            try { onCommit(JSON.parse(text)); setErr(undefined); } catch (e) { setErr((e as Error).message); }
          }}
          className="font-mono text-[11px]"
        />
      )}
    </Field>
  );
}

export default function NodeInspector({ node, issues, allowedTools, onChange, onDelete }: Props) {
  const set = (patch: Record<string, unknown>) => onChange({ ...node, ...patch } as FlowNode);
  const meta = NODE_META[node.type];
  return (
    <aside
      aria-label={`${meta.label} settings`}
      className="flex max-h-[50vh] w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-line bg-sidebar p-4 md:max-h-none md:w-80 md:border-l md:border-t-0"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-medium text-fg">
          <span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden />
          {meta.label}
        </div>
        {node.type !== "trigger" && (
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" leadingIcon={<Trash2 size={13} />} onClick={onDelete} aria-label={`Delete node ${node.id}`}>
            Delete
          </Button>
        )}
      </div>
      <div className="font-mono text-[11px] text-fg-subtle">id: {node.id}</div>
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Validation issues">
          {issues.map((x, k) => (
            <li key={k} className={cn("flex gap-1.5 rounded-md px-2 py-1 text-[12px]", x.severity === "error" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
              {x.severity === "error" ? <XCircle size={13} className="mt-0.5 shrink-0" aria-label="Error" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-label="Warning" />}
              <span><span className="font-mono">{x.path}</span> {x.message}</span>
            </li>
          ))}
        </ul>
      )}
      <Field label="Label">{(p) => <Input {...p} value={node.label ?? ""} onChange={(e) => set({ label: e.target.value })} />}</Field>

      {node.type === "trigger" && (
        <Field label="Kind">
          {(p) => <Select {...p} value={node.kind} onChange={(e) => set({ kind: e.target.value })}>{TRIGGERS.map((t) => <option key={t}>{t}</option>)}</Select>}
        </Field>
      )}
      {node.type === "action" && (
        <>
          <Field label="Tool">
            {(p) => (
              <Select {...p} value={node.tool} onChange={(e) => set({ tool: e.target.value })}>
                {TOOL_NAMES.map((t) => <option key={t} value={t}>{t}{allowedTools.includes(t) ? "" : " (not allowed)"}</option>)}
              </Select>
            )}
          </Field>
          <JsonField label="Args (strings are {{ templates }})" value={node.args} onCommit={(v) => set({ args: v })} />
        </>
      )}
      {node.type === "ai" && (
        <>
          <Field label="Task">{(p) => <Select {...p} value={node.task} onChange={(e) => set({ task: e.target.value })}>{TASKS.map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
          <Field label="Model (optional)">{(p) => <Input {...p} value={node.model ?? ""} onChange={(e) => set({ model: e.target.value || undefined })} />}</Field>
          <Field label="Prompt template">{(p) => <Textarea {...p} rows={6} value={node.prompt} onChange={(e) => set({ prompt: e.target.value })} />}</Field>
          <JsonField label="Output JSON schema (optional)" value={node.schema ?? {}} onCommit={(v) => set({ schema: Object.keys(v).length ? v : undefined })} />
        </>
      )}
      {node.type === "agent" && (
        <>
          <Field label="Agent id">{(p) => <Input {...p} value={node.agentId} onChange={(e) => set({ agentId: e.target.value })} />}</Field>
          <Field label="Goal template">{(p) => <Textarea {...p} rows={3} value={node.goal} onChange={(e) => set({ goal: e.target.value })} />}</Field>
          <Field label="Instructions">{(p) => <Textarea {...p} rows={3} value={node.instructions ?? ""} onChange={(e) => set({ instructions: e.target.value || undefined })} />}</Field>
          <Field label="Max steps">{(p) => <Input {...p} type="number" min={1} max={50} value={node.maxSteps} onChange={(e) => set({ maxSteps: Number(e.target.value) })} />}</Field>
          <Field label="Mode">{(p) => <Select {...p} value={node.mode} onChange={(e) => set({ mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</Select>}</Field>
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-fg-muted" id="agent-tools-label">Tools</div>
            <div role="group" aria-labelledby="agent-tools-label" className="flex flex-wrap gap-1.5">
              {TOOL_NAMES.map((t) => {
                const on = node.tools.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ tools: on ? node.tools.filter((x) => x !== t) : [...node.tools, t] })}
                    className={cn(
                      "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      on ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-muted hover:bg-hover hover:text-fg",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      {node.type === "branch" && <Field label="When (expression)">{(p) => <Textarea {...p} rows={3} className="font-mono" value={node.when} onChange={(e) => set({ when: e.target.value })} />}</Field>}
      {node.type === "loop" && (
        <>
          <Field label="Over (expression returning a list)">{(p) => <Textarea {...p} rows={2} className="font-mono" value={node.over} onChange={(e) => set({ over: e.target.value })} />}</Field>
          <Field label="Max iterations">{(p) => <Input {...p} type="number" min={1} value={node.maxIterations ?? ""} onChange={(e) => set({ maxIterations: e.target.value ? Number(e.target.value) : undefined })} />}</Field>
          <p className="text-[12px] text-fg-subtle">Connect the 'true' port to the loop body and loop the last body node back into this node. 'ok' continues after the loop. Inside: item, index.</p>
        </>
      )}
      {node.type === "approval" && (
        <>
          <Field label="Role">{(p) => <Input {...p} value={node.role} onChange={(e) => set({ role: e.target.value })} />}</Field>
          <Field label="Timeout (ms)">{(p) => <Input {...p} type="number" value={node.timeoutMs} onChange={(e) => set({ timeoutMs: Number(e.target.value) })} />}</Field>
          <Field label="Message template">{(p) => <Textarea {...p} rows={2} value={node.message ?? ""} onChange={(e) => set({ message: e.target.value || undefined })} />}</Field>
          <p className="text-[12px] text-fg-subtle">'ok' = approved. 'error' = rejected or timed out.</p>
        </>
      )}
      {node.type === "critic" && (
        <>
          <Field label="Criteria template">{(p) => <Textarea {...p} rows={4} value={node.criteria} onChange={(e) => set({ criteria: e.target.value })} />}</Field>
          <Field label="Subject template (content to review)">{(p) => <Textarea {...p} rows={3} value={node.subject} onChange={(e) => set({ subject: e.target.value })} />}</Field>
          <p className="text-[12px] text-fg-subtle">'true' = approved, 'false' = rejected. With "critic before writes" on, writes must sit behind 'true'.</p>
        </>
      )}
      {node.type === "supervisor" && (
        <>
          <Field label="Goal (used for synthesis)">{(p) => <Textarea {...p} rows={2} value={node.goal} onChange={(e) => set({ goal: e.target.value })} />}</Field>
          <Field label="Fan out over (expression returning a list)">{(p) => <Textarea {...p} rows={2} className="font-mono" value={node.fanOut} onChange={(e) => set({ fanOut: e.target.value })} />}</Field>
          <Field label="Worker goal template (item, index)">{(p) => <Textarea {...p} rows={3} value={node.workerGoal} onChange={(e) => set({ workerGoal: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max workers">{(p) => <Input {...p} type="number" min={1} max={50} value={node.maxWorkers} onChange={(e) => set({ maxWorkers: Number(e.target.value) })} />}</Field>
            <Field label="Concurrency">{(p) => <Input {...p} type="number" min={1} max={8} value={node.concurrency} onChange={(e) => set({ concurrency: Number(e.target.value) })} />}</Field>
          </div>
          <Field label="Worker mode">{(p) => <Select {...p} value={node.workerMode} onChange={(e) => set({ workerMode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</Select>}</Field>
          <Field label="Worker tools (comma separated)">{(p) => <Input {...p} value={node.workerTools.join(", ")} onChange={(e) => set({ workerTools: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />}</Field>
        </>
      )}
      {node.type === "subflow" && <Field label="Flow id">{(p) => <Input {...p} value={node.flowId} onChange={(e) => set({ flowId: e.target.value })} />}</Field>}

      {node.type !== "trigger" && node.type !== "branch" && node.type !== "approval" && node.type !== "loop" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Retry attempts">
            {(p) => (
              <Input {...p} type="number" min={1} max={10} value={node.retry?.maxAttempts ?? ""} placeholder="default"
                onChange={(e) => set({ retry: e.target.value ? { maxAttempts: Number(e.target.value), baseDelayMs: node.retry?.baseDelayMs ?? 500 } : undefined })} />
            )}
          </Field>
          <Field label="Backoff base ms">
            {(p) => (
              <Input {...p} type="number" min={0} value={node.retry?.baseDelayMs ?? ""} placeholder="500"
                onChange={(e) => set({ retry: { maxAttempts: node.retry?.maxAttempts ?? 3, baseDelayMs: Number(e.target.value) } })} />
            )}
          </Field>
        </div>
      )}
    </aside>
  );
}
