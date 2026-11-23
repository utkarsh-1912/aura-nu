import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, FileText, Trash2, Settings as SettingsIcon, Sparkles, Sun, Moon, CornerDownLeft, Layers } from "lucide-react";
import { Kbd, Segmented, EmptyState } from "../ui";
import { Note, Workspace } from "../types";
import type { NoteIndexes } from "../features/indexes/useNoteIndexes";
import { searchNotes } from "../features/search/searchNotes";
import SnippetText from "../features/search/SnippetText";
import type { Snippet } from "../core/search";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNewNote: () => void;
  onDeleteNote: () => void;
  onOpenSettings: () => void;
  onOpenAi: () => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  folders: string[];
  setActiveFolder: (folder: string) => void;
  setActiveNoteId: (id: string | null) => void;
  notes: Note[];
  activeWorkspaceId: string;
  workspaces: Workspace[];
  onSelectWorkspace: (id: string) => void;
  /** When ready, note results come from the SearchIndex (ranked, with highlighted snippets). */
  indexes?: NoteIndexes;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onNewNote,
  onDeleteNote,
  onOpenSettings,
  onOpenAi,
  theme,
  setTheme,
  folders,
  setActiveFolder,
  setActiveNoteId,
  notes,
  activeWorkspaceId,
  workspaces,
  onSelectWorkspace,
  indexes,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"current" | "all">("current");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle outside click close
  const overlayRef = useRef<HTMLDivElement>(null);
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  // Define static system command actions
  const systemCommands = [
    {
      id: "new-note",
      title: "Create New Document",
      subtitle: "Launch a clean blank workspace",
      icon: FileText,
      action: () => {
        onNewNote();
        onClose();
      }
    },
    {
      id: "open-ai",
      title: "Activate Aura AI Panel",
      subtitle: "Summarize, translate or chat with Gemini",
      icon: Sparkles,
      action: () => {
        onOpenAi();
        onClose();
      }
    },
    {
      id: "toggle-theme",
      title: `Switch to ${theme === "light" ? "Dark" : "Light"} Theme`,
      subtitle: "Adjust application color theme",
      icon: theme === "light" ? Moon : Sun,
      action: () => {
        setTheme(theme === "light" ? "dark" : "light");
        onClose();
      }
    },
    {
      id: "open-settings",
      title: "Configure App Preferences",
      subtitle: "Adjust font sizes, account status and shortcuts",
      icon: SettingsIcon,
      action: () => {
        onOpenSettings();
        onClose();
      }
    },
    {
      id: "delete-note",
      title: "Trash Current Note",
      subtitle: "Delete the selected active document",
      icon: Trash2,
      action: () => {
        onDeleteNote();
        onClose();
      }
    },
  ];

  // Convert folders to actions (restricted to current workspace context)
  const folderCommands = folders.map((folder) => ({
    id: `folder-${folder}`,
    title: `Filter Category: ${folder}`,
    subtitle: `Navigate to the ${folder} folder view`,
    icon: Layers,
    action: () => {
      setActiveFolder(folder);
      onClose();
    }
  }));

  // Map notes depending on Search Scope (Current Workspace vs All Workspaces)
  const filteredNotesByScope = notes.filter((note) => {
    if (searchScope === "current") {
      return note.workspaceId === activeWorkspaceId && !note.isArchived && !note.isTrashed;
    }
    // Search all accessible workspaces (exclude archived & trashed to keep it clean)
    return !note.isArchived && !note.isTrashed;
  });

  // Index-backed search covers the active workspace only; "all workspaces" keeps the plain filter.
  const hitResult = useMemo(() => {
    if (!isOpen || !indexes || indexes.status === "building" || searchScope !== "current" || !query.trim()) return null;
    void indexes.version;
    try { return searchNotes(indexes.search, query, { workspaceId: activeWorkspaceId, limit: 30 }); } catch { return null; }
  }, [isOpen, indexes, indexes?.version, indexes?.status, searchScope, query, activeWorkspaceId]);

  const noteCommands = filteredNotesByScope.map((note) => {
    const originWorkspace = workspaces.find((w) => w.id === note.workspaceId);
    const workspaceLabel = originWorkspace ? originWorkspace.name : "Core Workspace";
    return {
      id: `note-${note.id}`,
      noteId: note.id,
      snippet: undefined as Snippet | undefined,
      title: `Open Note: ${note.title}`,
      subtitle: `[${workspaceLabel}] • ${note.folder || "Uncategorized"}`,
      icon: FileText,
      action: () => {
        if (note.workspaceId !== activeWorkspaceId) {
          // Cross-workspace navigation: Switch active workspace first, then open note!
          onSelectWorkspace(note.workspaceId);
          setTimeout(() => {
            setActiveNoteId(note.id);
          }, 300); // Wait for workspace transition to execute nicely
        } else {
          setActiveNoteId(note.id);
        }
        onClose();
      }
    };
  });

  const otherCommands = [...systemCommands, ...folderCommands].map((c) => ({ ...c, noteId: undefined as string | undefined, snippet: undefined as Snippet | undefined }));
  const textFilter = (cmd: { title: string; subtitle: string }) => {
    if (!query) return true;
    const sQuery = query.toLowerCase();
    return cmd.title.toLowerCase().includes(sQuery) || cmd.subtitle.toLowerCase().includes(sQuery);
  };

  let filteredCommands: typeof otherCommands;
  if (hitResult) {
    const byId = new Map(noteCommands.map((c) => [c.noteId, c]));
    const ranked = hitResult.order.flatMap((id) => {
      const c = byId.get(id);
      return c ? [{ ...c, snippet: hitResult.hits.get(id)?.snippet }] : [];
    });
    filteredCommands = [...otherCommands.filter(textFilter), ...ranked];
  } else {
    filteredCommands = [...otherCommands, ...noteCommands].filter(textFilter);
  }

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands]);

  if (!isOpen) return null;

  const groupOf = (id: string) => (id.startsWith("note-") ? "Notes" : id.startsWith("folder-") ? "Folders" : "Commands");

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-start sm:p-4 sm:pt-[12vh]"
    >
      <div
        id="command-palette-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex h-[min(70dvh,480px)] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-line bg-raised pb-[env(safe-area-inset-bottom)] text-fg shadow-pop sm:rounded-xl"
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="text-fg-subtle" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-label="Search notes, folders and commands"
            placeholder="Search notes, folders or commands..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="h-full w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
          <span className="text-[11px] font-medium text-fg-muted">Scope</span>
          <Segmented
            size="sm"
            value={searchScope}
            onChange={(v) => {
              setSearchScope(v);
              setSelectedIndex(0);
            }}
            items={[
              { id: "current", label: "Current workspace" },
              { id: "all", label: "All workspaces" },
            ]}
          />
        </div>

        <div id="command-palette-list" role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, index) => {
              const isSelected = index === selectedIndex;
              const Icon = cmd.icon;
              const group = groupOf(cmd.id);
              const showHeader = index === 0 || groupOf(filteredCommands[index - 1].id) !== group;
              return (
                <React.Fragment key={cmd.id}>
                  {showHeader && (
                    <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-fg-subtle">{group}</div>
                  )}
                  <button
                    role="option"
                    aria-selected={isSelected}
                    ref={(el) => { if (isSelected && el) el.scrollIntoView({ block: "nearest" }); }}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex min-h-10 w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left outline-none transition-colors ${
                      isSelected ? "bg-accent-soft" : "hover:bg-hover"
                    }`}
                  >
                    <Icon size={15} className={isSelected ? "shrink-0 text-accent" : "shrink-0 text-fg-muted"} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-fg">{cmd.title}</span>
                      <span className="block truncate text-[12px] text-fg-muted">{cmd.snippet ? <SnippetText snippet={cmd.snippet} /> : cmd.subtitle}</span>
                    </span>
                    {isSelected && <CornerDownLeft size={13} className="shrink-0 text-fg-subtle" aria-hidden />}
                  </button>
                </React.Fragment>
              );
            })
          ) : (
            <EmptyState
              icon={<Search size={18} />}
              title="No results"
              description={query ? `Nothing matches "${query}". Try another term or widen the scope.` : "No actions or documents found."}
            />
          )}
        </div>

        <div className="hidden shrink-0 items-center justify-between border-t border-line px-4 py-2 text-[11px] text-fg-muted sm:flex">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> Select</span>
          </div>
          <span className="flex items-center gap-1"><Kbd>Esc</Kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
