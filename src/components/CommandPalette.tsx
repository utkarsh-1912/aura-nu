import React, { useState, useEffect, useRef } from "react";
import { Search, FileText, Pin, Trash2, Settings as SettingsIcon, Sparkles, Sun, Moon, CornerDownLeft, Layers, CheckSquare, Globe } from "lucide-react";
import { Note, Workspace } from "../types";

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

  const noteCommands = filteredNotesByScope.map((note) => {
    const originWorkspace = workspaces.find((w) => w.id === note.workspaceId);
    const workspaceLabel = originWorkspace ? originWorkspace.name : "Core Workspace";
    return {
      id: `note-${note.id}`,
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

  const allCommands = [...systemCommands, ...folderCommands, ...noteCommands];

  // Filter commands by search query
  const filteredCommands = allCommands.filter((cmd) => {
    if (!query) return true;
    const sQuery = query.toLowerCase();
    return cmd.title.toLowerCase().includes(sQuery) || cmd.subtitle.toLowerCase().includes(sQuery);
  });

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

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex justify-center pt-[12vh] p-4 bg-black/60 backdrop-blur-xs select-none"
    >
      <div
        id="command-palette-modal"
        className={`w-full max-w-lg h-[410px] rounded-2xl shadow-2xl flex flex-col border overflow-hidden transition-all duration-200 ${
          theme === "dark"
            ? "bg-[#18181b] border-zinc-800 text-zinc-100"
            : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        {/* Search Input Bar */}
        <div className="relative p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-3 shrink-0">
          <Search size={16} className="text-slate-400 dark:text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search notes, folders or commands across workspaces..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full text-xs border-none outline-none focus:ring-0 bg-transparent text-slate-900 dark:text-zinc-100"
          />
          <span className="text-[10px] opacity-40 uppercase tracking-widest font-mono">
            ⌘K
          </span>
        </div>

        {/* Workspace Scope Selection Bar */}
        <div className={`px-4 py-2 border-b flex justify-between items-center shrink-0 ${
          theme === "dark" ? "bg-zinc-950/40 border-zinc-800" : "bg-slate-50 border-slate-100"
        }`}>
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 font-mono uppercase tracking-wider">
            Search Scope
          </span>
          <div className="flex gap-1.5 bg-slate-200/50 dark:bg-zinc-900 p-0.5 rounded-lg text-[10px] font-semibold">
            <button
              onClick={() => {
                setSearchScope("current");
                setSelectedIndex(0);
              }}
              className={`px-2 py-1 rounded-md cursor-pointer transition-colors ${
                searchScope === "current"
                  ? theme === "dark" ? "bg-zinc-800 text-white" : "bg-white text-slate-900 shadow-xs"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300"
              }`}
            >
              Current Workspace
            </button>
            <button
              onClick={() => {
                setSearchScope("all");
                setSelectedIndex(0);
              }}
              className={`px-2 py-1 rounded-md cursor-pointer transition-colors flex items-center gap-1 ${
                searchScope === "all"
                  ? theme === "dark" ? "bg-zinc-800 text-white" : "bg-white text-slate-900 shadow-xs"
                  : "text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300"
              }`}
            >
              <Globe size={10} className="text-blue-500 animate-pulse" />
              <span>All Workspaces</span>
            </button>
          </div>
        </div>

        {/* Results Stream */}
        <div className="flex-grow overflow-y-auto p-2 flex flex-col gap-0.5 scrollbar-none no-scrollbar">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, index) => {
              const isSelected = index === selectedIndex;
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full text-left p-3 rounded-xl text-xs flex items-center justify-between transition-colors ${
                    isSelected
                      ? theme === "dark"
                        ? "bg-zinc-800 text-white"
                        : "bg-blue-500 text-white shadow-sm"
                      : theme === "dark"
                      ? "text-zinc-400 hover:text-white hover:bg-zinc-900"
                      : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
                  } cursor-pointer`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={14} className={isSelected ? "text-white" : "text-blue-500"} />
                    <div className="flex flex-col">
                      <span className="font-semibold">{cmd.title}</span>
                      <span className={`text-[9.5px] opacity-60 mt-0.5 ${isSelected ? "text-white/85" : ""}`}>
                        {cmd.subtitle}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <CornerDownLeft size={12} className="opacity-60" />
                  )}
                </button>
              );
            })
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-center opacity-40">
              <Search size={20} className="mb-1" />
              <span className="text-xs">No matching actions or documents found</span>
            </div>
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className={`p-3 text-[10px] font-mono border-t flex items-center justify-between shrink-0 ${
          theme === "dark" ? "bg-zinc-950/20 border-zinc-800 text-zinc-500" : "bg-slate-50/50 border-slate-200 text-slate-400"
        }`}>
          <div className="flex gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
          <span>Esc to exit</span>
        </div>
      </div>
    </div>
  );
}
