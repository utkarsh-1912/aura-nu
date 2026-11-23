import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Pin,
  Share2,
  Star,
  ArrowUpDown,
  Plus,
  FileText,
  Trash2,
  Archive,
  FileEdit,
  Globe,
  FolderInput,
  ListChecks,
  RotateCcw,
  Lock,
  X,
} from "lucide-react";
import { Note, Folder } from "../types";
import { Badge, Button, EmptyState, IconButton, Input, Kbd, Menu, Segmented, Skeleton, cn } from "../ui";
import type { NoteIndexes } from "../features/indexes/useNoteIndexes";
import { searchNotes } from "../features/search/searchNotes";
import SnippetText from "../features/search/SnippetText";
import { SMART_PREFIX, type SmartFolder } from "../features/smartFolders/store";
import { evaluateSmartFolder } from "../core/smartFolders";

interface NotesListProps {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  activeFolder: string;
  activeTag: string | null;
  setActiveTag?: (tag: string | null) => void;
  onNewNote: () => void;
  theme: "light" | "dark";
  onBulkMoveNotes?: (noteIds: string[], targetFolderId: string) => void;
  onBulkDeleteNotes?: (noteIds: string[]) => void;
  onBulkArchiveNotes?: (noteIds: string[], archive: boolean) => void;
  onBulkFavoriteNotes?: (noteIds: string[], favorite: boolean) => void;
  onBulkDeletePermanently?: (noteIds: string[]) => void;
  onBulkRestoreNotes?: (noteIds: string[]) => void;
  onEmptyTrash?: () => void;
  width?: number;
  onTogglePinNote?: (id: string) => void;
  onToggleFavoriteNote?: (id: string) => void;
  onDeleteNote?: (id: string) => void;
  /** Optional: show skeleton rows while notes are loading. */
  loading?: boolean;
  /** Search + link indexes (features/indexes). When ready, the search box uses the SearchIndex. */
  indexes?: NoteIndexes;
  /** Smart folders; the active folder id "smart:<id>" selects one. */
  smartFolders?: SmartFolder[];
  activeWorkspaceId?: string;
}

// Strip markdown syntax to generate a plain-text preview excerpt
function getPlainTextExcerpt(markdown: string, maxLength = 110): string {
  if (!markdown) return "No content yet";

  let text = markdown
    .replace(/#+\s+/g, "") // remove headers
    .replace(/\[[x ]\]/g, "") // remove task checkboxes
    .replace(/[-*+]\s+/g, "") // remove list bullets
    .replace(/`{3}[\s\S]*?`{3}/g, "") // remove code blocks
    .replace(/`.*?`/g, "") // remove inline code
    .replace(/[**_~*|]/g, "") // remove bold/italic/table dividers
    .replace(/\[(.*?)\]\(.*?\)/g, "$1") // clean links
    .replace(/\s+/g, " ") // simplify whitespace
    .trim();

  if (text.length > maxLength) {
    return text.substring(0, maxLength) + "...";
  }
  return text || "No content yet";
}

// Format date into human readable, clean format
function formatNoteDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  const isSameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isSameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (isYesterday) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

export default function NotesList({
  notes,
  folders,
  activeNoteId,
  setActiveNoteId,
  activeFolder,
  activeTag,
  setActiveTag,
  onNewNote,
  theme,
  onBulkMoveNotes,
  onBulkDeleteNotes,
  onBulkArchiveNotes,
  onBulkFavoriteNotes,
  onBulkDeletePermanently,
  onBulkRestoreNotes,
  onEmptyTrash,
  width,
  onTogglePinNote,
  onToggleFavoriteNote,
  onDeleteNote,
  loading = false,
  indexes,
  smartFolders,
  activeWorkspaceId,
}: NotesListProps) {
  void theme; // theme is token-driven now; prop kept for API compatibility
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"updatedAt" | "title">("updatedAt");
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const notesListRef = useRef<HTMLDivElement>(null);
  const bulkMoveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (isMoveMenuOpen && bulkMoveMenuRef.current && !bulkMoveMenuRef.current.contains(target)) {
        setIsMoveMenuOpen(false);
      }
      if (
        (selectedNoteIds.length > 0 || isMultiSelectMode) &&
        notesListRef.current &&
        !notesListRef.current.contains(target)
      ) {
        const isPopoverOrModal = document.getElementById("user-profile-popover")?.contains(target) ||
                                 document.getElementById("settings-modal-overlay")?.contains(target) ||
                                 document.getElementById("command-palette-overlay")?.contains(target) ||
                                 document.getElementById("image-upload-modal-overlay")?.contains(target);
        if (!isPopoverOrModal) {
          setSelectedNoteIds([]);
          setIsMultiSelectMode(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMoveMenuOpen, selectedNoteIds, isMultiSelectMode]);

  // Clear selections when active folder or tag changes
  useEffect(() => {
    setSelectedNoteIds([]);
    setLastClickedId(null);
    setIsMultiSelectMode(false);
  }, [activeFolder, activeTag]);

  const folderHeading = useMemo(() => {
    if (!activeFolder) return "All Notes";
    if (["All Notes", "Pinned", "Favorites", "Shared", "Drafts", "Published", "Archive", "Trash"].includes(activeFolder)) {
      return activeFolder;
    }
    if (activeFolder.startsWith(SMART_PREFIX)) {
      return smartFolders?.find((f) => SMART_PREFIX + f.id === activeFolder)?.name ?? "Smart folder";
    }
    const found = folders.find(f => f.id === activeFolder);
    return found ? found.name : activeFolder;
  }, [activeFolder, folders, smartFolders]);

  // Search: use the SearchIndex once it is fully built; until then fall back to the plain substring filter.
  const deferredQuery = React.useDeferredValue(searchQuery);
  const indexReady = !!indexes && indexes.status !== "building";
  const searchResult = useMemo(() => {
    if (!indexReady || !indexes || !deferredQuery.trim()) return null;
    void indexes.version;
    try { return searchNotes(indexes.search, deferredQuery, { workspaceId: activeWorkspaceId, includeTrashed: true }); } catch { return null; }
  }, [indexReady, indexes, indexes?.version, deferredQuery, activeWorkspaceId]);

  const smartIds = useMemo(() => {
    if (!activeFolder.startsWith(SMART_PREFIX)) return null;
    const sf = smartFolders?.find((f) => SMART_PREFIX + f.id === activeFolder);
    if (!sf) return new Set<string>();
    return new Set(evaluateSmartFolder(sf.rule, notes).map((n) => n.id));
  }, [activeFolder, smartFolders, notes]);

  // "/" focuses the notes search (when not typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const el = document.getElementById("notes-search-input") as HTMLInputElement | null;
      if (!el) return;
      e.preventDefault();
      el.focus();
      el.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Step 1: Filter notes by Folder, Tag, and search query
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (activeFolder === "Trash") {
        if (!note.isTrashed) return false;
      } else if (activeFolder === "Archive") {
        if (!note.isArchived || note.isTrashed) return false;
      } else {
        if (note.isTrashed || note.isArchived) return false;

        if (activeFolder === "Pinned") {
          if (!note.isPinned) return false;
        } else if (activeFolder === "Shared") {
          if (!note.isShared) return false;
        } else if (activeFolder === "Favorites") {
          if (!note.isFavorite) return false;
        } else if (activeFolder === "Drafts") {
          const isDraft = note.status === "Draft" || note.tags.includes("Draft");
          if (!isDraft) return false;
        } else if (activeFolder === "Published") {
          const isPublished = note.status === "Published" || note.tags.includes("Published");
          if (!isPublished) return false;
        } else if (smartIds) {
          if (!smartIds.has(note.id)) return false;
        } else if (activeFolder !== "All Notes" && activeFolder !== "Dashboard") {
          if (note.folder !== activeFolder) return false;
        }
      }

      if (activeTag && !note.tags.includes(activeTag)) {
        return false;
      }

      if (searchResult) return searchResult.hits.has(note.id);
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const titleMatch = note.title.toLowerCase().includes(query);
        const contentMatch = note.content.toLowerCase().includes(query);
        const tagMatch = note.tags.some((t) => t.toLowerCase().includes(query));
        return titleMatch || contentMatch || tagMatch;
      }

      return true;
    });
  }, [notes, activeFolder, activeTag, searchQuery, searchResult, smartIds]);

  // Step 2: Sort notes
  const sortedNotes = useMemo(() => {
    if (searchResult) {
      const rank = new Map(searchResult.order.map((id, i) => [id, i]));
      return [...filteredNotes].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }
    return [...filteredNotes].sort((a, b) => {
      if (sortField === "title") {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [filteredNotes, sortField, searchResult]);

  // Step 3: Categorize notes into groups (Pinned first, then by date)
  const groupedNotes = useMemo(() => {
    const pinned: Note[] = [];
    const today: Note[] = [];
    const yesterday: Note[] = [];
    const last7Days: Note[] = [];
    const older: Note[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const sevenDaysAgoStart = todayStart - 86400000 * 7;

    sortedNotes.forEach((note) => {
      const noteTime = new Date(note.updatedAt).getTime();
      if (note.isPinned && activeFolder !== "Trash" && activeFolder !== "Archive") {
        pinned.push(note);
      } else if (noteTime >= todayStart) {
        today.push(note);
      } else if (noteTime >= yesterdayStart) {
        yesterday.push(note);
      } else if (noteTime >= sevenDaysAgoStart) {
        last7Days.push(note);
      } else {
        older.push(note);
      }
    });

    return { pinned, today, yesterday, last7Days, older };
  }, [sortedNotes, activeFolder]);

  // Keyboard shortcut Ctrl/Cmd + A to select all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        const activeElement = document.activeElement;
        if (
          activeElement?.tagName === "INPUT" ||
          activeElement?.tagName === "TEXTAREA" ||
          activeElement?.getAttribute("contenteditable") === "true"
        ) {
          return;
        }
        e.preventDefault();
        setSelectedNoteIds(sortedNotes.map((n) => n.id));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sortedNotes]);

  const handleNoteClick = (e: React.MouseEvent, note: Note) => {
    if (isMultiSelectMode) {
      e.preventDefault();
      setSelectedNoteIds((prev) =>
        prev.includes(note.id)
          ? prev.filter((id) => id !== note.id)
          : [...prev, note.id]
      );
      setLastClickedId(note.id);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedNoteIds((prev) =>
        prev.includes(note.id)
          ? prev.filter((id) => id !== note.id)
          : [...prev, note.id]
      );
      setLastClickedId(note.id);
    } else if (e.shiftKey && lastClickedId) {
      e.preventDefault();
      const lastIndex = sortedNotes.findIndex((n) => n.id === lastClickedId);
      const currentIndex = sortedNotes.findIndex((n) => n.id === note.id);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = sortedNotes.slice(start, end + 1).map((n) => n.id);
        setSelectedNoteIds((prev) => Array.from(new Set([...prev, ...rangeIds])));
      }
      setLastClickedId(note.id);
    } else {
      setSelectedNoteIds([note.id]);
      setLastClickedId(note.id);
      setActiveNoteId(note.id);
    }
  };

  const handleDragStart = (e: React.DragEvent, note: Note) => {
    let notesToDrag = [note.id];
    if (selectedNoteIds.includes(note.id)) {
      notesToDrag = selectedNoteIds;
    } else {
      setSelectedNoteIds([note.id]);
      notesToDrag = [note.id];
    }

    e.dataTransfer.setData("text/plain", JSON.stringify(notesToDrag));
    e.dataTransfer.setData("type", "notes");
    e.dataTransfer.effectAllowed = "move";

    // Custom drag preview showing count of dragged items
    const preview = document.createElement("div");
    preview.className = "fixed pointer-events-none px-3 py-2 bg-accent text-accent-fg rounded-lg text-xs font-medium shadow-pop flex items-center gap-2 z-50";
    preview.textContent = `${notesToDrag.length} ${notesToDrag.length === 1 ? "note" : "notes"}`;
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 0, 0);
    setTimeout(() => document.body.removeChild(preview), 0);
  };

  const multiMode = isMultiSelectMode || selectedNoteIds.length > 1;

  const toggleSelected = (id: string) => {
    setSelectedNoteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setLastClickedId(id);
  };

  const renderNoteCard = (note: Note) => {
    const isActive = note.id === activeNoteId;
    const isSelected = selectedNoteIds.includes(note.id);
    const excerpt = getPlainTextExcerpt(note.content);
    const compact = density === "compact";
    const status = note.isTrashed ? "Trashed" : note.isArchived ? "Archived" : note.status || "";
    const statusTone = note.isTrashed ? "danger" : note.status === "Published" ? "success" : note.status === "In Review" ? "warning" : "neutral";
    const highlighted = isActive || isSelected;

    return (
      <div
        id={`note-card-${note.id}`}
        key={note.id}
        role="option"
        aria-selected={highlighted}
        tabIndex={0}
        onClick={(e) => handleNoteClick(e, note)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedNoteIds([note.id]);
            setLastClickedId(note.id);
            setActiveNoteId(note.id);
          }
        }}
        draggable
        onDragStart={(e) => handleDragStart(e, note)}
        className={cn(
          "group relative mx-1.5 mb-px flex cursor-pointer select-none gap-2 rounded-md px-3 outline-none transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-accent/50",
          compact ? "min-h-10 items-center py-1.5 sm:min-h-8" : "py-2.5",
          highlighted ? "bg-accent-soft" : "hover:bg-hover",
        )}
      >
        {isActive && <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-accent" />}

        {multiMode && (
          <div className="flex items-start pt-0.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelected(note.id)}
              aria-label={`Select ${note.title || "Untitled Note"}`}
              className="h-4 w-4 rounded border-line-strong accent-[var(--c-accent)]"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", isActive ? "text-accent" : "text-fg")}>
              {note.title || "Untitled Note"}
            </h4>
            <span className="flex shrink-0 items-center gap-1.5 text-fg-subtle group-focus-within:hidden group-hover:hidden">
              {note.isPinned && <Pin size={11} aria-label="Pinned" />}
              {note.isFavorite && <Star size={11} aria-label="Favorite" />}
              {note.isShared && <Share2 size={11} aria-label="Shared" />}
              {note.isLocked && <Lock size={11} aria-label="Locked" />}
            </span>
            <span className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
              {onTogglePinNote && (
                <IconButton size="sm" label={note.isPinned ? "Unpin note" : "Pin note"} onClick={(e) => { e.stopPropagation(); onTogglePinNote(note.id); }} className={cn("!h-6 !w-6", note.isPinned && "text-accent")}>
                  <Pin size={12} className={note.isPinned ? "fill-current" : ""} />
                </IconButton>
              )}
              {onToggleFavoriteNote && (
                <IconButton size="sm" label={note.isFavorite ? "Remove from favorites" : "Add to favorites"} onClick={(e) => { e.stopPropagation(); onToggleFavoriteNote(note.id); }} className={cn("!h-6 !w-6", note.isFavorite && "text-accent")}>
                  <Star size={12} className={note.isFavorite ? "fill-current" : ""} />
                </IconButton>
              )}
              {onDeleteNote && (
                <IconButton size="sm" label="Move to trash" onClick={(e) => { e.stopPropagation(); onDeleteNote(note.id); }} className="!h-6 !w-6 hover:!text-danger">
                  <Trash2 size={12} />
                </IconButton>
              )}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{formatNoteDate(note.updatedAt)}</span>
          </div>

          {!compact && (
            <p className={cn("mt-0.5 text-[12px] text-fg-muted", searchResult?.hits.get(note.id) ? "line-clamp-2" : "truncate")}>
              {searchResult?.hits.get(note.id) ? <SnippetText snippet={searchResult.hits.get(note.id)!.snippet} /> : excerpt}
            </p>
          )}

          {!compact && ((status && status !== "Draft") || note.tags.length > 0) && (
            <div className="mt-1.5 flex items-center gap-1 overflow-hidden">
              {status && status !== "Draft" && <Badge tone={statusTone}>{status}</Badge>}
              {note.tags.slice(0, 2).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (setActiveTag) setActiveTag(activeTag === tag ? null : tag);
                  }}
                  className="max-w-[96px] cursor-pointer truncate rounded-full bg-hover px-2 text-[11px] leading-5 text-fg-muted transition-colors hover:bg-active hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  title={`Filter by tag: #${tag}`}
                >
                  #{tag}
                </button>
              ))}
              {note.tags.length > 2 && <span className="text-[11px] text-fg-subtle">+{note.tags.length - 2}</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  const hasNotes = sortedNotes.length > 0;

  const emptyCopy = (() => {
    const q = searchQuery.trim();
    if (q) return { icon: <Search size={18} />, title: "No search results", desc: `Nothing matches "${q}". Try a different word or clear the search.` };
    switch (activeFolder) {
      case "Trash": return { icon: <Trash2 size={18} />, title: "Trash is empty", desc: "Deleted notes land here so you can restore them." };
      case "Archive": return { icon: <FolderInput size={18} />, title: "Archive is empty", desc: "Move older notes here to keep your workspace tidy." };
      case "Favorites": return { icon: <Star size={18} />, title: "No favorites yet", desc: "Star a note to keep it within reach." };
      case "Pinned": return { icon: <Pin size={18} />, title: "Nothing pinned", desc: "Pin important notes to keep them at the top." };
      case "Shared": return { icon: <Share2 size={18} />, title: "No shared notes", desc: "Notes you share with collaborators will show up here." };
      case "Drafts": return { icon: <FileEdit size={18} />, title: "No drafts", desc: "Notes still in progress appear here." };
      case "Published": return { icon: <Globe size={18} />, title: "Nothing published", desc: "Published notes will be listed here." };
      default: return { icon: <FileText size={18} />, title: `No notes in ${folderHeading}`, desc: "Create a note to start writing." };
    }
  })();

  const groups: { key: string; label: string; items: Note[] }[] = searchResult
    ? [{ key: "results", label: `Results (${sortedNotes.length})`, items: sortedNotes }]
    : [
    { key: "pinned", label: "Pinned", items: groupedNotes.pinned },
    { key: "today", label: "Today", items: groupedNotes.today },
    { key: "yesterday", label: "Yesterday", items: groupedNotes.yesterday },
    { key: "last7", label: "Previous 7 days", items: groupedNotes.last7Days },
    { key: "older", label: "Older", items: groupedNotes.older },
  ];

  const bulkBtn = "inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-md border border-line bg-panel text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent cursor-pointer";

  return (
    <div
      ref={notesListRef}
      id="notes-list-column"
      className={`${width ? "" : "w-[360px]"} relative flex h-full max-w-full flex-col border-r border-line bg-sidebar text-fg`}
      style={width ? { width: `${width}px`, minWidth: `${width}px`, flexGrow: 0, flexShrink: 0 } : undefined}
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="min-w-0 truncate text-[14px] font-semibold text-fg">{folderHeading}</h2>
        {!loading && <span className="text-[12px] tabular-nums text-fg-subtle">{sortedNotes.length}</span>}
        {activeTag && (
          <Badge tone="accent" className="gap-1">
            <span>#{activeTag}</span>
            <button
              type="button"
              onClick={() => setActiveTag && setActiveTag(null)}
              className="inline-flex cursor-pointer rounded-sm hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="Clear tag filter"
            >
              <X size={10} />
            </button>
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {activeFolder === "Trash" && hasNotes && onEmptyTrash && (
            <Button
              size="sm"
              variant="ghost"
              className="!text-danger"
              leadingIcon={<Trash2 size={12} />}
              onClick={() => {
                if (confirm("Are you sure you want to permanently delete all notes in the Trash? This action cannot be undone.")) {
                  onEmptyTrash();
                }
              }}
            >
              Empty
            </Button>
          )}
          <IconButton
            id="multi-select-toggle-btn"
            label="Toggle select mode"
            aria-pressed={isMultiSelectMode}
            className={cn(isMultiSelectMode && "!bg-accent-soft !text-accent")}
            onClick={() => {
              const newMode = !isMultiSelectMode;
              setIsMultiSelectMode(newMode);
              if (!newMode) {
                setSelectedNoteIds([]);
              } else if (activeNoteId) {
                setSelectedNoteIds((prev) => (prev.includes(activeNoteId) ? prev : [...prev, activeNoteId]));
              }
            }}
          >
            <ListChecks size={15} />
          </IconButton>
          <Menu
            align="end"
            items={[
              { id: "sort-updated", label: sortField === "updatedAt" ? "Last edited (current)" : "Last edited", onSelect: () => setSortField("updatedAt") },
              { id: "sort-title", label: sortField === "title" ? "Title A-Z (current)" : "Title A-Z", onSelect: () => setSortField("title") },
            ]}
            trigger={({ props }) => (
              <IconButton id="sort-toggle-btn" label="Sort notes" {...props}>
                <ArrowUpDown size={15} />
              </IconButton>
            )}
          />
          <IconButton id="new-note-header-btn" label="New note" variant="subtle" onClick={onNewNote}>
            <Plus size={15} />
          </IconButton>
        </div>
      </div>

      {/* Search + density */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <Input
            id="notes-search-input"
            type="search"
            aria-label="Search notes"
            placeholder="Search notes"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leadingIcon={<Search size={13} />}
            trailing={searchQuery ? undefined : <Kbd>/</Kbd>}
          />
          {indexes?.status === "building" && searchQuery.trim() && (
            <p className="mt-1 text-[11px] text-fg-subtle" role="status">Indexing notes ({indexes.done}/{indexes.total}). Showing basic matches until it finishes.</p>
          )}
        </div>
        <Segmented
          size="sm"
          value={density}
          onChange={(v) => setDensity(v as "comfortable" | "compact")}
          items={[
            { id: "comfortable", label: "Cozy" },
            { id: "compact", label: "Compact" },
          ]}
        />
      </div>

      {/* List */}
      <div
        role="listbox"
        aria-label={`${folderHeading} notes`}
        aria-multiselectable
        className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4", multiMode && selectedNoteIds.length > 0 && "pb-20")}
      >
        {loading ? (
          <div className="flex flex-col gap-1 px-3 py-2" aria-busy="true" aria-label="Loading notes">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5 py-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : !hasNotes ? (
          <EmptyState
            className="h-full"
            icon={emptyCopy.icon}
            title={emptyCopy.title}
            description={emptyCopy.desc}
            action={
              searchQuery ? (
                <Button size="sm" variant="secondary" onClick={() => setSearchQuery("")}>Clear search</Button>
              ) : activeFolder !== "Trash" && activeFolder !== "Archive" ? (
                <Button size="sm" variant="primary" leadingIcon={<Plus size={13} />} onClick={onNewNote}>New note</Button>
              ) : undefined
            }
          />
        ) : (
          groups.filter((g) => g.items.length > 0).map((g) => (
            <div key={g.key} role="group" aria-label={g.label} className="pb-2">
              <div className="sticky top-0 z-10 bg-sidebar px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                {g.label}
              </div>
              {g.items.map(renderNoteCard)}
            </div>
          ))
        )}
      </div>

      {/* Bulk actions */}
      {((isMultiSelectMode && selectedNoteIds.length > 0) || selectedNoteIds.length > 1) && (
        <div className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-line bg-raised p-3 shadow-pop">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-fg">{selectedNoteIds.length} selected</span>
            <button
              type="button"
              onClick={() => setSelectedNoteIds([])}
              className="cursor-pointer text-left text-[12px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Deselect all
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeFolder === "Trash" ? (
              <>
                {onBulkRestoreNotes && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leadingIcon={<RotateCcw size={12} />}
                    onClick={() => {
                      onBulkRestoreNotes(selectedNoteIds);
                      setSelectedNoteIds([]);
                    }}
                  >
                    Restore
                  </Button>
                )}
                {onBulkDeletePermanently && (
                  <Button
                    size="sm"
                    variant="danger"
                    leadingIcon={<Trash2 size={12} />}
                    onClick={() => {
                      if (confirm(`Are you sure you want to permanently delete these ${selectedNoteIds.length} notes? This action cannot be undone.`)) {
                        onBulkDeletePermanently(selectedNoteIds);
                        setSelectedNoteIds([]);
                      }
                    }}
                  >
                    Delete permanently
                  </Button>
                )}
              </>
            ) : (
              <>
                {onBulkFavoriteNotes && (
                  <button type="button" aria-label="Favorite selected" title="Favorite" className={bulkBtn}
                    onClick={() => { onBulkFavoriteNotes(selectedNoteIds, true); setSelectedNoteIds([]); }}>
                    <Star size={14} />
                  </button>
                )}
                {onBulkArchiveNotes && (
                  <button type="button" aria-label="Archive selected" title="Archive" className={bulkBtn}
                    onClick={() => { onBulkArchiveNotes(selectedNoteIds, true); setSelectedNoteIds([]); }}>
                    <Archive size={14} />
                  </button>
                )}
                {onBulkMoveNotes && (
                  <div ref={bulkMoveMenuRef} className="relative">
                    <button type="button" aria-label="Move selected to folder" aria-haspopup="menu" aria-expanded={isMoveMenuOpen} title="Move to folder" className={bulkBtn}
                      onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)}>
                      <FolderInput size={14} />
                    </button>
                    {isMoveMenuOpen && (
                      <div role="menu" className="absolute bottom-12 right-0 z-50 flex max-h-56 w-52 flex-col gap-px overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-pop">
                        <span className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Move to</span>
                        {folders.map((folder) => (
                          <button
                            key={folder.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onBulkMoveNotes(selectedNoteIds, folder.id);
                              setSelectedNoteIds([]);
                              setIsMoveMenuOpen(false);
                            }}
                            className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] text-fg hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            <span className="text-[13px]">{folder.icon || "📁"}</span>
                            <span className="truncate">{folder.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {onBulkDeleteNotes && (
                  <button type="button" aria-label="Move selected to trash" title="Trash" className={cn(bulkBtn, "hover:!text-danger")}
                    onClick={() => { onBulkDeleteNotes(selectedNoteIds); setSelectedNoteIds([]); }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
