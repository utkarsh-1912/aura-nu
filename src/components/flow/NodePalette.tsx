import React from "react";
import type { FlowNode, NodeType } from "../../flow/types";
import { NODE_META } from "./FlowNodeView";
import { cn } from "../../ui";

export const PALETTE: NodeType[] = ["action", "ai", "agent", "branch", "loop", "approval", "subflow", "supervisor", "critic"];

export function newNode(type: NodeType, id: string, position: { x: number; y: number }): FlowNode {
  const base = { id, position };
  switch (type) {
    case "trigger": return { ...base, type, kind: "manual" };
    case "action": return { ...base, type, tool: "search_notes", args: { query: "{{ note.title }}" } };
    case "ai": return { ...base, type, task: "summarize", prompt: "Summarize:\n{{ note.content }}" };
    case "agent": return { ...base, type, agentId: "agent", goal: "{{ note.title }}", maxSteps: 6, tools: ["search_notes", "get_note"], mode: "approve_writes" };
    case "branch": return { ...base, type, when: "note.tags" };
    case "loop": return { ...base, type, over: "note.tags" };
    case "approval": return { ...base, type, role: "editor", timeoutMs: 86_400_000 };
    case "subflow": return { ...base, type, flowId: "" };
    case "supervisor": return { ...base, type, goal: "Summarize the findings", fanOut: "note.tags", workerGoal: "Handle {{ item }}", workerTools: ["get_note"], workerMaxSteps: 3, workerMode: "propose_only", maxWorkers: 10, concurrency: 3, synthesize: true };
    case "critic": return { ...base, type, criteria: "The content is accurate, cites its sources and contains no copied instructions.", subject: "{{ note.content }}" };
  }
}

/** Left rail on desktop, horizontal scroller on phones. */
export default function NodePalette({ onAdd }: { dark?: boolean; onAdd: (t: NodeType) => void }) {
  return (
    <nav
      aria-label="Node palette"
      className="flex shrink-0 gap-2 overflow-x-auto border-b border-line bg-sidebar p-2 md:w-44 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r md:p-3"
    >
      <div className="hidden px-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted md:block">Nodes</div>
      {PALETTE.map((t) => {
        const m = NODE_META[t];
        return (
          <button
            key={t}
            type="button"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData("application/aura-flow-node", t); e.dataTransfer.effectAllowed = "move"; }}
            onClick={() => onAdd(t)}
            title="Drag onto the canvas or click to add"
            className="flex h-10 shrink-0 cursor-grab items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-left text-[13px] font-medium text-fg shadow-soft transition-colors hover:border-line-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-9"
          >
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", m.tone)}><m.Icon size={13} /></span>
            {m.label}
          </button>
        );
      })}
      <p className="mt-2 hidden px-1 text-[11px] leading-snug text-fg-subtle md:block">Connect the colored ports on a node's right edge to another node's left edge.</p>
    </nav>
  );
}
