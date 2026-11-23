import { apiFetch } from "../lib/apiClient";
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Bot,
  Plus,
  Play,
  Shield,
  Wrench,
  ArrowLeft,
  Building2,
  Terminal,
  Trash2,
  Sliders,
  Activity,
  FileText,
  Cpu,
  ChevronDown,
  ChevronUp,
  Check,
  BookOpen,
  FolderTree,
  CheckSquare,
  ShieldAlert,
  WifiOff,
  Workflow,
} from "lucide-react";
import {
  AgentDefinition,
  AgentAutonomyLevel,
  AgentTriggerType,
  AgentToolName,
  AgentToolCall,
  AgentExecutionStep,
  AgentRun,
  Note,
} from "../types";
import {
  loadEnterpriseAgents,
  saveEnterpriseAgents,
  loadAgentRuns,
  saveAgentRun,
  buildDeterministicAgentPlan,
  executeSingleToolCall,
  AGENT_TOOL_METADATA,
} from "../lib/agentTools";
import { INITIAL_NOTES } from "../data";
import { agentToFlow } from "../flow/schema";
import { FlowLibrary } from "../features/flows/flowLibrary";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  LogoMark,
  Panel,
  Select,
  Skeleton,
  Switch,
  Tabs,
  Textarea,
  ToastViewport,
  cn,
} from "../ui";
import type { BadgeTone, ToastItem } from "../ui";

interface AgentStudioPageProps {
  userEmail: string;
  activeTheme: "light" | "dark";
}

const ALL_TOOLS: AgentToolName[] = [
  "search_workspace_notes",
  "create_structured_note",
  "update_existing_note",
  "organize_notes_into_folders",
  "create_workspace_reminders",
  "run_compliance_audit",
];

type Section = "fleet" | "telemetry" | "builder";

const RUN_TONE: Record<AgentRun["status"], BadgeTone> = {
  completed: "success",
  awaiting_approval: "warning",
  running: "accent",
  failed: "danger",
  rejected: "danger",
};

const STEP_LABEL: Record<AgentExecutionStep["type"], string> = {
  thought: "Thought",
  tool_call: "Tool call",
  observation: "Observation",
  approval_gate: "Approval gate",
  final_answer: "Result",
};

/** Built-in agents store a lucide icon name; custom agents store an emoji. */
const ICON_BY_NAME: Record<string, React.ReactNode> = {
  BookOpen: <BookOpen size={18} />,
  FolderTree: <FolderTree size={18} />,
  CheckSquare: <CheckSquare size={18} />,
  ShieldAlert: <ShieldAlert size={18} />,
};

function AgentGlyph({ icon, size = 36 }: { icon: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[18px] text-accent"
    >
      {ICON_BY_NAME[icon] ?? icon ?? <Bot size={18} />}
    </span>
  );
}

const TOUCH = "h-10 w-10 sm:h-8 sm:w-8";

export default function AgentStudioPage({ userEmail }: AgentStudioPageProps) {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const effectiveOrgId = orgId || "org-aura-main";

  const [agents, setAgents] = useState<AgentDefinition[]>(() => loadEnterpriseAgents());
  const [runs, setRuns] = useState<AgentRun[]>(() => loadAgentRuns());
  const [activeSection, setActiveSection] = useState<Section>("fleet");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [syncState, setSyncState] = useState<"loading" | "ok" | "offline">("loading");

  // Custom Agent Builder state
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newIcon, setNewIcon] = useState("🤖");
  const [newColor] = useState("#6366f1"); // stored on the agent record; not shown in the UI
  const [newDescription, setNewDescription] = useState("");
  const [newSystemPrompt, setNewSystemPrompt] = useState(
    "You are an enterprise autonomous agent operating inside Aura Next. Analyze workspace notes rigorously and produce structured executive outputs."
  );
  const [newAutonomy, setNewAutonomy] = useState<AgentAutonomyLevel>("require_approval");
  const [newTrigger] = useState<AgentTriggerType>("manual");
  const [newTools, setNewTools] = useState<AgentToolName[]>([
    "search_workspace_notes",
    "create_structured_note",
  ]);

  const showToast = (msg: string) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, text: msg, type: "success" }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  };

  const loadRemoteRuns = () => {
    setSyncState("loading");
    apiFetch(`/api/agents/runs?orgId=${effectiveOrgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.runs) && data.runs.length > 0) {
          const local = loadAgentRuns();
          const mergedMap = new Map<string, AgentRun>();
          [...data.runs, ...local].forEach((r) => mergedMap.set(r.id, r));
          const merged = Array.from(mergedMap.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setRuns(merged);
        }
        setSyncState("ok");
      })
      .catch(() => setSyncState("offline"));
  };

  useEffect(() => {
    loadRemoteRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOrgId]);

  const handleToggleAgent = (id: string) => {
    const updated = agents.map((a) =>
      a.id === id ? { ...a, isEnabled: !a.isEnabled } : a
    );
    setAgents(updated);
    saveEnterpriseAgents(updated);
    showToast("Updated agent activation state");
  };

  const handleChangeAutonomy = (id: string, level: AgentAutonomyLevel) => {
    const updated = agents.map((a) =>
      a.id === id ? { ...a, autonomyLevel: level } : a
    );
    setAgents(updated);
    saveEnterpriseAgents(updated);
    showToast(`Updated autonomy policy to ${level.replace("_", " ")}`);
  };

  const handleChangeTrigger = (id: string, trigger: AgentTriggerType) => {
    const updated = agents.map((a) =>
      a.id === id ? { ...a, trigger } : a
    );
    setAgents(updated);
    saveEnterpriseAgents(updated);
    showToast(`Updated agent trigger to ${trigger}`);
  };

  const handleConvertToWorkflow = (agent: AgentDefinition) => {
    try {
      const lib = new FlowLibrary(localStorage, userEmail);
      const graph = agentToFlow({ ...agent, allowedTools: agent.allowedTools as readonly string[] });
      graph.name = `${agent.name} (workflow)`;
      const created = lib.create(graph);
      showToast(`Created workflow "${created.graph.name}"`);
      navigate(`/org/${effectiveOrgId}/workflows?flow=${encodeURIComponent(created.id)}`);
    } catch {
      showToast("Could not convert this agent to a workflow");
    }
  };

  const handleDeleteCustomAgent = (id: string) => {
    const updated = agents.filter((a) => a.id !== id);
    setAgents(updated);
    saveEnterpriseAgents(updated);
    showToast("Deleted custom agent");
  };

  const handleQuickDispatchAgent = (agent: AgentDefinition) => {
    setRunningAgentId(agent.id);

    // Load user's workspace notes from localStorage or fallback to INITIAL_NOTES
    let workspaceNotes: Note[] = INITIAL_NOTES;
    try {
      const saved = localStorage.getItem(`aura-notes-${userEmail}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) workspaceNotes = parsed;
      }
    } catch {}

    const workspaceId = "ws-aura-core";
    const goal = `Studio Dispatch: Execute ${agent.name} across enterprise workspace (${workspaceNotes.length} notes)`;
    const plan = buildDeterministicAgentPlan(agent, goal, {
      workspaceId,
      userEmail,
      notes: workspaceNotes,
      folders: [],
      reminders: [],
      activeNote: workspaceNotes[0] || null,
    });

    const steps: AgentExecutionStep[] = [...plan.steps];
    let updatedPool = [...workspaceNotes];
    const pending: AgentToolCall[] = [];

    plan.proposedCalls.forEach((call, idx) => {
      // Human-in-the-loop: calls that need approval stay pending and are not executed.
      if (call.status === "pending_approval") {
        pending.push(call);
        steps.push({
          id: `studio-gate-${idx}-${Date.now()}`,
          type: "approval_gate",
          title: `Awaiting approval: ${AGENT_TOOL_METADATA[call.toolName]?.label || call.toolName}`,
          detail: "This agent requires human approval before write actions run.",
          timestamp: new Date().toISOString(),
          toolCall: call,
        });
        return;
      }
      const exec = executeSingleToolCall(call, {
        workspaceId,
        userEmail,
        notes: updatedPool,
        folders: [],
        reminders: [],
        activeNote: updatedPool[0] || null,
      });
      updatedPool = exec.updatedNotes;
      steps.push({
        id: `studio-tool-${idx}-${Date.now()}`,
        type: "tool_call",
        title: `Executed ${AGENT_TOOL_METADATA[call.toolName]?.label || call.toolName}`,
        detail: `Result: ${exec.summary}`,
        timestamp: new Date().toISOString(),
        toolCall: { ...call, status: "executed", resultSummary: exec.summary },
      });
    });

    try {
      localStorage.setItem(`aura-notes-${userEmail}`, JSON.stringify(updatedPool));
    } catch {}

    steps.push({
      id: `studio-final-${Date.now()}`,
      type: "final_answer",
      title: pending.length ? "Studio Run Awaiting Approval" : "Studio Run Completed",
      detail: plan.finalSummary,
      timestamp: new Date().toISOString(),
    });

    const run: AgentRun = {
      id: `run-studio-${Date.now()}`,
      orgId: effectiveOrgId,
      workspaceId,
      agentId: agent.id,
      agentName: agent.name,
      userEmail: userEmail || "admin@aura.enterprise",
      goal,
      status: pending.length ? "awaiting_approval" : "completed",
      steps,
      pendingToolCalls: pending.length ? pending : undefined,
      finalSummary: plan.finalSummary,
      tokensUsed: 960,
      createdAt: new Date(Date.now() - 1200).toISOString(),
      completedAt: pending.length ? undefined : new Date().toISOString(),
    };

    const nextRuns = saveAgentRun(run);
    setRuns(nextRuns);
    setExpandedRunId(run.id);

    const updatedAgents = agents.map((a) =>
      a.id === agent.id
        ? { ...a, totalRuns: (a.totalRuns || 0) + 1, lastRunAt: new Date().toISOString() }
        : a
    );
    setAgents(updatedAgents);
    saveEnterpriseAgents(updatedAgents);

    apiFetch("/api/agents/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run }),
    }).catch(() => {});

    setTimeout(() => {
      setRunningAgentId(null);
      setActiveSection("telemetry");
      showToast(`${agent.name} completed studio run!`);
    }, 450);
  };

  const handleCreateCustomAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newRole.trim()) return;

    const created: AgentDefinition = {
      id: `agent-custom-${Date.now()}`,
      name: newName.trim(),
      role: newRole.trim(),
      description:
        newDescription.trim() ||
        `Custom enterprise agent specialized in ${newRole.trim()}.`,
      icon: newIcon || "🤖",
      color: newColor,
      systemPrompt: newSystemPrompt.trim(),
      autonomyLevel: newAutonomy,
      trigger: newTrigger,
      allowedTools: newTools.length > 0 ? newTools : ["search_workspace_notes"],
      isEnabled: true,
      totalRuns: 0,
    };

    const updated = [...agents, created];
    setAgents(updated);
    saveEnterpriseAgents(updated);
    setNewName("");
    setNewRole("");
    setNewDescription("");
    setActiveSection("fleet");
    showToast(`Created custom agent "${created.name}"`);
  };

  const toggleBuilderTool = (tool: AgentToolName) => {
    setNewTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const totalTokens = runs.reduce((acc, r) => acc + (r.tokensUsed || 0), 0);
  const totalCreatedNotes = runs.reduce(
    (acc, r) =>
      acc +
      r.steps.filter(
        (s) => s.toolCall?.toolName === "create_structured_note" && s.toolCall.status === "executed"
      ).length,
    0
  );
  const iconFor = (run: AgentRun) => agents.find((a) => a.id === run.agentId)?.icon ?? "";

  const kpis = [
    {
      label: "Active fleet agents",
      value: (
        <>
          {agents.filter((a) => a.isEnabled).length}{" "}
          <span className="text-[12px] font-normal text-fg-subtle">/ {agents.length} total</span>
        </>
      ),
      hint: "Multi-tool orchestration ready",
      icon: <Bot size={14} aria-hidden />,
    },
    { label: "Total executions", value: runs.length, hint: "Across all enterprise workspaces", icon: <Activity size={14} aria-hidden /> },
    { label: "Documents synthesized", value: totalCreatedNotes, hint: "Auto-generated briefs & reports", icon: <FileText size={14} aria-hidden /> },
    { label: "Token compute budget", value: `${(totalTokens / 1000).toFixed(1)}k`, hint: "Gemini 3.5 Flash + Local Hybrid", icon: <Cpu size={14} aria-hidden /> },
  ];

  return (
    <div className="flex min-h-screen w-full flex-col bg-surface text-fg">
      <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <header className="sticky top-0 z-20 flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="Back to workspace" className={TOUCH} onClick={() => navigate("/w/ws-aura-core/dashboard")}>
            <ArrowLeft size={16} />
          </IconButton>
          <LogoMark size={20} />
          <h1 className="truncate text-[14px] font-semibold text-fg">Agent Studio</h1>
          <Badge tone="accent" className="hidden sm:inline-flex">v3.0</Badge>
        </div>
        <nav aria-label="Studio navigation" className="flex flex-wrap items-center gap-2">
          <Button className="h-10 sm:h-8" leadingIcon={<Building2 size={14} />} onClick={() => navigate(`/org/${effectiveOrgId}`)}>
            Org Hub
          </Button>
          <Button className="h-10 sm:h-8" leadingIcon={<Shield size={14} />} onClick={() => navigate(`/org/${effectiveOrgId}/admin`)}>
            Admin Console
          </Button>
          <Button variant="primary" className="h-10 sm:h-8" leadingIcon={<Plus size={14} />} onClick={() => setActiveSection("builder")}>
            Build agent
          </Button>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <p className="max-w-2xl text-[13px] text-fg-muted">
          Orchestrate multi-step AI agents, configure human-in-the-loop governance policies, and audit tool execution traces.
        </p>

        <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => (
            <Panel key={k.label} className="p-4">
              <div className="flex items-center justify-between text-fg-muted">
                <h2 className="text-[12px] font-medium">{k.label}</h2>
                {k.icon}
              </div>
              <div className="mt-2 text-[20px] font-semibold tracking-tight text-fg">{k.value}</div>
              <p className="mt-1 text-[12px] text-fg-subtle">{k.hint}</p>
            </Panel>
          ))}
        </section>

        <Tabs<Section>
          className="overflow-x-auto"
          value={activeSection}
          onChange={setActiveSection}
          items={[
            { id: "fleet", label: "Fleet & governance", icon: <Bot size={14} /> },
            { id: "telemetry", label: "Execution audit log", icon: <Terminal size={14} />, count: runs.length },
            { id: "builder", label: "Agent builder", icon: <Sliders size={14} /> },
          ]}
        />

        {/* FLEET */}
        {activeSection === "fleet" &&
          (agents.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<Bot size={18} />}
                title="No agents in your fleet"
                description="Build a custom agent to automate work across your workspaces."
                action={<Button variant="primary" onClick={() => setActiveSection("builder")}>Build agent</Button>}
              />
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {agents.map((agent) => {
                const isBuiltIn = agent.isBuiltIn ?? (agent.id.startsWith("agent-") && !agent.id.startsWith("agent-custom-"));
                return (
                  <Panel key={agent.id} className="flex flex-col justify-between gap-4 p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <AgentGlyph icon={agent.icon} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-[14px] font-medium text-fg">{agent.name}</h3>
                              <Badge tone={agent.isEnabled ? "success" : "neutral"}>{agent.isEnabled ? "Enabled" : "Paused"}</Badge>
                            </div>
                            <span className="text-[12px] text-fg-muted">{agent.role}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Switch checked={agent.isEnabled} onChange={() => handleToggleAgent(agent.id)} label={`${agent.isEnabled ? "Disable" : "Enable"} ${agent.name}`} />
                          {!isBuiltIn && (
                            <IconButton label={`Delete ${agent.name}`} className={cn(TOUCH, "hover:text-danger")} onClick={() => handleDeleteCustomAgent(agent.id)}>
                              <Trash2 size={14} />
                            </IconButton>
                          )}
                        </div>
                      </div>

                      <p className="text-[13px] leading-relaxed text-fg-muted">{agent.description}</p>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Authorized tools</span>
                        <div className="flex flex-wrap gap-1.5">
                          {agent.allowedTools.map((toolName) => (
                            <Badge key={toolName}>
                              <Wrench size={10} aria-hidden />
                              {AGENT_TOOL_METADATA[toolName]?.label || toolName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-line pt-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Autonomy policy">
                          {(p) => (
                            <Select {...p} value={agent.autonomyLevel} onChange={(e) => handleChangeAutonomy(agent.id, e.target.value as AgentAutonomyLevel)} className="h-10 sm:h-8">
                              <option value="autonomous">Autonomous (auto-write)</option>
                              <option value="require_approval">HITL (require approval)</option>
                              <option value="advisory_only">Advisory only (read-only)</option>
                            </Select>
                          )}
                        </Field>
                        <Field label="Execution trigger">
                          {(p) => (
                            <Select {...p} value={agent.trigger} onChange={(e) => handleChangeTrigger(agent.id, e.target.value as AgentTriggerType)} className="h-10 sm:h-8">
                              <option value="manual">Manual dispatch</option>
                              <option value="on_note_publish">On note publish</option>
                              <option value="scheduled_daily">Scheduled daily digest</option>
                              <option value="on_compliance_flag">On compliance flag</option>
                            </Select>
                          )}
                        </Field>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-fg-subtle">
                          {agent.totalRuns || 0} runs &middot;{" "}
                          {agent.lastRunAt
                            ? `Last: ${new Date(agent.lastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : "Ready"}
                        </span>
                        <Button
                          variant="secondary"
                          className="ml-auto h-10 sm:h-8"
                          leadingIcon={<Workflow size={12} />}
                          onClick={() => handleConvertToWorkflow(agent)}
                        >
                          Convert to workflow
                        </Button>
                        <Button
                          variant="primary"
                          className="h-10 sm:h-8"
                          leadingIcon={<Play size={12} />}
                          loading={runningAgentId === agent.id}
                          disabled={runningAgentId === agent.id}
                          onClick={() => handleQuickDispatchAgent(agent)}
                        >
                          {runningAgentId === agent.id ? "Running" : "Run now"}
                        </Button>
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          ))}

        {/* TELEMETRY */}
        {activeSection === "telemetry" && (
          <div className="flex flex-col gap-3">
            {syncState === "offline" && (
              <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-[12px] text-warning">
                <WifiOff size={13} aria-hidden /> Could not reach the server. Showing runs stored on this device.
                <Button size="sm" variant="secondary" className="ml-auto" onClick={loadRemoteRuns}>Retry</Button>
              </div>
            )}
            {syncState === "loading" && runs.length === 0 ? (
              <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading runs">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : runs.length === 0 ? (
              <Panel>
                <EmptyState
                  icon={<Terminal size={18} />}
                  title="No agent executions recorded yet"
                  description="Dispatch an agent from the fleet tab or from the in-editor co-pilot panel to inspect its multi-step trace here."
                  action={<Button onClick={() => setActiveSection("fleet")}>Go to fleet</Button>}
                />
              </Panel>
            ) : (
              runs.map((run) => {
                const isExpanded = expandedRunId === run.id;
                const panelId = `run-${run.id}`;
                return (
                  <Panel key={run.id} className="overflow-hidden">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                      className="flex min-h-14 w-full flex-wrap items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <AgentGlyph icon={iconFor(run)} size={32} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium text-fg">{run.agentName}</span>
                            <Badge tone={RUN_TONE[run.status]}>{run.status.replace("_", " ")}</Badge>
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-fg-muted">{run.goal}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px] text-fg-subtle">
                        <span>{run.steps.length} steps</span>
                        <span>{run.tokensUsed} tokens</span>
                        <span className="hidden sm:inline">{new Date(run.createdAt).toLocaleString()}</span>
                        {isExpanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
                      </div>
                    </button>

                    {isExpanded && (
                      <ol id={panelId} className="border-t border-line bg-sidebar p-4">
                        {run.steps.map((step, i) => (
                          <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
                            <div className="flex flex-col items-center">
                              <span
                                className={cn(
                                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                                  step.type === "final_answer" ? "bg-success" : step.type === "approval_gate" ? "bg-warning" : step.type === "tool_call" ? "bg-accent" : "bg-line-strong"
                                )}
                              />
                              {i < run.steps.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[13px] font-medium text-fg">{step.title}</span>
                                <span className="font-mono text-[11px] text-fg-subtle">{STEP_LABEL[step.type]}</span>
                              </div>
                              <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-fg-muted">{step.detail}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Panel>
                );
              })
            )}
          </div>
        )}

        {/* BUILDER */}
        {activeSection === "builder" && (
          <Panel className="max-w-3xl">
            <form onSubmit={handleCreateCustomAgent} className="flex flex-col gap-5 p-4 sm:p-5">
              <div>
                <h2 className="text-[16px] font-semibold text-fg">Create custom enterprise agent</h2>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Define a specialized agent with custom system instructions, tool permissions, and governance controls.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Agent name *" className="sm:col-span-2">
                  {(p) => <Input {...p} type="text" required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., Legal Contract Risk Reviewer" />}
                </Field>
                <Field label="Avatar icon">
                  {(p) => <Input {...p} type="text" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} className="text-center" />}
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Functional role *">
                  {(p) => <Input {...p} type="text" required value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g., Legal & Procurement Auditor" />}
                </Field>
                <Field label="Autonomy governance policy">
                  {(p) => (
                    <Select {...p} value={newAutonomy} onChange={(e) => setNewAutonomy(e.target.value as AgentAutonomyLevel)}>
                      <option value="require_approval">Require human approval (recommended)</option>
                      <option value="autonomous">Fully autonomous</option>
                      <option value="advisory_only">Advisory only (no write access)</option>
                    </Select>
                  )}
                </Field>
              </div>

              <Field label="Description">
                {(p) => <Input {...p} type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Brief summary of what this agent automates across the organization..." />}
              </Field>

              <Field label="System prompt & directives">
                {(p) => <Textarea {...p} rows={3} value={newSystemPrompt} onChange={(e) => setNewSystemPrompt(e.target.value)} className="font-mono text-[12px]" />}
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-[12px] font-medium text-fg-muted">Authorized tool capabilities</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ALL_TOOLS.map((tool) => {
                    const meta = AGENT_TOOL_METADATA[tool];
                    const checked = newTools.includes(tool);
                    return (
                      <button
                        type="button"
                        key={tool}
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggleBuilderTool(tool)}
                        className={cn(
                          "flex min-h-14 items-start gap-2.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                          checked ? "border-accent bg-accent-soft" : "border-line bg-panel hover:bg-hover"
                        )}
                      >
                        <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded", checked ? "bg-accent text-accent-fg" : "border border-line-strong")}>
                          {checked && <Check size={10} aria-hidden />}
                        </span>
                        <span>
                          <span className="block text-[13px] font-medium text-fg">{meta.label}</span>
                          <span className="block text-[12px] text-fg-muted">{meta.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" className="h-10 sm:h-8" onClick={() => setActiveSection("fleet")}>Cancel</Button>
                <Button type="submit" variant="primary" className="h-10 sm:h-8">Register agent</Button>
              </div>
            </form>
          </Panel>
        )}
      </main>
    </div>
  );
}
