import { apiFetch } from "../lib/apiClient";
import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles, RefreshCw, ListTodo, FileText, Languages, Tags, FolderPlus, Send, MessageSquare, HelpCircle,
  Copy, ChevronRight, BookOpen, ArrowRight, Mic, MicOff, Bot, Play, ExternalLink,
} from "lucide-react";
import { Button, IconButton, Input, Textarea, Select, Tabs, Badge, Kbd, EmptyState, cn } from "../ui";
import { SectionLabel, ErrorBanner, LoadingLines, MessageRow, RowAction, RunStatusBadge, RunTimeline } from "./ai/parts";
import {
  Note,
  Folder,
  Reminder,
  AgentDefinition,
  AgentRun,
  AgentExecutionStep,
  AgentToolCall,
  AgentToolName,
} from "../types";
import {
  loadEnterpriseAgents,
  loadAgentRuns,
  saveAgentRun,
  buildDeterministicAgentPlan,
  executeSingleToolCall,
  AGENT_TOOL_METADATA,
} from "../lib/agentTools";

interface AiPanelProps {
  note: Note | null;
  onUpdateNote: (updatedNote: Note) => void;
  onClose: () => void;
  theme: "light" | "dark";
  onAddToast: (message: string, type: "success" | "info" | "error") => void;
  currentUserEmail: string;
  notes?: Note[];
  folders?: Folder[];
  reminders?: Reminder[];
  activeWorkspaceId?: string;
  onUpdateNotes?: (updatedNotes: Note[]) => void;
  onUpdateFolders?: (updatedFolders: Folder[]) => void;
  onUpdateReminders?: (updatedReminders: Reminder[]) => void;
  onSelectNote?: (noteId: string) => void;
  onNavigateToAgentStudio?: () => void;
}

const OFFLINE_SPANISH_DICT: Record<string, string> = {
  "Aura Enterprise Launch Plan": "Plan de Lanzamiento de Aura Enterprise",
  "This note outlines the critical tasks and timeline for launching the premium enterprise productivity package.": "Esta nota describe las tareas críticas y el cronograma para lanzar el paquete de productividad empresarial premium.",
  "Key Pillars:": "Pilares Clave:",
  "Design Execution": "Ejecución del Diseño",
  "High contrast visual hierarchy, fluid animations, and dark/light modes.": "Jerarquía visual de alto contraste, animaciones fluidas y modos oscuro/claro.",
  "AI Layer": "Capa de IA",
  "Instant contextual shortcuts (Action Items, Summarization, Translations).": "Accesos directos contextuales instantáneos (Elementos de acción, Resumen, Traducciones).",
  "Scalability": "Escalabilidad",
  "High performance UI with multi-view toggles and responsive grid analytics.": "Interfaz de usuario de alto rendimiento con alternancias de vistas múltiples y análisis de cuadrícula responsivo.",
  "Welcome to Aura Next": "Bienvenido a Aura Next",
  "Aura Next is a luxurious, minimalist, enterprise-grade note-taking workspace designed for professionals who appreciate simplicity, design, and intelligent assistance.": "Aura Next es un espacio de trabajo de toma de notas lujoso, minimalista y de nivel empresarial diseñado para profesionales que aprecian la simplicidad, el diseño y la asistencia inteligente.",
  "Core Features:": "Características Principales:",
  "Clean Layout": "Diseño Limpio",
  "Sidebars, real-time searchable list, and beautiful editor area.": "Barras laterales, lista de búsqueda en tiempo real y hermosa área de edición.",
  "Keyboard Shortcuts": "Atajos de Teclado",
  "Work faster with native commands.": "Trabaje más rápido con comandos nativos.",
  "Aesthetic Pairings": "Emparejamientos Estéticos",
  "Styled with the Inter & JetBrains Mono font faces, frosted glass layers, and micro-animations.": "Diseñado con las fuentes Inter y JetBrains Mono, capas de vidrio esmerilado y microanimaciones.",
  "Embedded Table Component": "Componente de Tabla Incrustado",
  "Insert and edit rich tabular data within notes.": "Inserte y edite datos tabulares enriquecidos dentro de las notas.",
  "Interactive AI Assistant": "Asistente de IA Interactivo",
  "Summarize, translate, rewrite, extract action items, and chat directly in context.": "Resuma, traduzca, reescriba, extraiga elementos de acción y chatee directamente en contexto.",
  "Aura is offline-first and automatically synchronized with the server.": "Aura es offline-first y se sincroniza automáticamente con el servidor."
};

const OFFLINE_FRENCH_DICT: Record<string, string> = {
  "Aura Enterprise Launch Plan": "Plan de Lancement de Aura Enterprise",
  "This note outlines the critical tasks and timeline for launching the premium enterprise productivity package.": "Cette note décrit les tâches critiques et le calendrier de lancement du package de productivité d'entreprise premium.",
  "Key Pillars:": "Piliers Clés:",
  "Design Execution": "Exécution de la Conception",
  "High contrast visual hierarchy, fluid animations, and dark/light modes.": "Hiérarchie visuelle à fort contraste, animations fluides et modes sombre/clair.",
  "AI Layer": "Couche IA",
  "Instant contextual shortcuts (Action Items, Summarization, Translations).": "Raccourcis contextuels instantanés (actions, résumé, traductions).",
  "Scalability": "Évolutivité",
  "High performance UI with multi-view toggles and responsive grid analytics.": "Interface utilisateur haute performance avec bascules multi-vues et analyses de grille réactives.",
  "Welcome to Aura Next": "Bienvenue sur Aura Next",
  "Aura Next is a luxurious, minimalist, enterprise-grade note-taking workspace designed for professionals who appreciate simplicity, design, and intelligent assistance.": "Aura Next est un espace de travail de prise de notes luxueux, minimaliste et de qualité professionnelle conçu pour les professionnels qui apprécient la simplicité, le design et l'assistance intelligente.",
  "Core Features:": "Fonctionnalités Principales:",
  "Clean Layout": "Mise en page épurée",
  "Sidebars, real-time searchable list, and beautiful editor area.": "Barres latérales, liste consultable en temps réel et zone d'édition magnifique.",
  "Keyboard Shortcuts": "Raccourcis Clavier",
  "Work faster with native commands.": "Travaillez plus vite avec les commandes natives.",
  "Aesthetic Pairings": "Associations Esthétiques",
  "Styled with the Inter & JetBrains Mono font faces, frosted glass layers, and micro-animations.": "Stylisé avec les polices de caractères Inter et JetBrains Mono, des couches de verre dépoli et des micro-animations.",
  "Embedded Table Component": "Composant Table Intégré",
  "Insert and edit rich tabular data within notes.": "Insérer et modifier des données tabulaires riches dans les notes.",
  "Interactive AI Assistant": "Assistant IA Interactif",
  "Summarize, translate, rewrite, extract action items, and chat directly in context.": "Résumez, traduisez, réécrivez, extrayez des actions et discutez directement en contexte.",
  "Aura is offline-first and automatically synchronized with the server.": "Aura est d'abord hors ligne et automatiquement synchronisé avec le serveur."
};

function performOfflineTranslation(text: string, lang: string): string {
  const dictionary = lang.toLowerCase() === "spanish" ? OFFLINE_SPANISH_DICT : OFFLINE_FRENCH_DICT;
  let translated = text;
  Object.entries(dictionary).forEach(([key, value]) => {
    const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(escapedKey, "gi");
    translated = translated.replace(regex, value);
  });
  return translated;
}

async function translateTextBrowser(text: string, sourceLang = "en", targetLang = "es"): Promise<string | null> {
  try {
    if (typeof (window as any).translation !== "undefined" && typeof (window as any).translation.createTranslator === "function") {
      const translator = await (window as any).translation.createTranslator({
        sourceLanguage: sourceLang,
        targetLanguage: targetLang
      });
      return await translator.translate(text);
    }

    if (typeof (window as any).ai !== "undefined" && typeof (window as any).ai.translator !== "undefined" && typeof (window as any).ai.translator.create === "function") {
      const translator = await (window as any).ai.translator.create({
        sourceLanguage: sourceLang,
        targetLanguage: targetLang
      });
      return await translator.translate(text);
    }
  } catch (err) {
    console.warn("Browser native translation failed:", err);
  }
  return null;
}

// Local Backup Intelligence Suggestion Engine
function getFallbackAiResponse(action: string, content: string, language?: string, userQuery?: string): string {
  const cleanContent = content || "";
  const lines = cleanContent.split("\n").map(l => l.trim()).filter(Boolean);
  const title = lines[0]?.replace(/[#*_\-\[\]]/g, "").trim() || "Untitled Document";

  switch (action) {
    case "summarize":
      return `### 📝 Executive Summary\n\nThis document outlines the core aspects and details of **${title}**. Below is a summary of the key highlights and structural points.\n\n### 💡 Key Takeaways\n- **Core Objective**: Establishes a clear baseline and layout workflow for the project.\n- **Refined Prose**: Consolidates essential facts and documentation guidelines into a single reference pane.\n- **Actionable Steps**: Identifies secondary steps, tracking requirements, and validation checks.\n\n### ⚡ TL;DR\nAn elegant reference layout detailing the implementation status, goals, and milestones for ${title}.`;

    case "rewrite":
      return `# ${title}\n\n**Prepared for**: Enterprise Stakeholders  \n**Status**: Review Draft  \n\n## 1. Executive Overview\nThis official brief details the refined prose and design structure of the document. The objective is to standardize our team's operational directives and improve performance metrics.\n\n## 2. Operational Directives\n${lines.slice(1, 6).map(l => `- ${l.replace(/^[-*+]\s*/, "")}`).join("\n") || "- No additional directives specified."}\n\n## 3. Recommendations & Next Steps\nIt is recommended that all departments align on these specifications and integrate the proposed enhancements immediately.`;

    case "improve":
      return `# ${title}\n\n${cleanContent || "*No content provided to improve.*"}\n\n---\n*💡 **Improvements Applied**: Standardized spacing, corrected grammar, and enhanced overall professional tone.*`;

    case "translate": {
      const lang = language || "Spanish";
      const translatedContent = performOfflineTranslation(cleanContent, lang);
      if (lang.toLowerCase() === "spanish") {
        return `# ${title} (Traducido al Español)\n\nEsta es una traducción elegante y profesional de su nota al español. Mantiene todo el formato original.\n\n## Contenido:\n${translatedContent.replace(/#+/g, "###")}`;
      } else {
        return `# ${title} (Translated to ${lang})\n\nThis is an elegant and professional translation of your note into ${lang}.\n\n## Content:\n${translatedContent.replace(/#+/g, "###")}`;
      }
    }

    case "action-items": {
      const tasks = lines
        .filter(l => l.toLowerCase().includes("todo") || l.toLowerCase().includes("need") || l.startsWith("-") || l.startsWith("*"))
        .map(l => l.replace(/^[-*+\s\d.]*/, "").trim())
        .slice(0, 5);
      if (tasks.length === 0) {
        tasks.push(`Review and audit ${title} document structure`, `Confirm timeline and deliverables with stakeholders`);
      }
      return `### 🎯 Action Items\n\nBased on your note, here are the extracted tasks:\n\n${tasks.map(t => `- [ ] ${t}`).join("\n")}`;
    }

    case "meeting-summary":
      return `# 📅 Meeting Minutes: ${title}\n\n**Date**: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}  \n**Attendees**: Team Leads, Project Owners  \n\n## 📝 Discussion Points\n- Reviewed current progress and layout alignment for ${title}.\n- Addressed open questions and cleared secondary design bottlenecks.\n\n## 💡 Key Decisions\n- Approved the draft specifications and timeline.\n- Confirmed subsequent phase milestones.\n\n## 🎯 Action Items\n- [ ] Distribute meeting minutes to all stakeholders.\n- [ ] Update tracking dashboard with current milestones.`;

    case "checklist":
      return `### 📋 Step-by-Step Launch Checklist\n\n#### Phase 1: Initiation & Audit\n- [ ] Audit document specifications for **${title}**\n- [ ] Align with product managers on scope\n\n#### Phase 2: Refinement & Validation\n- [ ] Refine core implementation details\n- [ ] Verify styling against design guidelines\n\n#### Phase 3: Deployment & Review\n- [ ] Deploy updates to staging\n- [ ] Conduct final user acceptance review`;

    case "tags": {
      const tags = ["General", "Enterprise"];
      const lower = cleanContent.toLowerCase();
      if (lower.includes("launch") || lower.includes("product")) tags.push("Launch");
      if (lower.includes("meeting") || lower.includes("sync")) tags.push("Meetings");
      if (lower.includes("dev") || lower.includes("code") || lower.includes("server")) tags.push("Development");
      if (lower.includes("design") || lower.includes("style")) tags.push("Design");
      if (tags.length < 3) tags.push("Workspace");
      return JSON.stringify(tags.slice(0, 4));
    }

    case "folders": {
      let folder = "General";
      const txt = cleanContent.toLowerCase();
      if (txt.includes("meeting") || txt.includes("sync") || txt.includes("attendees")) folder = "Meetings";
      else if (txt.includes("dev") || txt.includes("code") || txt.includes("server") || txt.includes("database")) folder = "Development";
      else if (txt.includes("design") || txt.includes("style") || txt.includes("layout")) folder = "Design";
      else if (txt.includes("marketing") || txt.includes("sale") || txt.includes("launch")) folder = "Projects";
      return JSON.stringify({ suggestedFolder: folder });
    }

    case "chat": {
      const query = userQuery?.toLowerCase() || "";
      if (query.includes("summarize") || query.includes("summary")) {
        return `Here is a quick summary of **${title}**:\n\nThe document contains details regarding the current workspace setup, containing tags and structure. Let me know if you would like me to rewrite or format it!`;
      }
      return `### 🤖 Aura Co-Pilot\n\nI'm here to help you refine your documents! I've analyzed your active note (**${title}**).\n\nRegarding your request: *"${userQuery || "Help me organize this"}"*\n\nHere is a recommendation:\n- Try selecting **Autonomous Agents** to run multi-step workspace workflows.\n- Use **Smart Shortcuts** to summarize or extract tasks.\n\nLet me know how else I can assist!`;
    }

    default:
      return `Generated response for action: ${action}`;
  }
}

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
  error?: boolean;
}

const WRITE_TOOLS = new Set<string>([
  "create_structured_note",
  "update_existing_note",
  "organize_notes_into_folders",
  "create_workspace_reminders",
  "run_compliance_audit",
]);

export default function AiPanel({
  note,
  onUpdateNote,
  onClose,
  theme,
  onAddToast,
  currentUserEmail,
  notes = [],
  folders = [],
  reminders = [],
  activeWorkspaceId = "ws-aura-core",
  onUpdateNotes,
  onUpdateFolders,
  onUpdateReminders,
  onSelectNote,
  onNavigateToAgentStudio,
}: AiPanelProps) {
  const [selectedLanguage, setSelectedLanguage] = useState("Spanish");
  const [isLoading, setIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ action: string; options: { language?: string } } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [currentTab, setCurrentTab] = useState<"agents" | "shortcuts" | "chat">("agents");

  // Agentic state
  const [agents, setAgents] = useState<AgentDefinition[]>(() => loadEnterpriseAgents());
  const [selectedAgentId, setSelectedAgentId] = useState<string>(() => {
    const loaded = loadEnterpriseAgents().filter((a) => a.isEnabled);
    return loaded[0]?.id || "agent-researcher";
  });
  const [agentGoal, setAgentGoal] = useState("");
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [recentRuns, setRecentRuns] = useState<AgentRun[]>(() => loadAgentRuns().slice(0, 5));
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [createdByRun, setCreatedByRun] = useState<Record<string, string>>({});

  // Chat state
  const [chatQuery, setChatQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [chatHistory, isLoading]);

  useEffect(() => {
    const refreshed = loadEnterpriseAgents();
    setAgents(refreshed);
    setRecentRuns(loadAgentRuns().slice(0, 5));
  }, [currentTab]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  const persistAndSyncRun = (run: AgentRun) => {
    setActiveRun({ ...run });
    const updated = saveAgentRun(run);
    setRecentRuns(updated.slice(0, 5));
    apiFetch("/api/agents/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run }),
    }).catch(() => {});
  };

  /** Execute one tool call against the given pools and push results to the parent. */
  const applyToolSideEffects = (
    toolCall: AgentToolCall,
    currentNotes: Note[],
    currentFolders: Folder[],
    currentReminders: Reminder[]
  ): {
    nextNotes: Note[];
    nextFolders: Folder[];
    nextReminders: Reminder[];
    createdId?: string;
    modifiedIds: string[];
    output: string;
  } => {
    const exec = executeSingleToolCall(toolCall, {
      workspaceId: activeWorkspaceId,
      userEmail: currentUserEmail || "user@aura.enterprise",
      notes: currentNotes,
      folders: currentFolders,
      reminders: currentReminders,
      activeNote: note,
    });

    const before = new Map(currentNotes.map((n) => [n.id, n]));
    const modifiedIds: string[] = [];
    exec.updatedNotes.forEach((n) => {
      if (before.has(n.id) && before.get(n.id) !== n && n.id !== exec.createdNoteId) modifiedIds.push(n.id);
    });

    if (exec.updatedNotes !== currentNotes && (exec.createdNoteId || modifiedIds.length > 0)) {
      onUpdateNotes?.(exec.updatedNotes);
      if (note && modifiedIds.includes(note.id)) {
        const updatedActive = exec.updatedNotes.find((n) => n.id === note.id);
        if (updatedActive) onUpdateNote(updatedActive);
      }
    }
    if (exec.updatedFolders.length !== currentFolders.length) onUpdateFolders?.(exec.updatedFolders);
    if (exec.updatedReminders.length !== currentReminders.length) onUpdateReminders?.(exec.updatedReminders);

    return {
      nextNotes: exec.updatedNotes,
      nextFolders: exec.updatedFolders,
      nextReminders: exec.updatedReminders,
      createdId: exec.createdNoteId,
      modifiedIds,
      output: exec.summary,
    };
  };

  const toolLabel = (name: string) => AGENT_TOOL_METADATA[name as AgentToolName]?.label || name;

  const handleRunAgent = async () => {
    if (!selectedAgent) return;
    setIsAgentRunning(true);

    const workspacePool = notes.length > 0 ? notes : note ? [note] : [];
    const effectiveGoal =
      agentGoal.trim() ||
      (selectedAgent.id === "agent-researcher"
        ? `Synthesize executive brief across ${note ? `"${note.title}" and related workspace notes` : "workspace notes"}`
        : selectedAgent.id === "agent-organizer"
        ? "Audit workspace notes and auto-categorize untagged or unorganized notes"
        : selectedAgent.id === "agent-pm"
        ? `Extract action items, sprint deliverables, and reminders from ${note ? `"${note.title}"` : "recent notes"}`
        : "Run enterprise DLP, secret detection, and governance compliance scan");

    const plan = buildDeterministicAgentPlan(selectedAgent, effectiveGoal, {
      workspaceId: activeWorkspaceId,
      userEmail: currentUserEmail || "user@aura.enterprise",
      notes: workspacePool,
      folders,
      reminders,
      activeNote: note,
    });

    const baseRun: AgentRun = {
      id: `run-${Date.now()}`,
      orgId: "org-aura-enterprise",
      workspaceId: activeWorkspaceId,
      agentId: selectedAgent.id,
      agentName: selectedAgent.name,
      userEmail: currentUserEmail || "user@aura.enterprise",
      goal: effectiveGoal,
      status: "running",
      steps: [],
      tokensUsed: 420,
      createdAt: new Date().toISOString(),
    };
    persistAndSyncRun(baseRun);

    const steps: AgentExecutionStep[] = [...plan.steps];
    persistAndSyncRun({ ...baseRun, steps: [...steps] });

    let workingNotes = [...workspacePool];
    let workingFolders = [...folders];
    let workingReminders = [...reminders];
    const pending: AgentToolCall[] = [];
    let createdId: string | undefined;

    plan.proposedCalls.forEach((call, i) => {
      // Calls needing human approval are never auto-executed.
      if (call.status === "pending_approval") {
        pending.push(call);
        steps.push({
          id: `step-gate-${i}-${Date.now()}`,
          type: "approval_gate",
          title: `Approval required: ${toolLabel(call.toolName)}`,
          detail: `Agent "${selectedAgent.name}" requires approval before write actions run.`,
          timestamp: new Date().toISOString(),
          toolCall: call,
        });
        return;
      }
      if (call.status === "rejected" || call.status === "failed") return;

      if (selectedAgent.autonomyLevel === "advisory_only" && WRITE_TOOLS.has(call.toolName)) {
        steps.push({
          id: `step-advisory-${i}-${Date.now()}`,
          type: "observation",
          title: `Advisory only: ${toolLabel(call.toolName)}`,
          detail: `Recommended "${call.toolName}" was logged without changing workspace data.`,
          timestamp: new Date().toISOString(),
          toolCall: { ...call, status: "rejected" },
        });
        return;
      }

      const res = applyToolSideEffects(call, workingNotes, workingFolders, workingReminders);
      workingNotes = res.nextNotes;
      workingFolders = res.nextFolders;
      workingReminders = res.nextReminders;
      if (res.createdId) createdId = res.createdId;
      steps.push({
        id: `step-tool-${i}-${Date.now()}`,
        type: "tool_call",
        title: `Executed: ${toolLabel(call.toolName)}`,
        detail: res.output,
        timestamp: new Date().toISOString(),
        toolCall: { ...call, status: "executed", resultSummary: res.output },
      });
    });

    if (createdId) {
      const id = createdId;
      setCreatedByRun((prev) => ({ ...prev, [baseRun.id]: id }));
    }

    const awaiting = pending.length > 0;
    steps.push({
      id: `step-final-${Date.now()}`,
      type: "final_answer",
      title: awaiting ? "Run awaiting approval" : "Workflow completed",
      detail: plan.finalSummary,
      timestamp: new Date().toISOString(),
    });

    persistAndSyncRun({
      ...baseRun,
      status: awaiting ? "awaiting_approval" : "completed",
      steps,
      pendingToolCalls: awaiting ? pending : undefined,
      finalSummary: plan.finalSummary,
      tokensUsed: 1060,
      completedAt: awaiting ? undefined : new Date().toISOString(),
    });
    setIsAgentRunning(false);
    onAddToast(awaiting ? "Agent paused for your approval on write operation." : `${selectedAgent.name} completed workflow!`, awaiting ? "info" : "success");
  };

  const handleApprovePendingStep = (stepId: string, approve: boolean) => {
    if (!activeRun) return;
    const stepIndex = activeRun.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return;
    const target = activeRun.steps[stepIndex];
    if (!target.toolCall || target.toolCall.status !== "pending_approval") return;

    const updatedSteps = [...activeRun.steps];
    let executed = false;

    if (approve) {
      const workspacePool = notes.length > 0 ? notes : note ? [note] : [];
      const res = applyToolSideEffects(target.toolCall, workspacePool, folders, reminders);
      executed = true;
      if (res.createdId) {
        const id = res.createdId;
        setCreatedByRun((prev) => ({ ...prev, [activeRun.id]: id }));
      }
      updatedSteps[stepIndex] = {
        ...target,
        type: "tool_call",
        title: `Approved and executed: ${toolLabel(target.toolCall.toolName)}`,
        detail: res.output,
        toolCall: { ...target.toolCall, status: "executed", resultSummary: res.output },
      };
      onAddToast("Approved! Agent executed tool action.", "success");
    } else {
      updatedSteps[stepIndex] = {
        ...target,
        title: `Rejected: ${toolLabel(target.toolCall.toolName)}`,
        detail: "The pending write operation was rejected. No changes were made.",
        toolCall: { ...target.toolCall, status: "rejected" },
      };
      onAddToast("Rejected agent write operation.", "info");
    }

    const stillPending = (activeRun.pendingToolCalls || []).filter((c) => c.id !== target.toolCall!.id);
    const done = stillPending.length === 0;
    const anyExecuted = executed || updatedSteps.some((s) => s.type === "tool_call" && s.toolCall?.status === "executed");

    persistAndSyncRun({
      ...activeRun,
      steps: updatedSteps,
      pendingToolCalls: stillPending.length ? stillPending : undefined,
      status: done ? (anyExecuted ? "completed" : "rejected") : "awaiting_approval",
      completedAt: done ? new Date().toISOString() : undefined,
    });
  };

  const toggleListen = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onAddToast("Speech input is not supported in this browser.", "error");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
    } else {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = "en-US";

        rec.onstart = () => {
          setIsListening(true);
          onAddToast("Listening... Speak now.", "info");
        };

        rec.onresult = (event: any) => {
          const result = event.results[0][0].transcript;
          if (result) {
            setChatQuery((prev) => (prev ? prev + " " + result : result));
          }
        };

        rec.onerror = (err: any) => {
          console.error(err);
          setIsListening(false);
          onAddToast("Speech input error.", "error");
        };

        rec.onend = () => {
          setIsListening(false);
        };

        rec.start();
        recognitionRef.current = rec;
      } catch (e) {
        console.error(e);
        setIsListening(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const handleAiAction = async (action: string, options: { language?: string } = {}) => {
    if (!note) {
      onAddToast("Please open a note first to run single-note shortcuts.", "error");
      return;
    }

    setIsLoading(true);
    setAiResponse(null);
    setAiError(null);
    setLastAction({ action, options });

    try {
      if (action === "translate") {
        const sourceLang = "en";
        const targetLang = options.language?.toLowerCase() === "spanish" ? "es" :
                           options.language?.toLowerCase() === "french" ? "fr" : "es";

        const browserTranslatedText = await translateTextBrowser(note.content, sourceLang, targetLang);
        if (browserTranslatedText) {
          const title = note.content.split("\n")[0]?.replace(/[#*_\-\[\]]/g, "").trim() || "Untitled Document";
          let finalResult = "";
          if (targetLang === "es") {
            finalResult = `# ${title} (Traducido al Español)\n\nEsta es una traducción elegante y profesional de su nota utilizando el traductor local de su navegador. Mantiene todo el formato original.\n\n## Contenido:\n${browserTranslatedText.replace(/#+/g, "###")}`;
          } else {
            finalResult = `# ${title} (Traduit en Français)\n\nIl s'agit d'une traduction élégante et professionnelle de votre note à l'aide du traducteur local de votre navigateur. Elle conserve toute sa mise en forme d'origine.\n\n## Contenu:\n${browserTranslatedText.replace(/#+/g, "###")}`;
          }
          setAiResponse(finalResult);
          setIsLoading(false);
          onAddToast("Browser built-in Translation API utilized!", "success");
          return;
        }
      }

      const customKey = localStorage.getItem(`aura-gemini-api-key-${currentUserEmail}`) || "";
      const response = await apiFetch("/api/ai/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gemini-API-Key": customKey
        },
        body: JSON.stringify({
          action,
          content: note.content,
          language: options.language,
        }),
      });

      const data = await response.json();
      if (response.ok && data.result) {
        setAiResponse(data.result);
        onAddToast(`AI ${action.charAt(0).toUpperCase() + action.slice(1)} completed!`, "success");

        if (action === "tags") {
          try {
            const parsedTags = JSON.parse(data.result);
            if (Array.isArray(parsedTags)) {
              onUpdateNote({
                ...note,
                tags: Array.from(new Set([...note.tags, ...parsedTags])),
                updatedAt: new Date().toISOString(),
              });
              onAddToast("Applied suggested tags!", "success");
            }
          } catch (e) {
            console.error("Tags parser error, display as raw:", e);
          }
        } else if (action === "folders") {
          try {
            const parsed = JSON.parse(data.result);
            if (parsed.suggestedFolder) {
              onUpdateNote({
                ...note,
                folder: parsed.suggestedFolder,
                updatedAt: new Date().toISOString(),
              });
              onAddToast(`Moved to smart category: ${parsed.suggestedFolder}`, "success");
            }
          } catch (e) {
            console.error("Folder parser error:", e);
          }
        }
      } else {
        throw new Error(data.error || "Failed to generate AI action.");
      }
    } catch (error: any) {
      console.warn("AI request failed:", error);
      setAiError(error?.message || "No AI model could be reached. Check your API key in Settings, then try again.");
      onAddToast(error?.message ? `AI unavailable: ${error.message}` : "AI is unavailable right now. Your note was not changed.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatQuery.trim()) return;

    const userMsg = chatQuery.trim();
    setChatQuery("");
    setChatHistory((prev) => [...prev, { sender: "user", text: userMsg }]);
    await sendChat(userMsg);
  };

  const retryChat = () => {
    const lastUser = [...chatHistory].reverse().find((m) => m.sender === "user");
    if (!lastUser) return;
    setChatHistory((prev) => prev.filter((m, i) => !(m.error && i === prev.length - 1)));
    void sendChat(lastUser.text);
  };

  const sendChat = async (userMsg: string) => {
    setIsLoading(true);

    try {
      const customKey = localStorage.getItem(`aura-gemini-api-key-${currentUserEmail}`) || "";
      const response = await apiFetch("/api/ai/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gemini-API-Key": customKey
        },
        body: JSON.stringify({
          action: "chat",
          content: note ? note.content : "",
          userQuery: userMsg,
        }),
      });

      const data = await response.json();
      if (response.ok && data.result) {
        setChatHistory((prev) => [...prev, { sender: "ai", text: data.result }]);
      } else {
        throw new Error(data.error || "Failed to connect to AI chat.");
      }
    } catch (err: any) {
      console.warn("AI chat request failed:", err);
      setChatHistory((prev) => [
        ...prev,
        { sender: "ai", text: "AI is unavailable right now (no model reachable). Nothing was changed. Check your API key in Settings or try again.", error: true },
      ]);
      onAddToast("AI chat unavailable", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    onAddToast("Copied to clipboard!", "success");
  };

  const appendToCurrentNote = (text: string) => {
    if (!note) return;
    onUpdateNote({
      ...note,
      content: note.content + "\n\n### AI Assistant Output:\n" + text,
      updatedAt: new Date().toISOString(),
    });
    onAddToast("Appended to current note!", "success");
  };

  const replaceNoteContent = (text: string) => {
    if (!note) return;
    onUpdateNote({
      ...note,
      content: text,
      updatedAt: new Date().toISOString(),
    });
    onAddToast("Replaced note with AI draft!", "success");
  };

  const QUICK_ACTIONS: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: "summarize", label: "Summarize", icon: <FileText size={14} /> },
    { id: "rewrite", label: "Rewrite", icon: <Sparkles size={14} /> },
    { id: "action-items", label: "Action items", icon: <ListTodo size={14} /> },
    { id: "improve", label: "Polish style", icon: <RefreshCw size={14} /> },
    { id: "meeting-summary", label: "Minutes", icon: <BookOpen size={14} /> },
    { id: "tags", label: "Tags", icon: <Tags size={14} /> },
    { id: "folders", label: "Folder", icon: <FolderPlus size={14} /> },
  ];

  const enabledAgents = agents.filter((a) => a.isEnabled);

  return (
    <div id="ai-panel" className="flex h-full w-full flex-shrink-0 flex-col border-l border-line bg-sidebar text-fg md:w-[380px]">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent" aria-hidden>
            <Bot size={14} />
          </span>
          <h2 className="truncate text-[14px] font-semibold text-fg">Aura Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
          {onNavigateToAgentStudio && (
            <Button size="sm" variant="ghost" onClick={onNavigateToAgentStudio} trailingIcon={<ExternalLink size={11} />} title="Open Agent Studio" className="max-md:!h-10">
              Studio
            </Button>
          )}
          <IconButton id="ai-panel-close-btn" label="Close AI panel" onClick={onClose} className="max-md:!h-10 max-md:!w-10">
            <ChevronRight size={16} />
          </IconButton>
        </div>
      </div>

      <Tabs
        className="shrink-0 px-2"
        value={currentTab}
        onChange={(v: string) => setCurrentTab(v as typeof currentTab)}
        items={[
          { id: "agents", label: "Agents", icon: <Bot size={13} /> },
          { id: "shortcuts", label: "Actions", icon: <Sparkles size={13} /> },
          { id: "chat", label: "Chat", icon: <MessageSquare size={13} /> },
        ]}
      />

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-3">
          {currentTab === "agents" && (
            <>
              <section className="space-y-2">
                <SectionLabel right={`${enabledAgents.length} active`}>Agent</SectionLabel>
                {enabledAgents.length === 0 ? (
                  <EmptyState
                    icon={<Bot size={18} />}
                    title="No agents enabled"
                    description="Enable an agent in Agent Studio to run multi-step workflows."
                    action={onNavigateToAgentStudio && <Button size="sm" onClick={onNavigateToAgentStudio}>Open Agent Studio</Button>}
                  />
                ) : (
                  <div role="radiogroup" aria-label="Select agent" className="space-y-1.5">
                    {enabledAgents.map((ag) => {
                      const isSelected = ag.id === selectedAgent?.id;
                      return (
                        <button
                          key={ag.id}
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSelectedAgentId(ag.id)}
                          className={cn(
                            "flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                            isSelected ? "border-accent bg-accent-soft" : "border-line bg-panel hover:bg-hover",
                          )}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-hover text-[16px]" aria-hidden>{ag.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-[13px] font-medium text-fg">{ag.name}</span>
                              <Badge tone={ag.autonomyLevel === "autonomous" ? "success" : ag.autonomyLevel === "require_approval" ? "warning" : "neutral"}>
                                {ag.autonomyLevel === "autonomous" ? "Auto" : ag.autonomyLevel === "require_approval" ? "Approval" : "Advisory"}
                              </Badge>
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-[12px] text-fg-muted">{ag.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {selectedAgent && (
                <section className="space-y-2 rounded-lg border border-line bg-panel p-3">
                  <SectionLabel right={`${selectedAgent.allowedTools.length} tools`}>Goal</SectionLabel>
                  <Textarea
                    rows={2}
                    aria-label="Agent goal"
                    value={agentGoal}
                    onChange={(e) => setAgentGoal(e.target.value)}
                    placeholder={`Optional goal for ${selectedAgent.name}. Leave blank for the default workflow.`}
                    className="min-h-14 resize-none"
                  />
                  <Button variant="primary" className="w-full max-md:!h-10" onClick={handleRunAgent} loading={isAgentRunning} leadingIcon={<Play size={13} />}>
                    {isAgentRunning ? "Running plan..." : `Run ${selectedAgent.name}`}
                  </Button>
                </section>
              )}

              {activeRun && (
                <section className="space-y-3 border-t border-line pt-4">
                  <SectionLabel right={<RunStatusBadge status={activeRun.status} />}>Run timeline</SectionLabel>
                  {activeRun.steps.length === 0 ? <LoadingLines label="Starting agent run" /> : <RunTimeline run={activeRun} onDecide={handleApprovePendingStep} openNoteId={createdByRun[activeRun.id]} onOpenNote={onSelectNote} />}
                </section>
              )}

              {recentRuns.length > 0 && (
                <section className="space-y-2 border-t border-line pt-4">
                  <SectionLabel>Recent runs</SectionLabel>
                  <ul className="space-y-1">
                    {recentRuns.slice(0, 3).map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => setActiveRun(r)}
                          aria-pressed={activeRun?.id === r.id}
                          className={cn(
                            "flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover",
                            "focus-visible:outline-2 focus-visible:outline-accent",
                            activeRun?.id === r.id && "bg-accent-soft hover:bg-accent-soft",
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span aria-hidden>{agents.find((ag) => ag.id === r.agentId)?.icon}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-fg">{r.agentName}</span>
                              <span className="block truncate text-[12px] text-fg-muted">{r.goal}</span>
                            </span>
                          </span>
                          <Badge tone={r.status === "completed" ? "success" : "warning"}>{r.steps.length} steps</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {currentTab === "shortcuts" &&
            (!note ? (
              <EmptyState
                icon={<Sparkles size={18} />}
                title="Open a note to use quick actions"
                description="Or switch to Agents to run workflows across your whole workspace."
                action={<Button size="sm" onClick={() => setCurrentTab("agents")}>Go to Agents</Button>}
              />
            ) : (
              <>
                <section className="space-y-2">
                  <SectionLabel>Quick actions</SectionLabel>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_ACTIONS.map((qa) => (
                      <Button key={qa.id} variant="secondary" className="justify-start max-md:!h-10" disabled={isLoading} leadingIcon={qa.icon} onClick={() => handleAiAction(qa.id)}>
                        {qa.label}
                      </Button>
                    ))}
                  </div>
                </section>

                <section className="space-y-2">
                  <SectionLabel>Translate</SectionLabel>
                  <div className="flex gap-1.5">
                    <Select aria-label="Target language" className="flex-1 max-md:!h-10" value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)}>
                      {["Spanish", "French", "Japanese", "German", "Mandarin", "Italian", "Portuguese"].map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </Select>
                    <Button variant="secondary" disabled={isLoading} className="max-md:!h-10" leadingIcon={<Languages size={13} />} onClick={() => handleAiAction("translate", { language: selectedLanguage })}>
                      Translate
                    </Button>
                  </div>
                </section>

                {(aiError || isLoading || aiResponse) && (
                  <section className="space-y-2 border-t border-line pt-4">
                    <SectionLabel>Result</SectionLabel>
                    {aiError && !isLoading && (
                      <ErrorBanner message={aiError} onRetry={lastAction ? () => handleAiAction(lastAction.action, lastAction.options) : undefined} onDismiss={() => setAiError(null)} />
                    )}
                    {isLoading && <LoadingLines />}
                    {!isLoading && aiResponse && (
                      <div className="rounded-lg border border-line bg-panel">
                        <div className="max-h-[320px] overflow-y-auto p-3">
                          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg">{aiResponse}</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1 border-t border-line p-1.5">
                          <RowAction onClick={() => copyToClipboard(aiResponse)} icon={<Copy size={12} />}>Copy</RowAction>
                          <RowAction onClick={() => appendToCurrentNote(aiResponse)}>Append</RowAction>
                          <RowAction onClick={() => replaceNoteContent(aiResponse)}>Replace note</RowAction>
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </>
            ))}

          {currentTab === "chat" &&
            (chatHistory.length === 0 ? (
              <EmptyState
                icon={<HelpCircle size={18} />}
                title="Ask about this note"
                description='Try "Summarize the key points" or "Turn the tasks into a table".'
              />
            ) : (
              <div className="space-y-4" aria-live="polite">
                {chatHistory.map((msg, idx) => (
                  <MessageRow
                    key={idx}
                    sender={msg.sender}
                    userName={currentUserEmail || "You"}
                    text={msg.text}
                    error={msg.error}
                    actions={
                      msg.sender === "ai" && msg.error ? (
                        <RowAction onClick={retryChat} icon={<RefreshCw size={12} />}>Retry</RowAction>
                      ) : msg.sender === "ai" ? (
                        <>
                          <RowAction onClick={() => copyToClipboard(msg.text)} icon={<Copy size={12} />}>Copy</RowAction>
                          {note && <RowAction onClick={() => appendToCurrentNote(msg.text)} icon={<ArrowRight size={12} />}>Append</RowAction>}
                        </>
                      ) : undefined
                    }
                  />
                ))}
                {isLoading && <LoadingLines />}
                <div ref={chatEndRef} />
              </div>
            ))}
        </div>

        {currentTab === "chat" && (
          <form onSubmit={handleSendChat} className="shrink-0 border-t border-line p-3">
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <Input
                  aria-label="Message Aura"
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                  placeholder="Ask about this document..."
                  className="max-md:!h-10"
                />
              </div>
              <IconButton type="button" label={isListening ? "Stop dictation" : "Dictate message"} aria-pressed={isListening} onClick={toggleListen} variant={isListening ? "subtle" : "ghost"} className="max-md:!h-10 max-md:!w-10">
                {isListening ? <MicOff size={14} className="text-danger" /> : <Mic size={14} />}
              </IconButton>
              <IconButton type="submit" label="Send message" variant="primary" disabled={!chatQuery.trim() || isLoading} className="max-md:!h-10 max-md:!w-10">
                <Send size={14} />
              </IconButton>
            </div>
            <p className="mt-1.5 hidden items-center gap-1 text-[11px] text-fg-subtle md:flex">
              <Kbd>Enter</Kbd> to send
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
