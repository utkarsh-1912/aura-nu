import React, { useState, useMemo } from "react";
import {
  Sparkles,
  TrendingUp,
  FileText,
  Pin,
  CheckCircle2,
  Calendar as CalendarIcon,
  Clock,
  ArrowRight,
  Plus,
  Trash2,
  Layers,
  Award,
  Zap,
  Bookmark,
  Users,
  Shield,
  HardDrive,
  Send,
  Share2,
  Copy,
  Move,
  Check,
  Globe,
  Lock,
  Settings as SettingsIcon,
  Activity as ActivityIcon,
  ChevronRight,
  UserPlus,
  FileCode,
  Terminal,
  SlidersHorizontal,
  AlertTriangle,
  Download,
  Upload,
  User,
  Key,
  ShieldAlert,
  ChevronLeft,
  X
} from "lucide-react";
import { Note, Reminder, Activity, Workspace, WorkspaceRole, WorkspaceType, WorkspaceMember, WorkspaceInvitation, AuditLogEntry, Department, Project } from "../types";

interface DashboardProps {
  notes: Note[];
  setActiveNoteId: (id: string | null) => void;
  onNewNoteWithContent: (title: string, content: string, folder: string, tags: string[]) => void;
  reminders: Reminder[];
  onAddReminder: (text: string, date: string) => void;
  onToggleReminder: (id: string) => void;
  onDeleteReminder: (id: string) => void;
  activities: Activity[];
  theme: "light" | "dark";
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onUpdateWorkspace: (updated: Workspace) => void;
  onCopyNote: (noteId: string, targetWorkspaceId: string) => void;
  onMoveNote: (noteId: string, targetWorkspaceId: string) => void;
  onDuplicateNote: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
  currentUserEmail?: string;
}

export default function Dashboard({
  notes,
  setActiveNoteId,
  onNewNoteWithContent,
  reminders,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
  activities,
  theme,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onUpdateWorkspace,
  onCopyNote,
  onMoveNote,
  onDuplicateNote,
  onDeleteNote,
  currentUserEmail = "sandbox@aura.io",
}: DashboardProps) {
  // Tabs: "overview" | "org" | "invites" | "admin"
  const [activeTab, setActiveTab] = useState<"overview" | "org" | "invites" | "admin">("overview");
  const [newReminderText, setNewReminderText] = useState("");
  
  // Workspace specific inputs
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("Contributor");
  const [domainRestriction, setDomainRestriction] = useState("");
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [apiKeyName, setApiKeyName] = useState("");
  const [generatedKeys, setGeneratedKeys] = useState<{ id: string; name: string; key: string; createdAt: string }[]>([]);

  // Cross-Workspace Action Modal States
  const [selectedNoteForAction, setSelectedNoteForAction] = useState<Note | null>(null);
  const [crossActionType, setCrossActionType] = useState<"copy" | "move" | "delete" | null>(null);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");

  // Nested Navigation (Org Tree Breadcrumbs)
  const [currentBreadcrumbs, setCurrentBreadcrumbs] = useState<{ id: string; name: string; type: "org" | "dept" | "proj" | "folder" }[]>([
    { id: "root", name: "Organization", type: "org" }
  ]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Form states for Org Tree editing
  const [newDeptName, setNewDeptName] = useState("");
  const [newProjName, setNewProjName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");

  // Active Workspace context
  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
  }, [workspaces, activeWorkspaceId]);

  // Isolate notes & other state items for CURRENT workspace
  const workspaceNotes = useMemo(() => {
    return notes.filter((n) => n.workspaceId === activeWorkspaceId && !n.isArchived && !n.isTrashed);
  }, [notes, activeWorkspaceId]);

  const workspaceReminders = useMemo(() => {
    return reminders.filter((r) => r.workspaceId === activeWorkspaceId);
  }, [reminders, activeWorkspaceId]);

  const workspaceActivities = useMemo(() => {
    return activities.filter((a) => a.workspaceId === activeWorkspaceId);
  }, [activities, activeWorkspaceId]);

  const pinnedNotes = useMemo(() => {
    return workspaceNotes.filter((n) => n.isPinned);
  }, [workspaceNotes]);

  const recentNotes = useMemo(() => {
    return [...workspaceNotes]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4);
  }, [workspaceNotes]);

  const sharedNotes = useMemo(() => {
    return workspaceNotes.filter((n) => n.isShared);
  }, [workspaceNotes]);

  // Compute stats
  const totalNotesCount = workspaceNotes.length;
  const wordCountSum = workspaceNotes.reduce((sum, n) => sum + (n.wordCount || 0), 0);
  const actualStorageUsed = (workspaceNotes.reduce((sum, n) => sum + (n.content?.length || 0), 0) / 1024).toFixed(2);
  const avgReadingTime = totalNotesCount > 0 
    ? Math.round(workspaceNotes.reduce((sum, n) => sum + (n.readingTime || 0), 0) / totalNotesCount)
    : 0;

  // Folder distribution
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    workspaceNotes.forEach((n) => {
      counts[n.folder] = (counts[n.folder] || 0) + 1;
    });
    return counts;
  }, [workspaceNotes]);

  const folderStats = useMemo(() => {
    return Object.keys(folderCounts).map((folder) => {
      const count = folderCounts[folder];
      const percentage = totalNotesCount > 0 ? Math.round((count / totalNotesCount) * 100) : 0;
      return { name: folder, count, percentage };
    }).sort((a, b) => b.count - a.count);
  }, [folderCounts, totalNotesCount]);

  const handleReminderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderText.trim()) return;
    onAddReminder(newReminderText.trim(), new Date().toISOString());
    setNewReminderText("");
  };

  // Roles permission check helper
  const hasPermission = (permission: string) => {
    const role = activeWorkspace?.role || "Viewer";
    const hierarchy: Record<WorkspaceRole, string[]> = {
      Owner: ["create", "read", "edit", "delete", "share", "export", "ai", "billing", "members", "settings"],
      Admin: ["create", "read", "edit", "delete", "share", "export", "ai", "members", "settings"],
      Manager: ["create", "read", "edit", "delete", "share", "export", "ai", "members"],
      Editor: ["create", "read", "edit", "delete", "share", "export", "ai"],
      Contributor: ["create", "read", "edit", "ai"],
      Commenter: ["read"],
      Viewer: ["read"],
      Guest: ["read"],
    };
    return hierarchy[role]?.includes(permission) || false;
  };

  // Send invitation
  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !hasPermission("members")) return;

    const newInvite: WorkspaceInvitation = {
      id: `inv-${Date.now()}`,
      email: inviteEmail.trim(),
      role: inviteRole,
      status: "pending",
      sentAt: new Date().toISOString().split("T")[0],
      expiresAt: new Date(Date.now() + 3600000 * 24 * 7).toISOString().split("T")[0], // 7 days expiration
    };

    const updatedWorkspace = {
      ...activeWorkspace,
      invitations: [newInvite, ...(activeWorkspace.invitations || [])],
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          userId: "current-user",
          userEmail: currentUserEmail,
          action: `Invited ${inviteEmail} as ${inviteRole}`,
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
        },
        ...(activeWorkspace.auditLogs || []),
      ],
    };

    onUpdateWorkspace(updatedWorkspace);
    setInviteEmail("");
    addWorkspaceActivity(`Invited ${inviteEmail} to workspace`, "workspace");
  };

  // Add domain restriction
  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainRestriction.trim()) return;
    setAllowedDomains([...allowedDomains, domainRestriction.trim()]);
    setDomainRestriction("");
  };

  // Generate API key
  const handleGenerateApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyName.trim()) return;
    const key = "sk_aura_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    setGeneratedKeys([
      { id: `key-${Date.now()}`, name: apiKeyName.trim(), key, createdAt: new Date().toISOString().split("T")[0] },
      ...generatedKeys
    ]);
    setApiKeyName("");
  };

  // Activity helper
  const addWorkspaceActivity = (text: string, type: Activity["type"]) => {
    const act: Activity = {
      id: `act-${Date.now()}`,
      workspaceId: activeWorkspaceId,
      text,
      timestamp: new Date().toISOString(),
      type,
    };
    // Let's assume we can trigger standard activity logs
  };

  // Execute Cross-Workspace Action (Move, Copy, Duplicate)
  const handleCrossActionExecute = () => {
    if (!selectedNoteForAction || !crossActionType) return;

    if (crossActionType === "copy") {
      if (!targetWorkspaceId) return;
      onCopyNote(selectedNoteForAction.id, targetWorkspaceId);
    } else if (crossActionType === "move") {
      if (!targetWorkspaceId) return;
      onMoveNote(selectedNoteForAction.id, targetWorkspaceId);
    } else if (crossActionType === "delete") {
      onDeleteNote(selectedNoteForAction.id);
    }

    // Add Audit Log
    const updatedWorkspace = {
      ...activeWorkspace,
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          userId: "current-user",
          userEmail: currentUserEmail,
          action: `${crossActionType.toUpperCase()} note "${selectedNoteForAction.title}"`,
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
        },
        ...(activeWorkspace.auditLogs || []),
      ],
    };
    onUpdateWorkspace(updatedWorkspace);

    // Reset State
    setSelectedNoteForAction(null);
    setCrossActionType(null);
  };

  const handleAddDeptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim() || !activeWorkspace) return;
    
    const newDept: Department = {
      id: `dept-${Date.now()}`,
      name: newDeptName.trim(),
      projects: []
    };

    const updatedWorkspace = {
      ...activeWorkspace,
      departments: [...(activeWorkspace.departments || []), newDept],
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          userId: "current-user",
          userEmail: currentUserEmail,
          action: `Created department "${newDeptName.trim()}"`,
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
        },
        ...(activeWorkspace.auditLogs || [])
      ]
    };
    onUpdateWorkspace(updatedWorkspace);
    setNewDeptName("");
  };

  const handleAddProjSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim() || !activeWorkspace || !selectedDeptId) return;

    const newProj: Project = {
      id: `proj-${Date.now()}`,
      name: newProjName.trim(),
      folders: ["General"]
    };

    const updatedDepartments = (activeWorkspace.departments || []).map(dept => {
      if (dept.id === selectedDeptId) {
        return {
          ...dept,
          projects: [...dept.projects, newProj]
        };
      }
      return dept;
    });

    const updatedWorkspace = {
      ...activeWorkspace,
      departments: updatedDepartments,
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          userId: "current-user",
          userEmail: currentUserEmail,
          action: `Created project "${newProjName.trim()}"`,
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
        },
        ...(activeWorkspace.auditLogs || [])
      ]
    };
    onUpdateWorkspace(updatedWorkspace);
    setNewProjName("");
  };

  const handleAddFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !activeWorkspace || !selectedDeptId || !selectedProjectId) return;

    const updatedDepartments = (activeWorkspace.departments || []).map(dept => {
      if (dept.id === selectedDeptId) {
        const updatedProjects = dept.projects.map(proj => {
          if (proj.id === selectedProjectId) {
            return {
              ...proj,
              folders: Array.from(new Set([...proj.folders, newFolderName.trim()]))
            };
          }
          return proj;
        });
        return { ...dept, projects: updatedProjects };
      }
      return dept;
    });

    const updatedWorkspace = {
      ...activeWorkspace,
      departments: updatedDepartments,
      auditLogs: [
        {
          id: `aud-${Date.now()}`,
          userId: "current-user",
          userEmail: currentUserEmail,
          action: `Created project folder "${newFolderName.trim()}"`,
          timestamp: new Date().toISOString(),
          ipAddress: "127.0.0.1",
        },
        ...(activeWorkspace.auditLogs || [])
      ]
    };
    onUpdateWorkspace(updatedWorkspace);
    setNewFolderName("");
  };

  // Mini Calendar Calculations
  const calendarDays = useMemo(() => {
    const days = [];
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // First day of current month
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Fill empty offset days
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ day: "", currentMonth: false });
    }

    // Fill actual month days
    for (let d = 1; d <= totalDays; d++) {
      // Check if there are tasks or notes on this day
      const isToday = d === date.getDate();
      days.push({ day: d, currentMonth: true, isToday });
    }
    return days;
  }, []);

  return (
    <div
      id="dashboard-view-panel"
      className="flex-grow h-full overflow-y-auto p-6 md:p-8 transition-colors duration-200 bg-bg-primary text-text-primary"
    >
      {/* Workspace Header Banner */}
      <div className="max-w-5xl mx-auto mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                activeWorkspace?.type === "Personal" ? "bg-amber-500/10 text-amber-500" :
                activeWorkspace?.type === "Team" ? "bg-blue-500/10 text-blue-500" :
                activeWorkspace?.type === "Organization" ? "bg-purple-500/10 text-purple-500" :
                activeWorkspace?.type === "Client" ? "bg-emerald-500/10 text-emerald-500" :
                "bg-cyan-500/10 text-cyan-500"
              }`}>
                {activeWorkspace?.type || "Personal"} Workspace
              </span>
              <span className="text-[10px] bg-slate-500/10 text-slate-400 font-mono px-2 py-0.5 rounded-md">
                Role: {activeWorkspace?.role || "Owner"}
              </span>
            </div>
            <h1 className="font-display font-black text-[30px] md:text-[34px] tracking-tight mt-2.5 text-slate-900 dark:text-white flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-display text-base text-white font-extrabold bg-gradient-to-tr ${
                activeWorkspace?.type === "Personal" ? "from-amber-400 to-orange-500" :
                activeWorkspace?.type === "Team" ? "from-blue-500 to-indigo-600" :
                activeWorkspace?.type === "Organization" ? "from-purple-500 to-pink-600" :
                activeWorkspace?.type === "Client" ? "from-emerald-400 to-teal-600" :
                "from-cyan-500 to-blue-600"
              }`}>
                {activeWorkspace?.name[0].toUpperCase()}
              </div>
              {activeWorkspace?.name || "Workspace Dashboard"}
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-xl">
              Isolated enterprise environment node. Create, isolate, secure, and index files instantly.
            </p>
          </div>

          {/* Quick Stats Block */}
          <div className="flex items-center gap-3 bg-slate-100/40 dark:bg-zinc-900/40 border border-slate-200/40 dark:border-zinc-800/40 p-3 rounded-2xl">
            <HardDrive size={15} className="text-slate-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-mono">Storage usage</span>
              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                {actualStorageUsed} KB / {activeWorkspace?.storageQuota || 5} MB
              </span>
            </div>
          </div>
        </div>

        {/* Dashboard Sub-navigation Tabs */}
        <div className="flex gap-1.5 mt-6 border-b border-slate-200/60 dark:border-zinc-800/80 pb-0.5 overflow-x-scroll scrollbar-thin scrollbar-thumb-slate-300/40 dark:scrollbar-thumb-zinc-700/40 scrollbar-track-transparent">
          {[
            { id: "overview", label: "Overview", icon: TrendingUp },
            { id: "org", label: "Departments & Projects", icon: Layers },
            { id: "invites", label: "Members & Invites", icon: Users },
            { id: "admin", label: "Admin Console", icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-blue-500 text-white font-bold"
                    : "text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900"
                }`}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Content Switcher */}
      <div className="max-w-5xl mx-auto">
        
        {/* VIEW 1: OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Column (Recent documents, AI Insights) */}
            <div className="md:col-span-2 flex flex-col gap-6">
              
              {/* Analytics Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className={`p-4 rounded-2xl border ${
                  "bg-bg-secondary border-border-primary"
                } shadow-xs`}>
                  <span className="text-slate-400 dark:text-zinc-500 text-xs font-medium">Total Notes</span>
                  <div className="font-display font-black text-2xl mt-1 text-slate-900 dark:text-white">{totalNotesCount}</div>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1 block font-mono">Isolated Files</span>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  "bg-bg-secondary border-border-primary"
                } shadow-xs`}>
                  <span className="text-slate-400 dark:text-zinc-500 text-xs font-medium">Words Logged</span>
                  <div className="font-display font-black text-2xl mt-1 text-slate-900 dark:text-white">{wordCountSum}</div>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1 block font-mono">Total Volume</span>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  "bg-bg-secondary border-border-primary"
                } shadow-xs`}>
                  <span className="text-slate-400 dark:text-zinc-500 text-xs font-medium">Members</span>
                  <div className="font-display font-black text-2xl mt-1 text-slate-900 dark:text-white">{(activeWorkspace?.members || []).length}</div>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1 block font-mono">Access Keys</span>
                </div>
              </div>

              {/* Recent Notes Table (With Action Menus) */}
              <div className={`p-5 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display font-bold text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <Clock size={15} className="text-blue-500" />
                    Documents
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-900 px-2.5 py-1 rounded-md">
                    {recentNotes.length} files
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {recentNotes.map((note) => (
                    <div
                      key={note.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between group transition-all ${
                        theme === "dark"
                          ? "bg-zinc-900/50 border-zinc-850 hover:bg-zinc-850"
                          : "bg-slate-50/40 border-slate-100 hover:bg-white hover:shadow-xs hover:border-slate-200"
                      }`}
                    >
                      <div
                        onClick={() => setActiveNoteId(note.id)}
                        className="flex items-center gap-3 cursor-pointer flex-grow min-w-0 pr-4"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 flex-shrink-0">
                          <FileText size={15} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 group-hover:text-blue-500 transition-colors truncate">
                            {note.title}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono mt-0.5 truncate">
                            {note.folder} • {note.tags.join(", ") || "No tags"}
                          </span>
                        </div>
                      </div>

                      {/* Document Actions Menu */}
                      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all">
                        {hasPermission("edit") && (
                          <>
                            {/* Copy Note to other workspace */}
                            <button
                              onClick={() => {
                                setSelectedNoteForAction(note);
                                setCrossActionType("copy");
                                setTargetWorkspaceId(workspaces.find((w) => w.id !== activeWorkspaceId)?.id || "");
                              }}
                              className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 cursor-pointer"
                              title="Copy to Workspace"
                            >
                              <Copy size={11} />
                            </button>

                            {/* Move Note to other workspace */}
                            <button
                              onClick={() => {
                                setSelectedNoteForAction(note);
                                setCrossActionType("move");
                                setTargetWorkspaceId(workspaces.find((w) => w.id !== activeWorkspaceId)?.id || "");
                              }}
                              className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 cursor-pointer"
                              title="Move to Workspace"
                            >
                              <Move size={11} />
                            </button>

                            {/* Duplicate note within current workspace */}
                            <button
                              onClick={() => onDuplicateNote(note.id)}
                              className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 cursor-pointer"
                              title="Duplicate note"
                            >
                              <Plus size={11} />
                            </button>
                          </>
                        )}

                        {hasPermission("delete") && (
                          <button
                            onClick={() => {
                              setSelectedNoteForAction(note);
                              setCrossActionType("delete");
                            }}
                            className="p-1.5 rounded bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-950 text-red-500 cursor-pointer"
                            title="Trash note"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>

                      {/* Arrow indication */}
                      <div className="flex items-center gap-2 group-hover:hidden pl-1">
                        {note.isPinned && <Pin size={11} className="text-amber-500 fill-amber-500" />}
                        {note.isShared && <Share2 size={11} className="text-blue-500" />}
                      </div>
                    </div>
                  ))}

                  {recentNotes.length === 0 && (
                    <div className="h-28 flex flex-col items-center justify-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                      <FileText size={20} className="mb-2 text-slate-300" />
                      <span>This workspace has no notes yet.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Shared Documents Panel */}
              {sharedNotes.length > 0 && (
                <div className={`p-5 rounded-2xl border ${
                  "bg-bg-secondary border-border-primary"
                } shadow-xs`}>
                  <h3 className="font-display font-bold text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
                    <Share2 size={15} className="text-emerald-500" />
                    Shared & Public Assets
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sharedNotes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => setActiveNoteId(note.id)}
                        className={`p-3 rounded-xl border border-slate-100 dark:border-zinc-850 hover:border-slate-200 dark:hover:border-zinc-800 cursor-pointer transition-colors flex items-center gap-2.5 ${
                          theme === "dark" ? "bg-zinc-950/20" : "bg-slate-50/20"
                        }`}
                      >
                        <Globe size={13} className="text-emerald-500 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200 truncate">{note.title}</span>
                          <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-mono">Shared External</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI History Logs & Insights */}
              <div className={`p-5 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
                  <Sparkles size={15} className="text-indigo-500 animate-pulse" />
                  Contextual AI Activity & Insights
                </h3>
                {activeWorkspace?.aiHistory && activeWorkspace.aiHistory.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {activeWorkspace.aiHistory.map((h, i) => (
                      <div key={i} className="p-3 bg-indigo-50/30 dark:bg-indigo-950/10 rounded-xl border border-indigo-100/50 dark:border-indigo-950/40 text-[11px]">
                        <div className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1">
                          <Terminal size={11} className="text-indigo-400" />
                          <span>Prompt: "{h.prompt}"</span>
                        </div>
                        <p className="text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
                          {h.result}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3.5 bg-slate-50 dark:bg-zinc-950/40 rounded-xl text-[11px] text-slate-400 leading-relaxed border border-dashed border-slate-200 dark:border-zinc-850">
                    Your workspace AI assistant logs summarize prompt interactions automatically here. Try asking Gemini to summarize or write checklists within notes to populate these logs.
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (Reminders, Calendar, Members Summary) */}
            <div className="flex flex-col gap-6">
              
              {/* Reminders & Actions */}
              <div className={`p-5 rounded-2xl border flex flex-col h-[280px] ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
                  <CheckCircle2 size={15} className="text-blue-500" />
                  Reminders & Tasks
                </h3>

                {/* Checklist */}
                <div className="flex-grow overflow-y-auto flex flex-col gap-2 pb-2 scrollbar-none no-scrollbar">
                  {workspaceReminders.map((rem) => (
                    <div
                      key={rem.id}
                      className="flex items-start gap-2 group justify-between"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <button
                          onClick={() => onToggleReminder(rem.id)}
                          className={`mt-0.5 w-4.5 h-4.5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${
                            rem.completed
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "border-slate-300 dark:border-zinc-700 hover:border-emerald-400"
                          } cursor-pointer`}
                        >
                          {rem.completed && <Check size={10} className="stroke-[3]" />}
                        </button>
                        <span className={`text-xs leading-tight break-all ${
                          rem.completed ? "line-through text-slate-400 dark:text-zinc-500" : "text-slate-700 dark:text-zinc-200 font-medium"
                        }`}>
                          {rem.text}
                        </span>
                      </div>
                      <button
                        onClick={() => onDeleteReminder(rem.id)}
                        className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all cursor-pointer"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}

                  {workspaceReminders.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                      <CalendarIcon size={18} className="mb-1" />
                      <span className="text-[10px]">No pending reminders</span>
                    </div>
                  )}
                </div>

                {/* Form */}
                <form onSubmit={handleReminderSubmit} className="flex gap-1.5 mt-auto pt-2 border-t border-slate-100 dark:border-zinc-800">
                  <input
                    type="text"
                    placeholder="Create reminder..."
                    value={newReminderText}
                    onChange={(e) => setNewReminderText(e.target.value)}
                    className={`flex-grow text-[11px] px-3 py-2 rounded-xl border outline-none ${
                      theme === "dark"
                        ? "bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-700"
                        : "bg-slate-100/60 border-slate-200 text-slate-700 focus:bg-white focus:border-blue-400"
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={!newReminderText.trim()}
                    className={`p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-xs flex items-center justify-center flex-shrink-0 ${
                      !newReminderText.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                    }`}
                  >
                    <Plus size={13} />
                  </button>
                </form>
              </div>

              {/* Mini Calendar */}
              <div className={`p-4 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <CalendarIcon size={13} className="text-blue-500" />
                    <span>Workspace Calendar</span>
                  </h4>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date().toLocaleDateString([], { month: "short", year: "numeric" })}
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold">
                  {calendarDays.map((cd, idx) => (
                    <div
                      key={idx}
                      className={`h-6 flex items-center justify-center rounded-lg ${
                        cd.isToday
                          ? "bg-blue-500 text-white"
                          : cd.day
                          ? "hover:bg-slate-100 dark:hover:bg-zinc-800/80 text-slate-700 dark:text-zinc-300"
                          : "text-slate-300 dark:text-zinc-800"
                      }`}
                    >
                      {cd.day}
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Members Bar */}
              <div className={`p-4 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 mb-3 flex justify-between items-center">
                  <span>Workspace Access</span>
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-mono">
                    {(activeWorkspace?.members || []).length} users
                  </span>
                </h4>
                <div className="flex flex-col gap-2">
                  {(activeWorkspace?.members || []).map((m) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] text-white font-extrabold font-display">
                          {m.name[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 truncate max-w-[100px]">
                            {m.name}
                          </span>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 capitalize">{m.role}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* VIEW 2: DEPARTMENTS & PROJECTS (Org Tree) */}
        {activeTab === "org" && (
          <div className={`p-6 rounded-2xl border ${
            "bg-bg-secondary border-border-primary"
          } shadow-xs`}>
            
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 mb-6 bg-slate-100/50 dark:bg-zinc-900/50 p-2.5 rounded-xl border border-slate-200/40 dark:border-zinc-800/40 text-[11px] overflow-x-auto scrollbar-none whitespace-nowrap">
              <Layers size={13} className="text-blue-500 shrink-0" />
              <button
                onClick={() => {
                  setSelectedDeptId(null);
                  setSelectedProjectId(null);
                  setSelectedFolderId(null);
                }}
                className="hover:text-blue-500 cursor-pointer font-semibold text-slate-600 dark:text-zinc-300 shrink-0"
              >
                {activeWorkspace?.name}
              </button>
              
              {selectedDeptId && (
                <>
                  <ChevronRight size={10} className="text-slate-400 shrink-0" />
                  <button
                    onClick={() => {
                      setSelectedProjectId(null);
                      setSelectedFolderId(null);
                    }}
                    className="hover:text-blue-500 cursor-pointer text-slate-700 dark:text-zinc-200 font-semibold shrink-0"
                  >
                    {activeWorkspace?.departments?.find((d) => d.id === selectedDeptId)?.name}
                  </button>
                </>
              )}

              {selectedProjectId && (
                <>
                  <ChevronRight size={10} className="text-slate-400 shrink-0" />
                  <button
                    onClick={() => setSelectedFolderId(null)}
                    className="hover:text-blue-500 cursor-pointer text-slate-700 dark:text-zinc-200 font-semibold shrink-0"
                  >
                    {activeWorkspace?.departments
                      ?.find((d) => d.id === selectedDeptId)
                      ?.projects.find((p) => p.id === selectedProjectId)?.name}
                  </button>
                </>
              )}

              {selectedFolderId && (
                <>
                  <ChevronRight size={10} className="text-slate-400 shrink-0" />
                  <span className="text-slate-400 font-mono shrink-0">{selectedFolderId}</span>
                </>
              )}
            </div>

            {/* Tree renderer */}
            <div>
              {/* Level 1: Departments */}
              {!selectedDeptId && (
                <div>
                  <div className="mb-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Departments</h3>
                    <p className="text-[11px] text-slate-500">Select a department node within the organization.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {activeWorkspace?.departments && activeWorkspace.departments.length > 0 &&
                      activeWorkspace.departments.map((dept) => (
                        <div
                          key={dept.id}
                          onClick={() => setSelectedDeptId(dept.id)}
                          className={`p-4 rounded-xl border border-slate-100 dark:border-zinc-850 hover:border-blue-300 hover:shadow-xs cursor-pointer transition-all flex justify-between items-center ${
                            theme === "dark" ? "bg-zinc-950/20 hover:bg-zinc-950/40" : "bg-slate-50/30 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                              <Layers size={15} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{dept.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono mt-0.5">{dept.projects.length} Projects</span>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-400" />
                        </div>
                      ))}
                  </div>

                  {hasPermission("settings") && (
                    <form onSubmit={handleAddDeptSubmit} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-md">
                      <input
                        type="text"
                        placeholder="New Department name (e.g. Sales)"
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        className={`text-xs px-3 py-2.5 rounded-xl border outline-none flex-grow ${
                          theme === "dark"
                            ? "bg-zinc-950 border-zinc-805 text-zinc-300 focus:border-zinc-700"
                            : "bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:border-blue-400"
                        }`}
                      />
                      <button type="submit" className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs whitespace-nowrap">
                        Add Department
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Level 2: Projects inside Department */}
              {selectedDeptId && !selectedProjectId && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <button
                      onClick={() => setSelectedDeptId(null)}
                      className="text-xs text-blue-500 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <ChevronLeft size={13} />
                      Back to Departments
                    </button>
                    <span className="text-[10px] font-mono text-slate-400">Department Node Selected</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeWorkspace?.departments
                      ?.find((d) => d.id === selectedDeptId)
                      ?.projects.map((proj) => (
                        <div
                          key={proj.id}
                          onClick={() => setSelectedProjectId(proj.id)}
                          className={`p-4 rounded-xl border border-slate-100 dark:border-zinc-850 hover:border-blue-300 hover:shadow-xs cursor-pointer transition-all flex justify-between items-center ${
                            theme === "dark" ? "bg-zinc-950/20 hover:bg-zinc-950/40" : "bg-slate-50/30 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                              <SlidersHorizontal size={15} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{proj.name}</span>
                              <span className="text-[9px] text-slate-400 font-mono mt-0.5">{proj.folders.length} Folders</span>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-400" />
                        </div>
                      ))}
                  </div>

                  {hasPermission("settings") && (
                    <form onSubmit={handleAddProjSubmit} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-md">
                      <input
                        type="text"
                        placeholder="New Project name (e.g. CRM System)"
                        value={newProjName}
                        onChange={(e) => setNewProjName(e.target.value)}
                        className={`text-xs px-3 py-2.5 rounded-xl border outline-none flex-grow ${
                          theme === "dark"
                            ? "bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-700"
                            : "bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:border-blue-400"
                        }`}
                      />
                      <button type="submit" className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs whitespace-nowrap">
                        Add Project
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Level 3: Folders inside Project */}
              {selectedProjectId && !selectedFolderId && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <button
                      onClick={() => setSelectedProjectId(null)}
                      className="text-xs text-blue-500 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <ChevronLeft size={13} />
                      Back to Projects
                    </button>
                    <span className="text-[10px] font-mono text-slate-400">Project Node Selected</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {activeWorkspace?.departments
                      ?.find((d) => d.id === selectedDeptId)
                      ?.projects.find((p) => p.id === selectedProjectId)
                      ?.folders.map((folder) => (
                        <div
                          key={folder}
                          onClick={() => setSelectedFolderId(folder)}
                          className={`p-4 rounded-xl border border-slate-100 dark:border-zinc-850 hover:border-blue-300 hover:shadow-xs cursor-pointer transition-all flex justify-between items-center ${
                            theme === "dark" ? "bg-zinc-950/20 hover:bg-zinc-950/40" : "bg-slate-50/30 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                              <Bookmark size={15} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{folder}</span>
                              <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                                {workspaceNotes.filter((n) => n.folder === folder && n.projectId === selectedProjectId).length} Notes
                              </span>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-400" />
                        </div>
                      ))}
                  </div>

                  {hasPermission("settings") && (
                    <form onSubmit={handleAddFolderSubmit} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-md">
                      <input
                        type="text"
                        placeholder="New Folder name (e.g. Specs)"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className={`text-xs px-3 py-2.5 rounded-xl border outline-none flex-grow ${
                          theme === "dark"
                            ? "bg-zinc-950 border-zinc-805 text-zinc-300 focus:border-zinc-700"
                            : "bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:border-blue-400"
                        }`}
                      />
                      <button type="submit" className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs whitespace-nowrap">
                        Add Folder
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Level 4: Notes inside Folder */}
              {selectedFolderId && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <button
                      onClick={() => setSelectedFolderId(null)}
                      className="text-xs text-blue-500 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <ChevronLeft size={13} />
                      Back to Folders
                    </button>
                    <span className="text-[10px] font-mono text-slate-400">Folder Node: {selectedFolderId}</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {workspaceNotes
                      .filter((n) => n.folder === selectedFolderId && n.projectId === selectedProjectId)
                      .map((note) => (
                        <div
                          key={note.id}
                          onClick={() => setActiveNoteId(note.id)}
                          className={`p-3 rounded-xl border border-slate-100 dark:border-zinc-850 hover:border-blue-300 cursor-pointer flex items-center justify-between group transition-colors ${
                            theme === "dark" ? "bg-zinc-900/50 hover:bg-zinc-900" : "bg-slate-50/30 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <FileText size={14} className="text-slate-400" />
                            <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 group-hover:text-blue-500 transition-colors">
                              {note.title}
                            </span>
                          </div>
                          <ArrowRight size={12} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      ))}

                    {workspaceNotes.filter((n) => n.folder === selectedFolderId && n.projectId === selectedProjectId).length === 0 && (
                      <div className="text-center py-10 text-slate-400 text-xs border border-dashed border-slate-200 dark:border-zinc-850 rounded-xl bg-slate-50/40 dark:bg-zinc-950/20">
                        No notes currently localized inside this nested folder node. Create or move notes here.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* VIEW 3: MEMBERS & INVITATIONS */}
        {activeTab === "invites" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Column (Members List) */}
            <div className="md:col-span-2 flex flex-col gap-6">
              
              {/* Member lists */}
              <div className={`p-5 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-zinc-100 mb-4">
                  Active Workspace Team ({activeWorkspace?.members?.length || 0})
                </h3>

                <div className="flex flex-col gap-3">
                  {(activeWorkspace?.members || []).map((m) => (
                    <div key={m.id} className="p-3 bg-slate-50/50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-850/60 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 text-white flex items-center justify-center font-display font-black text-xs">
                          {m.name[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-850 dark:text-zinc-200">{m.name}</span>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono mt-0.5">{m.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] bg-slate-200/50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 px-2 py-0.5 rounded capitalize">
                          {m.role}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400 hidden sm:inline">Joined {m.joinedAt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending invitations table */}
              <div className={`p-5 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-zinc-100 mb-3 flex justify-between items-center">
                  <span>Pending Outbound Invites</span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-zinc-900 px-2 py-0.5 rounded">
                    {(activeWorkspace?.invitations || []).filter((i) => i.status === "pending").length} pending
                  </span>
                </h3>

                <div className="flex flex-col gap-2.5">
                  {(activeWorkspace?.invitations || []).map((inv) => (
                    <div key={inv.id} className="p-3 bg-slate-50/20 dark:bg-zinc-950/20 rounded-xl border border-slate-100 dark:border-zinc-850 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-850 dark:text-zinc-100">{inv.email}</span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">Expires {inv.expiresAt}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono uppercase bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded">
                          {inv.status}
                        </span>
                        <span className="text-[10px] text-slate-400">Role: {inv.role}</span>
                      </div>
                    </div>
                  ))}

                  {(activeWorkspace?.invitations || []).length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                      No pending outbound email invites.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Right Column (Invite Forms, Share Links) */}
            <div className="flex flex-col gap-6">
              
              {/* Send Invite Form */}
              {hasPermission("members") ? (
                <div className={`p-5 rounded-2xl border ${
                  "bg-bg-secondary border-border-primary"
                } shadow-xs`}>
                  <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                    <UserPlus size={13} className="text-blue-500" />
                    <span>Invite Team Node</span>
                  </h3>
                  <form onSubmit={handleSendInvite} className="flex flex-col gap-3">
                    <input
                      type="email"
                      required
                      placeholder="teammate@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${
                        theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-800"
                      }`}
                    />
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-slate-400">Workspace Role</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                        className={`w-full px-2 py-1.5 text-xs rounded-lg border outline-none ${
                          theme === "dark" ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
                        }`}
                      >
                        <option value="Admin">Admin (Full administrative controls)</option>
                        <option value="Manager">Manager (Billing & User Management)</option>
                        <option value="Editor">Editor (Read, Edit, Create, Delete)</option>
                        <option value="Contributor">Contributor (Read, Create, Edit)</option>
                        <option value="Viewer">Viewer (Read Only)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 transition-transform active:scale-[0.98]"
                    >
                      <Send size={11} />
                      <span>Dispatch Invitation</span>
                    </button>
                  </form>
                </div>
              ) : (
                <div className="p-4 bg-amber-500/5 border border-amber-500/10 text-amber-500 rounded-2xl flex items-start gap-2.5">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">Inadequate Authorization</span>
                    <p className="text-[10px] leading-relaxed mt-0.5 text-slate-400">
                      Your current workspace role ({activeWorkspace?.role}) does not have permission to invite teammates.
                    </p>
                  </div>
                </div>
              )}

              {/* Domain Restriction Policies */}
              <div className={`p-5 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                  <Globe size={13} className="text-indigo-500" />
                  <span>Domain Restrictions</span>
                </h3>
                <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
                  Restrict user self-onboarding to specific enterprise domains.
                </p>
                <form onSubmit={handleAddDomain} className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="e.g. company.com"
                    value={domainRestriction}
                    onChange={(e) => setDomainRestriction(e.target.value)}
                    className={`flex-grow px-2.5 py-1.5 text-xs rounded-lg border outline-none ${
                      theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  />
                  <button type="submit" className="px-3 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg cursor-pointer">
                    Add
                  </button>
                </form>

                <div className="flex flex-wrap gap-1">
                  {allowedDomains.map((dom, idx) => (
                    <span key={idx} className="text-[9.5px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full font-mono flex items-center gap-1">
                      <span>{dom}</span>
                      <X size={9} className="cursor-pointer hover:text-indigo-600" onClick={() => setAllowedDomains(allowedDomains.filter((d) => d !== dom))} />
                    </span>
                  ))}
                  {allowedDomains.length === 0 && (
                    <span className="text-[10px] text-slate-400">Open domain access (No restriction rules)</span>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* VIEW 4: ADMIN CONSOLE */}
        {activeTab === "admin" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Column (Audit Logs & Storage Policies) */}
            <div className="md:col-span-2 flex flex-col gap-6">
              
              {/* Audit logs table */}
              <div className={`p-5 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-zinc-100 mb-3 flex items-center gap-1.5">
                  <Shield size={14} className="text-blue-500" />
                  Enterprise Audit Logs
                </h3>
                
                <div className="flex flex-col gap-2.5">
                  {(activeWorkspace?.auditLogs || []).map((log) => (
                    <div key={log.id} className="p-3 bg-slate-50/30 dark:bg-zinc-900/20 border border-slate-100 dark:border-zinc-800 rounded-xl text-[10.5px]">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800 dark:text-zinc-200">{log.action}</span>
                        <span className="text-[9.5px] text-slate-400 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 font-mono mt-1">
                        <span>User: {log.userEmail}</span>
                        <span>•</span>
                        <span>IP: {log.ipAddress}</span>
                      </div>
                    </div>
                  ))}

                  {(activeWorkspace?.auditLogs || []).length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                      Audit trails load automatically. No security triggers recorded.
                    </div>
                  )}
                </div>
              </div>

              {/* Compliance & Security Panel */}
              <div className={`p-5 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-zinc-100 mb-3">
                  Security Policies & SSO Compliance
                </h3>

                <div className="flex flex-col gap-4">
                  {[
                    { id: "sso", title: "Single Sign-On (SAML/OIDC)", desc: "Enforce employee authentication via enterprise identity provider.", defaultVal: true },
                    { id: "enc", title: "Strict Content Quarantine", desc: "Isolate Gemini AI content outputs automatically into localized node logs.", defaultVal: false },
                    { id: "compliance", title: "GDPR/HIPAA Log Redundancy", desc: "Automate raw file export backups directly onto secured local volumes.", defaultVal: true }
                  ].map((pol) => (
                    <div key={pol.id} className="flex justify-between items-start gap-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{pol.title}</span>
                        <span className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{pol.desc}</span>
                      </div>
                      <div className="w-9 h-5 bg-blue-500/20 rounded-full relative p-0.5 cursor-pointer flex items-center">
                        <div className="w-4 h-4 bg-blue-500 rounded-full translate-x-4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right Column (Integrations, API keys) */}
            <div className="flex flex-col gap-6">
              
              {/* API Key management */}
              <div className={`p-5 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                  <Key size={13} className="text-blue-500" />
                  <span>Aura Developer API Keys</span>
                </h3>

                <form onSubmit={handleGenerateApiKey} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    required
                    placeholder="Key name (e.g. CI Sync)"
                    value={apiKeyName}
                    onChange={(e) => setApiKeyName(e.target.value)}
                    className={`flex-grow px-2.5 py-1.5 text-xs rounded-lg border outline-none ${
                      theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  />
                  <button type="submit" className="px-3 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg cursor-pointer">
                    Create
                  </button>
                </form>

                <div className="flex flex-col gap-2">
                  {generatedKeys.map((key) => (
                    <div key={key.id} className="p-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200/50 dark:border-zinc-850 rounded-xl text-[10px] font-mono">
                      <div className="flex justify-between font-bold text-slate-700 dark:text-zinc-300">
                        <span>{key.name}</span>
                        <span className="text-slate-400">{key.createdAt}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 bg-slate-200/50 dark:bg-zinc-900 px-1.5 py-1 rounded text-slate-500">
                        <span className="truncate flex-grow">{key.key}</span>
                        <Check size={11} className="text-emerald-500 cursor-pointer shrink-0" />
                      </div>
                    </div>
                  ))}
                  {generatedKeys.length === 0 && (
                    <p className="text-[10px] text-slate-400 leading-relaxed">No developer API tokens generated yet. Integrate with external workflows easily.</p>
                  )}
                </div>
              </div>

              {/* Integrations panel */}
              <div className={`p-5 rounded-2xl border ${
                "bg-bg-secondary border-border-primary"
              } shadow-xs`}>
                <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                  <Globe size={13} className="text-indigo-500" />
                  <span>Workspace Integrations</span>
                </h3>
                <div className="flex flex-col gap-3">
                  {(activeWorkspace?.integrations || []).map((int) => (
                    <div key={int.id} className="p-3 bg-slate-50/30 dark:bg-zinc-950/20 border border-slate-100 dark:border-zinc-850 rounded-xl flex justify-between items-center">
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{int.name}</span>
                        <span className="text-[9px] text-slate-400 dark:text-zinc-500 leading-normal mt-0.5">{int.desc}</span>
                      </div>
                      <button
                        className={`text-[9.5px] px-2 py-0.5 rounded font-bold font-mono transition-colors shrink-0 cursor-pointer ${
                          int.status === "Connected"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-slate-200 dark:bg-zinc-800 text-slate-400 hover:text-indigo-500"
                        }`}
                      >
                        {int.status}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* CONFIRMATION DIALOG MODAL FOR CROSS-WORKSPACE ACTIONS */}
      {selectedNoteForAction && crossActionType && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none">
          <div className="p-5 rounded-2xl border border-border-primary max-w-sm w-full shadow-2xl bg-bg-secondary text-text-primary">
            <div className="flex items-center gap-2 text-amber-500 mb-3">
              <AlertTriangle size={18} />
              <h4 className="font-bold text-sm uppercase tracking-tight">Confirm Isolate Action</h4>
            </div>

            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to <strong>{crossActionType}</strong> the note <strong>"{selectedNoteForAction.title}"</strong>?
              {crossActionType !== "delete" && " Select the target workspace destination below:"}
            </p>

            {/* Target Workspace Selector (If not delete) */}
            {crossActionType !== "delete" && (
              <div className="flex flex-col gap-1 mt-3">
                <label className="text-[9px] text-slate-400">Destination Workspace Node</label>
                <select
                  value={targetWorkspaceId}
                  onChange={(e) => setTargetWorkspaceId(e.target.value)}
                  className={`px-2 py-1.5 text-xs rounded-lg border outline-none ${
                    theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}
                >
                  {workspaces
                    .filter((w) => w.id !== activeWorkspaceId)
                    .map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                </select>
              </div>
            )}

            <div className="flex gap-2.5 mt-5 justify-end">
              <button
                onClick={() => {
                  setSelectedNoteForAction(null);
                  setCrossActionType(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  theme === "dark" ? "border-zinc-800 hover:bg-zinc-800" : "border-slate-200 hover:bg-slate-100"
                } cursor-pointer`}
              >
                Cancel
              </button>
              <button
                onClick={handleCrossActionExecute}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer transition-transform active:scale-[0.98] ${
                  crossActionType === "delete" ? "bg-rose-500 hover:bg-rose-600" : "bg-blue-500 hover:bg-blue-600"
                }`}
              >
                Execute Action
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
