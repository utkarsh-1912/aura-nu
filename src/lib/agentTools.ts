import {
  AgentDefinition,
  AgentExecutionStep,
  AgentRun,
  AgentToolCall,
  AgentToolName,
  Folder,
  Note,
  Reminder,
} from "../types";

export const BUILT_IN_AGENTS: AgentDefinition[] = [
  {
    id: "agent-researcher",
    name: "Knowledge Synthesizer",
    role: "Cross-Workspace Research & Briefing Agent",
    description:
      "Scans multiple notes across folders, synthesizes key insights, cross-references decisions, and generates an executive briefing note with citations.",
    icon: "BookOpen",
    color: "#3b82f6",
    systemPrompt:
      "You are the Aura Knowledge Synthesizer Agent. Search across workspace notes, synthesize findings with source citations, and create a structured Executive Briefing note.",
    allowedTools: ["search_workspace_notes", "create_structured_note", "update_existing_note"],
    autonomyLevel: "autonomous",
    trigger: "manual",
    departmentScope: "All Departments",
    isEnabled: true,
    isBuiltIn: true,
    totalRuns: 28,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  },
  {
    id: "agent-organizer",
    name: "Workspace Taxonomy Architect",
    role: "Autonomous Folder & Tagging Organizer",
    description:
      "Audits uncategorized or scattered notes, proposes smart folder taxonomy, applies domain tags, and batch-organizes documents.",
    icon: "FolderTree",
    color: "#8b5cf6",
    systemPrompt:
      "You are the Aura Workspace Taxonomy Architect. Inspect workspace notes, identify uncategorized or poorly tagged notes, and organize them into clean folders and tags.",
    allowedTools: ["search_workspace_notes", "organize_notes_into_folders", "update_existing_note"],
    autonomyLevel: "require_approval",
    trigger: "scheduled_daily",
    departmentScope: "Operations & Knowledge",
    isEnabled: true,
    isBuiltIn: true,
    totalRuns: 19,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 130).toISOString(),
  },
  {
    id: "agent-pm",
    name: "OKR & Sprint Extractor",
    role: "Project Action Item & Reminder Agent",
    description:
      "Scans meeting minutes and strategy notes to extract uncompleted action items, creates workspace reminders with due dates, and builds a Sprint Tracker.",
    icon: "CheckSquare",
    color: "#10b981",
    systemPrompt:
      "You are the Aura OKR & Sprint Extractor Agent. Scan workspace notes for tasks, todos, and milestones, create actionable workspace reminders, and compile a Sprint Tracker note.",
    allowedTools: ["search_workspace_notes", "create_workspace_reminders", "create_structured_note"],
    autonomyLevel: "autonomous",
    trigger: "on_note_publish",
    departmentScope: "Engineering & Product",
    isEnabled: true,
    isBuiltIn: true,
    totalRuns: 45,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: "agent-compliance",
    name: "Enterprise DLP & Compliance Auditor",
    role: "Security, PII & Policy Enforcement Agent",
    description:
      "Audits workspace documents and shared links for exposed credentials, PII, or policy gaps, flags risks, and recommends locking sensitive documents.",
    icon: "ShieldAlert",
    color: "#f59e0b",
    systemPrompt:
      "You are the Aura Enterprise DLP & Compliance Auditor. Scan workspace notes for sensitive data, external sharing risks, or missing compliance headers, and generate a security audit report.",
    allowedTools: ["search_workspace_notes", "run_compliance_audit", "create_structured_note"],
    autonomyLevel: "require_approval",
    trigger: "on_compliance_flag",
    departmentScope: "Security & Legal",
    isEnabled: true,
    isBuiltIn: true,
    totalRuns: 14,
    lastRunAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
  },
];

export const AGENT_TOOL_METADATA: Record<
  AgentToolName,
  { label: string; description: string; destructive: boolean }
> = {
  search_workspace_notes: {
    label: "Search Workspace Notes",
    description: "Semantic & keyword search across notes, tags, and folders",
    destructive: false,
  },
  create_structured_note: {
    label: "Create Structured Note",
    description: "Creates a new formatted markdown note in the target folder",
    destructive: false,
  },
  update_existing_note: {
    label: "Update Existing Note",
    description: "Appends or updates content/tags on an existing note",
    destructive: false,
  },
  organize_notes_into_folders: {
    label: "Organize Notes & Folders",
    description: "Creates smart folders and batch-moves/tags notes",
    destructive: true,
  },
  create_workspace_reminders: {
    label: "Create Workspace Reminders",
    description: "Extracts tasks and schedules workspace reminders",
    destructive: false,
  },
  run_compliance_audit: {
    label: "Run DLP & Compliance Audit",
    description: "Scans notes for PII/secrets and optionally locks flagged notes",
    destructive: true,
  },
};

export interface WorkspaceAgentContext {
  workspaceId: string;
  userEmail: string;
  notes: Note[];
  folders: Folder[];
  reminders: Reminder[];
  activeNote?: Note | null;
}

export interface ToolExecutionResult {
  updatedNotes: Note[];
  updatedFolders: Folder[];
  updatedReminders: Reminder[];
  createdNoteId?: string;
  summary: string;
}

export function executeSingleToolCall(
  toolCall: AgentToolCall,
  ctx: WorkspaceAgentContext
): ToolExecutionResult {
  let updatedNotes = [...ctx.notes];
  let updatedFolders = [...ctx.folders];
  let updatedReminders = [...ctx.reminders];
  let createdNoteId: string | undefined;
  let summary = "";

  const wsNotes = updatedNotes.filter(
    (n) => n.workspaceId === ctx.workspaceId && !n.isTrashed && !n.isArchived
  );

  switch (toolCall.toolName) {
    case "search_workspace_notes": {
      const q = (toolCall.args.query || "").toLowerCase();
      const matched = q
        ? wsNotes.filter(
            (n) =>
              n.title.toLowerCase().includes(q) ||
              n.content.toLowerCase().includes(q) ||
              n.tags?.some((t) => t.toLowerCase().includes(q))
          )
        : wsNotes;
      const topTitles = matched
        .slice(0, 5)
        .map((n) => `"${n.title || "Untitled"}"`)
        .join(", ");
      summary = `Scanned ${wsNotes.length} workspace notes; matched ${matched.length} relevant documents (${topTitles || "none"}).`;
      break;
    }

    case "create_structured_note": {
      const title = toolCall.args.title || "🤖 Agent Synthesis Brief";
      const content = toolCall.args.content || "# Agent Brief\n\nGenerated autonomously.";
      const folderName = toolCall.args.folder || "f-strategy";
      const tags: string[] = Array.isArray(toolCall.args.tags)
        ? toolCall.args.tags
        : ["Agent-Generated", "Enterprise"];

      const words = content.trim().split(/\s+/).filter(Boolean).length;
      const newNote: Note = {
        id: `note-agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        workspaceId: ctx.workspaceId,
        title,
        content,
        tags,
        isPinned: true,
        isShared: false,
        isFavorite: false,
        folder: folderName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wordCount: words,
        readingTime: Math.max(1, Math.ceil(words / 200)),
        status: "Draft",
        versionHistory: [],
      };
      updatedNotes = [newNote, ...updatedNotes];
      createdNoteId = newNote.id;
      summary = `Created new note "${title}" (${words} words) with tags [${tags.join(", ")}].`;
      break;
    }

    case "update_existing_note": {
      const targetId = toolCall.args.noteId || ctx.activeNote?.id || wsNotes[0]?.id;
      const appendText = toolCall.args.appendContent || "";
      const addTags: string[] = Array.isArray(toolCall.args.addTags) ? toolCall.args.addTags : [];

      if (targetId) {
        updatedNotes = updatedNotes.map((n) => {
          if (n.id !== targetId) return n;
          const nextContent = appendText ? `${n.content}\n\n${appendText}` : n.content;
          const nextTags = Array.from(new Set([...(n.tags || []), ...addTags]));
          const words = nextContent.trim().split(/\s+/).filter(Boolean).length;
          return {
            ...n,
            content: nextContent,
            tags: nextTags,
            wordCount: words,
            readingTime: Math.max(1, Math.ceil(words / 200)),
            updatedAt: new Date().toISOString(),
          };
        });
        const targetTitle = updatedNotes.find((n) => n.id === targetId)?.title || targetId;
        summary = `Updated note "${targetTitle}"${addTags.length ? ` and added tags [${addTags.join(", ")}]` : ""}.`;
      } else {
        summary = "No target note found to update.";
      }
      break;
    }

    case "organize_notes_into_folders": {
      const categoryFolderName = toolCall.args.targetFolderName || "AI Organized Briefs";
      let targetFolder = updatedFolders.find(
        (f) =>
          f.workspaceId === ctx.workspaceId &&
          f.name.toLowerCase() === categoryFolderName.toLowerCase()
      );
      if (!targetFolder) {
        targetFolder = {
          id: `folder-agent-${Date.now()}`,
          workspaceId: ctx.workspaceId,
          name: categoryFolderName,
          color: "#8b5cf6",
          icon: "🤖",
          isExpanded: true,
        };
        updatedFolders = [...updatedFolders, targetFolder];
      }

      const addTags: string[] = toolCall.args.applyTags || ["Organized", "Audited"];
      let organizedCount = 0;

      updatedNotes = updatedNotes.map((n) => {
        if (n.workspaceId !== ctx.workspaceId || n.isTrashed || n.isArchived) return n;
        const needsTag = !n.tags || n.tags.length < 2;
        if (needsTag || n.folder === "General" || n.folder === "f-general") {
          organizedCount++;
          return {
            ...n,
            tags: Array.from(new Set([...(n.tags || []), ...addTags])),
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      });

      summary = `Ensured smart folder "${targetFolder.name}" exists and enriched taxonomy tags on ${organizedCount} workspace notes.`;
      break;
    }

    case "create_workspace_reminders": {
      const items: string[] = Array.isArray(toolCall.args.items) ? toolCall.args.items : [];
      const newRems: Reminder[] = items.map((text, idx) => ({
        id: `rem-agent-${Date.now()}-${idx}`,
        workspaceId: ctx.workspaceId,
        text,
        date: new Date(Date.now() + (idx + 1) * 86400000).toISOString(),
        completed: false,
      }));
      updatedReminders = [...newRems, ...updatedReminders];
      summary = `Created ${newRems.length} workspace reminders from extracted action items.`;
      break;
    }

    case "run_compliance_audit": {
      const lockShared = !!toolCall.args.lockSharedNotes;
      let flaggedCount = 0;
      updatedNotes = updatedNotes.map((n) => {
        if (n.workspaceId !== ctx.workspaceId || n.isTrashed) return n;
        const hasSensitivePattern =
          /password|secret|api[_-]?key|token|ssn|confidential|private/i.test(n.content) ||
          n.isShared;
        if (hasSensitivePattern) {
          flaggedCount++;
          return {
            ...n,
            tags: Array.from(new Set([...(n.tags || []), "Compliance-Reviewed"])),
            isLocked: lockShared ? true : n.isLocked,
            updatedAt: new Date().toISOString(),
          };
        }
        return n;
      });
      summary = `Audited ${wsNotes.length} notes for PII/credentials & external sharing. Tagged ${flaggedCount} notes with "Compliance-Reviewed"${lockShared ? " and enabled read-only lock" : ""}.`;
      break;
    }
  }

  return {
    updatedNotes,
    updatedFolders,
    updatedReminders,
    createdNoteId,
    summary,
  };
}

export function buildDeterministicAgentPlan(
  agent: AgentDefinition,
  goal: string,
  ctx: WorkspaceAgentContext
): { steps: AgentExecutionStep[]; proposedCalls: AgentToolCall[]; finalSummary: string } {
  const wsNotes = ctx.notes.filter(
    (n) => n.workspaceId === ctx.workspaceId && !n.isTrashed && !n.isArchived
  );
  const now = Date.now();
  const steps: AgentExecutionStep[] = [];
  const proposedCalls: AgentToolCall[] = [];

  steps.push({
    id: `step-${now}-1`,
    type: "thought",
    title: `${agent.name} initialized`,
    detail: `Analyzing goal: "${goal}" across ${wsNotes.length} active documents in workspace.`,
    timestamp: new Date(now).toISOString(),
    durationMs: 180,
  });

  const searchCall: AgentToolCall = {
    id: `tc-${now}-search`,
    toolName: "search_workspace_notes",
    args: { query: "" },
    status: "executed",
    requiresApproval: false,
  };
  proposedCalls.push(searchCall);

  if (agent.id === "agent-researcher") {
    const bulletPoints = wsNotes.slice(0, 6).map((n) => {
      const firstLine =
        n.content
          .split("\n")
          .map((l) => l.replace(/^[#*>-]+\s*/, "").trim())
          .find((l) => l.length > 20) || "Contains core operational specifications.";
      return `- **[${n.title || "Untitled Note"}]** *(Folder: ${n.folder}, Words: ${n.wordCount})*: ${firstLine.slice(0, 140)}`;
    });

    const synthesisContent = `# 🌐 Executive Knowledge Synthesis\n\n**Generated by**: ${agent.name} (${agent.role})  \n**Goal / Directive**: ${goal}  \n**Documents Analyzed**: ${wsNotes.length} workspace notes  \n**Timestamp**: ${new Date().toLocaleString()}\n\n---\n\n## 1. Cross-Note Synthesis & Citations\n${bulletPoints.join("\n") || "- No active notes found in workspace."}\n\n## 2. Strategic Alignment & Themes\n- **Operational Velocity**: Workspace notes emphasize structured execution, clear milestones, and collaborative documentation.\n- **Recommended Next Steps**: Consolidate open drafts into published specifications and review extracted action items.\n\n## 3. Verification Metadata\n| Metric | Value |\n|---|---|\n| Total Words Indexed | ${wsNotes.reduce((acc, n) => acc + (n.wordCount || 0), 0)} |\n| Shared Notes | ${wsNotes.filter((n) => n.isShared).length} |\n| Agent Autonomy | ${agent.autonomyLevel.toUpperCase()} |`;

    proposedCalls.push({
      id: `tc-${now}-create`,
      toolName: "create_structured_note",
      args: {
        title: `📑 Executive Synthesis: ${goal.slice(0, 36)}`,
        content: synthesisContent,
        folder: "f-strategy",
        tags: ["Synthesis", "Agent-Brief", "Executive"],
      },
      status: agent.autonomyLevel === "require_approval" ? "pending_approval" : "executed",
      requiresApproval: agent.autonomyLevel === "require_approval",
    });

    return {
      steps,
      proposedCalls,
      finalSummary: `Synthesized ${wsNotes.length} workspace notes into a new Executive Briefing document with source citations.`,
    };
  }

  if (agent.id === "agent-pm") {
    const extractedTasks: string[] = [];
    wsNotes.forEach((n) => {
      n.content.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (
          trimmed.startsWith("- [ ]") ||
          /\b(todo|action|deliverable|milestone):/i.test(trimmed)
        ) {
          const clean = trimmed.replace(/^- \[ \]\s*/, "").replace(/^[-*]\s*/, "").trim();
          if (clean && extractedTasks.length < 6) {
            extractedTasks.push(`[${n.title || "Note"}] ${clean}`);
          }
        }
      });
    });

    if (extractedTasks.length === 0) {
      extractedTasks.push(
        `Review milestones in "${wsNotes[0]?.title || "Workspace"}"`,
        "Align Q3/Q4 department deliverables and OKR metrics",
        "Audit open Draft notes before weekly stakeholder sync"
      );
    }

    proposedCalls.push({
      id: `tc-${now}-reminders`,
      toolName: "create_workspace_reminders",
      args: { items: extractedTasks },
      status: agent.autonomyLevel === "require_approval" ? "pending_approval" : "executed",
      requiresApproval: agent.autonomyLevel === "require_approval",
    });

    const sprintContent = `# 🎯 Autonomous Sprint & OKR Tracker\n\n**Compiled by**: ${agent.name}  \n**Directive**: ${goal}  \n\n## Extracted Action Items (${extractedTasks.length})\n${extractedTasks.map((t) => `- [ ] ${t}`).join("\n")}\n\n## Source Notes Audited\n${wsNotes.slice(0, 5).map((n) => `- **${n.title || "Untitled"}** (${n.status || "Draft"})`).join("\n")}`;

    proposedCalls.push({
      id: `tc-${now}-sprint-note`,
      toolName: "create_structured_note",
      args: {
        title: `🎯 Sprint Action Tracker (${new Date().toLocaleDateString()})`,
        content: sprintContent,
        folder: "f-projects",
        tags: ["OKR", "Sprint", "Action-Items"],
      },
      status: agent.autonomyLevel === "require_approval" ? "pending_approval" : "executed",
      requiresApproval: agent.autonomyLevel === "require_approval",
    });

    return {
      steps,
      proposedCalls,
      finalSummary: `Extracted ${extractedTasks.length} action items across ${wsNotes.length} notes, scheduled workspace reminders, and generated a Sprint Action Tracker note.`,
    };
  }

  if (agent.id === "agent-organizer") {
    proposedCalls.push({
      id: `tc-${now}-organize`,
      toolName: "organize_notes_into_folders",
      args: {
        targetFolderName: "Executive Knowledge Base",
        applyTags: ["Taxonomy-Verified", "Enterprise"],
      },
      status: agent.autonomyLevel === "require_approval" ? "pending_approval" : "executed",
      requiresApproval: agent.autonomyLevel === "require_approval",
    });

    return {
      steps,
      proposedCalls,
      finalSummary: `Audited ${wsNotes.length} notes for folder & tag hygiene and prepared batch taxonomy organization.`,
    };
  }

  // Default / Compliance Auditor or Custom Agent
  const sharedNotes = wsNotes.filter((n) => n.isShared);
  const sensitiveNotes = wsNotes.filter((n) =>
    /password|secret|api[_-]?key|token|ssn|confidential/i.test(n.content)
  );

  proposedCalls.push({
    id: `tc-${now}-compliance`,
    toolName: "run_compliance_audit",
    args: { lockSharedNotes: false },
    status: agent.autonomyLevel === "require_approval" ? "pending_approval" : "executed",
    requiresApproval: agent.autonomyLevel === "require_approval",
  });

  const auditReport = `# 🛡️ Enterprise DLP & Compliance Audit Report\n\n**Auditor Agent**: ${agent.name}  \n**Scope**: Workspace \`${ctx.workspaceId}\` (${wsNotes.length} active documents)  \n**Triggered By**: ${ctx.userEmail}  \n\n## 1. Executive Risk Summary\n- **Externally Shared Documents**: ${sharedNotes.length}\n- **Keyword-Flagged Documents**: ${sensitiveNotes.length}\n- **Locked / Read-Only Documents**: ${wsNotes.filter((n) => n.isLocked).length}\n\n## 2. Audited Document Inventory\n| Document Title | Shared | Locked | Status |\n|---|---|---|---|\n${wsNotes
    .slice(0, 8)
    .map(
      (n) =>
        `| ${n.title || "Untitled"} | ${n.isShared ? "⚠️ Public Link" : "Private"} | ${n.isLocked ? "🔒 Locked" : "Unlocked"} | ${n.status || "Draft"} |`
    )
    .join("\n")}\n\n## 3. Governance Recommendations\n- Enforce 2FA and SSO session timeouts for external link creation.\n- Lock published specifications after stakeholder sign-off.`;

  proposedCalls.push({
    id: `tc-${now}-audit-note`,
    toolName: "create_structured_note",
    args: {
      title: `🛡️ Compliance & DLP Audit (${new Date().toLocaleDateString()})`,
      content: auditReport,
      folder: "f-general",
      tags: ["Compliance", "Security", "Audit-Report"],
    },
    status: agent.autonomyLevel === "require_approval" ? "pending_approval" : "executed",
    requiresApproval: agent.autonomyLevel === "require_approval",
  });

  return {
    steps,
    proposedCalls,
    finalSummary: `Completed DLP & governance scan over ${wsNotes.length} notes (${sharedNotes.length} shared, ${sensitiveNotes.length} keyword-flagged) and generated a Compliance Audit Report.`,
  };
}

// LocalStorage persistence helpers for Agents & Runs
const AGENTS_STORAGE_KEY = "aura-enterprise-agents-v3";
const AGENT_RUNS_STORAGE_KEY = "aura-enterprise-agent-runs-v3";

export function loadEnterpriseAgents(): AgentDefinition[] {
  try {
    const raw = localStorage.getItem(AGENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AgentDefinition[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn("Failed to load custom agents:", e);
  }
  return BUILT_IN_AGENTS;
}

export function saveEnterpriseAgents(agents: AgentDefinition[]): void {
  try {
    localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
  } catch (e) {
    console.warn("Failed to save enterprise agents:", e);
  }
}

export function loadAgentRuns(): AgentRun[] {
  try {
    const raw = localStorage.getItem(AGENT_RUNS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as AgentRun[];
    }
  } catch (e) {
    console.warn("Failed to load agent runs:", e);
  }
  return [];
}

export function saveAgentRun(run: AgentRun): AgentRun[] {
  const existing = loadAgentRuns();
  const idx = existing.findIndex((r) => r.id === run.id);
  let updated: AgentRun[];
  if (idx >= 0) {
    updated = existing.map((r, i) => (i === idx ? run : r));
  } else {
    updated = [run, ...existing].slice(0, 50);
  }
  try {
    localStorage.setItem(AGENT_RUNS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Failed to save agent run:", e);
  }
  return updated;
}
