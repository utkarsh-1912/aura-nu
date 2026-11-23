/**
 * AuraEditor: TipTap v3 rich-text editor with Markdown as the storage format.
 *
 * STATUS: written against TipTap 3.35 APIs but NOT wired into the app and NOT
 * run in a browser/jsdom by the author (no component tests exist). The Markdown
 * conversion it depends on (src/core/markdown.ts) IS unit-tested.
 *
 * - value: Markdown. onChange(markdown) fires (debounced) on user edits only.
 * - [[wikilinks]] / ![[embeds]] are Link marks carrying data-wikilink attrs; clicking
 *   one calls onWikiLinkClick(target, heading) instead of navigating.
 * - Typing `[[query` calls onWikiSuggest({query, from, to, coords}); call
 *   ref.insertWikiLink(range, title) to complete it. onWikiSuggest(null) = dismissed.
 * - Content in/out is sanitised by markdownToHtml / htmlToMarkdown.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { markdownToHtml, htmlToMarkdown } from "../core/markdown";

export interface WikiSuggestState { query: string; from: number; to: number; coords: { left: number; top: number; bottom: number } }

export interface AuraEditorProps {
  value: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  onWikiLinkClick?: (target: string, heading?: string) => void;
  onWikiSuggest?: (state: WikiSuggestState | null) => void;
}
export interface AuraEditorHandle {
  editor: Editor | null;
  insertWikiLink(range: { from: number; to: number }, title: string): void;
  focus(): void;
}

const attr = (key: string, name: string) => ({
  default: null as string | null,
  parseHTML: (el: HTMLElement) => el.getAttribute(name),
  renderHTML: (a: Record<string, unknown>) => (a[key] ? { [name]: String(a[key]) } : {}),
});

/** Link mark that keeps wikilink metadata so it round-trips to [[...]]. */
const WikiLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      dataWikilink: attr("dataWikilink", "data-wikilink"),
      dataEmbed: attr("dataEmbed", "data-embed"),
      dataHeading: attr("dataHeading", "data-heading"),
      dataAlias: attr("dataAlias", "data-alias"),
    };
  },
}).configure({ openOnClick: false, autolink: true, protocols: ["mailto", "tel"] });

export const AuraEditor = forwardRef<AuraEditorHandle, AuraEditorProps>(function AuraEditor(props, ref) {
  const { value, onChange, readOnly = false, placeholder = "Start writing…", debounceMs = 250, className } = props;
  const lastEmitted = useRef<string>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(props);
  cb.current = props;

  const editor = useEditor({
    extensions: [
      // StarterKit v3 already bundles Link; disable it so our WikiLink replaces it.
      StarterKit.configure({ link: false }),
      WikiLink,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
    ],
    content: markdownToHtml(value),
    editable: !readOnly,
    editorProps: {
      attributes: { class: className ?? "aura-editor prose max-w-none focus:outline-none" },
      handleDOMEvents: {
        click: (_view, ev) => {
          const a = (ev.target as HTMLElement | null)?.closest?.("a[data-wikilink]") as HTMLElement | null;
          if (!a) return false;
          ev.preventDefault();
          cb.current.onWikiLinkClick?.(a.getAttribute("data-wikilink") ?? "", a.getAttribute("data-heading") ?? undefined);
          return true;
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const md = htmlToMarkdown(ed.getHTML());
        lastEmitted.current = md;
        cb.current.onChange?.(md);
      }, debounceMs);
    },
    onSelectionUpdate: ({ editor: ed }) => reportSuggest(ed, cb.current.onWikiSuggest),
  });

  // Also check for a [[ trigger after content updates (typing doesn't always move selection events first).
  useEffect(() => {
    if (!editor) return;
    const h = () => reportSuggest(editor, cb.current.onWikiSuggest);
    editor.on("update", h);
    return () => { editor.off("update", h); };
  }, [editor]);

  // External value changes (e.g. switching notes, sync) -> replace content without echoing onChange.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => { editor?.setEditable(!readOnly); }, [readOnly, editor]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useImperativeHandle(ref, () => ({
    editor,
    focus: () => { editor?.commands.focus(); },
    insertWikiLink: (range, title) => {
      editor?.chain().focus().insertContentAt(range, {
        type: "text", text: title,
        marks: [{ type: "link", attrs: { href: "#", dataWikilink: title } }],
      }).insertContent(" ").run();
    },
  }), [editor]);

  return <EditorContent editor={editor} />;
});

function reportSuggest(ed: Editor, fn?: (s: WikiSuggestState | null) => void) {
  if (!fn) return;
  const { from, empty } = ed.state.selection;
  if (!empty) return fn(null);
  const $from = ed.state.doc.resolve(from);
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const m = /\[\[([^\]\n]{0,80})$/.exec(before);
  if (!m) return fn(null);
  try {
    const c = ed.view.coordsAtPos(from);
    fn({ query: m[1], from: from - m[0].length, to: from, coords: { left: c.left, top: c.top, bottom: c.bottom } });
  } catch {
    fn(null);
  }
}

export default AuraEditor;
