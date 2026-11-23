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
  Activity,
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
  LogOut,
  Bot,
  Building2,
  Shield,
  ChevronsUpDown,
  Workflow
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, Button, Dialog, IconButton, Kbd, Logo, LogoMark, Menu } from "../ui";
import type { MenuEntry } from "../ui";
import { Note, Folder, Workspace, WorkspaceType } from "../types";

import SmartFoldersSection from "../features/smartFolders/SmartFoldersSection";
import type { SmartFolder } from "../features/smartFolders/store";

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
  onMobileClose?: () => void;
  isOnline?: boolean;
  /** Smart folders (features/smartFolders); the section is hidden when not provided. */
  smartFolders?: SmartFolder[];
  onSaveSmartFolder?: (sf: SmartFolder) => void;
  onDeleteSmartFolder?: (id: string) => void;
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
  onMobileClose,
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
  isOnline,
  smartFolders,
  onSaveSmartFolder,
  onDeleteSmartFolder,
}: SidebarProps) {
  const navigate = useNavigate();
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [linksOpen, setLinksOpen] = useState(true);
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

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces?.[0] || null;

  const {
    activeNotes,
    totalNotesCount,
    pinnedCount,
    sharedCount,
    favoriteCount,
    draftCount,
    publishedCount,
    archivedCount,
    trashCount,
    storageUsed,
    storageLimit,
    storagePercentage,
  } = useMemo(() => {
    const actNotes = notes.filter((n) => !n.isTrashed && !n.isArchived);
    const total = actNotes.length;
    const pinned = actNotes.filter((n) => n.isPinned).length;
    const shared = actNotes.filter((n) => n.isShared).length;
    const favorite = actNotes.filter((n) => n.isFavorite).length;
    const draft = actNotes.filter((n) => n.status === "Draft" || (n.tags && n.tags.includes("Draft"))).length;
    const published = actNotes.filter((n) => n.status === "Published" || (n.tags && n.tags.includes("Published"))).length;
    const archived = notes.filter((n) => n.isArchived).length;
    const trash = notes.filter((n) => n.isTrashed).length;

    const usedKb = (notes.reduce((acc, note) => acc + (note.content?.length || 0), 0) / 1024).toFixed(2);
    const quotaVal = activeWorkspace?.storageQuota || 5 * 1024 * 1024;
    const limitKb = quotaVal > 10000 ? quotaVal / 1024 : quotaVal * 1024;
    const pct = limitKb > 0 ? Math.min((parseFloat(usedKb) / limitKb) * 100, 100).toFixed(1) : "0.0";

    return {
      activeNotes: actNotes,
      totalNotesCount: total,
      pinnedCount: pinned,
      sharedCount: shared,
      favoriteCount: favorite,
      draftCount: draft,
      publishedCount: published,
      archivedCount: archived,
      trashCount: trash,
      storageUsed: usedKb,
      storageLimit: limitKb,
      storagePercentage: pct,
    };
  }, [notes, activeWorkspace]);

  const topTags = useMemo(() => {
    const counts: Record<string, number> = {};
    activeNotes.forEach((note) => {
      note.tags?.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
    const sliced = sorted.slice(0, 8);
    if (activeTag && !sliced.includes(activeTag)) {
      sliced.push(activeTag);
    }
    return sliced;
  }, [activeNotes, activeTag]);

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
    if (onMobileClose) onMobileClose();
  };

  const handleSelectFolder = (folderId: string) => {
    setActiveTag(null);
    setActiveFolder(folderId);
    if (onMobileClose) onMobileClose();
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
    if (onMobileClose) onMobileClose();
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

    const swatches = (current: string, set: (c: string) => void) => (
      <div className="flex gap-1.5 py-1" role="group" aria-label="Folder color">
        {AVAILABLE_COLORS.map((col) => (
          <button
            key={col}
            type="button"
            aria-label={`Color ${col}`}
            aria-pressed={current === col}
            onClick={() => set(col)}
            className="h-4 w-4 rounded-full outline-offset-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent"
            style={{ backgroundColor: col, outline: current === col ? `2px solid ${col}` : undefined }}
          />
        ))}
      </div>
    );
    const emojis = (current: string, set: (e: string) => void) => (
      <div className="flex gap-0.5 overflow-x-auto py-0.5" role="group" aria-label="Folder icon">
        {AVAILABLE_EMOJIS.map((em) => (
          <button
            key={em}
            type="button"
            aria-label={`Icon ${em}`}
            aria-pressed={current === em}
            onClick={() => set(em)}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent ${
              current === em ? "bg-accent-soft" : ""
            }`}
          >
            {em}
          </button>
        ))}
      </div>
    );

    return (
      <div className="flex w-full flex-col gap-px">
        {currentLevel.map((folder) => {
          const isSelected = activeFolder === folder.id && activeTag === null;
          const folderCount = notes.filter((n) => n.folder === folder.id && !n.isTrashed && !n.isArchived).length;
          const isExpanded = folder.isExpanded ?? false;
          const hasChildren = folders.some((f) => f.parentId === folder.id);
          const isEditing = editingFolderId === folder.id;
          const isTargetedDrag = dragOverFolderId === folder.id;

          return (
            <div key={folder.id} className="flex w-full flex-col">
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
                className={`group relative flex min-h-10 items-center justify-between rounded-md pr-1 text-[13px] transition-colors md:min-h-8 ${
                  isSelected
                    ? "bg-active font-medium text-fg"
                    : isTargetedDrag
                    ? "bg-accent-soft outline-1 outline-dashed outline-accent"
                    : "text-fg-muted hover:bg-hover hover:text-fg"
                }`}
                style={{ paddingLeft: `${depth * 12 + 2}px` }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
                    aria-expanded={isExpanded}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateFolderExpanded(folder.id, !isExpanded);
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                ) : (
                  <span className="h-6 w-6 shrink-0" aria-hidden />
                )}

                {isEditing ? (
                  <div className="z-20 flex min-w-0 flex-1 flex-col gap-1 rounded-md border border-line bg-raised p-1.5 shadow-soft" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px]" aria-hidden>{editingFolderIcon}</span>
                      <input
                        type="text"
                        aria-label="Folder name"
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onKeyDown={(e) => handleRenameKeyDown(e, folder.id)}
                        autoFocus
                        className="h-7 w-full min-w-0 rounded border border-line bg-panel px-1.5 text-[13px] text-fg outline-none focus:border-accent"
                      />
                      <IconButton label="Save folder" size="sm" variant="primary" onClick={() => handleSaveRename(folder.id)}>
                        <Check size={12} />
                      </IconButton>
                      <IconButton label="Cancel rename" size="sm" onClick={() => setEditingFolderId(null)}>
                        <X size={12} />
                      </IconButton>
                    </div>
                    {emojis(editingFolderIcon, setEditingFolderIcon)}
                    {swatches(editingFolderColor, setEditingFolderColor)}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSelectFolder(folder.id)}
                    aria-current={isSelected ? "page" : undefined}
                    className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:outline-2 focus-visible:outline-accent md:min-h-8"
                  >
                    <span className="text-[13px]" aria-hidden>{folder.icon || "📁"}</span>
                    <span className="truncate">{folder.name}</span>
                  </button>
                )}

                {!isEditing && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <span className="px-1 text-[11px] tabular-nums text-fg-subtle group-hover:hidden">{folderCount > 0 ? folderCount : ""}</span>
                    <button
                      type="button"
                      aria-label={`Folder actions for ${folder.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFolderContextMenu(e, folder.id);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-active hover:text-fg focus-visible:outline-2 focus-visible:outline-accent md:hidden md:group-hover:flex"
                    >
                      <MoreVertical size={13} />
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && hasChildren && <div className="w-full">{renderFolderTree(folder.id, depth + 1)}</div>}
            </div>
          );
        })}

        {creatingInParentId === (parentId || "root") && (
          <div
            style={{ marginLeft: `${(parentId ? depth + 1 : depth) * 12 + 2}px` }}
            className="my-1 flex flex-col gap-1 rounded-md border border-line bg-raised p-2 shadow-soft"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[13px]" aria-hidden>{newFolderIcon}</span>
              <input
                type="text"
                aria-label="New folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => handleNewFolderKeyDown(e, parentId)}
                placeholder="Folder name"
                autoFocus
                className="h-7 w-full min-w-0 rounded border border-line bg-panel px-1.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
              />
              <IconButton label="Create folder" size="sm" variant="primary" onClick={() => handleSaveNewFolder(parentId)}>
                <Check size={12} />
              </IconButton>
              <IconButton label="Cancel new folder" size="sm" onClick={() => setCreatingInParentId(null)}>
                <X size={12} />
              </IconButton>
            </div>
            {emojis(newFolderIcon, setNewFolderIcon)}
            {swatches(newFolderColor, setNewFolderColor)}
          </div>
        )}
      </div>
    );
  };

  const collapsed = isSidebarCollapsed;
  const userName = currentUserEmail ? currentUserEmail.split("@")[0] : "Enterprise Guest";
  const quotaMb = activeWorkspace?.storageQuota
    ? activeWorkspace.storageQuota > 10000
      ? Math.round(activeWorkspace.storageQuota / (1024 * 1024))
      : activeWorkspace.storageQuota
    : 5;

  const sectionHeader = (label: string, open: boolean, toggle: () => void, action?: React.ReactNode) => (
    <div className="flex items-center justify-between px-2 pb-1 pt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1 rounded text-[11px] font-medium text-fg-subtle outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ChevronRight size={11} className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        {label}
      </button>
      {action}
    </div>
  );

  const rowBase =
    "group flex min-h-10 w-full items-center rounded-md px-2 text-[13px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-accent md:min-h-8";

  const profileItems: MenuEntry[] = [
    { id: "settings", label: "Account settings", icon: <Settings size={14} />, onSelect: () => onOpenSettings() },
    { id: "agents", label: "Agent Studio", icon: <Bot size={14} />, onSelect: () => navigate("/org/org-aura-main/agents") },
    { id: "workflows", label: "Workflow Studio", icon: <Workflow size={14} />, onSelect: () => navigate("/org/org-aura-main/workflows") },
    { id: "org", label: "Organization Hub", icon: <Building2 size={14} />, onSelect: () => navigate("/org/org-aura-main") },
    { id: "admin", label: "Admin console", icon: <Shield size={14} />, onSelect: () => navigate("/org/org-aura-main/admin") },
    { id: "network", label: "System diagnostics", icon: <Activity size={14} />, onSelect: () => navigate("/network-status") },
    ...(onSignOut
      ? ([
          "separator",
          { id: "signout", label: "Sign out", icon: <LogOut size={14} />, danger: true, onSelect: () => onSignOut() },
        ] as MenuEntry[])
      : []),
  ];

  const ctxFolder = contextMenuFolderId ? folders.find((f) => f.id === contextMenuFolderId) : null;
  const ctxItem =
    "flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-fg outline-none hover:bg-hover focus-visible:bg-hover";
  const deleteFolder = deleteConfirmFolderId ? folders.find((f) => f.id === deleteConfirmFolderId) : null;

  const radio = (mode: "uncategorize" | "move" | "trash", title: string, hint: string, danger?: boolean) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
        deleteMode === mode ? (danger ? "border-danger bg-danger-soft" : "border-accent bg-accent-soft") : "border-line hover:bg-hover"
      }`}
    >
      <input
        type="radio"
        name="deleteMode"
        checked={deleteMode === mode}
        onChange={() => setDeleteMode(mode)}
        className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-[13px] font-medium ${danger ? "text-danger" : "text-fg"}`}>{title}</span>
        <span className="text-[12px] text-fg-muted">{hint}</span>
        {mode === "move" && deleteMode === "move" && (
          <select
            aria-label="Target folder"
            value={deleteTargetFolderId}
            onChange={(e) => setDeleteTargetFolderId(e.target.value)}
            className="mt-2 h-8 w-full rounded-md border border-line bg-panel px-2 text-[13px] text-fg outline-none focus:border-accent"
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
      </span>
    </label>
  );

  return (
    <motion.div
      id="sidebar-container"
      animate={{ width: collapsed ? 56 : 240 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="relative flex h-full max-w-full shrink-0 select-none flex-col border-r border-line bg-sidebar pt-[env(safe-area-inset-top)] text-fg-muted"
    >
      {/* Brand + collapse */}
      <div className={`flex h-12 shrink-0 items-center px-2.5 ${collapsed ? "justify-center" : "justify-between"}`}>
        {collapsed ? <LogoMark size={22} /> : <Logo size={22} />}
        {!collapsed && (
          <IconButton id="sidebar-collapse-btn" label="Collapse sidebar" size="sm" onClick={() => setIsSidebarCollapsed(true)} className="hidden md:inline-flex">
            <ChevronLeft size={15} />
          </IconButton>
        )}
      </div>
      {collapsed && (
        <div className="flex justify-center pb-1">
          <IconButton id="sidebar-collapse-btn" label="Expand sidebar" size="sm" onClick={() => setIsSidebarCollapsed(false)}>
            <ChevronRight size={15} />
          </IconButton>
        </div>
      )}

      {/* Workspace switcher */}
      <div id="workspace-switcher-section" className="shrink-0 px-2 pb-2">
        <div ref={workspaceMenuRef} className="relative">
          <button
            id="workspace-dropdown-btn"
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isWorkspaceOpen}
            aria-label={`Workspace: ${activeWorkspace?.name ?? "none"}. Switch workspace`}
            onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
            className={`flex min-h-10 w-full items-center gap-2 rounded-md border border-line bg-panel p-1.5 text-left outline-none transition-colors hover:border-line-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent ${
              collapsed ? "justify-center" : "justify-between"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={activeWorkspace?.name || "Workspace"} size={24} />
              {!collapsed && (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-medium leading-tight text-fg">{activeWorkspace?.name}</span>
                  <span className="truncate text-[11px] leading-tight text-fg-subtle">{activeWorkspace?.type}</span>
                </span>
              )}
            </span>
            {!collapsed && <ChevronsUpDown size={13} className="shrink-0 text-fg-subtle" aria-hidden />}
          </button>

          {isWorkspaceOpen && (
            <div
              role="listbox"
              aria-label="Workspaces"
              className={`absolute z-50 mt-1 flex flex-col gap-0.5 rounded-lg border border-line bg-raised p-1 shadow-pop ${
                collapsed ? "left-full top-0 ml-2 w-60" : "left-0 right-0 top-full"
              }`}
            >
              <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-fg-subtle">Switch workspace</div>
              <div className="no-scrollbar flex max-h-60 flex-col gap-0.5 overflow-y-auto">
                {workspaces.map((w) => {
                  const isActive = w.id === activeWorkspaceId;
                  return (
                    <div
                      key={w.id}
                      className={`group/item flex items-center justify-between rounded-md pr-1 ${isActive ? "bg-accent-soft" : "hover:bg-hover"}`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => {
                          setActiveWorkspaceId(w.id);
                          setIsWorkspaceOpen(false);
                          if (onMobileClose) onMobileClose();
                        }}
                        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] text-fg outline-none focus-visible:outline-2 focus-visible:outline-accent md:min-h-8"
                      >
                        <span className="shrink-0" aria-hidden>{w.icon || "🚀"}</span>
                        <span className="truncate">{w.name}</span>
                        {isActive && <Check size={13} className="ml-auto shrink-0 text-accent" aria-hidden />}
                      </button>
                      <div className="flex shrink-0 items-center opacity-100 focus-within:opacity-100 md:opacity-0 md:group-hover/item:opacity-100">
                        <IconButton
                          label={w.isPinned ? `Unpin ${w.name}` : `Pin ${w.name}`}
                          size="sm"
                          onClick={() => onTogglePinWorkspace(w.id)}
                          className={w.isPinned ? "!text-accent" : ""}
                        >
                          <Pin size={12} className={w.isPinned ? "fill-accent" : ""} />
                        </IconButton>
                        <IconButton
                          label={w.isFavorite ? `Unfavorite ${w.name}` : `Favorite ${w.name}`}
                          size="sm"
                          onClick={() => onToggleFavoriteWorkspace(w.id)}
                          className={w.isFavorite ? "!text-warning" : ""}
                        >
                          <Star size={12} className={w.isFavorite ? "fill-warning" : ""} />
                        </IconButton>
                        {workspaces.length > 1 && (
                          <IconButton
                            label={`Delete workspace ${w.name}`}
                            size="sm"
                            className="!text-danger"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete workspace "${w.name}"? All folders and notes inside it will be permanently deleted.`)) {
                                if (onDeleteWorkspace) onDeleteWorkspace(w.id);
                              }
                            }}
                          >
                            <Trash size={12} />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="my-1 h-px bg-line" />

              <button
                type="button"
                onClick={() => {
                  const wsName = prompt("Enter new workspace name:");
                  if (wsName && wsName.trim()) {
                    onCreateWorkspace(wsName.trim(), "Personal", "💼");
                  }
                  setIsWorkspaceOpen(false);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-accent outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent md:min-h-8"
              >
                <Plus size={14} aria-hidden />
                <span>Create workspace</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Primary actions */}
      <div id="quick-actions-section" className="flex shrink-0 flex-col gap-1.5 px-2 pb-2">
        {collapsed ? (
          <IconButton id="new-note-sidebar-btn" label="New note" variant="primary" onClick={onNewNote} className="mx-auto">
            <Plus size={15} />
          </IconButton>
        ) : (
          <Button id="new-note-sidebar-btn" variant="primary" onClick={onNewNote} leadingIcon={<Plus size={14} />} className="w-full !justify-start">
            New note
          </Button>
        )}
        {collapsed ? (
          <IconButton id="cmd-palette-sidebar-btn" label="Search and commands" onClick={onOpenCommandPalette} className="mx-auto">
            <Search size={15} />
          </IconButton>
        ) : (
          <button
            id="cmd-palette-sidebar-btn"
            type="button"
            onClick={onOpenCommandPalette}
            className="flex h-8 w-full items-center justify-between rounded-md border border-line bg-panel px-2.5 text-[13px] text-fg-subtle outline-none transition-colors hover:border-line-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="flex items-center gap-2">
              <Search size={13} aria-hidden />
              Search
            </span>
            <span className="flex items-center gap-0.5">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav id="main-navigation-section" aria-label="Notes navigation" className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
        <div className="flex flex-col gap-px">
          {mainNavItems.map((item) => {
            const isActive = activeFolder === item.id && activeTag === null;
            const isTargetedDrag = dragOverNavId === item.id;
            return (
              <button
                id={`nav-item-${item.id.toLowerCase().replace(" ", "-")}`}
                key={item.id}
                type="button"
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                onClick={() => handleSelectNav(item.id)}
                onDragOver={(e) => handleDragOverNav(e, item.id)}
                onDragLeave={handleDragLeaveNav}
                onDrop={(e) => handleDropOnNav(e, item.id)}
                className={`${rowBase} ${collapsed ? "justify-center" : "justify-between"} ${
                  isActive
                    ? "bg-active font-medium text-fg"
                    : isTargetedDrag
                    ? "bg-accent-soft outline-1 outline-dashed outline-accent"
                    : "text-fg-muted hover:bg-hover hover:text-fg"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <item.icon size={15} className={isActive ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted"} aria-hidden />
                  {!collapsed && <span>{item.label}</span>}
                </span>
                {!collapsed && item.badge !== null && (
                  <span className="text-[11px] tabular-nums text-fg-subtle">{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Folders */}
        {collapsed ? (
          <div className="mt-3 flex flex-col items-center gap-1 border-t border-line pt-3">
            {folders.filter((f) => !f.parentId).map((folder) => {
              const isSelected = activeFolder === folder.id && activeTag === null;
              return (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => handleSelectFolder(folder.id)}
                  title={folder.name}
                  aria-label={`Folder ${folder.name}`}
                  className={`flex h-10 w-10 items-center justify-center rounded-md text-[14px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    isSelected ? "bg-active" : "hover:bg-hover"
                  }`}
                >
                  {folder.icon || "📁"}
                </button>
              );
            })}
          </div>
        ) : (
          <div id="folders-section" onDragOver={handleDragOverHeader} onDrop={handleDropOnHeader}>
            {sectionHeader(
              "Folders",
              foldersOpen,
              () => setFoldersOpen(!foldersOpen),
              <IconButton label="New folder" size="sm" onClick={() => handleTriggerNewFolder(undefined)}>
                <FolderPlus size={13} />
              </IconButton>,
            )}
            {foldersOpen &&
              (folders.length === 0 && creatingInParentId !== "root" ? (
                <p className="px-2 py-1 text-[12px] text-fg-subtle">No folders yet. Create one to organize notes.</p>
              ) : (
                renderFolderTree(undefined)
              ))}
          </div>
        )}

        {/* Smart folders */}
        {!collapsed && smartFolders && onSaveSmartFolder && onDeleteSmartFolder && (
          <SmartFoldersSection
            smartFolders={smartFolders}
            notes={notes}
            folders={folders}
            activeFolder={activeFolder}
            onSelect={handleSelectFolder}
            onSave={onSaveSmartFolder}
            onDelete={onDeleteSmartFolder}
          />
        )}

        {/* Tags */}
        {collapsed ? (
          tags.length > 0 && (
            <div className="mt-3 flex flex-col items-center gap-1 border-t border-line pt-3">
              {tags.map((tag) => {
                const isSelected = activeTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleSelectTag(tag)}
                    title={`Tag: #${tag}`}
                    aria-label={`Tag ${tag}`}
                    aria-pressed={isSelected}
                    className={`flex h-10 w-10 items-center justify-center rounded-md text-[13px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                      isSelected ? "bg-accent-soft text-accent" : "text-fg-subtle hover:bg-hover hover:text-fg"
                    }`}
                  >
                    #
                  </button>
                );
              })}
            </div>
          )
        ) : (
          topTags.length > 0 && (
            <div id="tags-section">
              {sectionHeader("Tags", tagsOpen, () => setTagsOpen(!tagsOpen))}
              {tagsOpen && (
                <div className="flex flex-col gap-px">
                  {topTags.map((tag) => {
                    const isSelected = activeTag === tag;
                    return (
                      <button
                        id={`tag-badge-${tag.toLowerCase()}`}
                        key={tag}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleSelectTag(tag)}
                        className={`${rowBase} gap-2.5 ${
                          isSelected ? "bg-accent-soft font-medium text-accent" : "text-fg-muted hover:bg-hover hover:text-fg"
                        }`}
                      >
                        <Tag size={13} className={isSelected ? "text-accent" : "text-fg-subtle"} aria-hidden />
                        <span className="truncate">{tag}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )
        )}

        {/* Workspace links */}
        {!collapsed && (
          <div className="mb-2">
            {sectionHeader("Workspace", linksOpen, () => setLinksOpen(!linksOpen))}
            {linksOpen && (
              <div className="flex flex-col gap-px">
                {[
                  { to: "/org/org-aura-main", label: "Organization", icon: Building2 },
                  { to: "/org/org-aura-main/agents", label: "Agent Studio", icon: Bot },
                  { to: "/org/org-aura-main/workflows", label: "Workflows", icon: Workflow },
                ].map((l) => (
                  <Link key={l.to} to={l.to} className={`${rowBase} gap-2.5 text-fg-muted hover:bg-hover hover:text-fg`}>
                    <l.icon size={15} className="text-fg-subtle group-hover:text-fg-muted" aria-hidden />
                    <span>{l.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div id="sidebar-footer" className="relative mt-auto shrink-0 border-t border-line p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {!collapsed && (
          <div className="mb-2 flex flex-col gap-1 px-1">
            <div className="flex items-center justify-between text-[11px] text-fg-subtle">
              <span className="flex items-center gap-1">
                <Database size={10} aria-hidden />
                Storage
              </span>
              <span className="tabular-nums">
                {storageUsed}KB / {quotaMb}MB
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Storage used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={parseFloat(storagePercentage)}
              className="h-1 w-full overflow-hidden rounded-full bg-active"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  parseFloat(storagePercentage) > 85 ? "bg-danger" : parseFloat(storagePercentage) > 60 ? "bg-warning" : "bg-accent"
                }`}
                style={{ width: `${storagePercentage}%` }}
              />
            </div>
          </div>
        )}

        <div className="[&>div]:block [&>div]:w-full">
        <Menu
          align="start"
          className={`bottom-full mb-1 mt-0 ${collapsed ? "w-56" : "w-[calc(240px-1rem)]"}`}
          items={profileItems}
          trigger={({ props }) => (
            <button
              id="user-profile-section"
              type="button"
              aria-label={`Account menu for ${userName}`}
              {...props}
              className={`flex min-h-10 items-center gap-2.5 rounded-md p-1.5 text-left outline-none transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent ${
                collapsed ? "justify-center" : "w-full"
              }`}
            >
              <span className="relative shrink-0">
                <Avatar name={userName} size={26} />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar ${isOnline !== false ? "bg-success" : "bg-danger"}`}
                  aria-hidden
                />
              </span>
              {!collapsed && (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium leading-tight text-fg">{userName}</span>
                  <span className="truncate text-[11px] leading-tight text-fg-subtle">{isOnline !== false ? "Connected" : "Offline"}</span>
                </span>
              )}
              {!collapsed && <ChevronsUpDown size={13} className="shrink-0 text-fg-subtle" aria-hidden />}
            </button>
          )}
        />
        </div>
      </div>

      {/* Folder context menu */}
      {ctxFolder && contextMenuPosition && (
        <div
          role="menu"
          aria-label={`Actions for ${ctxFolder.name}`}
          className="fixed z-50 flex min-w-48 flex-col gap-px rounded-lg border border-line bg-raised p-1 shadow-pop"
          style={{ top: `${Math.min(contextMenuPosition.y, window.innerHeight - 190)}px`, left: `${Math.min(contextMenuPosition.x, window.innerWidth - 200)}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            onClick={() => {
              onNewNote();
              setTimeout(() => {
                const event = new CustomEvent("aura-preselect-note-folder", { detail: ctxFolder.id });
                window.dispatchEvent(event);
              }, 100);
              setContextMenuFolderId(null);
            }}
            className={ctxItem}
          >
            <Plus size={14} className="text-fg-muted" aria-hidden />
            <span>New note here</span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              if (contextMenuFolderId) handleTriggerNewFolder(contextMenuFolderId);
              setContextMenuFolderId(null);
            }}
            className={ctxItem}
          >
            <FolderPlus size={14} className="text-fg-muted" aria-hidden />
            <span>Create sub-folder</span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              handleTriggerRename(ctxFolder);
              setContextMenuFolderId(null);
            }}
            className={ctxItem}
          >
            <Edit size={14} className="text-fg-muted" aria-hidden />
            <span>Rename / customize</span>
          </button>
          <div role="separator" className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            onClick={() => {
              if (contextMenuFolderId) handleRequestDeleteFolder(contextMenuFolderId);
              setContextMenuFolderId(null);
            }}
            className={`${ctxItem} !text-danger`}
          >
            <Trash size={14} aria-hidden />
            <span>Delete folder</span>
          </button>
        </div>
      )}

      {/* Safe deletion dialog */}
      <Dialog
        open={!!deleteConfirmFolderId}
        onClose={() => setDeleteConfirmFolderId(null)}
        title="Delete folder"
        description={
          deleteConfirmFolderId
            ? `"${deleteFolder?.name ?? ""}" contains ${getFolderNotesCount(deleteConfirmFolderId)} notes. Choose what happens to them.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteConfirmFolderId(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDeleteFolder}>
              Delete folder
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {radio("uncategorize", "Move to Uncategorized", "Keeps the notes under the default folder.")}
          {radio("move", "Move notes to another folder", "Pick a destination below.")}
          {radio("trash", "Move folder and notes to Trash", "Everything can be recovered from Trash later.", true)}
        </div>
      </Dialog>
    </motion.div>
  );
}
