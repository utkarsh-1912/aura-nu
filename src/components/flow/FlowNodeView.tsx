import React from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Zap, Wrench, Sparkles, Bot, GitBranch, Repeat, ShieldCheck, Workflow, Users, Scale } from "lucide-react";
import type { FlowNode, NodeType, PortName } from "../../flow/types";
import { NODE_PORTS } from "../../flow/schema";
import { cn } from "../../ui";

/** `tone` is a token class pair for the node icon chip; `dot` is a token background for small indicators. */
export const NODE_META: Record<NodeType, { label: string; tone: string; dot: string; Icon: React.ComponentType<{ size?: number }> }> = {
  trigger: { label: "Trigger", tone: "bg-success-soft text-success", dot: "bg-success", Icon: Zap },
  action: { label: "Action", tone: "bg-hover text-fg-muted", dot: "bg-fg-muted", Icon: Wrench },
  ai: { label: "AI step", tone: "bg-accent-soft text-accent", dot: "bg-accent", Icon: Sparkles },
  agent: { label: "Agent", tone: "bg-accent-soft text-accent", dot: "bg-accent", Icon: Bot },
  branch: { label: "Branch", tone: "bg-warning-soft text-warning", dot: "bg-warning", Icon: GitBranch },
  loop: { label: "Loop", tone: "bg-warning-soft text-warning", dot: "bg-warning", Icon: Repeat },
  approval: { label: "Approval", tone: "bg-danger-soft text-danger", dot: "bg-danger", Icon: ShieldCheck },
  subflow: { label: "Subflow", tone: "bg-hover text-fg-muted", dot: "bg-fg-muted", Icon: Workflow },
  supervisor: { label: "Supervisor", tone: "bg-accent-soft text-accent", dot: "bg-accent", Icon: Users },
  critic: { label: "Critic", tone: "bg-warning-soft text-warning", dot: "bg-warning", Icon: Scale },
};

export interface FlowNodeData extends Record<string, unknown> {
  node: FlowNode;
  errors: number;
  warnings: number;
  status?: "completed" | "failed" | "waiting" | "started";
  dark: boolean;
}

export function summarize(n: FlowNode): string {
  switch (n.type) {
    case "trigger": return n.kind;
    case "action": return n.tool;
    case "ai": return `${n.task}${n.model ? ` · ${n.model}` : ""}`;
    case "agent": return `${n.mode} · ${n.tools.length} tools`;
    case "branch": return n.when;
    case "loop": return `for each ${n.over}`;
    case "approval": return `role: ${n.role}`;
    case "subflow": return n.flowId;
    case "supervisor": return `${n.maxWorkers} workers max · x${n.concurrency}`;
    case "critic": return "approve / reject";
  }
}

/** Port colors resolve through theme tokens so the canvas follows light/dark. */
export const PORT_COLOR: Record<PortName, string> = {
  ok: "var(--c-success)",
  error: "var(--c-danger)",
  true: "var(--c-success)",
  false: "var(--c-warning)",
};

const STATUS_LABEL: Record<string, string> = { completed: "Completed", failed: "Failed", waiting: "Waiting", started: "Running" };

export default function FlowNodeView({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const { node, errors, warnings, status } = data;
  const meta = NODE_META[node.type];
  const ports = NODE_PORTS[node.type];
  const ring = errors ? "ring-2 ring-danger" : selected ? "ring-2 ring-accent" : warnings ? "ring-2 ring-warning" : "";
  const statusDot = status === "completed" ? "bg-success" : status === "failed" ? "bg-danger" : status === "waiting" ? "bg-warning" : status ? "bg-accent" : "";
  return (
    <div className={cn("relative w-56 rounded-lg border border-line bg-panel text-fg shadow-soft", ring)}>
      {node.type !== "trigger" && <Handle type="target" position={Position.Left} aria-label="Input" />}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", meta.tone)}>
          <meta.Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">{meta.label}</div>
          <div className="truncate text-[12px] font-medium">{node.label || node.id}</div>
        </div>
        {statusDot && <span role="img" aria-label={STATUS_LABEL[status as string]} className={cn("h-2 w-2 rounded-full", statusDot)} />}
        {errors > 0 && <span className="sr-only">{errors} errors</span>}
      </div>
      <div className="truncate px-3 py-2 pr-10 font-mono text-[11px] text-fg-muted">{summarize(node)}</div>
      {ports.map((p, i) => (
        <Handle
          key={p}
          id={p}
          type="source"
          position={Position.Right}
          aria-label={`Output ${p}`}
          style={{ top: `${((i + 1) * 100) / (ports.length + 1)}%`, background: PORT_COLOR[p] }}
        >
          <span className="pointer-events-none absolute -top-2 right-3 font-mono text-[9px]" style={{ color: PORT_COLOR[p] }}>{p}</span>
        </Handle>
      ))}
    </div>
  );
}
