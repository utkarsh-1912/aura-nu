import React from "react";
import { Archive } from "lucide-react";

export default function ArchiveView() {
  return (
    <div className="flex-grow h-full flex flex-col items-center justify-center p-8 text-center bg-[#FAFAFC] dark:bg-[#09090b] select-none animate-fade-in">
      <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 dark:bg-indigo-500/5 flex items-center justify-center mb-4 text-indigo-500">
        <Archive size={28} />
      </div>
      <h3 className="font-display font-semibold text-slate-800 dark:text-zinc-200 text-base mb-1">
        Archive Room
      </h3>
      <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-xs leading-relaxed">
        Select an archived note to view or restore it back to your workspace.
      </p>
    </div>
  );
}
