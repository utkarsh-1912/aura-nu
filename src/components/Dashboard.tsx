import React, { useState, useMemo } from "react";
import {
  Sparkles, TrendingUp, FileText, Pin, CheckCircle2, Calendar as CalendarIcon, Clock, ArrowRight, Plus, Trash2,
  Layers, Bookmark, Users, Shield, HardDrive, Send, Share2, Copy, Move, Globe, Lock, Activity as ActivityIcon,
  ChevronRight, UserPlus, Terminal, SlidersHorizontal, Key, ShieldAlert, ChevronLeft, X, MoreHorizontal,
} from "lucide-react";
import { Button, IconButton, Input, Field, Select, Switch, Dialog, Menu, Tabs, Badge, Avatar, Skeleton, EmptyState, cn } from "../ui";
import type { MenuEntry } from "../ui";
import { Card, StatTile, StatTileSkeleton, BarRow, InlineEmpty, timeAgo } from "./dashboard/parts";
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
    return workspaces.find((w) => w.id === activeWorkspaceId) || workspaces?.[0] || null;
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
    return workspaceNotes
      .map((n) => ({ note: n, time: new Date(n.updatedAt).getTime() }))
      .sort((a, b) => b.time - a.time)
      .map((item) => item.note)
      .slice(0, 6);
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
  const folderStats = useMemo(() => {
    const counts: Record<string, number> = {};
    workspaceNotes.forEach((n) => {
      counts[n.folder] = (counts[n.folder] || 0) + 1;
    });

    return Object.keys(counts).map((folder) => {
      const count = counts[folder];
      const percentage = totalNotesCount > 0 ? Math.round((count / totalNotesCount) * 100) : 0;
      return { name: folder, count, percentage };
    }).sort((a, b) => b.count - a.count);
  }, [workspaceNotes, totalNotesCount]);

  const handleReminderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderText.trim()) return;
    onAddReminder(newReminderText.trim(), new Date().toISOString());
    setNewReminderText("");
  };

  // Roles permission check helper
  const hasPermission = (permission: string) => {
    const role = activeWorkspace?.role || "Viewer";
    const hierarchy: Record<string, string[]> = {
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

  const [policies, setPolicies] = useState<Record<string, boolean>>({ sso: true, enc: false, compliance: true });

  const tagStats = useMemo(() => {
    const counts: Record<string, number> = {};
    workspaceNotes.forEach((n) => (n.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 16);
  }, [workspaceNotes]);

  const recentActivities = useMemo(
    () => [...workspaceActivities].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6),
    [workspaceActivities],
  );

  const openReminders = workspaceReminders.filter((r) => !r.completed).length;
  const isLoading = !activeWorkspace;
  const userName = (currentUserEmail || "there").split("@")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const defaultFolder = folderStats[0]?.name || "General";
  const storageQuotaMb = activeWorkspace?.storageQuota
    ? activeWorkspace.storageQuota > 10000
      ? Math.round(activeWorkspace.storageQuota / (1024 * 1024))
      : activeWorkspace.storageQuota
    : 5;

  const closeCrossAction = () => {
    setSelectedNoteForAction(null);
    setCrossActionType(null);
  };

  const noteMenu = (note: Note): MenuEntry[] => {
    const items: MenuEntry[] = [];
    if (hasPermission("edit")) {
      const otherWs = workspaces.find((w) => w.id !== activeWorkspaceId)?.id || "";
      items.push(
        { id: "copy", label: "Copy to workspace", icon: <Copy size={13} />, onSelect: () => { setSelectedNoteForAction(note); setCrossActionType("copy"); setTargetWorkspaceId(otherWs); } },
        { id: "move", label: "Move to workspace", icon: <Move size={13} />, onSelect: () => { setSelectedNoteForAction(note); setCrossActionType("move"); setTargetWorkspaceId(otherWs); } },
        { id: "dup", label: "Duplicate", icon: <Plus size={13} />, onSelect: () => onDuplicateNote(note.id) },
      );
    }
    if (hasPermission("delete")) {
      if (items.length) items.push("separator");
      items.push({ id: "trash", label: "Move to trash", icon: <Trash2 size={13} />, danger: true, onSelect: () => { setSelectedNoteForAction(note); setCrossActionType("delete"); } });
    }
    return items;
  };

  const backLink = (label: string, onClick: () => void) => (
    <Button variant="ghost" size="sm" onClick={onClick} leadingIcon={<ChevronLeft size={13} />}>{label}</Button>
  );

  const treeCard = (key: string, icon: React.ReactNode, title: string, meta: string, onClick: () => void) => (
    <button
      key={key}
      onClick={onClick}
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel p-3 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent" aria-hidden>{icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-fg">{title}</span>
          <span className="block text-[12px] text-fg-muted">{meta}</span>
        </span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-fg-subtle" aria-hidden />
    </button>
  );

  const addForm = (onSubmit: (e: React.FormEvent) => void, value: string, setValue: (v: string) => void, label: string, placeholder: string, cta: string) => (
    <form onSubmit={onSubmit} className="mt-5 flex max-w-md items-end gap-2">
      <div className="flex-1">
        <Field label={label}>{(p) => <Input {...p} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />}</Field>
      </div>
      <Button type="submit" variant="primary" disabled={!value.trim()}>{cta}</Button>
    </form>
  );

  const deptSel = activeWorkspace?.departments?.find((d) => d.id === selectedDeptId);
  const projSel = deptSel?.projects.find((p) => p.id === selectedProjectId);

  const tabItems = [
    { id: "overview" as const, label: "Overview", icon: <TrendingUp size={13} /> },
    { id: "org" as const, label: "Departments", icon: <Layers size={13} /> },
    { id: "invites" as const, label: "Members", icon: <Users size={13} /> },
    { id: "admin" as const, label: "Admin", icon: <Shield size={13} /> },
  ];

  return (
    <div id="dashboard-view-panel" className="h-full flex-grow overflow-y-auto bg-surface px-4 py-6 text-fg md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] text-fg-muted">{greeting}, <span className="capitalize">{userName}</span></p>
            {isLoading ? (
              <Skeleton className="mt-2 h-7 w-56" />
            ) : (
              <h1 className="mt-1 flex items-center gap-2.5 text-[20px] font-semibold text-fg">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[13px] font-semibold text-accent" aria-hidden>
                  {activeWorkspace?.name?.[0]?.toUpperCase() || "W"}
                </span>
                <span className="truncate">{activeWorkspace?.name || "Workspace"}</span>
              </h1>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{activeWorkspace?.type || "Personal"} workspace</Badge>
              <Badge>Role: {activeWorkspace?.role || "Owner"}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2">
            <HardDrive size={14} className="text-fg-muted" aria-hidden />
            <div>
              <p className="text-[11px] text-fg-subtle">Storage</p>
              <p className="text-[13px] font-medium text-fg">{actualStorageUsed} KB / {storageQuotaMb} MB</p>
            </div>
          </div>
        </header>

        <Tabs value={activeTab} onChange={(v: string) => setActiveTab(v as typeof activeTab)} items={tabItems} className="overflow-x-auto" />

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Quick actions */}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick actions">
              <Button variant="primary" className="max-md:!h-10" leadingIcon={<Plus size={14} />} disabled={!hasPermission("create")} onClick={() => onNewNoteWithContent("Untitled note", "", defaultFolder, [])}>
                New note
              </Button>
              <Button className="max-md:!h-10" leadingIcon={<CalendarIcon size={14} />} disabled={!hasPermission("create")} onClick={() => onNewNoteWithContent("Meeting notes", "## Attendees\n\n## Agenda\n\n## Decisions\n\n## Action items\n- [ ] ", defaultFolder, ["meeting"])}>
                Meeting notes
              </Button>
              <Button className="max-md:!h-10" leadingIcon={<CheckCircle2 size={14} />} disabled={!hasPermission("create")} onClick={() => onNewNoteWithContent("Checklist", "- [ ] \n- [ ] \n- [ ] ", defaultFolder, [])}>
                Checklist
              </Button>
              {recentNotes[0] && (
                <Button variant="ghost" className="max-md:!h-10" trailingIcon={<ArrowRight size={13} />} onClick={() => setActiveNoteId(recentNotes[0].id)}>
                  Continue last note
                </Button>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {isLoading ? (
                [0, 1, 2, 3].map((i) => <StatTileSkeleton key={i} />)
              ) : (
                <>
                  <StatTile label="Notes" value={totalNotesCount} />
                  <StatTile label="Words written" value={wordCountSum.toLocaleString()} />
                  <StatTile label="Pinned" value={pinnedNotes.length} hint={`${sharedNotes.length} shared`} />
                  <StatTile label="Avg. read time" value={`${avgReadingTime} min`} hint={`${openReminders} open tasks`} />
                </>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
                <Card title="Recent notes" icon={<Clock size={14} />} right={`${recentNotes.length} shown`} bodyClassName="p-2">
                  {isLoading ? (
                    <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : recentNotes.length === 0 ? (
                    <div className="p-2">
                      <EmptyState
                        icon={<FileText size={18} />}
                        title="No notes yet"
                        description="Create your first note to see it here."
                        action={<Button variant="primary" size="sm" disabled={!hasPermission("create")} onClick={() => onNewNoteWithContent("Untitled note", "", defaultFolder, [])}>New note</Button>}
                      />
                    </div>
                  ) : (
                    <ul>
                      {recentNotes.map((note) => {
                        const menu = noteMenu(note);
                        return (
                          <li key={note.id} className="flex items-center gap-1 rounded-md hover:bg-hover">
                            <button
                              onClick={() => setActiveNoteId(note.id)}
                              className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-accent"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-hover text-fg-muted" aria-hidden><FileText size={14} /></span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-[13px] font-medium text-fg">{note.title || "Untitled"}</span>
                                  {note.isPinned && <Pin size={11} className="shrink-0 text-fg-subtle" aria-label="Pinned" />}
                                  {note.isShared && <Share2 size={11} className="shrink-0 text-fg-subtle" aria-label="Shared" />}
                                </span>
                                <span className="block truncate text-[12px] text-fg-muted">
                                  {note.folder} · {(note.tags || []).join(", ") || "No tags"} · {timeAgo(note.updatedAt)}
                                </span>
                              </span>
                            </button>
                            {menu.length > 0 && (
                              <Menu
                                align="end"
                                items={menu}
                                trigger={({ props }) => (
                                  <IconButton label={`Actions for ${note.title || "note"}`} {...props} className="mr-1 max-md:!h-10 max-md:!w-10">
                                    <MoreHorizontal size={15} />
                                  </IconButton>
                                )}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <Card title="Folders" icon={<Layers size={14} />}>
                    {folderStats.length === 0 ? (
                      <InlineEmpty>Folders appear once you add notes.</InlineEmpty>
                    ) : (
                      <ul className="space-y-3">
                        {folderStats.slice(0, 6).map((f) => (
                          <BarRow key={f.name} label={f.name} count={f.count} percent={f.percentage} />
                        ))}
                      </ul>
                    )}
                  </Card>
                  <Card title="Tags" icon={<Bookmark size={14} />}>
                    {tagStats.length === 0 ? (
                      <InlineEmpty>No tags yet. Tag notes to see themes here.</InlineEmpty>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {tagStats.map((t, i) => (
                          <li key={t.tag}>
                            <Badge tone={i < 3 ? "accent" : "neutral"} className="h-6 px-2 text-[12px]">
                              {t.tag}
                              <span className="text-fg-subtle tabular-nums">{t.count}</span>
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>

                {sharedNotes.length > 0 && (
                  <Card title="Shared notes" icon={<Share2 size={14} />} right={`${sharedNotes.length}`}>
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {sharedNotes.map((note) => (
                        <li key={note.id}>
                          <button onClick={() => setActiveNoteId(note.id)} className="flex min-h-10 w-full items-center gap-2 rounded-md border border-line px-2.5 py-2 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent">
                            <Globe size={13} className="shrink-0 text-fg-muted" aria-hidden />
                            <span className="truncate text-[13px] text-fg">{note.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                <Card title="AI activity" icon={<Sparkles size={14} />}>
                  {activeWorkspace?.aiHistory && activeWorkspace.aiHistory.length > 0 ? (
                    <ul className="space-y-2">
                      {activeWorkspace.aiHistory.map((h, i) => (
                        <li key={i} className="rounded-lg border border-line bg-surface p-3">
                          <p className="flex items-center gap-1.5 text-[12px] font-medium text-fg">
                            <Terminal size={11} className="text-fg-muted" aria-hidden />
                            <span className="break-words">Prompt: "{h.prompt}"</span>
                          </p>
                          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted break-words">{h.result}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <InlineEmpty icon={<Sparkles size={16} />}>Prompts you run in the AI panel are logged here.</InlineEmpty>
                  )}
                </Card>
              </div>

              <div className="flex min-w-0 flex-col gap-6">
                <Card title="Reminders and tasks" icon={<CheckCircle2 size={14} />} right={`${openReminders} open`}>
                  {workspaceReminders.length === 0 ? (
                    <InlineEmpty icon={<CalendarIcon size={16} />}>Nothing due. Add a reminder below.</InlineEmpty>
                  ) : (
                    <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                      {workspaceReminders.map((rem) => (
                        <li key={rem.id} className="flex items-center justify-between gap-2 rounded-md px-1 hover:bg-hover">
                          <label className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 max-md:min-h-10">
                            <input
                              type="checkbox"
                              checked={rem.completed}
                              onChange={() => onToggleReminder(rem.id)}
                              className="h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--c-accent)]"
                            />
                            <span className={cn("break-words text-[13px]", rem.completed ? "text-fg-subtle line-through" : "text-fg")}>{rem.text}</span>
                          </label>
                          <IconButton label={`Delete reminder ${rem.text}`} size="sm" onClick={() => onDeleteReminder(rem.id)} className="max-md:!h-10 max-md:!w-10 hover:!text-danger">
                            <Trash2 size={13} />
                          </IconButton>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form onSubmit={handleReminderSubmit} className="mt-3 flex gap-2 border-t border-line pt-3">
                    <div className="flex-1">
                      <Input aria-label="New reminder" placeholder="Add a reminder" value={newReminderText} onChange={(e) => setNewReminderText(e.target.value)} />
                    </div>
                    <IconButton type="submit" label="Add reminder" variant="primary" disabled={!newReminderText.trim()} className="max-md:!h-10 max-md:!w-10">
                      <Plus size={14} />
                    </IconButton>
                  </form>
                </Card>

                <Card title="Activity" icon={<ActivityIcon size={14} />}>
                  {recentActivities.length === 0 ? (
                    <InlineEmpty icon={<ActivityIcon size={16} />}>Edits, shares and AI runs show up here.</InlineEmpty>
                  ) : (
                    <ul className="space-y-3">
                      {recentActivities.map((a) => (
                        <li key={a.id} className="flex gap-2.5">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                          <div className="min-w-0">
                            <p className="text-[13px] text-fg break-words">{a.text}</p>
                            <p className="text-[11px] text-fg-subtle">{timeAgo(a.timestamp)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Workspace access" icon={<Users size={14} />} right={`${(activeWorkspace?.members || []).length} users`}>
                  <ul className="space-y-2">
                    {(activeWorkspace?.members || []).map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar name={m.name} size={24} />
                          <span className="truncate text-[13px] text-fg">{m.name}</span>
                        </span>
                        <span className="shrink-0 text-[12px] capitalize text-fg-muted">{m.role}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* DEPARTMENTS & PROJECTS */}
        {activeTab === "org" && (
          <Card title="Departments and projects" icon={<Layers size={14} />}>
            <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1 overflow-x-auto whitespace-nowrap text-[13px]">
              <button
                onClick={() => { setSelectedDeptId(null); setSelectedProjectId(null); setSelectedFolderId(null); }}
                className="rounded px-1 font-medium text-fg hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
              >
                {activeWorkspace?.name}
              </button>
              {selectedDeptId && (
                <>
                  <ChevronRight size={12} className="text-fg-subtle" aria-hidden />
                  <button onClick={() => { setSelectedProjectId(null); setSelectedFolderId(null); }} className="rounded px-1 text-fg hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent">{deptSel?.name}</button>
                </>
              )}
              {selectedProjectId && (
                <>
                  <ChevronRight size={12} className="text-fg-subtle" aria-hidden />
                  <button onClick={() => setSelectedFolderId(null)} className="rounded px-1 text-fg hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent">{projSel?.name}</button>
                </>
              )}
              {selectedFolderId && (
                <>
                  <ChevronRight size={12} className="text-fg-subtle" aria-hidden />
                  <span className="px-1 text-fg-muted">{selectedFolderId}</span>
                </>
              )}
            </nav>

            {!selectedDeptId && (
              <div>
                <p className="mb-3 text-[12px] text-fg-muted">Select a department.</p>
                {(activeWorkspace?.departments || []).length === 0 ? (
                  <InlineEmpty icon={<Layers size={16} />}>No departments yet.</InlineEmpty>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {(activeWorkspace?.departments || []).map((dept) => treeCard(dept.id, <Layers size={15} />, dept.name, `${dept.projects.length} projects`, () => setSelectedDeptId(dept.id)))}
                  </div>
                )}
                {hasPermission("settings") && addForm(handleAddDeptSubmit, newDeptName, setNewDeptName, "New department", "e.g. Sales", "Add department")}
              </div>
            )}

            {selectedDeptId && !selectedProjectId && (
              <div>
                <div className="mb-3">{backLink("Departments", () => setSelectedDeptId(null))}</div>
                {(deptSel?.projects || []).length === 0 ? (
                  <InlineEmpty icon={<SlidersHorizontal size={16} />}>No projects in this department.</InlineEmpty>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {(deptSel?.projects || []).map((proj) => treeCard(proj.id, <SlidersHorizontal size={15} />, proj.name, `${proj.folders.length} folders`, () => setSelectedProjectId(proj.id)))}
                  </div>
                )}
                {hasPermission("settings") && addForm(handleAddProjSubmit, newProjName, setNewProjName, "New project", "e.g. CRM system", "Add project")}
              </div>
            )}

            {selectedProjectId && !selectedFolderId && (
              <div>
                <div className="mb-3">{backLink("Projects", () => setSelectedProjectId(null))}</div>
                {(projSel?.folders || []).length === 0 ? (
                  <InlineEmpty icon={<Bookmark size={16} />}>No folders in this project.</InlineEmpty>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {(projSel?.folders || []).map((folder) =>
                      treeCard(folder, <Bookmark size={15} />, folder, `${workspaceNotes.filter((n) => n.folder === folder && n.projectId === selectedProjectId).length} notes`, () => setSelectedFolderId(folder)),
                    )}
                  </div>
                )}
                {hasPermission("settings") && addForm(handleAddFolderSubmit, newFolderName, setNewFolderName, "New folder", "e.g. Specs", "Add folder")}
              </div>
            )}

            {selectedFolderId && (
              <div>
                <div className="mb-3">{backLink("Folders", () => setSelectedFolderId(null))}</div>
                {workspaceNotes.filter((n) => n.folder === selectedFolderId && n.projectId === selectedProjectId).length === 0 ? (
                  <InlineEmpty icon={<FileText size={16} />}>No notes in this folder yet. Create or move notes here.</InlineEmpty>
                ) : (
                  <ul className="space-y-1">
                    {workspaceNotes
                      .filter((n) => n.folder === selectedFolderId && n.projectId === selectedProjectId)
                      .map((note) => (
                        <li key={note.id}>
                          <button onClick={() => setActiveNoteId(note.id)} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-2 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent">
                            <span className="flex min-w-0 items-center gap-2.5">
                              <FileText size={14} className="shrink-0 text-fg-muted" aria-hidden />
                              <span className="truncate text-[13px] text-fg">{note.title}</span>
                            </span>
                            <ArrowRight size={12} className="shrink-0 text-fg-subtle" aria-hidden />
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        )}

        {/* MEMBERS */}
        {activeTab === "invites" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              <Card title={`Team (${activeWorkspace?.members?.length || 0})`} icon={<Users size={14} />} bodyClassName="p-2">
                {(activeWorkspace?.members || []).length === 0 ? (
                  <InlineEmpty icon={<Users size={16} />}>No members yet.</InlineEmpty>
                ) : (
                  <ul>
                    {(activeWorkspace?.members || []).map((m) => (
                      <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-hover">
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar name={m.name} size={28} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-fg">{m.name}</span>
                            <span className="block truncate text-[12px] text-fg-muted">{m.email}</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <Badge className="capitalize">{m.role}</Badge>
                          <span className="hidden text-[12px] text-fg-subtle sm:inline">Joined {m.joinedAt}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Pending invites" icon={<Send size={14} />} right={`${(activeWorkspace?.invitations || []).filter((i) => i.status === "pending").length} pending`}>
                {(activeWorkspace?.invitations || []).length === 0 ? (
                  <InlineEmpty>No outbound invitations.</InlineEmpty>
                ) : (
                  <ul className="space-y-2">
                    {(activeWorkspace?.invitations || []).map((inv) => (
                      <li key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-fg">{inv.email}</span>
                          <span className="block text-[12px] text-fg-muted">Expires {inv.expiresAt} · {inv.role}</span>
                        </span>
                        <Badge tone="warning" className="capitalize">{inv.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              {hasPermission("members") ? (
                <Card title="Invite teammate" icon={<UserPlus size={14} />}>
                  <form onSubmit={handleSendInvite} className="space-y-3">
                    <Field label="Email">
                      {(p) => <Input {...p} type="email" required placeholder="teammate@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />}
                    </Field>
                    <Field label="Role">
                      {(p) => (
                        <Select {...p} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}>
                          <option value="Admin">Admin (full control)</option>
                          <option value="Manager">Manager (billing and users)</option>
                          <option value="Editor">Editor (read, edit, create, delete)</option>
                          <option value="Contributor">Contributor (read, create, edit)</option>
                          <option value="Viewer">Viewer (read only)</option>
                        </Select>
                      )}
                    </Field>
                    <Button type="submit" variant="primary" className="w-full" leadingIcon={<Send size={12} />}>Send invitation</Button>
                  </form>
                </Card>
              ) : (
                <div role="status" className="flex items-start gap-2.5 rounded-lg border border-line bg-warning-soft p-3">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                  <div>
                    <p className="text-[13px] font-medium text-fg">Not authorized</p>
                    <p className="mt-0.5 text-[12px] text-fg-muted">Your role ({activeWorkspace?.role}) cannot invite teammates.</p>
                  </div>
                </div>
              )}

              <Card title="Domain restrictions" icon={<Globe size={14} />}>
                <p className="mb-3 text-[12px] text-fg-muted">Limit self-onboarding to specific enterprise domains.</p>
                <form onSubmit={handleAddDomain} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="Domain">{(p) => <Input {...p} placeholder="company.com" value={domainRestriction} onChange={(e) => setDomainRestriction(e.target.value)} />}</Field>
                  </div>
                  <Button type="submit" disabled={!domainRestriction.trim()}>Add</Button>
                </form>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {allowedDomains.map((dom) => (
                    <li key={dom}>
                      <Badge tone="accent" className="h-6 pr-0.5 text-[12px]">
                        {dom}
                        <button aria-label={`Remove domain ${dom}`} onClick={() => setAllowedDomains(allowedDomains.filter((d) => d !== dom))} className="flex h-5 w-5 items-center justify-center rounded hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent">
                          <X size={11} />
                        </button>
                      </Badge>
                    </li>
                  ))}
                  {allowedDomains.length === 0 && <li className="text-[12px] text-fg-subtle">No restrictions: any domain can join.</li>}
                </ul>
              </Card>
            </div>
          </div>
        )}

        {/* ADMIN */}
        {activeTab === "admin" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              <Card title="Audit log" icon={<Shield size={14} />} bodyClassName="p-2">
                {(activeWorkspace?.auditLogs || []).length === 0 ? (
                  <div className="p-2"><InlineEmpty icon={<Shield size={16} />}>No security events recorded yet.</InlineEmpty></div>
                ) : (
                  <ul className="divide-y divide-line">
                    {(activeWorkspace?.auditLogs || []).map((log) => (
                      <li key={log.id} className="px-2 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[13px] font-medium text-fg break-words">{log.action}</p>
                          <span className="shrink-0 text-[11px] text-fg-subtle">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-fg-muted break-all">{log.userEmail} · {log.ipAddress}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Security policies" icon={<Lock size={14} />}>
                <ul className="divide-y divide-line">
                  {[
                    { id: "sso", title: "Single sign-on (SAML/OIDC)", desc: "Require sign-in through your identity provider." },
                    { id: "enc", title: "Strict content quarantine", desc: "Keep AI outputs in isolated logs before they reach notes." },
                    { id: "compliance", title: "GDPR / HIPAA log redundancy", desc: "Back up raw exports to secured local volumes." },
                  ].map((pol) => (
                    <li key={pol.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-fg">{pol.title}</p>
                        <p className="mt-0.5 text-[12px] text-fg-muted">{pol.desc}</p>
                      </div>
                      <Switch label={pol.title} checked={!!policies[pol.id]} onChange={(v) => setPolicies({ ...policies, [pol.id]: v })} disabled={!hasPermission("settings")} />
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              <Card title="API keys" icon={<Key size={14} />}>
                <form onSubmit={handleGenerateApiKey} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="Key name">{(p) => <Input {...p} required placeholder="e.g. CI sync" value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} />}</Field>
                  </div>
                  <Button type="submit" variant="primary">Create</Button>
                </form>
                <ul className="mt-3 space-y-2">
                  {generatedKeys.map((k) => (
                    <li key={k.id} className="rounded-lg border border-line p-2.5">
                      <div className="flex justify-between gap-2 text-[12px]">
                        <span className="font-medium text-fg">{k.name}</span>
                        <span className="text-fg-subtle">{k.createdAt}</span>
                      </div>
                      <p className="mt-1 truncate rounded bg-hover px-1.5 py-1 font-mono text-[11px] text-fg-muted">{k.key}</p>
                    </li>
                  ))}
                  {generatedKeys.length === 0 && <li className="text-[12px] text-fg-muted">No API keys generated yet.</li>}
                </ul>
              </Card>

              <Card title="Integrations" icon={<Globe size={14} />}>
                {(activeWorkspace?.integrations || []).length === 0 ? (
                  <InlineEmpty>No integrations configured.</InlineEmpty>
                ) : (
                  <ul className="space-y-2">
                    {(activeWorkspace?.integrations || []).map((int) => (
                      <li key={int.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-2.5">
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium text-fg">{int.name}</span>
                          <span className="block text-[12px] text-fg-muted">{int.desc}</span>
                        </span>
                        <Badge tone={int.status === "Connected" ? "success" : "neutral"}>{int.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Confirm cross-workspace action */}
      <Dialog
        open={!!(selectedNoteForAction && crossActionType)}
        onClose={closeCrossAction}
        size="sm"
        title={crossActionType === "delete" ? "Move note to trash?" : crossActionType === "move" ? "Move note?" : "Copy note?"}
        description={selectedNoteForAction ? `"${selectedNoteForAction.title}"` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={closeCrossAction}>Cancel</Button>
            <Button
              variant={crossActionType === "delete" ? "danger" : "primary"}
              onClick={handleCrossActionExecute}
              disabled={crossActionType !== "delete" && !targetWorkspaceId}
            >
              {crossActionType === "delete" ? "Move to trash" : crossActionType === "move" ? "Move note" : "Copy note"}
            </Button>
          </>
        }
      >
        {crossActionType === "delete" ? (
          <p className="text-[13px] text-fg-muted">The note will be moved to trash.</p>
        ) : (
          <Field label="Destination workspace" error={workspaces.filter((w) => w.id !== activeWorkspaceId).length === 0 ? "No other workspace available." : undefined}>
            {(p) => (
              <Select {...p} value={targetWorkspaceId} onChange={(e) => setTargetWorkspaceId(e.target.value)}>
                {workspaces.filter((w) => w.id !== activeWorkspaceId).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </Dialog>
    </div>
  );
}
