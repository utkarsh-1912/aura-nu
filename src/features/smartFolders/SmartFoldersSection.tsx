/** Sidebar section listing smart folders with live counts, plus New / Edit actions. */
import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Sparkles } from "lucide-react";
import { IconButton, cn } from "../../ui";
import { evaluateSmartFolder } from "../../core/smartFolders";
import type { Note, Folder } from "../../types";
import SmartFolderDialog from "./SmartFolderDialog";
import { SMART_PREFIX, type SmartFolder } from "./store";

interface Props {
  smartFolders: SmartFolder[];
  notes: Note[];
  folders: Folder[];
  activeFolder: string;
  onSelect: (folderId: string) => void;
  onSave: (sf: SmartFolder) => void;
  onDelete: (id: string) => void;
}

export default function SmartFoldersSection({ smartFolders, notes, folders, activeFolder, onSelect, onSave, onDelete }: Props) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<SmartFolder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const live = useMemo(() => notes.filter((n) => !n.isTrashed && !n.isArchived), [notes]);
  const counts = useMemo(() => new Map(smartFolders.map((f) => [f.id, evaluateSmartFolder(f.rule, live).length])), [smartFolders, live]);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div id="smart-folders-section" className="mt-3">
      <div className="flex h-7 items-center justify-between px-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex cursor-pointer items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Chevron size={12} aria-hidden /> Smart folders
        </button>
        <IconButton label="New smart folder" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus size={13} />
        </IconButton>
      </div>
      {open && (
        smartFolders.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-fg-subtle">Save a rule (tags, dates, tasks...) as a live folder.</p>
        ) : (
          <div className="flex flex-col gap-px">
            {smartFolders.map((f) => {
              const id = SMART_PREFIX + f.id;
              const on = activeFolder === id;
              return (
                <div key={f.id} className={cn("group flex h-8 items-center rounded-md pr-1 max-md:h-10", on ? "bg-accent-soft" : "hover:bg-hover")}>
                  <button
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => onSelect(id)}
                    className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-accent", on ? "font-medium text-accent" : "text-fg-muted group-hover:text-fg")}
                  >
                    <Sparkles size={13} aria-hidden className={on ? "text-accent" : "text-fg-subtle"} />
                    <span className="truncate">{f.name}</span>
                    <span className="ml-auto text-[11px] tabular-nums text-fg-subtle">{counts.get(f.id) ?? 0}</span>
                  </button>
                  <IconButton label={`Edit ${f.name}`} size="sm" className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100" onClick={() => { setEditing(f); setDialogOpen(true); }}>
                    <Pencil size={12} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        )
      )}
      <SmartFolderDialog
        open={dialogOpen}
        initial={editing}
        folders={folders}
        onClose={() => setDialogOpen(false)}
        onSave={onSave}
        onDelete={onDelete}
      />
    </div>
  );
}
