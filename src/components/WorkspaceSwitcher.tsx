import React, { useState, useMemo } from "react";
import {
  Search,
  Star,
  Pin,
  Plus,
  Check,
  User,
  Users,
  Cpu,
  Briefcase,
  Zap,
  HardDrive,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  Compass,
  Bookmark
} from "lucide-react";
import { Workspace, WorkspaceType } from "../types";

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string, type: WorkspaceType, icon: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  theme: "light" | "dark";
  isCollapsed: boolean;
  isMobileSheet?: boolean;
  onClose?: () => void;
}

const ICON_MAP: Record<string, any> = {
  User: User,
  Users: Users,
  Cpu: Cpu,
  Briefcase: Briefcase,
  Zap: Zap,
  HardDrive: HardDrive,
  Compass: Compass,
};

const COLOR_ACCENTS: Record<string, string> = {
  Personal: "from-amber-400 to-orange-500",
  Team: "from-blue-500 to-indigo-600",
  Organization: "from-purple-500 to-pink-600",
  Client: "from-emerald-400 to-teal-600",
  Project: "from-rose-500 to-red-600",
  Department: "from-cyan-500 to-blue-600",
};

export default function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onTogglePin,
  onToggleFavorite,
  theme,
  isCollapsed,
  isMobileSheet = false,
  onClose,
}: WorkspaceSwitcherProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceType, setNewWorkspaceType] = useState<WorkspaceType>("Personal");
  const [newWorkspaceIcon, setNewWorkspaceIcon] = useState("Users");
  const [sortBy, setSortBy] = useState<"name" | "type" | "storage">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
  }, [workspaces, activeWorkspaceId]);

  // Filter and sort workspaces
  const processedWorkspaces = useMemo(() => {
    let list = [...workspaces];

    // 1. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.type.toLowerCase().includes(q) ||
          w.role.toLowerCase().includes(q)
      );
    }

    // 2. Sorting
    list.sort((a, b) => {
      // Pin priorities first
      const pinA = a.isPinned ? 1 : 0;
      const pinB = b.isPinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;

      let valA: any = a.name.toLowerCase();
      let valB: any = b.name.toLowerCase();

      if (sortBy === "type") {
        valA = a.type.toLowerCase();
        valB = b.type.toLowerCase();
      } else if (sortBy === "storage") {
        valA = a.storageUsage;
        valB = b.storageUsage;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [workspaces, searchQuery, sortBy, sortDirection]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    onCreateWorkspace(newWorkspaceName.trim(), newWorkspaceType, newWorkspaceIcon);
    setNewWorkspaceName("");
    setShowCreateForm(false);
  };

  const currentIcon = activeWorkspace ? activeWorkspace.icon : "Users";
  const ActiveIconComponent = ICON_MAP[currentIcon] || Users;

  // Render collapsible desktop button
  if (isCollapsed && !isMobileSheet) {
    return (
      <div className="flex justify-center py-2">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-display font-black shadow-sm bg-gradient-to-tr ${
            COLOR_ACCENTS[activeWorkspace?.type] || "from-blue-600 to-indigo-500"
          } cursor-pointer hover:scale-105 transition-all`}
          title={`${activeWorkspace?.name} (${activeWorkspace?.type})`}
        >
          {activeWorkspace?.name[0].toUpperCase()}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full select-none ${theme === "dark" ? "text-zinc-200" : "text-slate-800"}`}>
      {/* Search Input */}
      <div className="px-4 py-2 border-b border-slate-100 dark:border-zinc-850 flex items-center gap-2">
        <div className="relative flex-grow">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-8 pr-3 py-1.5 rounded-xl text-[11px] font-medium outline-none border transition-colors ${
              theme === "dark"
                ? "bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-zinc-700"
                : "bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-300"
            }`}
          />
        </div>

        {/* Sorting Toggles */}
        <button
          onClick={() => {
            if (sortBy === "name") {
              setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
            } else {
              setSortBy("name");
              setSortDirection("asc");
            }
          }}
          className={`p-1.5 rounded-lg border ${
            theme === "dark"
              ? "border-zinc-800 hover:bg-zinc-850 text-zinc-400"
              : "border-slate-200 hover:bg-slate-50 text-slate-500"
          } transition-colors cursor-pointer`}
          title="Sort Workspaces"
        >
          <ArrowUpDown size={11} />
        </button>
      </div>

      {/* Workspaces Scroll list */}
      <div className="flex-grow overflow-y-auto p-2 flex flex-col gap-1 max-h-[350px] min-h-[160px] no-scrollbar">
        {processedWorkspaces.length === 0 ? (
          <div className="text-center py-6 text-slate-400 dark:text-zinc-500 text-[10px]">
            No workspaces found
          </div>
        ) : (
          processedWorkspaces.map((ws, index) => {
            const IconComponent = ICON_MAP[ws.icon] || Users;
            const isActive = ws.id === activeWorkspaceId;
            const accentClass = COLOR_ACCENTS[ws.type] || "from-blue-500 to-indigo-600";

            return (
              <div
                key={ws.id}
                className={`group flex items-center justify-between p-2 rounded-xl border transition-all ${
                  isActive
                    ? theme === "dark"
                      ? "bg-zinc-800/80 border-indigo-500/30 text-white"
                      : "bg-blue-50/50 border-blue-200 text-blue-950"
                    : theme === "dark"
                    ? "bg-zinc-950/20 border-zinc-900 hover:bg-zinc-800/40 text-zinc-400 hover:text-zinc-200"
                    : "bg-white border-slate-100 hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                }`}
              >
                {/* Switch Workspace Trigger Info */}
                <button
                  onClick={() => {
                    onSelectWorkspace(ws.id);
                    if (onClose) onClose();
                  }}
                  className="flex items-center gap-3 flex-grow text-left cursor-pointer"
                >
                  {/* Color coded logo */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-extrabold text-white bg-gradient-to-tr ${accentClass} shadow-xs relative shrink-0`}
                  >
                    {ws.name[0].toUpperCase()}
                    <div className="absolute -bottom-1 -right-1 p-0.5 bg-zinc-900 text-[8px] rounded-md border border-zinc-700 font-mono">
                      {index + 1}
                    </div>
                  </div>

                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-xs truncate max-w-[120px] tracking-tight">
                        {ws.name}
                      </span>
                      {ws.isFavorite && <Star size={10} className="fill-amber-400 text-amber-400 shrink-0" />}
                      {ws.isPinned && <Pin size={10} className="fill-blue-500 text-blue-500 shrink-0 rotate-45" />}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[9px] font-mono text-slate-400 dark:text-zinc-500">
                      <span className="capitalize">{ws.type}</span>
                      <span>•</span>
                      <span>{ws.members.length} {ws.members.length === 1 ? "member" : "members"}</span>
                      <span>•</span>
                      <span className="capitalize">{ws.role}</span>
                    </div>
                  </div>
                </button>

                {/* Switcher Actions (Favorite, Pin, Active Check) */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={() => onToggleFavorite(ws.id)}
                    className={`p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer ${
                      ws.isFavorite ? "text-amber-400" : "text-slate-300 dark:text-zinc-600"
                    }`}
                    title="Favorite Workspace"
                  >
                    <Star size={11} className={ws.isFavorite ? "fill-amber-400" : ""} />
                  </button>
                  <button
                    onClick={() => onTogglePin(ws.id)}
                    className={`p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer ${
                      ws.isPinned ? "text-blue-500" : "text-slate-300 dark:text-zinc-600"
                    }`}
                    title="Pin Workspace"
                  >
                    <Pin size={11} className={`${ws.isPinned ? "fill-blue-500" : ""} rotate-45`} />
                  </button>
                </div>

                {/* Show Active check when hover isn't triggering */}
                {isActive && (
                  <div className="pl-1.5 pr-1 group-hover:hidden shrink-0">
                    <div className="w-5 h-5 rounded-full bg-blue-500/10 dark:bg-indigo-500/10 text-blue-500 dark:text-indigo-400 flex items-center justify-center">
                      <Check size={11} className="stroke-[3]" />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Drawer Action - Create Workspace Form */}
      <div className="p-3 border-t border-slate-100 dark:border-zinc-850">
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-transform active:scale-[0.98]"
          >
            <Plus size={13} />
            <span>Create New Workspace</span>
          </button>
        ) : (
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-2.5 p-2 bg-slate-50 dark:bg-zinc-950 rounded-xl border border-slate-200/60 dark:border-zinc-800/80">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">New Workspace</span>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded text-slate-400"
              >
                <X size={11} />
              </button>
            </div>

            <input
              type="text"
              required
              placeholder="Workspace Name (e.g. Acme Hub)"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs outline-none border ${
                theme === "dark"
                  ? "bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-zinc-700"
                  : "bg-white border-slate-200 text-slate-800 focus:border-blue-300"
              }`}
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">Type</label>
                <select
                  value={newWorkspaceType}
                  onChange={(e) => setNewWorkspaceType(e.target.value as WorkspaceType)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] outline-none border ${
                    theme === "dark" ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
                  }`}
                >
                  <option value="Personal">Personal</option>
                  <option value="Team">Team</option>
                  <option value="Organization">Organization</option>
                  <option value="Client">Client</option>
                  <option value="Project">Project</option>
                  <option value="Department">Department</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400">Icon Accent</label>
                <select
                  value={newWorkspaceIcon}
                  onChange={(e) => setNewWorkspaceIcon(e.target.value)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] outline-none border ${
                    theme === "dark" ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
                  }`}
                >
                  <option value="Users">Team (Users)</option>
                  <option value="User">Personal (User)</option>
                  <option value="Cpu">Tech (Cpu)</option>
                  <option value="Briefcase">Enterprise</option>
                  <option value="Zap">Active (Zap)</option>
                  <option value="Compass">Compass</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-lg cursor-pointer mt-1"
            >
              Provision Workspace Node
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
