/**
 * Settings > Import. Pick files or a folder (or drop files), preview what will be created, then import.
 * Parsing happens in this tab (no upload): the importers are pure functions over text/bytes.
 * Large archives are parsed on the main thread one file at a time, yielding between files.
 */
import React, { useCallback, useRef, useState } from "react";
import { FileUp, FolderUp } from "lucide-react";
import { Badge, Button, Segmented, Spinner } from "../../ui";
import type { Folder } from "../../types";
import { importAppleNotesFiles, importEnex, importMarkdownFiles, importNotionZip } from "../../import";
import type { ImportedNote, ImportFile } from "../../import/common";
import { classifyFiles, planImport, type ImportPlan, type ImportSource } from "./plan";

interface Props {
  workspaceId: string;
  folders: Folder[];
  onImport: (plan: ImportPlan) => void;
}

interface Picked { file: File; path: string }
const SOURCES: { id: ImportSource; label: string }[] = [
  { id: "auto", label: "Auto-detect" },
  { id: "markdown", label: "Markdown" },
  { id: "notion", label: "Notion .zip" },
  { id: "evernote", label: "Evernote .enex" },
  { id: "apple", label: "Apple Notes export" },
];
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));
const newId = () => `note-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export default function ImportPanel({ workspaceId, folders, onImport }: Props) {
  const [source, setSource] = useState<ImportSource>("auto");
  const [phase, setPhase] = useState<"idle" | "reading" | "preview" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<{ path: string; reason: string }[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  const reset = () => { setPhase("idle"); setPlan(null); setErrors([]); setSkipped([]); setProgress({ done: 0, total: 0 }); };

  const run = useCallback(async (picked: Picked[], src: ImportSource) => {
    setPhase("reading"); setErrors([]); setPlan(null);
    const byPath = new Map(picked.map((p) => [p.path, p.file]));
    const { groups, skipped: sk } = classifyFiles(picked.map((p) => ({ path: p.path, size: p.file.size })), src);
    setSkipped(sk);
    const total = groups.reduce((n, g) => n + g.paths.length, 0);
    setProgress({ done: 0, total });
    const found: ImportedNote[] = [];
    const errs: string[] = [];
    let done = 0;
    const tick = async () => { setProgress({ done, total }); await yieldToUi(); };

    for (const g of groups) {
      if (g.kind === "markdown" || g.kind === "apple") {
        const files: ImportFile[] = [];
        for (const p of g.paths) {
          const f = byPath.get(p)!;
          try { files.push({ path: p, content: await f.text(), modifiedAt: f.lastModified ? new Date(f.lastModified).toISOString() : undefined }); }
          catch { errs.push(`${p}: could not be read`); }
          done++;
          if (done % 25 === 0) await tick();
        }
        try { found.push(...(g.kind === "markdown" ? importMarkdownFiles(files) : importAppleNotesFiles(files))); }
        catch (e) { errs.push(`${g.kind === "markdown" ? "Markdown" : "Apple Notes"} import failed: ${e instanceof Error ? e.message : String(e)}`); }
      } else {
        for (const p of g.paths) {
          const f = byPath.get(p)!;
          try {
            if (g.kind === "notion") found.push(...importNotionZip(new Uint8Array(await f.arrayBuffer())));
            else found.push(...importEnex(await f.text()));
          } catch (e) { errs.push(`${p}: ${e instanceof Error ? e.message : String(e)}`); }
          done++;
          await tick();
        }
      }
    }
    setErrors(errs);
    setProgress({ done: total, total });
    if (found.length === 0) { setPlan(null); setPhase("preview"); return; }
    setPlan(planImport(found, folders, workspaceId, newId));
    setPhase("preview");
  }, [folders, workspaceId]);

  const onPick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const picked = Array.from(list).map((file) => ({ file, path: ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, "/") }));
    void run(picked, source);
  };

  const confirm = () => {
    if (!plan) return;
    onImport(plan);
    setPhase("done");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-accent-soft px-3 py-2.5 text-[12px] leading-relaxed text-fg">
        <p className="font-medium">What can be imported</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-fg-muted">
          <li>Markdown files or folders (Obsidian-style), including frontmatter and #tags.</li>
          <li>Notion: the .zip from Export &gt; Markdown &amp; CSV.</li>
          <li>Evernote: .enex exports. Attachments and encrypted text are not imported.</li>
          <li><span className="text-fg">Apple Notes: Apple provides no export file.</span> Only HTML, Markdown or plain-text files written by an exporter tool (one file per note) can be imported. Locked notes, scans, drawings, attachments and the Notes database itself are not supported.</li>
        </ul>
      </div>

      {(phase === "idle" || phase === "done") && (
        <>
          <Segmented value={source} onChange={(v) => setSource(v as ImportSource)} size="sm" items={SOURCES} />
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); onPick(e.dataTransfer.files); }}
            className={`flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center ${dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-panel"}`}
          >
            <p className="text-[13px] text-fg">Drop files here, or choose what to import</p>
            <p className="text-[12px] text-fg-muted">To import a whole folder, use “Choose folder” (dropping a folder is not supported).</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" leadingIcon={<FileUp size={14} />} onClick={() => fileInput.current?.click()}>Choose files</Button>
              <Button variant="secondary" leadingIcon={<FolderUp size={14} />} onClick={() => dirInput.current?.click()}>Choose folder</Button>
            </div>
            <input ref={fileInput} type="file" multiple hidden accept=".md,.markdown,.zip,.enex,.html,.htm,.txt" onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
            <input
              ref={(el) => { dirInput.current = el; el?.setAttribute("webkitdirectory", ""); }}
              type="file" hidden multiple onChange={(e) => { onPick(e.target.files); e.target.value = ""; }}
            />
          </div>
          {phase === "done" && <p role="status" className="text-[13px] text-success">Import finished. The notes are in your workspace.</p>}
        </>
      )}

      {phase === "reading" && (
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-6 text-[13px] text-fg">
          <Spinner /> Reading files ({progress.done}/{progress.total})…
        </div>
      )}

      {phase === "preview" && (
        <div className="space-y-3">
          {plan ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{plan.notes.length} note{plan.notes.length === 1 ? "" : "s"}</Badge>
                <Badge>{plan.newFolders.length} new folder{plan.newFolders.length === 1 ? "" : "s"}</Badge>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-line">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-hover text-fg-muted"><tr><th className="px-3 py-2 font-medium">Folder</th><th className="px-3 py-2 text-right font-medium">Notes</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {plan.folderSummary.map((f) => (
                      <tr key={f.path}><td className="px-3 py-1.5 text-fg">{f.path}{f.isNew && <span className="ml-2 text-[11px] text-fg-subtle">new</span>}</td><td className="px-3 py-1.5 text-right tabular-nums text-fg">{f.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-fg">No notes were found in the selected files.</p>
          )}
          {plan && plan.warnings.length > 0 && <MessageList title="Notices" items={plan.warnings} tone="warning" />}
          {skipped.length > 0 && <MessageList title={`${skipped.length} file${skipped.length === 1 ? "" : "s"} skipped`} items={skipped.map((s) => `${s.path}: ${s.reason}`)} tone="warning" />}
          {errors.length > 0 && <MessageList title="Errors" items={errors} tone="danger" />}
          <div className="flex gap-2">
            <Button variant="primary" disabled={!plan} onClick={confirm}>Import {plan ? plan.notes.length : 0} note{plan?.notes.length === 1 ? "" : "s"}</Button>
            <Button variant="secondary" onClick={reset}>Start over</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageList({ title, items, tone }: { title: string; items: string[]; tone: "warning" | "danger" }) {
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`rounded-lg border border-line px-3 py-2 text-[12px] ${tone === "danger" ? "bg-danger-soft" : "bg-warning-soft"}`}>
      <p className="font-medium text-fg">{title}</p>
      <ul className="mt-1 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4 text-fg-muted">{items.slice(0, 100).map((m, i) => <li key={i} className="break-words">{m}</li>)}</ul>
      {items.length > 100 && <p className="mt-1 text-fg-subtle">…and {items.length - 100} more</p>}
    </div>
  );
}
