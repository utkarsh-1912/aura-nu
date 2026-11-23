import React, { useState, useMemo } from "react";
import { Search, Star, Pin, Plus, Check, X, ArrowUpDown } from "lucide-react";
import { Workspace, WorkspaceType } from "../types";
import { Avatar, Button, EmptyState, Field, IconButton, Input, Kbd, Select } from "../ui";

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

export default function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onTogglePin,
  onToggleFavorite,
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

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (w) => w.name.toLowerCase().includes(q) || w.type.toLowerCase().includes(q) || w.role.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
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

  if (isCollapsed && !isMobileSheet) {
    return (
      <div className="flex justify-center py-2">
        <span title={`${activeWorkspace?.name} (${activeWorkspace?.type})`}>
          <Avatar name={activeWorkspace?.name || "Workspace"} size={28} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full select-none flex-col text-fg">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <Input
            type="text"
            aria-label="Search workspaces"
            placeholder="Search workspaces..."
            leadingIcon={<Search size={13} aria-hidden />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <IconButton
          label={`Sort workspaces (${sortBy}, ${sortDirection === "asc" ? "ascending" : "descending"})`}
          variant="secondary"
          onClick={() => {
            if (sortBy === "name") {
              setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
            } else {
              setSortBy("name");
              setSortDirection("asc");
            }
          }}
        >
          <ArrowUpDown size={13} />
        </IconButton>
      </div>

      <div className="no-scrollbar flex max-h-[350px] min-h-[160px] flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {processedWorkspaces.length === 0 ? (
          <EmptyState icon={<Search size={16} />} title="No workspaces found" description="Try a different search term." className="py-6" />
        ) : (
          processedWorkspaces.map((ws, index) => {
            const isActive = ws.id === activeWorkspaceId;
            return (
              <div
                key={ws.id}
                className={`group flex items-center justify-between rounded-md p-1.5 transition-colors ${
                  isActive ? "bg-accent-soft" : "hover:bg-hover"
                }`}
              >
                <button
                  onClick={() => {
                    onSelectWorkspace(ws.id);
                    if (onClose) onClose();
                  }}
                  aria-current={isActive ? "true" : undefined}
                  className="flex min-h-10 flex-1 items-center gap-2.5 rounded-md text-left outline-none focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Avatar name={ws.name} size={28} />
                  <div className="flex min-w-0 flex-col pr-2">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[13px] font-medium text-fg">{ws.name}</span>
                      {ws.isFavorite && <Star size={10} className="shrink-0 fill-warning text-warning" aria-label="Favorite" />}
                      {ws.isPinned && <Pin size={10} className="shrink-0 rotate-45 fill-accent text-accent" aria-label="Pinned" />}
                      {index < 9 && <Kbd className="ml-1 hidden sm:inline-flex">{index + 1}</Kbd>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-fg-muted">
                      <span className="capitalize">{ws.type}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {ws.members.length} {ws.members.length === 1 ? "member" : "members"}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="capitalize">{ws.role}</span>
                    </div>
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <IconButton
                    label={ws.isFavorite ? `Unfavorite ${ws.name}` : `Favorite ${ws.name}`}
                    size="sm"
                    onClick={() => onToggleFavorite(ws.id)}
                    className={ws.isFavorite ? "!text-warning" : ""}
                  >
                    <Star size={12} className={ws.isFavorite ? "fill-warning" : ""} />
                  </IconButton>
                  <IconButton
                    label={ws.isPinned ? `Unpin ${ws.name}` : `Pin ${ws.name}`}
                    size="sm"
                    onClick={() => onTogglePin(ws.id)}
                    className={ws.isPinned ? "!text-accent" : ""}
                  >
                    <Pin size={12} className={`rotate-45 ${ws.isPinned ? "fill-accent" : ""}`} />
                  </IconButton>
                </div>

                {isActive && (
                  <span className="shrink-0 pl-1.5 pr-1 text-accent sm:group-hover:hidden" aria-hidden>
                    <Check size={14} />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-line p-3">
        {!showCreateForm ? (
          <Button variant="secondary" className="w-full" onClick={() => setShowCreateForm(true)} leadingIcon={<Plus size={13} />}>
            Create workspace
          </Button>
        ) : (
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-fg">New workspace</span>
              <IconButton label="Cancel new workspace" size="sm" onClick={() => setShowCreateForm(false)}>
                <X size={13} />
              </IconButton>
            </div>

            <Input
              type="text"
              required
              aria-label="Workspace name"
              placeholder="Workspace name (e.g. Acme Hub)"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <Field label="Type">
                {(f) => (
                  <Select id={f.id} value={newWorkspaceType} onChange={(e) => setNewWorkspaceType(e.target.value as WorkspaceType)}>
                    <option value="Personal">Personal</option>
                    <option value="Team">Team</option>
                    <option value="Organization">Organization</option>
                    <option value="Client">Client</option>
                    <option value="Project">Project</option>
                    <option value="Department">Department</option>
                  </Select>
                )}
              </Field>
              <Field label="Icon">
                {(f) => (
                  <Select id={f.id} value={newWorkspaceIcon} onChange={(e) => setNewWorkspaceIcon(e.target.value)}>
                    <option value="Users">Team (Users)</option>
                    <option value="User">Personal (User)</option>
                    <option value="Cpu">Tech (Cpu)</option>
                    <option value="Briefcase">Enterprise</option>
                    <option value="Zap">Active (Zap)</option>
                    <option value="Compass">Compass</option>
                  </Select>
                )}
              </Field>
            </div>

            <Button type="submit" variant="primary" className="w-full">
              Create workspace
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
