import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import {
  Folder as FolderIcon,
  FolderClosed,
  FolderOpen,
  Tag,
  Settings,
  Trash2,
  Bookmark,
  Share2,
  Pin,
  Home,
  FileText,
  Plus,
  Search,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Archive,
  FileEdit,
  Globe,
  MoreVertical,
  Check,
  X,
  Palette,
  Smile,
  Star,
  Edit,
  Trash,
  FolderPlus,
  ArrowUpRight,
  Database,
  LogOut
} from "lucide-react";
import { Note, Folder, Workspace, WorkspaceType } from "../types";

interface SidebarProps {
  notes: Note[];
  folders: Folder[];
  tags: string[];
  activeFolder: string;
  setActiveFolder: (folder: string) => void;
  activeTag: string | null;
  setActiveTag: (tag: string | null) => void;
  onNewNote: () => void;
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  theme: "light" | "dark";
  currentUserEmail: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  onCreateWorkspace: (name: string, type: WorkspaceType, icon: string) => void;
  onDeleteWorkspace?: (id: string) => void;
  onTogglePinWorkspace: (id: string) => void;
  onToggleFavoriteWorkspace: (id: string) => void;
  // Folder Operations
  onNewFolder: (name: string, parentId?: string, color?: string, icon?: string) => string;
  onRenameFolder: (id: string, newName: string) => void;
  onDeleteFolder: (id: string, mode: "uncategorize" | "move" | "trash", targetFolderId?: string) => void;
  onMoveFolder: (folderId: string, parentId: string | undefined) => void;
  onUpdateFolderExpanded: (id: string, isExpanded: boolean) => void;
  onMoveNotesToFolder: (noteIds: string[], folderId: string) => void;
  onToggleFavoriteNote: (noteId: string) => void;
  onToggleArchiveNote: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onSignOut?: () => void;
}

const AVAILABLE_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];
const AVAILABLE_EMOJIS = ["📁", "💼", "🚀", "💡", "📝", "🎯", "🌟", "📚", "🔒", "🛠️"];

export default function Sidebar({
  notes,
  folders,
  tags,
  activeFolder,
  setActiveFolder,
  activeTag,
  setActiveTag,
  onNewNote,
  activeNoteId,
  setActiveNoteId,
  onOpenSettings,
  onOpenCommandPalette,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  theme,
  currentUserEmail,
  workspaces,
  activeWorkspaceId,
  setActiveWorkspaceId,
  onCreateWorkspace,
  onDeleteWorkspace,
  onTogglePinWorkspace,
  onToggleFavoriteWorkspace,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onUpdateFolderExpanded,
  onMoveNotesToFolder,
  onToggleFavoriteNote,
  onToggleArchiveNote,
  onDeleteNote,
  onSignOut,
}: SidebarProps) {
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [showUserProfileMenu, setShowUserProfileMenu] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const userProfileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (isWorkspaceOpen && workspaceMenuRef.current && !workspaceMenuRef.current.contains(target)) {
        setIsWorkspaceOpen(false);
      }
      if (showUserProfileMenu && userProfileRef.current && !userProfileRef.current.contains(target)) {
        setShowUserProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isWorkspaceOpen, showUserProfileMenu]);

  // Folder Local states
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingFolderColor, setEditingFolderColor] = useState("#3b82f6");
  const [editingFolderIcon, setEditingFolderIcon] = useState("📁");

  const [creatingInParentId, setCreatingInParentId] = useState<string | null | undefined>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#3b82f6");
  const [newFolderIcon, setNewFolderIcon] = useState("📁");

  // Context Menu
  const [contextMenuFolderId, setContextMenuFolderId] = useState<string | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Drag and drop visual cues
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverNavId, setDragOverNavId] = useState<string | null>(null);

  // Safe Deletion confirmation
  const [deleteConfirmFolderId, setDeleteConfirmFolderId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<"uncategorize" | "move" | "trash">("uncategorize");
  const [deleteTargetFolderId, setDeleteTargetFolderId] = useState<string>("");

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
  const activeNotes = notes.filter((n) => !n.isTrashed && !n.isArchived);

  // Stats calculation
  const totalNotesCount = activeNotes.length;
  const pinnedCount = activeNotes.filter((n) => n.isPinned).length;
  const sharedCount = activeNotes.filter((n) => n.isShared).length;
  const favoriteCount = activeNotes.filter((n) => n.isFavorite).length;
  const draftCount = activeNotes.filter((n) => n.status === "Draft" || n.tags.includes("Draft")).length;
  const publishedCount = activeNotes.filter((n) => n.status === "Published" || n.tags.includes("Published")).length;
  const archivedCount = notes.filter((n) => n.isArchived).length;
  const trashCount = notes.filter((n) => n.isTrashed).length;

  const storageUsed = (notes.reduce((acc, note) => acc + (note.content?.length || 0), 0) / 1024).toFixed(2); // KB
  const storageLimit = (activeWorkspace?.storageQuota || 5) * 1024; // MB to KB
  const storagePercentage = Math.min((parseFloat(storageUsed) / storageLimit) * 100, 100).toFixed(1);

  const mainNavItems = [
    { id: "Dashboard", label: "Home", icon: Home, badge: null },
    { id: "All Notes", label: "All Notes", icon: FileText, badge: totalNotesCount },
    { id: "Pinned", label: "Pinned", icon: Pin, badge: pinnedCount > 0 ? pinnedCount : null },
    { id: "Drafts", label: "Drafts", icon: FileEdit, badge: draftCount > 0 ? draftCount : null },
    { id: "Published", label: "Published", icon: Globe, badge: publishedCount > 0 ? publishedCount : null },
    { id: "Favorites", label: "Favorites", icon: Bookmark, badge: favoriteCount > 0 ? favoriteCount : null },
    { id: "Shared", label: "Shared", icon: Share2, badge: sharedCount > 0 ? sharedCount : null },
    { id: "Archive", label: "Archive", icon: Archive, badge: archivedCount > 0 ? archivedCount : null },
    { id: "Trash", label: "Trash", icon: Trash2, badge: trashCount > 0 ? trashCount : null },
  ];

  // Dismiss context menus on outer click
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenuFolderId(null);
      setContextMenuPosition(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Global Ctrl/Cmd + Shift + N shortcut for root folder creation
  useEffect(() => {
    const handleGlobalShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "N") {
        e.preventDefault();
        handleTriggerNewFolder(undefined);
      }
    };
    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, [folders]);

  const handleSelectNav = (id: string) => {
    setActiveTag(null);
    setActiveFolder(id);
  };

  const handleSelectFolder = (folderId: string) => {
    setActiveTag(null);
    setActiveFolder(folderId);
  };

  const handleSelectTag = (tag: string) => {
    if (activeTag === tag) {
      setActiveTag(null);
    } else {
      setActiveTag(tag);
      setActiveFolder("All Notes");
      const filtered = activeNotes.filter((n) => n.tags.includes(tag));
      if (filtered.length > 0) {
        setActiveNoteId(filtered[0].id);
      } else {
        setActiveNoteId(null);
      }
    }
  };

  // Folder creation triggering
  const handleTriggerNewFolder = (parentId: string | undefined) => {
    setCreatingInParentId(parentId || "root");
    setNewFolderName("");
    setNewFolderColor(AVAILABLE_COLORS[Math.floor(Math.random() * AVAILABLE_COLORS.length)]);
    setNewFolderIcon("📁");
  };

  const handleSaveNewFolder = (parentId: string | undefined) => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setCreatingInParentId(null);
      return;
    }

    // Check duplicate name inside the same parent
    const isDuplicate = folders.some(
      (f) => f.parentId === parentId && f.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      alert("A folder with this name already exists in this directory.");
      return;
    }

    const createdId = onNewFolder(trimmed, parentId, newFolderColor, newFolderIcon);
    setCreatingInParentId(null);
    
    // Automatically focus and expand the parent if nested
    if (parentId) {
      onUpdateFolderExpanded(parentId, true);
    }
  };

  const handleNewFolderKeyDown = (e: React.KeyboardEvent, parentId: string | undefined) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveNewFolder(parentId);
    } else if (e.key === "Escape") {
      setCreatingInParentId(null);
    }
  };

  // Folder Renaming triggering
  const handleTriggerRename = (folder: Folder) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
    setEditingFolderColor(folder.color || "#3b82f6");
    setEditingFolderIcon(folder.icon || "📁");
  };

  const handleSaveRename = (folderId: string) => {
    const trimmed = editingFolderName.trim();
    if (!trimmed) {
      setEditingFolderId(null);
      return;
    }

    // Check duplicates in the same level
    const currentFolder = folders.find((f) => f.id === folderId);
    const parentId = currentFolder?.parentId;
    const isDuplicate = folders.some(
      (f) => f.id !== folderId && f.parentId === parentId && f.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      alert("A folder with this name already exists in this directory.");
      return;
    }

    onRenameFolder(folderId, trimmed);
    
    // Also save color/emoji if updated
    const updatedFolders = folders.map((f) =>
      f.id === folderId ? { ...f, name: trimmed, color: editingFolderColor, icon: editingFolderIcon } : f
    );
    // Persist to server through App state
    const customEvent = new CustomEvent("aura-save-folders-direct", { detail: updatedFolders });
    window.dispatchEvent(customEvent);

    setEditingFolderId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, folderId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename(folderId);
    } else if (e.key === "Escape") {
      setEditingFolderId(null);
    }
  };

  // Safe Deletion confirmation
  const getFolderNotesCount = (folderId: string): number => {
    const getDescendants = (fid: string): string[] => {
      const direct = folders.filter((f) => f.parentId === fid).map((f) => f.id);
      return [...direct, ...direct.flatMap(getDescendants)];
    };
    const allTargets = [folderId, ...getDescendants(folderId)];
    return notes.filter((n) => n.workspaceId === activeWorkspaceId && allTargets.includes(n.folder) && !n.isTrashed).length;
  };

  const handleRequestDeleteFolder = (folderId: string) => {
    const count = getFolderNotesCount(folderId);
    if (count === 0) {
      // Direct deletion since there are zero notes inside
      onDeleteFolder(folderId, "uncategorize");
    } else {
      // Show rich options dialog
      setDeleteConfirmFolderId(folderId);
      setDeleteMode("uncategorize");
      
      // Select first eligible target folder that isn't the deleted folder or its descendants
      const getDescendants = (fid: string): string[] => {
        const direct = folders.filter((f) => f.parentId === fid).map((f) => f.id);
        return [...direct, ...direct.flatMap(getDescendants)];
      };
      const excludedIds = [folderId, ...getDescendants(folderId)];
      const candidate = folders.find((f) => !excludedIds.includes(f.id));
      setDeleteTargetFolderId(candidate?.id || "f-general");
    }
  };

  const handleConfirmDeleteFolder = () => {
    if (!deleteConfirmFolderId) return;
    onDeleteFolder(deleteConfirmFolderId, deleteMode, deleteMode === "move" ? deleteTargetFolderId : undefined);
    setDeleteConfirmFolderId(null);
  };

  // Drag and drop handlers for Sidebar folders/navigation items
  const handleDragStartFolder = (e: React.DragEvent, folderId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", folderId);
    e.dataTransfer.setData("type", "folder");
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(folderId);
  };

  const handleDragLeaveFolder = () => {
    setDragOverFolderId(null);
  };

  const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);

    const type = e.dataTransfer.getData("type");
    const draggedData = e.dataTransfer.getData("text/plain");

    if (type === "folder") {
      if (draggedData === targetFolderId) return;
      onMoveFolder(draggedData, targetFolderId);
    } else if (type === "notes") {
      try {
        const noteIds = JSON.parse(draggedData);
        if (Array.isArray(noteIds)) {
          onMoveNotesToFolder(noteIds, targetFolderId);
        }
      } catch {}
    } else if (type === "note") {
      onMoveNotesToFolder([draggedData], targetFolderId);
    }
  };

  // Drop notes into Sidebar virtual tabs (Favorites, Archive, Trash)
  const handleDragOverNav = (e: React.DragEvent, navId: string) => {
    if (["Favorites", "Archive", "Trash"].includes(navId)) {
      e.preventDefault();
      setDragOverNavId(navId);
    }
  };

  const handleDragLeaveNav = () => {
    setDragOverNavId(null);
  };

  const handleDropOnNav = (e: React.DragEvent, navId: string) => {
    e.preventDefault();
    setDragOverNavId(null);
    const type = e.dataTransfer.getData("type");
    const draggedData = e.dataTransfer.getData("text/plain");

    let noteIds: string[] = [];
    if (type === "notes") {
      try {
        noteIds = JSON.parse(draggedData);
      } catch {}
    } else if (type === "note") {
      noteIds = [draggedData];
    }

    if (noteIds.length > 0) {
      if (navId === "Favorites") {
        noteIds.forEach((id) => onToggleFavoriteNote(id));
      } else if (navId === "Archive") {
        noteIds.forEach((id) => onToggleArchiveNote(id));
      } else if (navId === "Trash") {
        noteIds.forEach((id) => onDeleteNote(id));
      }
    }
  };

  // Drop folder onto "Folders" header to move it back to root level
  const handleDragOverHeader = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnHeader = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("type");
    const draggedData = e.dataTransfer.getData("text/plain");
    if (type === "folder") {
      onMoveFolder(draggedData, undefined);
    }
  };

  // Right-click Context Menu rendering
  const handleFolderContextMenu = (e: React.MouseEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuFolderId(folderId);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  };

  // Long-press Touch events simulation for mobile Context Menu
  let touchTimerRef = useRef<any>(null);
  const handleTouchStart = (e: React.TouchEvent, folderId: string) => {
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    touchTimerRef.current = setTimeout(() => {
      setContextMenuFolderId(folderId);
      setContextMenuPosition({ x: clientX, y: clientY });
    }, 600);
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }
  };

  // Recursive render of nested Folder tree nodes
  const renderFolderTree = (parentId: string | undefined, depth: number = 0): React.ReactNode => {
    const currentLevel = folders.filter((f) => f.parentId === parentId);

    return (
      <div className="flex flex-col gap-0.5 w-full">
        {currentLevel.map((folder) => {
          const isSelected = activeFolder === folder.id && activeTag === null;
          const folderCount = notes.filter((n) => n.folder === folder.id && !n.isTrashed && !n.isArchived).length;
          const isExpanded = folder.isExpanded ?? false;
          
          // Check if this folder has subfolders
          const hasChildren = folders.some((f) => f.parentId === folder.id);
          const isEditing = editingFolderId === folder.id;
          const isTargetedDrag = dragOverFolderId === folder.id;

          return (
            <div key={folder.id} className="w-full flex flex-col">
              {/* Folder Node row */}
              <div
                onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
                onTouchStart={(e) => handleTouchStart(e, folder.id)}
                onTouchEnd={handleTouchEnd}
                draggable
                onDragStart={(e) => handleDragStartFolder(e, folder.id)}
                onDragOver={(e) => handleDragOverFolder(e, folder.id)}
                onDragLeave={handleDragLeaveFolder}
                onDrop={(e) => handleDropOnFolder(e, folder.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleTriggerRename(folder);
                }}
                onClick={() => handleSelectFolder(folder.id)}
                className={`flex items-center justify-between text-xs py-1 px-2 rounded-md transition-all group cursor-pointer relative ${
                  isSelected
                    ? theme === "dark"
                      ? "bg-zinc-900/95 text-indigo-400 font-semibold border-l-2"
                      : "bg-white text-blue-600 font-semibold shadow-xs border-l-2 border-blue-500"
                    : isTargetedDrag
                    ? "bg-blue-500/10 border border-dashed border-blue-500"
                    : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100/40 dark:hover:bg-zinc-900/30"
                }`}
                style={{
                  borderLeftColor: isSelected ? folder.color || "#3b82f6" : "transparent",
                  paddingLeft: `${depth * 12 + 8}px`
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-grow">
                  {/* Expansion chevron toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateFolderExpanded(folder.id, !isExpanded);
                    }}
                    className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors ${
                      hasChildren ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>

                  {/* Inline Edit form OR static icon + label */}
                  {isEditing ? (
                    <div className="flex flex-col gap-1.5 p-1 bg-slate-50 dark:bg-zinc-900 rounded-lg w-full z-20 shadow-sm border border-slate-200/50 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{editingFolderIcon}</span>
                        <input
                          type="text"
                          value={editingFolderName}
                          onChange={(e) => setEditingFolderName(e.target.value)}
                          onKeyDown={(e) => handleRenameKeyDown(e, folder.id)}
                          autoFocus
                          className="text-xs px-1.5 py-1 rounded outline-none border w-full bg-white dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 border-slate-200 dark:border-zinc-800"
                        />
                        <button
                          onClick={() => handleSaveRename(folder.id)}
                          className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600"
                        >
                          <Check size={11} />
                        </button>
                        <button
                          onClick={() => setEditingFolderId(null)}
                          className="p-1 rounded bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-slate-300"
                        >
                          <X size={11} />
                        </button>
                      </div>

                      {/* inline customization options */}
                      <div className="flex flex-col gap-1">
                        {/* Emojis selection */}
                        <div className="flex gap-1 overflow-x-auto py-0.5">
                          {AVAILABLE_EMOJIS.map((em) => (
                            <button
                              key={em}
                              onClick={() => setEditingFolderIcon(em)}
                              className={`text-xs p-1 rounded hover:scale-115 transition-transform ${
                                editingFolderIcon === em ? "bg-blue-500/10 ring-1 ring-blue-500" : ""
                              }`}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                        {/* Colors selection */}
                        <div className="flex gap-1.5 py-0.5">
                          {AVAILABLE_COLORS.map((col) => (
                            <button
                              key={col}
                              onClick={() => setEditingFolderColor(col)}
                              className={`w-3.5 h-3.5 rounded-full hover:scale-115 transition-transform`}
                              style={{
                                backgroundColor: col,
                                boxShadow: editingFolderColor === col ? "0 0 0 2px #fff, 0 0 0 3px " + col : "none"
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-xs">{folder.icon || "📁"}</span>
                      <span className="truncate">{folder.name}</span>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] opacity-50 font-mono scale-90">{folderCount}</span>
                    {/* More button showing context menu */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFolderContextMenu(e, folder.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400"
                    >
                      <MoreVertical size={11} />
                    </button>
                  </div>
                )}
              </div>

              {/* Recursive child folders container */}
              {isExpanded && hasChildren && (
                <div className="w-full">
                  {renderFolderTree(folder.id, depth + 1)}
                </div>
              )}
            </div>
          );
        })}

        {/* Inline Folder Creation Form */}
        {creatingInParentId === (parentId || "root") && (
          <div
            style={{ paddingLeft: `${(parentId ? depth + 1 : depth) * 12 + 8}px` }}
            className="flex flex-col gap-1.5 p-2 mx-1 rounded-xl bg-slate-50 dark:bg-zinc-900 shadow-sm border border-slate-200/50 dark:border-zinc-800"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs">{newFolderIcon}</span>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => handleNewFolderKeyDown(e, parentId)}
                placeholder="Folder name..."
                autoFocus
                className="text-xs px-2 py-1.5 rounded outline-none border w-full bg-white dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 border-slate-200 dark:border-zinc-800"
              />
              <button
                onClick={() => handleSaveNewFolder(parentId)}
                className="p-1 rounded bg-blue-500 text-white hover:bg-blue-600"
              >
                <Check size={11} />
              </button>
              <button
                onClick={() => setCreatingInParentId(null)}
                className="p-1 rounded bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400"
              >
                <X size={11} />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex gap-1 overflow-x-auto py-0.5">
                {AVAILABLE_EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => setNewFolderIcon(em)}
                    className={`text-xs p-1 rounded hover:scale-115 transition-transform ${
                      newFolderIcon === em ? "bg-blue-500/10 ring-1 ring-blue-500" : ""
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 py-0.5">
                {AVAILABLE_COLORS.map((col) => (
                  <button
                    key={col}
                    onClick={() => setNewFolderColor(col)}
                    className="w-3.5 h-3.5 rounded-full hover:scale-115 transition-transform"
                    style={{
                      backgroundColor: col,
                      boxShadow: newFolderColor === col ? "0 0 0 2px #fff, 0 0 0 3px " + col : "none"
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      id="sidebar-container"
      animate={{ width: isSidebarCollapsed ? 72 : 280 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className={`h-full border-r relative flex flex-col flex-shrink-0 transition-colors duration-200 select-none ${
        theme === "dark"
          ? "bg-[#09090b] border-zinc-800 text-zinc-300"
          : "bg-[#FAFAFC] border-slate-200 text-slate-700"
      }`}
    >
      {/* Sidebar Collapse Toggle */}
      <button
        id="sidebar-collapse-btn"
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className={`absolute -right-3 top-5 z-20 w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
          theme === "dark"
            ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
            : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
        } shadow-sm cursor-pointer`}
      >
        {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Workspace Switcher */}
      <div id="workspace-switcher-section" className="p-4 flex flex-col gap-2 border-b border-slate-100/40 dark:border-zinc-800/40">
        <div ref={workspaceMenuRef} className="relative">
          <button
            id="workspace-dropdown-btn"
            onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
            className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all ${
              theme === "dark" ? "hover:bg-zinc-950/80 bg-zinc-950/20" : "hover:bg-slate-100/80 bg-slate-100/30"
            } ${isSidebarCollapsed ? "justify-center" : "justify-between"} border border-slate-200/40 dark:border-zinc-800/40 shadow-xs cursor-pointer`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center font-display font-black text-white shadow-sm shrink-0 bg-gradient-to-tr ${
                  activeWorkspace?.type === "Personal" ? "from-amber-400 to-orange-500" :
                  activeWorkspace?.type === "Team" ? "from-emerald-400 to-teal-500" : "from-blue-500 to-indigo-600"
                }`}
              >
                {activeWorkspace?.icon || activeWorkspace?.name[0]}
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold truncate text-slate-800 dark:text-zinc-100">{activeWorkspace?.name}</span>
                  <span className="text-[10px] opacity-60 font-medium truncate">{activeWorkspace?.type} Studio</span>
                </div>
              )}
            </div>
            {!isSidebarCollapsed && <ChevronDown size={13} className="opacity-60" />}
          </button>

          {isWorkspaceOpen && (
            <div
              className={`absolute mt-1.5 rounded-2xl shadow-2xl border p-1.5 z-50 flex flex-col gap-0.5 ${
                isSidebarCollapsed
                  ? "left-full top-0 ml-2 w-60"
                  : "top-full left-0 right-0"
              } ${
                theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase px-2 py-1.5 border-b border-slate-100 dark:border-zinc-800/60 mb-1">
                Switch Studio
              </div>
              <div className="max-h-60 overflow-y-auto flex flex-col gap-0.5 no-scrollbar">
                {workspaces.map((w) => {
                  const isActive = w.id === activeWorkspaceId;
                  return (
                    <div
                      key={w.id}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs transition-colors group/item ${
                        isActive
                          ? theme === "dark" ? "bg-zinc-900 text-white font-semibold" : "bg-slate-100 text-slate-900 font-semibold"
                          : "hover:bg-slate-50 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setActiveWorkspaceId(w.id);
                          setIsWorkspaceOpen(false);
                        }}
                        className="flex items-center gap-2 flex-grow min-w-0 text-left cursor-pointer bg-transparent border-none outline-none text-inherit font-inherit"
                      >
                        <span className="shrink-0">{w.icon || "🚀"}</span>
                        <span className="truncate">{w.name}</span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                        <button
                          onClick={() => onTogglePinWorkspace(w.id)}
                          className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400 ${w.isPinned ? "text-amber-500" : ""}`}
                          title="Pin Workspace"
                        >
                          <Pin size={10} className={w.isPinned ? "fill-amber-500" : ""} />
                        </button>
                        <button
                          onClick={() => onToggleFavoriteWorkspace(w.id)}
                          className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400 ${w.isFavorite ? "text-yellow-500" : ""}`}
                          title="Favorite Workspace"
                        >
                          <Star size={10} className={w.isFavorite ? "fill-yellow-500" : ""} />
                        </button>
                        {workspaces.length > 1 && (
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete workspace "${w.name}"? All folders and notes inside it will be permanently deleted.`)) {
                                if (onDeleteWorkspace) onDeleteWorkspace(w.id);
                              }
                            }}
                            className="p-1 rounded hover:bg-red-500/10 text-red-500 hover:text-red-600 cursor-pointer"
                            title="Delete Workspace"
                          >
                            <Trash size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="h-px bg-slate-100 dark:bg-zinc-800/80 my-1"></div>
              
              <button
                onClick={() => {
                  const wsName = prompt("Enter new workspace name:");
                  if (wsName && wsName.trim()) {
                    onCreateWorkspace(wsName.trim(), "Personal", "💼");
                  }
                  setIsWorkspaceOpen(false);
                }}
                className="w-full flex items-center justify-center gap-1.5 p-2 rounded-xl text-xs font-semibold text-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 cursor-pointer transition-colors"
              >
                <Plus size={13} />
                <span>Create Workspace</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Primary Actions */}
      <div id="quick-actions-section" className="px-4 mb-2 flex flex-col gap-1.5 mt-4">
        <button
          id="new-note-sidebar-btn"
          onClick={onNewNote}
          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xs transition-transform active:scale-[0.98] ${
            theme === "dark"
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
              : "bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
          } justify-center cursor-pointer`}
        >
          <Plus size={14} />
          {!isSidebarCollapsed && <span>New Note</span>}
        </button>

        {!isSidebarCollapsed && (
          <button
            id="cmd-palette-sidebar-btn"
            onClick={onOpenCommandPalette}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors border ${
              theme === "dark"
                ? "bg-zinc-950/40 hover:bg-zinc-900 border-zinc-800/80 text-zinc-400"
                : "bg-white hover:bg-slate-50 border-slate-200/80 text-slate-400"
            }`}
          >
            <div className="flex items-center gap-2">
              <Search size={13} />
              <span>Search Actions...</span>
            </div>
            <span className="font-mono text-[9px] scale-90 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
              ⌘K
            </span>
          </button>
        )}
      </div>

      {/* Main Views */}
      <div id="main-navigation-section" className="px-2 py-1 flex flex-col gap-0.5 overflow-y-auto flex-grow no-scrollbar">
        {mainNavItems.map((item) => {
          const isActive = activeFolder === item.id && activeTag === null;
          const isTargetedDrag = dragOverNavId === item.id;
          
          return (
            <button
              id={`nav-item-${item.id.toLowerCase().replace(" ", "-")}`}
              key={item.id}
              onClick={() => handleSelectNav(item.id)}
              onDragOver={(e) => handleDragOverNav(e, item.id)}
              onDragLeave={handleDragLeaveNav}
              onDrop={(e) => handleDropOnNav(e, item.id)}
              className={`flex items-center rounded-lg p-2 text-xs font-medium transition-all group cursor-pointer ${
                isSidebarCollapsed ? "justify-center" : "justify-between"
              } ${
                isActive
                  ? theme === "dark"
                    ? "bg-zinc-900 text-white font-semibold border-l-2 border-indigo-500 pl-1.5"
                    : "bg-white text-slate-950 font-semibold shadow-xs border-l-2 border-blue-500 pl-1.5"
                  : isTargetedDrag
                  ? "bg-blue-500/15 border border-dashed border-blue-500 pl-1.5"
                  : theme === "dark"
                  ? "hover:bg-zinc-900/60 text-zinc-400 hover:text-zinc-200"
                  : "hover:bg-slate-100/60 text-slate-500 hover:text-slate-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon
                  size={15}
                  className={`transition-colors ${
                    isActive
                      ? "text-blue-500 dark:text-indigo-400"
                      : "text-slate-400 group-hover:text-slate-600 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                  }`}
                />
                {!isSidebarCollapsed && <span>{item.label}</span>}
              </div>
              {!isSidebarCollapsed && item.badge !== null && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? "bg-blue-100 dark:bg-zinc-800 text-blue-600 dark:text-indigo-400"
                      : "bg-slate-200/50 dark:bg-zinc-900 text-slate-500 dark:text-zinc-500"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Folders Accordion with Unlimited Nesting */}
        {isSidebarCollapsed ? (
          <div className="mt-4 flex flex-col items-center gap-1.5 px-2">
            <div className="w-8 h-px bg-slate-200 dark:bg-zinc-800/80 my-1"></div>
            {folders.filter(f => !f.parentId).map((folder) => {
              const isSelected = activeFolder === folder.id && activeTag === null;
              return (
                <button
                  key={folder.id}
                  onClick={() => handleSelectFolder(folder.id)}
                  title={folder.name}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? theme === "dark"
                        ? "bg-zinc-900 text-indigo-400 font-semibold"
                        : "bg-white text-blue-600 font-semibold shadow-xs border border-slate-200"
                      : "text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100/40 dark:hover:bg-zinc-900/30"
                  }`}
                >
                  {folder.icon || "📁"}
                </button>
              );
            })}
          </div>
        ) : (
          <div id="folders-section" className="mt-4 px-2" onDragOver={handleDragOverHeader} onDrop={handleDropOnHeader}>
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 px-1 py-1">
              <span className="cursor-pointer hover:text-slate-600" title="Drop here to move folder to top-level">Folders</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleTriggerNewFolder(undefined)}
                  title="New Folder"
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400"
                >
                  <FolderPlus size={12} />
                </button>
                <Layers size={11} />
              </div>
            </div>

            {/* Folders tree render starting at root */}
            <div className="flex flex-col gap-0.5 mt-1">
              {renderFolderTree(undefined)}
            </div>
          </div>
        )}

        {/* Tags Section */}
        {isSidebarCollapsed ? (
          tags.length > 0 && (
            <div className="mt-4 flex flex-col items-center gap-1.5 px-2">
              <div className="w-8 h-px bg-slate-200 dark:bg-zinc-800/80 my-1"></div>
              {tags.map((tag) => {
                const isSelected = activeTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => handleSelectTag(tag)}
                    title={`Tag: #${tag}`}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-mono transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-blue-500 text-white font-medium"
                        : "bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200/60 dark:hover:bg-zinc-800 text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    #
                  </button>
                );
              })}
            </div>
          )
        ) : (
          tags.length > 0 && (
            <div id="tags-section" className="mt-4 px-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 px-1 py-1">
                <span>Tags</span>
                <Tag size={11} />
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5 px-1">
                {tags.map((tag) => {
                  const isSelected = activeTag === tag;
                  return (
                    <button
                      id={`tag-badge-${tag.toLowerCase()}`}
                      key={tag}
                      onClick={() => handleSelectTag(tag)}
                      className={`text-[11px] px-2 py-0.5 rounded-full transition-all flex items-center gap-1 cursor-pointer ${
                        isSelected
                          ? "bg-blue-500 text-white font-medium"
                          : "bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200/60 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                      }`}
                    >
                      <span className="opacity-60">#</span>
                      <span>{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>

      {/* Footer / Settings, Storage & Profile */}
      <div
        ref={userProfileRef}
        id="sidebar-footer"
        className={`mt-auto p-3 border-t relative ${
          theme === "dark" ? "border-zinc-800/80 bg-zinc-950/20" : "border-slate-200/60 bg-slate-50/50"
        }`}
      >
        {/* User Profile Popover */}
        {showUserProfileMenu && (
          <div
            id="user-profile-popover"
            className={`absolute z-50 flex flex-col gap-3 animate-fade-in ${
              isSidebarCollapsed
                ? "left-14 w-60 bottom-2 mb-0"
                : "bottom-full left-3 right-3 mb-2"
            } rounded-2xl shadow-2xl border p-3.5 ${
              theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-100" : "bg-white border-slate-200 text-slate-800"
            }`}
          >
            {/* Header info */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white bg-gradient-to-tr from-indigo-500 to-pink-500 shadow-sm">
                {currentUserEmail ? currentUserEmail[0].toUpperCase() : "U"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold truncate">
                  {currentUserEmail ? currentUserEmail.split("@")[0] : "Enterprise Guest"}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                  {currentUserEmail || "sandbox@aura.io"}
                </span>
              </div>
            </div>

            {/* Actions list */}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => {
                  onOpenSettings();
                  setShowUserProfileMenu(false);
                }}
                className={`flex items-center gap-2.5 w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  theme === "dark"
                    ? "hover:bg-zinc-900 text-zinc-350 hover:text-white"
                    : "hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                }`}
              >
                <Settings size={13} className="opacity-70" />
                <span>Account Settings</span>
              </button>

              {onSignOut && (
                <button
                  onClick={() => {
                    onSignOut();
                    setShowUserProfileMenu(false);
                  }}
                  className="flex items-center gap-2.5 w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-rose-500 hover:bg-rose-50/50 dark:hover:bg-rose-950/20"
                >
                  <LogOut size={13} />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Cloud Storage Sync */}
        {!isSidebarCollapsed && (
          <div className="mb-2 px-1 flex flex-col gap-1.5 select-none">
            <div className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1 text-slate-400 dark:text-zinc-500 font-medium">
                <Database size={10} />
                Cloud Storage Sync
              </span>
              <span className="text-slate-500 dark:text-zinc-400 font-mono">
                {storageUsed}KB / {activeWorkspace?.storageQuota || 5}MB
              </span>
            </div>
            <div className="w-full h-1 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  parseFloat(storagePercentage) > 85
                    ? "bg-rose-500"
                    : parseFloat(storagePercentage) > 60
                    ? "bg-amber-500"
                    : "bg-blue-500"
                }`}
                style={{ width: `${storagePercentage}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Clickable User profile strip */}
        <button
          id="user-profile-section"
          onClick={() => setShowUserProfileMenu(!showUserProfileMenu)}
          className={`flex items-center gap-2.5 w-full p-1.5 rounded-xl transition-all text-left cursor-pointer hover:bg-slate-100/80 dark:hover:bg-zinc-800/80 ${
            showUserProfileMenu ? "bg-slate-100 dark:bg-zinc-800" : ""
          } ${isSidebarCollapsed ? "justify-center" : ""}`}
        >
          <div className="relative flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-white shadow-sm border ${
                theme === "dark"
                  ? "bg-[#18181b] border-zinc-700"
                  : "bg-white border-slate-200"
              }`}
            >
              <div
                className={`w-6.5 h-6.5 rounded-full flex items-center justify-center text-[10px] text-white bg-gradient-to-tr from-indigo-500 to-pink-500`}
              >
                {currentUserEmail ? currentUserEmail[0].toUpperCase() : "U"}
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[#FAFAFC] dark:border-[#09090B] rounded-full"></div>
          </div>

          {!isSidebarCollapsed && (
            <div className="flex-grow flex items-center justify-between min-w-0">
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100 truncate">
                  {currentUserEmail ? currentUserEmail.split("@")[0] : "Enterprise Guest"}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                  {currentUserEmail || "sandbox@aura.io"}
                </span>
              </div>
              <ChevronDown size={12} className={`text-slate-400 transition-transform ${showUserProfileMenu ? "rotate-180" : ""}`} />
            </div>
          )}
        </button>
      </div>

      {/* Context Menu Popup Overlay */}
      {contextMenuFolderId && contextMenuPosition && (
        <div
          className={`fixed border p-1.5 rounded-2xl shadow-2xl flex flex-col gap-0.5 z-50 min-w-44 ${
            theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
          }`}
          style={{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* New Note */}
          <button
            onClick={() => {
              const f = folders.find((fol) => fol.id === contextMenuFolderId);
              if (f) {
                // Trigger normal note creation with this folder pre-selected
                onNewNote();
                setTimeout(() => {
                  const event = new CustomEvent("aura-preselect-note-folder", { detail: f.id });
                  window.dispatchEvent(event);
                }, 100);
              }
              setContextMenuFolderId(null);
            }}
            className="text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-900"
          >
            <Plus size={13} className="text-blue-500" />
            <span>New Note here</span>
          </button>

          {/* New Sub-folder */}
          <button
            onClick={() => {
              if (contextMenuFolderId) handleTriggerNewFolder(contextMenuFolderId);
              setContextMenuFolderId(null);
            }}
            className="text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-900"
          >
            <FolderPlus size={13} className="text-indigo-500" />
            <span>Create Sub-folder</span>
          </button>

          {/* Rename / Customize */}
          <button
            onClick={() => {
              const fol = folders.find((fo) => fo.id === contextMenuFolderId);
              if (fol) handleTriggerRename(fol);
              setContextMenuFolderId(null);
            }}
            className="text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-900"
          >
            <Edit size={13} className="text-amber-500" />
            <span>Rename / Customize</span>
          </button>

          <hr className="my-1 border-slate-100 dark:border-zinc-800" />

          {/* Delete Folder */}
          <button
            onClick={() => {
              if (contextMenuFolderId) handleRequestDeleteFolder(contextMenuFolderId);
              setContextMenuFolderId(null);
            }}
            className="text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-rose-500 hover:bg-rose-50/50 dark:hover:bg-rose-950/20"
          >
            <Trash size={13} />
            <span>Delete Folder</span>
          </button>
        </div>
      )}

      {/* Safe Deletion Confirmation Modal Overlay */}
      {deleteConfirmFolderId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className={`p-6 rounded-3xl max-w-md w-full border shadow-2xl flex flex-col gap-4 ${
            theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-100" : "bg-white border-slate-200 text-slate-800"
          }`}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="text-rose-500" size={20} />
              </div>
              <div className="flex flex-col min-w-0">
                <h3 className="text-sm font-bold truncate">Safe Folder Deletion</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  The folder <strong>"{folders.find((f) => f.id === deleteConfirmFolderId)?.name}"</strong> contains{" "}
                  <strong>{getFolderNotesCount(deleteConfirmFolderId)} notes</strong> inside it.
                  Please select how you'd like to handle these notes before deleting:
                </p>
              </div>
            </div>

            {/* Selection modes radio list */}
            <div className="flex flex-col gap-2 mt-2">
              <label className={`p-3 rounded-2xl border flex items-center gap-3 cursor-pointer ${
                deleteMode === "uncategorize" ? "border-blue-500 bg-blue-500/5" : "border-slate-200 dark:border-zinc-800"
              }`}>
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === "uncategorize"}
                  onChange={() => setDeleteMode("uncategorize")}
                  className="hidden"
                />
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  deleteMode === "uncategorize" ? "border-blue-500" : "border-slate-400"
                }`}>
                  {deleteMode === "uncategorize" && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">Move to Uncategorized (Default)</span>
                  <span className="text-[10px] opacity-60">Keeps the documents intact under the default folder</span>
                </div>
              </label>

              <label className={`p-3 rounded-2xl border flex flex-col gap-2 cursor-pointer ${
                deleteMode === "move" ? "border-blue-500 bg-blue-500/5" : "border-slate-200 dark:border-zinc-800"
              }`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === "move"}
                    onChange={() => setDeleteMode("move")}
                    className="hidden"
                  />
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    deleteMode === "move" ? "border-blue-500" : "border-slate-400"
                  }`}>
                    {deleteMode === "move" && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                  </div>
                  <span className="text-xs font-semibold">Move notes to another folder:</span>
                </div>

                {deleteMode === "move" && (
                  <select
                    value={deleteTargetFolderId}
                    onChange={(e) => setDeleteTargetFolderId(e.target.value)}
                    className={`text-xs ml-7 p-2 rounded-xl outline-none border bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200`}
                  >
                    {folders
                      .filter((f) => f.id !== deleteConfirmFolderId)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.icon || "📁"} {f.name}
                        </option>
                      ))}
                  </select>
                )}
              </label>

              <label className={`p-3 rounded-2xl border flex items-center gap-3 cursor-pointer ${
                deleteMode === "trash" ? "border-rose-500 bg-rose-500/5" : "border-slate-200 dark:border-zinc-800"
              }`}>
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === "trash"}
                  onChange={() => setDeleteMode("trash")}
                  className="hidden"
                />
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  deleteMode === "trash" ? "border-rose-500" : "border-slate-400"
                }`}>
                  {deleteMode === "trash" && <div className="w-2 h-2 bg-rose-500 rounded-full" />}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-rose-500">Move folder and notes to Trash</span>
                  <span className="text-[10px] opacity-60">Safely trashes everything; can be recovered later</span>
                </div>
              </label>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setDeleteConfirmFolderId(null)}
                className={`px-4 py-2 text-xs font-semibold rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-900`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteFolder}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-500 text-white hover:bg-rose-600 shadow-md shadow-rose-500/10"
              >
                Execute Safe Deletion
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
