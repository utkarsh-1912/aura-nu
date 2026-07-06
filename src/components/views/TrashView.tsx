import React from "react";
import { Trash2 } from "lucide-react";

interface TrashViewProps {
  hasNotes: boolean;
  onEmptyTrash: () => void;
}

export default function TrashView({ hasNotes, onEmptyTrash }: TrashViewProps) {
  return (
    <div className="flex-grow h-full flex flex-col items-center justify-center p-8 text-center bg-[#FAFAFC] dark:bg-[#09090b] select-none animate-fade-in">
      <div className="w-16 h-16 rounded-3xl bg-rose-500/10 dark:bg-rose-500/5 flex items-center justify-center mb-4 text-rose-500">
        <Trash2 size={28} />
      </div>
      <h3 className="font-display font-semibold text-slate-800 dark:text-zinc-200 text-base mb-1">
        Trash Bin
      </h3>
      <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-xs leading-relaxed mb-4">
        Select a trashed note from the list to view or restore it. Items in trash are kept until emptied.
      </p>
      {hasNotes && (
        <button
          onClick={onEmptyTrash}
          className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm transition-colors cursor-pointer"
        >
          Empty Trash Bin
        </button>
      )}
    </div>
  );
}
