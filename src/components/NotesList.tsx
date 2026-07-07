import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Pin,
  Share2,
  Star,
  Calendar,
  Clock,
  Filter,
  Plus,
  FileText,
  Trash2,
  Archive,
  FileEdit,
  Globe,
  FolderInput,
  Check,
  CheckSquare,
  Square,
  RotateCcw,
  X
} from "lucide-react";
import { Note, Folder } from "../types";

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
}

// Strip markdown syntax to generate a beautiful plain-text preview excerpt
function getPlainTextExcerpt(markdown: string, maxLength = 75): string {
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
}: NotesListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"updatedAt" | "title">("updatedAt");
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
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
    if (["All Notes", "Pinned", "Favorites", "Shared", "Drafts", "Published", "Archived", "Trash"].includes(activeFolder)) {
      return activeFolder;
    }
    const found = folders.find(f => f.id === activeFolder);
    return found ? found.name : activeFolder;
  }, [activeFolder, folders]);

  // Step 1: Filter notes by Folder, Tag, and search query
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      // 1. Filter by Base Status Constraint
      if (activeFolder === "Trash") {
        if (!note.isTrashed) return false;
      } else if (activeFolder === "Archive") {
        if (!note.isArchived || note.isTrashed) return false;
      } else {
        // Standard views don't show trashed or archived notes
        if (note.isTrashed || note.isArchived) return false;

        // Apply tab specific filters
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
        } else if (activeFolder !== "All Notes" && activeFolder !== "Dashboard") {
          if (note.folder !== activeFolder) return false;
        }
      }

      // Filter by tag if selected
      if (activeTag && !note.tags.includes(activeTag)) {
        return false;
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const titleMatch = note.title.toLowerCase().includes(query);
        const contentMatch = note.content.toLowerCase().includes(query);
        const tagMatch = note.tags.some((t) => t.toLowerCase().includes(query));
        return titleMatch || contentMatch || tagMatch;
      }

      return true;
    });
  }, [notes, activeFolder, activeTag, searchQuery]);

  // Step 2: Sort notes
  const sortedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => {
      if (sortField === "title") {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [filteredNotes, sortField]);

  // Step 3: Categorize notes into Date Groups
  const groupedNotes = useMemo(() => {
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
      if (noteTime >= todayStart) {
        today.push(note);
      } else if (noteTime >= yesterdayStart) {
        yesterday.push(note);
      } else if (noteTime >= sevenDaysAgoStart) {
        last7Days.push(note);
      } else {
        older.push(note);
      }
    });

    return { today, yesterday, last7Days, older };
  }, [sortedNotes]);

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
      // Dragging a note not currently selected should select it
      setSelectedNoteIds([note.id]);
      notesToDrag = [note.id];
    }
    
    e.dataTransfer.setData("text/plain", JSON.stringify(notesToDrag));
    e.dataTransfer.setData("type", "notes");
    e.dataTransfer.effectAllowed = "move";

    // Create custom drag preview showing count of dragged items
    const preview = document.createElement("div");
    preview.className = "fixed pointer-events-none px-3 py-2 bg-blue-600 text-white rounded-xl font-sans text-xs font-semibold shadow-2xl flex items-center gap-2 z-50";
    preview.innerHTML = `📄 ${notesToDrag.length} ${notesToDrag.length === 1 ? 'Note' : 'Notes'}`;
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 0, 0);
    setTimeout(() => document.body.removeChild(preview), 0);
  };

  const renderNoteCard = (note: Note) => {
    const isActive = note.id === activeNoteId;
    const isSelected = selectedNoteIds.includes(note.id);
    const excerpt = getPlainTextExcerpt(note.content);

    return (
      <div
        id={`note-card-${note.id}`}
        key={note.id}
        onClick={(e) => handleNoteClick(e, note)}
        draggable
        onDragStart={(e) => handleDragStart(e, note)}
        className={`py-2.5 px-3 rounded-xl mx-1.5 mb-1.5 cursor-pointer transition-all duration-150 select-none group relative border ${
          isActive
            ? "bg-bg-secondary border-border-primary shadow-xs text-text-primary font-semibold"
            : isSelected
            ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 font-semibold"
            : "bg-transparent border-transparent hover:bg-bg-secondary/80 hover:border-border-primary text-text-secondary hover:text-text-primary"
        }`}
      >
        {/* Checkbox indicator for multi-selection mode */}
        {(isMultiSelectMode || selectedNoteIds.length > 1) && (
          <div
            className="absolute top-3.5 left-2 z-10 p-1 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setSelectedNoteIds((prev) =>
                prev.includes(note.id)
                  ? prev.filter((id) => id !== note.id)
                  : [...prev, note.id]
              );
              setLastClickedId(note.id);
            }}
          >
            {isSelected ? (
              <CheckSquare size={13} className="text-blue-500" />
            ) : (
              <Square size={13} className="text-slate-400 group-hover:text-slate-600 dark:text-zinc-600" />
            )}
          </div>
        )}

        {/* Unread/Pinned Dot */}
        {note.isPinned && !isActive && !(isMultiSelectMode || selectedNoteIds.length > 1) && (
          <div className="absolute top-3 left-2 w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
        )}

        <div className={`flex justify-between items-start gap-2 mb-1 ${(isMultiSelectMode || selectedNoteIds.length > 1) ? "pl-4.5" : ""}`}>
          <h4 className="font-semibold text-[13px] leading-tight line-clamp-1 group-hover:text-blue-500 dark:group-hover:text-indigo-400 transition-colors">
            {note.title || "Untitled Note"}
          </h4>
          <span className="text-[10px] opacity-60 font-mono whitespace-nowrap">
            {formatNoteDate(note.updatedAt)}
          </span>
        </div>

        <p className={`text-[12px] leading-relaxed mb-2 line-clamp-2 ${(isMultiSelectMode || selectedNoteIds.length > 1) ? "pl-4.5" : ""} ${
          isActive
            ? theme === "dark" ? "text-zinc-300" : "text-slate-600"
            : theme === "dark" ? "text-zinc-400" : "text-slate-500"
        }`}>
          {excerpt}
        </p>

        <div className={`flex justify-between items-center gap-2 ${(isMultiSelectMode || selectedNoteIds.length > 1) ? "pl-4.5" : ""}`}>
          {/* Status & Tags */}
          <div className="flex gap-1 items-center overflow-hidden max-w-[75%]">
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-md font-sans font-bold uppercase tracking-wider ${
                note.isTrashed
                  ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                  : note.isArchived
                  ? "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400"
                  : note.status === "Published"
                  ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                  : note.status === "In Review"
                  ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"
              }`}
            >
              {note.isTrashed ? "Trashed" : note.isArchived ? "Archived" : note.status || "Draft"}
            </span>

            {note.tags.slice(0, 1).map((tag) => (
              <button
                key={tag}
                onClick={(e) => {
                  e.stopPropagation(); // Avoid selecting the card
                  if (setActiveTag) {
                    setActiveTag(activeTag === tag ? null : tag);
                  }
                }}
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium whitespace-nowrap cursor-pointer transition-all hover:scale-105 ${
                  isActive
                    ? "bg-blue-100/60 dark:bg-zinc-800 text-blue-600 dark:text-zinc-300 hover:bg-blue-200/60 dark:hover:bg-zinc-700"
                    : "bg-slate-100 dark:bg-zinc-900/60 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
                }`}
                title={`Filter by tag: #${tag}`}
              >
                {tag}
              </button>
            ))}
            {note.tags.length > 1 && (
              <span className="text-[9px] opacity-60 self-center">+{note.tags.length - 1}</span>
            )}
          </div>

          {/* Action buttons (interactive hover menu) */}
          <div className="flex items-center gap-1 group-hover:opacity-100 opacity-0 transition-opacity duration-155 relative z-20">
            {onTogglePinNote && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePinNote(note.id);
                }}
                title={note.isPinned ? "Unpin Note" : "Pin Note"}
                className={`p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${
                  note.isPinned ? "text-amber-500" : "text-slate-400 dark:text-zinc-550 hover:text-slate-700 dark:hover:text-zinc-200"
                }`}
              >
                <Pin size={11} className={note.isPinned ? "fill-amber-500 text-amber-500" : ""} />
              </button>
            )}
            {onToggleFavoriteNote && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavoriteNote(note.id);
                }}
                title={note.isFavorite ? "Unstar Note" : "Star Note"}
                className={`p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${
                  note.isFavorite ? "text-rose-500" : "text-slate-400 dark:text-zinc-550 hover:text-slate-700 dark:hover:text-zinc-200"
                }`}
              >
                <Star size={11} className={note.isFavorite ? "fill-rose-500 text-rose-500" : ""} />
              </button>
            )}
            {onDeleteNote && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNote(note.id);
                }}
                title="Move to Trash"
                className="p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-955/20 text-slate-400 dark:text-zinc-550 hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>

          {/* Static badges indicators (visible when NOT hovered) */}
          <div className="flex items-center gap-1.5 opacity-70 group-hover:hidden">
            {note.isPinned && <Pin size={11} className="text-amber-500 fill-amber-500/20" />}
            {note.isShared && <Share2 size={11} className="text-indigo-500" />}
            {note.isFavorite && <Star size={11} className="text-yellow-500 fill-yellow-500/20" />}
          </div>
        </div>
      </div>
    );
  };

  const hasNotes = sortedNotes.length > 0;

  return (
    <div
      ref={notesListRef}
      id="notes-list-column"
      className={`${width ? "" : "w-[360px]"} h-full flex flex-col border-r border-border-primary transition-colors duration-200 relative bg-bg-primary text-text-primary`}
      style={width ? { width: `${width}px`, minWidth: `${width}px`, flexGrow: 0, flexShrink: 0 } : undefined}
    >
      {/* Top Header & Search */}
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-semibold text-base tracking-tight text-slate-900 dark:text-zinc-100">
              {folderHeading}
            </h2>
            {activeTag && (
              <span className="flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <span>#{activeTag}</span>
                <button
                  onClick={() => setActiveTag && setActiveTag(null)}
                  className="hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer inline-flex items-center justify-center p-0.5 rounded hover:bg-blue-500/20"
                  title="Clear tag filter"
                >
                  <X size={10} />
                </button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {activeFolder === "Trash" && hasNotes && onEmptyTrash && (
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to permanently delete all notes in the Trash? This action cannot be undone.")) {
                    onEmptyTrash();
                  }
                }}
                className="px-2 py-1 rounded-md text-[10px] font-bold bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-transparent hover:bg-rose-200 dark:hover:bg-rose-900/40 transition-all flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={10} />
                <span>Empty Trash</span>
              </button>
            )}
            {/* Multi-select Mode Toggle */}
            <button
              id="multi-select-toggle-btn"
              onClick={() => {
                const newMode = !isMultiSelectMode;
                setIsMultiSelectMode(newMode);
                if (!newMode) {
                  setSelectedNoteIds([]);
                } else if (activeNoteId) {
                  setSelectedNoteIds((prev) =>
                    prev.includes(activeNoteId) ? prev : [...prev, activeNoteId]
                  );
                }
              }}
              title="Toggle Select Mode"
              className={`p-1.5 rounded-md border transition-colors ${
                isMultiSelectMode
                  ? "bg-blue-500 border-blue-500 text-white"
                  : theme === "dark"
                  ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
              } cursor-pointer`}
            >
              <CheckSquare size={13} />
            </button>

            {/* Sort Toggle */}
            <button
              id="sort-toggle-btn"
              onClick={() => setSortField(sortField === "updatedAt" ? "title" : "updatedAt")}
              title="Change Sorting"
              className={`p-1.5 rounded-md border transition-colors ${
                theme === "dark"
                  ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
              } cursor-pointer`}
            >
              <Filter size={13} />
            </button>
            <button
              id="new-note-header-btn"
              onClick={onNewNote}
              title="New Note"
              className={`p-1.5 rounded-md transition-colors ${
                theme === "dark"
                  ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                  : "bg-slate-200/80 hover:bg-slate-300/80 text-slate-800"
              } cursor-pointer`}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            id="notes-search-input"
            type="text"
            placeholder="Search notes, tags, or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full text-xs pl-8 pr-4 py-1.5 rounded-lg border outline-none transition-all ${
              theme === "dark"
                ? "bg-zinc-950 border-zinc-800/80 text-zinc-200 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                : "bg-slate-100/60 border-slate-200/40 text-slate-800 focus:border-blue-400 focus:bg-white focus:ring-1 focus:ring-blue-400"
            }`}
          />
        </div>
      </div>

      {/* Scroller / List items */}
      <div className="flex-grow overflow-y-auto px-1 pb-20">
        {!hasNotes ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-zinc-500 my-auto">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 bg-slate-100 dark:bg-zinc-900 ${
              theme === "dark" ? "text-zinc-400" : "text-slate-500"
            }`}>
              {activeFolder === "Trash" ? <Trash2 size={22} className="text-rose-500" /> :
               activeFolder === "Archive" ? <Archive size={22} className="text-indigo-500" /> :
               activeFolder === "Favorites" ? <Star size={22} className="text-yellow-500" /> :
               activeFolder === "Shared" ? <Share2 size={22} className="text-blue-500" /> :
               activeFolder === "Drafts" ? <FileEdit size={22} className="text-slate-500" /> :
               activeFolder === "Published" ? <Globe size={22} className="text-emerald-500" /> :
               searchQuery ? <Search size={22} /> :
               <FileText size={22} className="text-indigo-500" />}
            </div>
            <h3 className="text-xs font-semibold text-slate-800 dark:text-zinc-100">
              {searchQuery ? "No search results" :
               activeFolder === "Trash" ? "Trash is Empty" :
               activeFolder === "Archive" ? "Archive is Empty" :
               activeFolder === "Favorites" ? "No Favorites" :
               activeFolder === "Shared" ? "No Shared Notes" :
               activeFolder === "Drafts" ? "No Drafts" :
               activeFolder === "Published" ? "No Published Notes" :
               `No notes in ${activeFolder}`}
            </h3>
            <p className="text-[10px] opacity-65 max-w-[200px] mt-1.5 leading-relaxed">
              {searchQuery ? `We couldn't find any documents matching "${searchQuery}".` :
               activeFolder === "Trash" ? "Deleted notes live here. Safely restore them anytime." :
               activeFolder === "Archive" ? "Keep your workspace clean by moving older notes here." :
               activeFolder === "Favorites" ? "Starred and pinned key documents will appear here." :
               activeFolder === "Shared" ? "Documents shared via collaboration links will appear here." :
               activeFolder === "Drafts" ? "Working notes under revision before publication." :
               activeFolder === "Published" ? "All notes published to your public dashboard." :
               `Create your first document inside ${activeFolder} to get started.`}
            </p>
            {!searchQuery && activeFolder !== "Trash" && activeFolder !== "Archive" && (
              <button
                onClick={onNewNote}
                className="mt-3.5 px-3 py-1.5 rounded-xl bg-blue-500 text-white font-medium text-[10px] cursor-pointer hover:bg-blue-600 transition-all flex items-center gap-1 shadow-sm"
              >
                <Plus size={11} />
                <span>Create New Note</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {/* Today */}
            {groupedNotes.today.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-zinc-500 uppercase px-4 py-1.5 flex items-center gap-1.5">
                  <Clock size={10} />
                  <span>Today</span>
                </div>
                {groupedNotes.today.map(renderNoteCard)}
              </div>
            )}

            {/* Yesterday */}
            {groupedNotes.yesterday.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-zinc-500 uppercase px-4 py-1.5 flex items-center gap-1.5">
                  <Calendar size={10} />
                  <span>Yesterday</span>
                </div>
                {groupedNotes.yesterday.map(renderNoteCard)}
              </div>
            )}

            {/* Last 7 Days */}
            {groupedNotes.last7Days.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-zinc-500 uppercase px-4 py-1.5">
                  <span>Last 7 Days</span>
                </div>
                {groupedNotes.last7Days.map(renderNoteCard)}
              </div>
            )}

            {/* Older */}
            {groupedNotes.older.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-zinc-500 uppercase px-4 py-1.5">
                  <span>Older Notes</span>
                </div>
                {groupedNotes.older.map(renderNoteCard)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slide-Up Bulk Actions Panel */}
      {((isMultiSelectMode && selectedNoteIds.length > 0) || selectedNoteIds.length > 1) && (
        <div className={`absolute bottom-0 left-0 right-0 p-4 border-t shadow-2xl flex items-center justify-between z-30 transition-all ${
          theme === "dark" ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-white border-slate-200 text-slate-800"
        }`}>
          <div className="flex flex-col">
            <span className="text-xs font-bold">{selectedNoteIds.length} Selected</span>
            <button
              onClick={() => setSelectedNoteIds([])}
              className="text-[10px] text-blue-500 hover:underline text-left"
            >
              Deselect All
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeFolder === "Trash" ? (
              <>
                {/* Bulk Restore from Trash */}
                {onBulkRestoreNotes && (
                  <button
                    onClick={() => {
                      onBulkRestoreNotes(selectedNoteIds);
                      setSelectedNoteIds([]);
                    }}
                    title="Restore Selected"
                    className={`px-3 py-1.5 rounded-lg border hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1 text-xs font-medium cursor-pointer ${
                      theme === "dark" ? "border-zinc-800 text-zinc-300" : "border-slate-200 text-slate-700"
                    }`}
                  >
                    <RotateCcw size={12} className="text-emerald-500" />
                    <span>Restore</span>
                  </button>
                )}

                {/* Bulk Delete Permanently */}
                {onBulkDeletePermanently && (
                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to permanently delete these ${selectedNoteIds.length} notes? This action cannot be undone.`)) {
                        onBulkDeletePermanently(selectedNoteIds);
                        setSelectedNoteIds([]);
                      }
                    }}
                    title="Delete Permanently"
                    className="px-3 py-1.5 rounded-lg border bg-rose-500 hover:bg-rose-600 text-white flex items-center gap-1 text-xs font-semibold border-transparent cursor-pointer shadow-sm"
                  >
                    <Trash2 size={12} />
                    <span>Delete Permanently</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {/* Bulk Favorite */}
                {onBulkFavoriteNotes && (
                  <button
                    onClick={() => {
                      onBulkFavoriteNotes(selectedNoteIds, true);
                      setSelectedNoteIds([]);
                    }}
                    title="Favorite"
                    className={`p-2 rounded-xl border hover:bg-slate-50 dark:hover:bg-zinc-800 ${
                      theme === "dark" ? "border-zinc-800" : "border-slate-200"
                    } cursor-pointer`}
                  >
                    <Star size={14} className="text-yellow-500" />
                  </button>
                )}

                {/* Bulk Archive */}
                {onBulkArchiveNotes && (
                  <button
                    onClick={() => {
                      onBulkArchiveNotes(selectedNoteIds, true);
                      setSelectedNoteIds([]);
                    }}
                    title="Archive"
                    className={`p-2 rounded-xl border hover:bg-slate-50 dark:hover:bg-zinc-800 ${
                      theme === "dark" ? "border-zinc-800" : "border-slate-200"
                    } cursor-pointer`}
                  >
                    <Archive size={14} className="text-indigo-500" />
                  </button>
                )}

                {/* Bulk Move To Folder */}
                {onBulkMoveNotes && (
                  <div ref={bulkMoveMenuRef} className="relative">
                    <button
                      onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)}
                      title="Move to Folder"
                      className={`p-2 rounded-xl border hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1 ${
                        theme === "dark" ? "border-zinc-800" : "border-slate-200"
                      } cursor-pointer`}
                    >
                      <FolderInput size={14} className="text-blue-500" />
                    </button>

                    {isMoveMenuOpen && (
                      <div className={`absolute bottom-12 right-0 w-48 max-h-48 overflow-y-auto p-1.5 rounded-2xl border shadow-2xl flex flex-col gap-0.5 z-50 ${
                        theme === "dark" ? "bg-zinc-950 border-zinc-800" : "bg-white border-slate-200"
                      }`}>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">Move to:</span>
                        {folders.map((folder) => (
                          <button
                            key={folder.id}
                            onClick={() => {
                              onBulkMoveNotes(selectedNoteIds, folder.id);
                              setSelectedNoteIds([]);
                              setIsMoveMenuOpen(false);
                            }}
                            className={`text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-zinc-900 cursor-pointer ${
                              theme === "dark" ? "text-zinc-300" : "text-slate-700"
                            }`}
                          >
                            <span className="text-xs">{folder.icon || "📁"}</span>
                            <span className="truncate">{folder.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Bulk Delete */}
                {onBulkDeleteNotes && (
                  <button
                    onClick={() => {
                      onBulkDeleteNotes(selectedNoteIds);
                      setSelectedNoteIds([]);
                    }}
                    title="Trash"
                    className={`p-2 rounded-xl border hover:bg-rose-50/50 dark:hover:bg-rose-950/20 border-rose-200 dark:border-rose-900/50 cursor-pointer`}
                  >
                    <Trash2 size={14} className="text-rose-500" />
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
