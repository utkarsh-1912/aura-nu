import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Workflow, LayoutTemplate, Download, Upload, CheckCircle2, AlertTriangle, XCircle, Save, History, Copy, Trash2 } from "lucide-react";
import { Badge, Button, Dialog, Field, LogoMark, Select, Switch, Textarea } from "../ui";
import FlowNodeView, { type FlowNodeData } from "../components/flow/FlowNodeView";
import NodePalette, { newNode } from "../components/flow/NodePalette";
import NodeInspector from "../components/flow/NodeInspector";
import TestRunPanel from "../components/flow/TestRunPanel";
import { auth } from "../firebase";
import { FlowLibrary, MAX_VERSIONS, type StoredFlow } from "../features/flows/flowLibrary";
import { createFlowRuntime } from "../features/flows/services";
import { localBinding, readLocalNotes } from "../features/flows/localBinding";
import { toNoteRef, type NoteLike } from "../features/flows/workspaceApi";
import { isLiveAi, lazyAiClient } from "../features/flows/useFlowTriggers";
import { autoLayout, hasErrors, parseFlowJson, validateFlow, NODE_PORTS } from "../flow/schema";
import { FLOW_TEMPLATES, cloneTemplateFlow } from "../flow/templates";
import type { FlowGraph, FlowNode, NodeType, NoteRef, PortName, RunRecord, StepRecord } from "../flow/types";

interface Props {
  userEmail: string;
  activeTheme: "light" | "dark";
}

const RF: any = ReactFlow;
const nodeTypes: any = { flowNode: FlowNodeView };

/** Maps React Flow's own CSS variables and chrome onto the app tokens so the canvas follows the theme. */
const FLOW_THEME_CSS = `
.aura-flow {
  --xy-background-color: var(--c-surface);
  --xy-background-pattern-dots-color-default: var(--c-line-strong);
  --xy-edge-stroke-default: var(--c-fg-subtle);
  --xy-edge-label-color-default: var(--c-fg-muted);
  --xy-edge-label-background-color-default: var(--c-surface);
  --xy-minimap-background-color-default: var(--c-panel);
  --xy-minimap-mask-background-color-default: rgba(0, 0, 0, 0.08);
  --xy-controls-button-background-color-default: var(--c-panel);
  --xy-controls-button-background-color-hover-default: var(--c-hover);
  --xy-controls-button-color-default: var(--c-fg-muted);
  --xy-controls-button-color-hover-default: var(--c-fg);
  --xy-controls-button-border-color-default: var(--c-line);
  --xy-handle-background-color-default: var(--c-fg-subtle);
  --xy-handle-border-color-default: var(--c-panel);
  --xy-selection-background-color-default: var(--c-accent-soft);
  --xy-selection-border-default: 1px solid var(--c-accent);
  --xy-connectionline-stroke-default: var(--c-accent);
  background: var(--c-surface);
}
.aura-flow .react-flow__node { font-family: inherit; }
.aura-flow .react-flow__handle { width: 10px; height: 10px; }
.aura-flow .react-flow__controls { box-shadow: var(--c-shadow-sm); border: 1px solid var(--c-line); border-radius: 8px; overflow: hidden; }
.aura-flow .react-flow__controls-button { border-bottom: 1px solid var(--c-line); fill: currentColor; }
.aura-flow .react-flow__controls-button svg { fill: currentColor; }
.aura-flow .react-flow__minimap { border: 1px solid var(--c-line); border-radius: 8px; overflow: hidden; }
.aura-flow .react-flow__minimap-node { fill: var(--c-line-strong); stroke: none; }
.aura-flow .react-flow__edge-textbg { fill: var(--c-surface); }
.aura-flow .react-flow__edge-text { fill: var(--c-fg-muted); }
.aura-flow .react-flow__attribution { background: transparent; color: var(--c-fg-subtle); }
.aura-flow .react-flow__attribution a { color: inherit; }
`;

const SAMPLE: NoteRef = {
  id: "sample-1",
  title: "Weekly product sync",
  content: "Attendees: Ana, Raj\n- [ ] Send the roadmap deck\n- [ ] Book the demo room\nTODO: follow up with finance about invoice #42",
  tags: ["meeting"],
  folder: "Inbox",
};

const LEGACY_KEY = "aura.flow.current.v1";

function openLibrary(email: string): FlowLibrary {
  const lib = new FlowLibrary(localStorage, email);
  if (lib.list().length === 0) {
    let g: FlowGraph | null = null;
    try { const p = parseFlowJson(localStorage.getItem(LEGACY_KEY) ?? ""); g = p.flow ?? null; } catch { /* none */ }
    lib.create(g ?? autoLayout(cloneTemplateFlow(FLOW_TEMPLATES[0].id, `flow_${Date.now().toString(36)}`), true));
  }
  return lib;
}

type Modal = null | "templates" | "json" | "versions" | "delete" | "live";

function Designer({ userEmail, activeTheme }: Props) {
  const dark = activeTheme === "dark";
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const library = useMemo(() => openLibrary(userEmail), [userEmail]);
  const [stored, setStored] = useState<StoredFlow[]>(() => library.list());
  const [activeId, setActiveId] = useState<string>(() => {
    const q = new URLSearchParams(window.location.search).get("flow");
    const list = library.list();
    return list.find((f) => f.id === q)?.id ?? list[0].id;
  });
  const [killed, setKilled] = useState(() => library.isKilled());
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [jsonText, setJsonText] = useState("");
  const [jsonErr, setJsonErr] = useState<string[]>([]);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [steps, setSteps] = useState<StepRecord[]>([]);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [sample, setSample] = useState<NoteRef>(SAMPLE);
  const [sourceId, setSourceId] = useState<string>("sample");
  const [realNotes, setRealNotes] = useState<NoteRef[]>(() => readLocalNotes(localStorage, userEmail).filter((n) => !n.isTrashed).map(toNoteRef));
  const [signedIn, setSignedIn] = useState(isLiveAi());
  const runModes = useRef(new Map<string, "real" | "sandbox">());

  useEffect(() => library.subscribe(() => { setStored(library.list()); setKilled(library.isKilled()); }), [library]);
  useEffect(() => {
    const unsub = (auth as any)?.onAuthStateChanged?.(() => setSignedIn(isLiveAi()));
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, []);
  useEffect(() => {
    const refreshNotes = () => setRealNotes(readLocalNotes(localStorage, userEmail).filter((n) => !n.isTrashed).map(toNoteRef));
    window.addEventListener("storage", refreshNotes);
    window.addEventListener("focus", refreshNotes);
    return () => { window.removeEventListener("storage", refreshNotes); window.removeEventListener("focus", refreshNotes); };
  }, [userEmail]);

  const entry = stored.find((f) => f.id === activeId) ?? stored[0];
  const flow = entry.graph;

  // Two runtimes: the user's real notes (localStorage backup, picked up by sync on next load) and an in-memory sandbox.
  const runtimes = useMemo(() => {
    const ai = lazyAiClient();
    const real = createFlowRuntime({ email: userEmail, storage: localStorage, library, ai, binding: localBinding(localStorage, userEmail) });
    let box: NoteLike[] = [{ ...SAMPLE }];
    const sandbox = createFlowRuntime({
      email: `${userEmail}:sandbox`, storage: localStorage, library, ai, store: real.store,
      binding: { getNotes: () => box, updateNotes: (n) => { box = n; }, getReminders: () => [], updateReminders: () => undefined },
    });
    return { real, sandbox, resetSandbox: (n: NoteRef) => { box = [{ ...n }]; } };
  }, [userEmail, library]);

  const setFlow = useCallback((f: FlowGraph | ((p: FlowGraph) => FlowGraph)) => {
    const cur = library.get(activeId)?.graph;
    if (!cur) return;
    library.saveDraft(activeId, typeof f === "function" ? f(cur) : f);
  }, [library, activeId]);

  const issues = useMemo(() => validateFlow(flow), [flow]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const stepStatus = useMemo(() => {
    const m = new Map<string, FlowNodeData["status"]>();
    for (const s of steps) if (s.nodeType !== "gate") m.set(s.nodeId, s.status === "approved" ? "completed" : (s.status as FlowNodeData["status"]));
    return m;
  }, [steps]);

  const issueNode = (path: string) => {
    const m = /^nodes\[(\d+)\]/.exec(path);
    return m ? flow.nodes[Number(m[1])]?.id : undefined;
  };

  const rfNodes: Node<FlowNodeData>[] = useMemo(() => flow.nodes.map((n) => {
    const mine = issues.filter((i) => issueNode(i.path) === n.id);
    return {
      id: n.id, type: "flowNode", position: n.position ?? { x: 0, y: 0 }, selected: n.id === selected,
      deletable: n.type !== "trigger",
      data: { node: n, errors: mine.filter((i) => i.severity === "error").length, warnings: mine.filter((i) => i.severity === "warning").length, status: stepStatus.get(n.id), dark },
    };
  }), [flow, issues, selected, stepStatus, dark]); // eslint-disable-line react-hooks/exhaustive-deps

  const rfEdges: Edge[] = useMemo(() => flow.edges.map((e) => ({
    id: e.id, source: e.from, target: e.to, sourceHandle: e.port, label: e.port, animated: e.port === "error" ? false : undefined,
    style: { stroke: e.port === "error" ? "var(--c-danger)" : e.port === "false" ? "var(--c-warning)" : "var(--c-success)" },
    labelStyle: { fontSize: 10 },
  })), [flow.edges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setFlow((f) => {
      let next = f;
      for (const c of changes) {
        if (c.type === "position" && c.position) next = { ...next, nodes: next.nodes.map((n) => (n.id === c.id ? { ...n, position: c.position } : n)) };
        else if (c.type === "remove") {
          const n = next.nodes.find((x) => x.id === c.id);
          if (n && n.type !== "trigger") next = { ...next, nodes: next.nodes.filter((x) => x.id !== c.id), edges: next.edges.filter((e) => e.from !== c.id && e.to !== c.id) };
        } else if (c.type === "select" && c.selected) setSelected(c.id);
      }
      return next;
    });
  }, [setFlow]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removed = new Set(changes.filter((c) => c.type === "remove").map((c) => c.id));
    if (removed.size) setFlow((f) => ({ ...f, edges: f.edges.filter((e) => !removed.has(e.id)) }));
  }, [setFlow]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    const port = (c.sourceHandle ?? "ok") as PortName;
    setFlow((f) => {
      if (f.edges.some((e) => e.from === c.source && e.to === c.target && e.port === port)) return f;
      return { ...f, edges: [...f.edges, { id: `e_${Date.now().toString(36)}_${f.edges.length}`, from: c.source!, port, to: c.target! }] };
    });
  }, [setFlow]);

  const uniqueId = (type: string) => {
    let i = 1;
    while (flow.nodes.some((n) => n.id === `${type}${i}`)) i++;
    return `${type}${i}`;
  };

  const addNode = (type: NodeType, position?: { x: number; y: number }) => {
    const pos = position ?? { x: 120 + flow.nodes.length * 30, y: 120 + flow.nodes.length * 30 };
    const node = newNode(type, uniqueId(type), pos);
    setFlow((f) => ({ ...f, nodes: [...f.nodes, node] }));
    setSelected(node.id);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const t = e.dataTransfer.getData("application/aura-flow-node") as NodeType;
    if (t && NODE_PORTS[t]) addNode(t, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const updateNode = (n: FlowNode) => setFlow((f) => ({ ...f, nodes: f.nodes.map((x) => (x.id === n.id ? n : x)) }));
  const deleteNode = (id: string) => { setFlow((f) => ({ ...f, nodes: f.nodes.filter((n) => n.id !== id), edges: f.edges.filter((e) => e.from !== id && e.to !== id) })); setSelected(null); };

  const fit = () => setTimeout(() => rf.fitView({ padding: 0.2 }), 50);
  const switchTo = (id: string) => { setActiveId(id); setSelected(null); setRun(null); setSteps([]); setHistory([]); fit(); };

  const loadTemplate = (id: string) => {
    const created = library.create(autoLayout(cloneTemplateFlow(id, `flow_${Date.now().toString(36)}`), true));
    setModal(null); switchTo(created.id);
  };

  const openJson = () => { setJsonText(JSON.stringify(flow, null, 2)); setJsonErr([]); setModal("json"); };
  const importJson = () => {
    const p = parseFlowJson(jsonText);
    if (!p.flow) { setJsonErr(p.issues.filter((i) => i.severity === "error").map((i) => `${i.path}: ${i.message}`)); return; }
    setFlow(autoLayout({ ...p.flow, id: activeId }));
    setModal(null); setSelected(null); fit();
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(flow, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${flow.name.replace(/\W+/g, "-").toLowerCase() || "flow"}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const refreshHistory = async () => setHistory(await runtimes.real.store.listRuns(activeId));
  useEffect(() => { void refreshHistory(); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async (r: RunRecord) => {
    setRun(r);
    setSteps(await runtimes.real.store.getSteps(r.id));
    await refreshHistory();
  };

  const usingReal = sourceId !== "sample" && realNotes.some((n) => n.id === sourceId);
  const runNote: NoteRef = usingReal ? realNotes.find((n) => n.id === sourceId)! : sample;
  const rtFor = (m: "real" | "sandbox") => (m === "real" ? runtimes.real : runtimes.sandbox);

  const startRun = async (dryRun: boolean) => {
    setModal(null);
    setBusy(true);
    try {
      const mode = usingReal ? "real" : "sandbox";
      if (mode === "sandbox") runtimes.resetSandbox(sample);
      const r = await rtFor(mode).start(flow, { note: runNote, payload: {} }, { dryRun, startedBy: userEmail });
      runModes.current.set(r.id, mode);
      await refresh(r);
    } catch (e) {
      setRun(null); setSteps([]);
      setRunError((e as Error).message);
    } finally { setBusy(false); }
  };
  const doRun = (dryRun: boolean) => { if (!dryRun && usingReal) setModal("live"); else void startRun(dryRun); };

  const doDecide = async (key: string, approved: boolean) => {
    if (!run) return;
    setBusy(true);
    try { await refresh(await rtFor(runModes.current.get(run.id) ?? "real").executorFor(run.flowId).resolveApproval(run.id, key, { approved, by: userEmail })); }
    catch (e) { setRunError((e as Error).message); } finally { setBusy(false); }
  };
  const doCancel = async () => { if (run) await refresh(await rtFor(runModes.current.get(run.id) ?? "real").executorFor(run.flowId).cancel(run.id)); };
  const openRun = async (id: string) => { const r = await runtimes.real.store.getRun(id); if (r) await refresh(r); };
  const sel = flow.nodes.find((n) => n.id === selected) ?? null;
  const trigger = flow.nodes.find((n) => n.type === "trigger");
  const automatic = trigger && trigger.type === "trigger" && trigger.kind !== "manual" && trigger.kind !== "webhook" && trigger.kind !== "note.published";

  return (
    <div className="flex h-screen w-full flex-col bg-surface text-fg">
      <style>{FLOW_THEME_CSS}</style>
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-1.5 sm:px-4">
        <LogoMark size={20} />
        <Workflow size={16} className="text-fg-muted" aria-hidden />
        <div className="flex min-w-0 items-center gap-2">
          <Select aria-label="Workflow" className="h-8 w-36 sm:w-44" value={entry.id} onChange={(e) => switchTo(e.target.value)}>
            {stored.map((f) => <option key={f.id} value={f.id}>{f.graph.name}</option>)}
          </Select>
          <input
            value={flow.name}
            onChange={(e) => setFlow((f) => ({ ...f, name: e.target.value }))}
            className="h-8 w-40 rounded-md border border-transparent bg-transparent px-2 text-[14px] font-semibold text-fg hover:border-line focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 sm:w-56"
            aria-label="Workflow name"
          />
          <span className="hidden whitespace-nowrap text-[12px] text-fg-muted lg:inline">v{flow.version} · {flow.nodes.length} nodes</span>
          {signedIn
            ? <Badge tone="success" className="font-mono text-[10px]"><span title="Runs call the Aura AI API">LIVE AI</span></Badge>
            : <Badge tone="warning" className="font-mono text-[10px]"><span title="Guest session: deterministic stand-in model">MOCK AI</span></Badge>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Switch checked={entry.enabled} onChange={(on) => library.setEnabled(activeId, on)} label={automatic ? "Run automatically" : "Enabled"} disabled={!automatic} />
          <Switch checked={killed} onChange={(on) => library.setKilled(on)} label="Pause all automation" />
          <Badge tone={errorCount ? "danger" : "success"}>
            {errorCount ? <XCircle size={12} aria-hidden /> : <CheckCircle2 size={12} aria-hidden />}
            {errorCount ? `${errorCount} error${errorCount > 1 ? "s" : ""}` : "valid"}
          </Badge>
          <Button className="h-10 sm:h-8" leadingIcon={<Save size={14} />} onClick={() => library.commitVersion(activeId)} disabled={errorCount > 0}>Save version</Button>
          <Button className="h-10 sm:h-8" leadingIcon={<History size={14} />} onClick={() => setModal("versions")}>Versions</Button>
          <Button className="h-10 sm:h-8" leadingIcon={<Copy size={14} />} onClick={() => { const d = library.duplicate(activeId); if (d) switchTo(d.id); }}>Duplicate</Button>
          <Button className="h-10 text-danger sm:h-8" leadingIcon={<Trash2 size={14} />} onClick={() => setModal("delete")} disabled={stored.length < 2}>Delete</Button>
          <Button className="h-10 sm:h-8" leadingIcon={<LayoutTemplate size={14} />} onClick={() => setModal("templates")}>Templates</Button>
          <Button className="h-10 sm:h-8" leadingIcon={<Upload size={14} />} onClick={openJson}>Import / JSON</Button>
          <Button className="h-10 sm:h-8" leadingIcon={<Download size={14} />} onClick={download}>Export</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <NodePalette onAdd={(t) => addNode(t)} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={wrapper} className="relative min-h-[320px] flex-1" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}>
            <RF
              key={activeId}
              className="aura-flow"
              nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
              onNodesChange={onNodesChange as any} onEdgesChange={onEdgesChange as any} onConnect={onConnect}
              onNodeClick={(_: unknown, n: Node) => setSelected(n.id)} onPaneClick={() => setSelected(null)}
              fitView fitViewOptions={{ padding: 0.2 }} deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background gap={20} />
              <Controls />
              <MiniMap pannable zoomable className="hidden sm:block" />
            </RF>
            {issues.length > 0 && (
              <div className="absolute bottom-3 left-3 right-3 max-h-40 max-w-md overflow-y-auto rounded-lg border border-line bg-raised p-1.5 text-[12px] shadow-pop sm:right-auto">
                {issues.map((i, k) => (
                  <button
                    key={k}
                    type="button"
                    className="flex min-h-8 w-full items-start gap-1.5 rounded px-1.5 py-1 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => { const id = issueNode(i.path); if (id) setSelected(id); }}
                  >
                    {i.severity === "error" ? <XCircle size={13} className="mt-0.5 shrink-0 text-danger" aria-label="Error" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-label="Warning" />}
                    <span className="text-fg-muted"><span className="font-mono text-fg-subtle">{i.path}</span> {i.message}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <TestRunPanel run={run} steps={steps} history={history} busy={busy || hasErrors(issues)} sampleNote={usingReal ? runNote : sample}
            aiMode={signedIn ? "live" : "mock"} notes={realNotes} sourceId={usingReal ? sourceId : "sample"} onSource={setSourceId}
            onSampleChange={setSample} onRun={doRun} onCancel={doCancel} onDecide={doDecide} onOpenRun={openRun} />
        </div>
        {sel && (
          <NodeInspector node={sel} allowedTools={flow.policy.allowedTools}
            issues={issues.filter((i) => issueNode(i.path) === sel.id)} onChange={updateNode} onDelete={() => deleteNode(sel.id)} />
        )}
      </div>

      <Dialog open={modal === "templates"} onClose={() => setModal(null)} title="Template gallery" description="A template is added as a new workflow." size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          {FLOW_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => loadTemplate(t.id)}
              className="rounded-lg border border-line bg-panel p-4 text-left transition-colors hover:border-accent hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="text-[14px] font-medium text-fg">{t.title}</div>
              <p className="mt-1 text-[12px] text-fg-muted">{t.description}</p>
              <div className="mt-2 font-mono text-[11px] text-fg-subtle">{t.flow.nodes.length} nodes</div>
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={modal === "json"}
        onClose={() => setModal(null)}
        title="Workflow JSON"
        size="lg"
        footer={<Button variant="primary" onClick={importJson}>Validate and import</Button>}
      >
        <Field label="Flow definition" error={jsonErr.length ? jsonErr.slice(0, 10).join("\n") : undefined}>
          {(p) => <Textarea {...p} value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={16} spellCheck={false} className="font-mono text-[12px]" />}
        </Field>
      </Dialog>

      <Dialog open={modal === "versions"} onClose={() => setModal(null)} title="Version history" description={`Current working copy is v${flow.version}. The last ${MAX_VERSIONS} saved versions are kept. Restoring creates a new version.`} size="md">
        {entry.versions.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No saved versions yet. Use "Save version" to snapshot this workflow.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...entry.versions].reverse().map((v) => (
              <li key={`${v.version}-${v.savedAt}`} className="flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-2 text-[13px]">
                <span className="font-mono text-fg">v{v.version}</span>
                <span className="min-w-0 flex-1 truncate text-fg-muted">{v.label ?? v.graph.name} · {new Date(v.savedAt).toLocaleString()} · {v.graph.nodes.length} nodes</span>
                <Button size="sm" onClick={() => { library.restore(activeId, v.version); setModal(null); fit(); }}>Restore</Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <Dialog
        open={modal === "delete"}
        onClose={() => setModal(null)}
        title="Delete workflow?"
        description={`"${flow.name}" and its saved versions will be removed from this device. Run history is kept.`}
        size="sm"
        footer={<Button variant="danger" onClick={() => { const rest = stored.filter((f) => f.id !== activeId); library.remove(activeId); setModal(null); switchTo(rest[0].id); }}>Delete workflow</Button>}
      >
        <p className="text-[13px] text-fg-muted">This cannot be undone.</p>
      </Dialog>

      <Dialog
        open={modal === "live"}
        onClose={() => setModal(null)}
        title="Run on your real note?"
        description={`This run can edit, tag, move or create notes and reminders in your workspace. Use a dry run first to preview the changes.`}
        size="sm"
        footer={<Button variant="primary" onClick={() => void startRun(false)}>Run and write changes</Button>}
      >
        <p className="text-[13px] text-fg-muted">Note: {runNote.title || "Untitled"}. {signedIn ? "AI steps call the Aura AI API." : "AI steps use the MOCK model (guest)."}</p>
      </Dialog>

      <Dialog
        open={!!runError}
        onClose={() => setRunError(null)}
        title="Run could not start"
        size="sm"
        footer={<Button variant="primary" onClick={() => setRunError(null)}>OK</Button>}
      >
        <p role="alert" className="text-[13px] text-danger">{runError}</p>
      </Dialog>
    </div>
  );
}

export default function WorkflowStudioPage(props: Props) {
  return (
    <ReactFlowProvider>
      <Designer {...props} />
    </ReactFlowProvider>
  );
}
