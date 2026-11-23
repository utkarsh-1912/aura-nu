import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Table as TableIcon,
  Link,
  Image,
  Upload,
  Eye,
  Edit3,
  Columns,
  Sparkles,
  Check,
  X,
  Undo,
  Redo,
  RotateCcw,
  Clock,
  History,
  FileText,
  Info,
  Maximize2,
  Minimize2,
  Paperclip,
  Share2,
  Star,
  MoreVertical,
  Lock,
  Search,
  Pin,
  Unlock,
  Trash2,
  Archive,
  Copy,
  FolderOpen,
  FileDown,
  Printer,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Tag,
  Volume2,
  VolumeX
} from "lucide-react";
import { Note, Workspace, Folder, Settings } from "../types";
import CodeBlockContainer from "./CodeBlockContainer";
import TableContainer from "./TableContainer";
import { Badge, Button, IconButton, Kbd, cn } from "../ui";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import NoteBodyEditor from "../features/editor/NoteBodyEditor";
import BacklinksPanel from "../features/panels/BacklinksPanel";
import { FLAG_TIPTAP_EDITOR, useFlag } from "../features/flags";
import { isEncryptedNote } from "../features/encryption/helpers";
import { EncryptNoteDialog, EncryptedNotePanel } from "../features/encryption/EncryptionUi";
import type { NoteIndexes } from "../features/indexes/useNoteIndexes";

/** Optional wiring supplied by WorkspacePage (indexes, link navigation, phone back button). */
export interface EditorExtras {
  indexes?: NoteIndexes;
  workspaceNotes?: Note[];
  openNote?: (id: string) => void;
  /** Creates a note titled `title` (for unresolved [[links]]) and returns its id. */
  createNoteWithTitle?: (title: string) => string | undefined;
  /** Phones: return to the notes list. */
  onBack?: () => void;
}

interface EditorAreaProps {
  note: Note | null;
  onUpdateNote: (updatedNote: Note) => void;
  onOpenAiAssistant: () => void;
  theme: "light" | "dark";
  isAiPanelOpen: boolean;
  onDeleteNote?: (id: string) => void;
  onDuplicateNote?: (id: string) => void;
  onRestoreNote?: (id: string) => void;
  onDeletePermanently?: (id: string) => void;
  onArchiveNote?: (id: string) => void;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
  onMoveNote?: (id: string, targetWsId: string) => void;
  onCopyNote?: (id: string, targetWsId: string) => void;
  folders?: Folder[];
  isFocusMode: boolean;
  setIsFocusMode: (focus: boolean) => void;
  settings?: Settings;
  extras?: EditorExtras;
}

export default function EditorArea({
  note,
  onUpdateNote,
  onOpenAiAssistant,
  theme,
  isAiPanelOpen,
  onDeleteNote,
  onDuplicateNote,
  onRestoreNote,
  onDeletePermanently,
  onArchiveNote,
  workspaces = [],
  activeWorkspaceId,
  onMoveNote,
  onCopyNote,
  folders = [],
  isFocusMode,
  setIsFocusMode,
  settings,
  extras,
}: EditorAreaProps) {
  const [tiptapOn] = useFlag(FLAG_TIPTAP_EDITOR);
  const [encryptOpen, setEncryptOpen] = useState(false);
  const encrypted = isEncryptedNote(note);
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "split">("split");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuCoords, setSlashMenuCoords] = useState({ top: 0, left: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleToggleSpeak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      if (!note?.content || encrypted) return;
      const cleanText = note.content
        .replace(/[#*_\-\[\]]/g, "")
        .replace(/!\[.*?\]\(.*?\)/g, "")
        .replace(/\[.*?\]\(.*?\)/g, "");

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [note?.id]);
  const [showHistory, setShowHistory] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historySizeFilter, setHistorySizeFilter] = useState<"all" | "large" | "small">("all");

  const filteredHistory = useMemo(() => {
    let list = note?.versionHistory || [];

    if (historySearchQuery.trim()) {
      const q = historySearchQuery.toLowerCase();
      list = list.filter((v) => v?.content?.toLowerCase()?.includes(q));
    }

    if (historySizeFilter === "large") {
      list = list.filter((v) => (v?.content?.length || 0) > 500);
    } else if (historySizeFilter === "small") {
      list = list.filter((v) => (v?.content?.length || 0) <= 500);
    }

    return list;
  }, [note?.versionHistory, historySearchQuery, historySizeFilter]);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [splitPercentage, setSplitPercentage] = useState(50);
  const isDraggingSplit = useRef(false);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const [showCopySubmenu, setShowCopySubmenu] = useState(false);
  const [showFolderSubmenu, setShowFolderSubmenu] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Undo / Redo History stack states
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const lastHistoryPushTime = useRef<number>(0);

  const [localContent, setLocalContent] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSubTab, setMobileSubTab] = useState<"edit" | "preview">("edit");
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const tagContainerRef = useRef<HTMLDivElement>(null);
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [editingBlockContent, setEditingBlockContent] = useState("");
  const [activeStyles, setActiveStyles] = useState({
    bold: false,
    italic: false,
    underline: false,
    code: false,
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const gutterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setIsTagsExpanded(false);
    lastHistoryPushTime.current = 0;
    if (note) {
      setLocalContent(note.content || "");
    } else {
      setLocalContent("");
    }
  }, [note?.id]);

  useEffect(() => {
    if (note && note.content !== localContent) {
      if (settings?.autoSave || localContent === "") {
        setLocalContent(note.content || "");
      }
    }
  }, [note?.content, localContent, settings?.autoSave]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (showMoreMenu && moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
        setShowMoveSubmenu(false);
        setShowCopySubmenu(false);
        setShowFolderSubmenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showMoreMenu]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (showStatusDropdown && statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showStatusDropdown]);

  // States to keep track of per-code-block configurations
  const [codeBlockWordWrap, setCodeBlockWordWrap] = useState<Record<string, boolean>>({});
  const [codeBlockLanguages, setCodeBlockLanguages] = useState<Record<string, string>>({});

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplit.current = true;
    document.body.style.cursor = "col-resize";
    document.body.classList.add("select-none");
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit.current) return;
      const editorContainer = document.getElementById("editor-pane-container");
      if (!editorContainer) return;
      
      const rect = editorContainer.getBoundingClientRect();
      let percentage = ((e.clientX - rect.left) / rect.width) * 105; // Adjust bounds factor
      percentage = ((e.clientX - rect.left) / rect.width) * 100;
      
      if (percentage < 15) percentage = 15;
      if (percentage > 85) percentage = 85;
      
      setSplitPercentage(percentage);
    };

    const handleMouseUp = () => {
      if (isDraggingSplit.current) {
        isDraggingSplit.current = false;
        document.body.style.cursor = "";
        document.body.classList.remove("select-none");
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const scrollRafId = useRef<number | null>(null);

  const handleEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (viewMode !== "split") return;
    if (isSyncingScroll.current) {
      isSyncingScroll.current = false;
      return;
    }
    const editor = e.currentTarget;
    const preview = previewContainerRef.current;
    if (!editor || !preview) return;

    if (scrollRafId.current !== null) {
      cancelAnimationFrame(scrollRafId.current);
    }

    scrollRafId.current = requestAnimationFrame(() => {
      isSyncingScroll.current = true;
      const editorScrollable = editor.scrollHeight - editor.clientHeight;
      if (editorScrollable <= 0) {
        isSyncingScroll.current = false;
        return;
      }
      const scrollPercentage = editor.scrollTop / editorScrollable;
      preview.scrollTop = scrollPercentage * (preview.scrollHeight - preview.clientHeight);
    });
  };

  const handlePreviewScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (viewMode !== "split") return;
    if (isSyncingScroll.current) {
      isSyncingScroll.current = false;
      return;
    }
    const preview = e.currentTarget;
    const editor = textareaRef.current;
    if (!preview || !editor) return;

    if (scrollRafId.current !== null) {
      cancelAnimationFrame(scrollRafId.current);
    }

    scrollRafId.current = requestAnimationFrame(() => {
      isSyncingScroll.current = true;
      const previewScrollable = preview.scrollHeight - preview.clientHeight;
      if (previewScrollable <= 0) {
        isSyncingScroll.current = false;
        return;
      }
      const scrollPercentage = preview.scrollTop / previewScrollable;
      editor.scrollTop = scrollPercentage * (editor.scrollHeight - editor.clientHeight);
    });
  };

  useEffect(() => {
    return () => {
      if (scrollRafId.current !== null) {
        cancelAnimationFrame(scrollRafId.current);
      }
    };
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  const folderName = React.useMemo(() => {
    if (!note?.folder) return "None";
    const found = folders.find(f => f.id === note.folder);
    return found ? found.name : note.folder;
  }, [note?.folder, folders]);

  // Helper to sync updated code block language back into the actual Markdown text
  const handleUpdateCodeBlockLanguage = (blockId: string, lang: string, rawCode: string) => {
    if (!note) return;
    const lines = note.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("```")) {
        const currentBlockId = `code-block-${i}`;
        if (currentBlockId === blockId) {
          lines[i] = "```" + lang;
          const updatedContent = lines.join("\n");
          handleContentChange(updatedContent);
          break;
        }
        // Skip over this code block
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          i++;
        }
      }
    }
  };

  // Keyboard accessibility and rich editor behaviors: Preserve indentation on Enter, Tab/Shift+Tab indents/outdents, and triple backtick expansion
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea || note?.isLocked) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleManualSave();
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    // 1. Tab indents, Shift+Tab outdents
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        // Outdent: remove up to 2 spaces at start of the current line
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const currentLine = value.substring(lineStart, start);
        if (currentLine.startsWith("  ")) {
          const newValue = value.substring(0, lineStart) + currentLine.substring(2) + value.substring(start);
          handleContentChange(newValue);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start - 2, start - 2);
          }, 0);
        } else if (currentLine.startsWith("\t")) {
          const newValue = value.substring(0, lineStart) + currentLine.substring(1) + value.substring(start);
          handleContentChange(newValue);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start - 1, start - 1);
          }, 0);
        }
      } else {
        // Indent: insert 2 spaces
        const newValue = value.substring(0, start) + "  " + value.substring(end);
        handleContentChange(newValue);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + 2, start + 2);
        }, 0);
      }
      return;
    }

    // 2. Preserve indentation on pressing Enter inside a code block
    if (e.key === "Enter") {
      const textBefore = value.substring(0, start);
      const codeBlockCount = (textBefore.match(/```/g) || []).length;
      if (codeBlockCount % 2 === 1) {
        // Inside a code block! Get current line's indentation
        const lineStart = textBefore.lastIndexOf("\n") + 1;
        const currentLine = textBefore.substring(lineStart);
        const indentMatch = currentLine.match(/^(\s*)/);
        const indentation = indentMatch ? indentMatch[1] : "";

        e.preventDefault();
        const insertion = "\n" + indentation;
        const newValue = value.substring(0, start) + insertion + value.substring(end);
        handleContentChange(newValue);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + insertion.length, start + insertion.length);
        }, 0);
        return;
      }
    }

    // 3. Triple backticks auto-expansion
    if (e.key === "`") {
      const textBefore = value.substring(0, start);
      if (textBefore.endsWith("``")) {
        e.preventDefault();
        const finalValue = value.substring(0, start) + "`javascript\n\n```";
        handleContentChange(finalValue);
        setTimeout(() => {
          textarea.focus();
          // Place cursor after "`javascript\n"
          const cursorPosition = start + 12;
          textarea.setSelectionRange(cursorPosition, cursorPosition);
        }, 0);
        return;
      }
    }
  };

  const handleToggleLock = () => {
    if (!note) return;
    onUpdateNote({
      ...note,
      isLocked: !note.isLocked,
    });
    setShowMoreMenu(false);
  };

  const handleToggleFavorite = () => {
    if (!note) return;
    onUpdateNote({
      ...note,
      isFavorite: !note.isFavorite,
    });
    setShowMoreMenu(false);
  };

  const handleTogglePin = () => {
    if (!note) return;
    onUpdateNote({
      ...note,
      isPinned: !note.isPinned,
    });
    setShowMoreMenu(false);
  };

  const handleUpdateStatus = (status: "Draft" | "In Review" | "Published") => {
    if (!note) return;
    onUpdateNote({
      ...note,
      status,
      updatedAt: new Date().toISOString()
    });
  };

  const handleExport = (format: "markdown" | "html" | "json") => {
    if (!note) return;
    let content = "";
    let mimeType = "text/plain";
    let fileExtension = "txt";

    if (format === "markdown") {
      content = `# ${note.title}\n\n${note.content}`;
      mimeType = "text/markdown";
      fileExtension = "md";
    } else if (format === "html") {
      content = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${note.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 2rem; max-width: 800px; margin: 0 auto; color: #1e293b; background: #fafafa; }
    h1 { font-size: 2.2rem; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.8rem; margin-bottom: 1.5rem; }
    pre { background: #f1f5f9; padding: 1.2rem; border-radius: 0.5rem; overflow-x: auto; border: 1px solid #e2e8f0; }
    code { font-family: "JetBrains Mono", monospace; font-size: 0.9em; color: #0f172a; }
    blockquote { border-left: 4px solid #3b82f6; padding-left: 1rem; margin-left: 0; color: #475569; font-style: italic; }
    .meta { font-size: 0.85rem; color: #64748b; margin-bottom: 2rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>${note.title}</h1>
  <div class="meta">Created on ${new Date(note.createdAt).toLocaleDateString()} • Words: ${note.wordCount}</div>
  <div>${note.content.replace(/\n/g, "<br/>")}</div>
</body>
</html>
      `;
      mimeType = "text/html";
      fileExtension = "html";
    } else if (format === "json") {
      content = JSON.stringify(note, null, 2);
      mimeType = "application/json";
      fileExtension = "json";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${note.title.toLowerCase().replace(/\s+/g, "-") || "note"}.${fileExtension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowMoreMenu(false);
  };

  const handleShare = () => {
    if (!note) return;
    const shareLink = `${window.location.origin}/share/note/${note.id}`;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
    onUpdateNote({
      ...note,
      isShared: true
    });
    setShowMoreMenu(false);
  };

  const handlePrint = () => {
    setShowMoreMenu(false);
    window.print();
  };

  // Sync state & save note changes
  useEffect(() => {
    if (!note || isEncryptedNote(note)) return;
    // Calculate word count & reading time
    const words = note.content ? note.content.trim().split(/\s+/).filter(Boolean).length : 0;
    const readTime = Math.max(1, Math.ceil(words / 200));

    if (words !== note.wordCount || readTime !== note.readingTime) {
      onUpdateNote({
        ...note,
        wordCount: words,
        readingTime: readTime,
      });
    }
  }, [note?.content]);

  // Simulated auto-save trigger on edit
  const handleContentChange = (content: string, skipHistoryGrouping = false) => {
    if (!note) return;

    // History tracking for undo/redo
    const now = Date.now();
    const isWordBoundary = content.endsWith(" ") || content.endsWith("\n");
    const timeElapsed = now - lastHistoryPushTime.current;

    if (note.content !== content) {
      if (skipHistoryGrouping || isWordBoundary || timeElapsed > 1500 || undoStack.length === 0) {
        setUndoStack((prev) => {
          if (prev[prev.length - 1] === note.content) return prev;
          const next = [...prev, note.content];
          if (next.length > 50) next.shift();
          return next;
        });
        setRedoStack([]);
        lastHistoryPushTime.current = now;
      }
    }

    setIsSaving(true);
    
    // Auto-save debounce imitation
    const timer = setTimeout(() => {
      setIsSaving(false);
    }, 1000);

    // Track version history in local record (up to 5 versions)
    const currentHistory = note.versionHistory || [];
    const lastVersion = currentHistory[0];
    let updatedHistory = [...currentHistory];

    // Only create a new version history entry if content changed significantly
    if (!lastVersion || Math.abs(lastVersion.content.length - content.length) > 25) {
      updatedHistory = [
        { timestamp: new Date().toISOString(), content: note.content },
        ...currentHistory.slice(0, 4),
      ];
    }

    onUpdateNote({
      ...note,
      content,
      versionHistory: updatedHistory,
      updatedAt: new Date().toISOString(),
    });

    return () => clearTimeout(timer);
  };

  const handleManualSave = () => {
    if (!note) return;
    handleContentChange(localContent);
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || note.isLocked) return;
    const previous = undoStack[undoStack.length - 1];
    const remaining = undoStack.slice(0, -1);
    setUndoStack(remaining);
    setRedoStack((prev) => [...prev, note.content]);
    
    setIsSaving(true);
    onUpdateNote({
      ...note,
      content: previous,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || note.isLocked) return;
    const next = redoStack[redoStack.length - 1];
    const remaining = redoStack.slice(0, -1);
    setRedoStack(remaining);
    setUndoStack((prev) => [...prev, note.content]);
    
    setIsSaving(true);
    onUpdateNote({
      ...note,
      content: next,
      updatedAt: new Date().toISOString(),
    });
  };

  // Keyboard Undo/Redo shortcuts listener
  useEffect(() => {
    const handleUndoRedoShortcuts = (e: KeyboardEvent) => {
      if (!note || note.isLocked || viewMode === "preview") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleUndoRedoShortcuts);
    return () => {
      window.removeEventListener("keydown", handleUndoRedoShortcuts);
    };
  }, [undoStack, redoStack, note?.content, note?.isLocked, viewMode]);

  // Keyboard shortcut support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!note) return;
      // Focus mode toggle Alt + F
      if (e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsFocusMode(!isFocusMode);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [note, isFocusMode, setIsFocusMode]);

  if (!note) {
    return (
      <div id="editor-empty-state" className="flex-grow h-full flex flex-col items-center justify-center p-8 bg-surface text-fg">
        <div className="max-w-md text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-lg bg-panel flex items-center justify-center mb-6 shadow-soft border border-line">
            <FileText size={32} className="text-fg-subtle" />
          </div>
          <h3 className="font-semibold text-lg text-fg mb-2">
            No Note Active
          </h3>
          <p className="text-sm text-fg-muted mb-6">
            Select an existing document from the notes list or launch a clean new workspace to start writing.
          </p>
        </div>
      </div>
    );
  }

  // Formatting Actions (Unified Live Document Editor + Textarea compatible)
  const insertMarkdown = (syntaxBefore: string, syntaxAfter = "") => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;

      const selectedText = text.substring(start, end);
      const replacement = syntaxBefore + selectedText + syntaxAfter;

      const newContent = text.substring(0, start) + replacement + text.substring(end);
      handleContentChange(newContent);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + syntaxBefore.length, start + syntaxBefore.length + selectedText.length);
      }, 50);
      return;
    }

    // Unified block editor handling
    const currentLines = (note.content || "").split("\n");
    const targetIdx = editingBlockIndex !== null && editingBlockIndex < currentLines.length
      ? editingBlockIndex
      : currentLines.length - 1;

    // Multi-line block insertions (table, code block, image, file attachment)
    if (syntaxBefore.includes("\n") || syntaxAfter.includes("\n")) {
      const blockText = `${syntaxBefore}${syntaxAfter}`.trim();
      const newLines = blockText.split("\n");
      currentLines.splice(targetIdx + 1, 0, ...newLines);
      const joined = currentLines.join("\n");
      setLocalContent(joined);
      handleContentChange(joined);
      setEditingBlockIndex(null);
      return;
    }

    // Prefix toggles (# , ## , - , 1. , - [ ] )
    if (!syntaxAfter && ["# ", "## ", "- ", "1. ", "- [ ] "].includes(syntaxBefore)) {
      const existingLine = currentLines[targetIdx] || "";
      const stripped = existingLine
        .replace(/^(#{1,3}\s+|- \[[ xX]\]\s+|- |\* |\d+\.\s+|>\s+)/, "");
      const updatedLine = existingLine.startsWith(syntaxBefore)
        ? stripped
        : `${syntaxBefore}${stripped || "New item"}`;
      currentLines[targetIdx] = updatedLine;
      const joined = currentLines.join("\n");
      setLocalContent(joined);
      handleContentChange(joined);
      setEditingBlockIndex(targetIdx);
      setEditingBlockContent(updatedLine);
      return;
    }

    // Inline insertions (e.g. Link)
    const existingLine = currentLines[targetIdx] || "";
    const updatedLine = `${existingLine}${existingLine ? " " : ""}${syntaxBefore}link${syntaxAfter}`;
    currentLines[targetIdx] = updatedLine;
    const joined = currentLines.join("\n");
    setLocalContent(joined);
    handleContentChange(joined);
    setEditingBlockIndex(targetIdx);
    setEditingBlockContent(updatedLine);
  };

  const checkSelectionStyles = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const hasBoldWrap = 
      (start >= 2 && end <= text.length - 2 && text.substring(start - 2, start) === "**" && text.substring(end, end + 2) === "**") ||
      (text.substring(start, end).startsWith("**") && text.substring(start, end).endsWith("**") && (end - start) >= 4);

    const hasUnderlineWrap = 
      (start >= 2 && end <= text.length - 2 && text.substring(start - 2, start) === "__" && text.substring(end, end + 2) === "__") ||
      (text.substring(start, end).startsWith("__") && text.substring(start, end).endsWith("__") && (end - start) >= 4);

    const hasItalicWrap = 
      (start >= 1 && end <= text.length - 1 && text.substring(start - 1, start) === "*" && text.substring(end, end + 1) === "*") ||
      (start >= 1 && end <= text.length - 1 && text.substring(start - 1, start) === "_" && text.substring(end, end + 1) === "_") ||
      (text.substring(start, end).startsWith("*") && text.substring(start, end).endsWith("*") && (end - start) >= 2) ||
      (text.substring(start, end).startsWith("_") && text.substring(start, end).endsWith("_") && (end - start) >= 2);

    const hasCodeWrap = 
      (start >= 1 && end <= text.length - 1 && text.substring(start - 1, start) === "`" && text.substring(end, end + 1) === "`") ||
      (text.substring(start, end).startsWith("`") && text.substring(start, end).endsWith("`") && (end - start) >= 2);

    setActiveStyles({
      bold: hasBoldWrap,
      underline: hasUnderlineWrap,
      italic: hasItalicWrap && !hasBoldWrap && !hasUnderlineWrap,
      code: hasCodeWrap,
    });
  };

  const toggleFormat = (type: "bold" | "italic" | "underline" | "code") => {
    let syntaxBefore = "";
    let syntaxAfter = "";
    if (type === "bold") { syntaxBefore = "**"; syntaxAfter = "**"; }
    else if (type === "italic") { syntaxBefore = "*"; syntaxAfter = "*"; }
    else if (type === "underline") { syntaxBefore = "__"; syntaxAfter = "__"; }
    else if (type === "code") { syntaxBefore = "`"; syntaxAfter = "`"; }

    const textarea = textareaRef.current;
    if (!textarea) {
      // Unified block editor inline formatting
      const currentLines = (note.content || "").split("\n");
      const targetIdx = editingBlockIndex !== null && editingBlockIndex < currentLines.length
        ? editingBlockIndex
        : currentLines.length - 1;
      const line = currentLines[targetIdx] || "";
      const prefixMatch = line.match(/^(#{1,3}\s+|- \[[ xX]\]\s+|- |\* |\d+\.\s+|>\s+)/);
      const prefix = prefixMatch ? prefixMatch[0] : "";
      const body = line.slice(prefix.length);
      const isWrapped = body.startsWith(syntaxBefore) && body.endsWith(syntaxAfter) && body.length >= syntaxBefore.length + syntaxAfter.length;
      const nextBody = isWrapped
        ? body.slice(syntaxBefore.length, body.length - syntaxAfter.length)
        : `${syntaxBefore}${body || "text"}${syntaxAfter}`;
      const updatedLine = `${prefix}${nextBody}`;
      currentLines[targetIdx] = updatedLine;
      const joined = currentLines.join("\n");
      setLocalContent(joined);
      handleContentChange(joined);
      setEditingBlockIndex(targetIdx);
      setEditingBlockContent(updatedLine);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const selectedText = text.substring(start, end);

    const lenB = syntaxBefore.length;
    const lenA = syntaxAfter.length;

    const isInsideWrap = start >= lenB && end <= text.length - lenA && 
                         text.substring(start - lenB, start) === syntaxBefore && 
                         text.substring(end, end + lenA) === syntaxAfter;

    const isWrappedSelf = selectedText.startsWith(syntaxBefore) && selectedText.endsWith(syntaxAfter) && selectedText.length >= (lenB + lenA);

    let newContent = "";
    let newStart = start;
    let newEnd = end;

    if (isInsideWrap) {
      const unwrapped = selectedText;
      newContent = text.substring(0, start - lenB) + unwrapped + text.substring(end + lenA);
      newStart = start - lenB;
      newEnd = end - lenB;
    } else if (isWrappedSelf) {
      const unwrapped = selectedText.substring(lenB, selectedText.length - lenA);
      newContent = text.substring(0, start) + unwrapped + text.substring(end);
      newStart = start;
      newEnd = end - lenB - lenA;
    } else {
      const wrapped = syntaxBefore + selectedText + syntaxAfter;
      newContent = text.substring(0, start) + wrapped + text.substring(end);
      newStart = start + lenB;
      newEnd = end + lenB;
    }

    handleContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newStart, newEnd);
      checkSelectionStyles();
    }, 50);
  };

  // Slash commands triggers
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const selectionStart = e.target.selectionStart;
    const lastChar = value.substring(selectionStart - 1, selectionStart);

    if (lastChar === "/") {
      // Find coordinates for floating slash commands
      const caretCoords = getCaretCoordinates(e.target);
      setSlashMenuCoords({
        top: Math.min(caretCoords.top + 24, 400),
        left: Math.min(caretCoords.left, 250),
      });
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }

    setLocalContent(value);
    if (settings?.autoSave !== false) {
      handleContentChange(value);
    }
  };

  const handleTextareaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Helper to approximate caret coordinates
  const getCaretCoordinates = (textarea: HTMLTextAreaElement) => {
    const { selectionStart } = textarea;
    const textLines = textarea.value.substring(0, selectionStart).split("\n");
    const currentLineNumber = textLines.length;
    const currentLineText = textLines[textLines.length - 1];

    const lineHeight = 22; // px approximate
    const charWidth = 8; // px approximate

    return {
      top: currentLineNumber * lineHeight,
      left: currentLineText.length * charWidth + 24,
    };
  };

  const handleInsertSlashCommand = (command: string) => {
    let insertedLines: string[] = [""];
    switch (command) {
      case "h1":
        insertedLines = ["# Heading 1"];
        break;
      case "h2":
        insertedLines = ["## Heading 2"];
        break;
      case "todo":
        insertedLines = ["- [ ] Task item"];
        break;
      case "bullet":
        insertedLines = ["- Bullet point"];
        break;
      case "code":
        insertedLines = ["```typescript", "// Write your code here", "```"];
        break;
      case "table":
        insertedLines = ["| Header 1 | Header 2 |", "|---|---|", "| Value 1 | Value 2 |"];
        break;
      case "quote":
        insertedLines = ["> Elegant quote segment here"];
        break;
    }

    const currentLines = (note.content || "").split("\n");
    const targetIdx = editingBlockIndex !== null && editingBlockIndex < currentLines.length
      ? editingBlockIndex
      : currentLines.length - 1;

    const cleanedLine = (currentLines[targetIdx] || "").replace(/\/$/, "").trim();
    if (cleanedLine) {
      currentLines[targetIdx] = cleanedLine;
      currentLines.splice(targetIdx + 1, 0, ...insertedLines);
    } else {
      currentLines.splice(targetIdx, 1, ...insertedLines);
    }

    const newContent = currentLines.join("\n");
    setLocalContent(newContent);
    handleContentChange(newContent);
    setShowSlashMenu(false);

    if (insertedLines.length === 1) {
      const nextIdx = cleanedLine ? targetIdx + 1 : targetIdx;
      setEditingBlockIndex(nextIdx);
      setEditingBlockContent(insertedLines[0]);
    } else {
      setEditingBlockIndex(null);
    }
  };

  // Interactive Checklist toggle inside preview pane!
  const toggleChecklistItem = (lineIndex: number) => {
    const lines = note.content.split("\n");
    const line = lines[lineIndex];

    let updatedLine = line;
    if (line.includes("- [ ]")) {
      updatedLine = line.replace("- [ ]", "- [x]");
    } else if (line.includes("- [x]")) {
      updatedLine = line.replace("- [x]", "- [ ]");
    }

    lines[lineIndex] = updatedLine;
    handleContentChange(lines.join("\n"));
  };

  // Drag and Drop simulated file handler
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    // Handle files simulation
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const fileName = file.name;
      const fileIcon = file.type.startsWith("image/") ? "🖼️" : "📎";
      
      insertMarkdown(`\n${fileIcon} **Uploaded File**: [${fileName}](#file-attachment)\n`);
    }
  };

  const handleFileUploadMock = () => {
    const mockFileNames = ["Q3_Budget_Sheet.xlsx", "Aura_System_Architecture.png", "Meeting_Agenda.pdf"];
    const randomFile = mockFileNames[Math.floor(Math.random() * mockFileNames.length)];
    const fileIcon = randomFile.endsWith(".png") ? "🖼️" : "📎";

    insertMarkdown(`\n${fileIcon} **Uploaded File**: [${randomFile}](#file-attachment)\n`);
  };

  // Rollback to historical version
  const handleRestoreVersion = (oldContent: string) => {
    handleContentChange(oldContent);
    setShowHistory(false);
  };

  // Render inline formatting: code (`), bold (** or __), italic (* or _), and links ([text](url))
  const renderInlineMarkdown = (text: string, keyPrefix = "inline"): React.ReactNode[] => {
    if (!text) return [];

    const patterns = [
      {
        type: "code",
        regex: /`([\s\S]+?)`/,
      },
      {
        type: "link",
        regex: /\[([\s\S]+?)\]\(([\s\S]+?)\)/,
      },
      {
        type: "bold_italic_stars",
        regex: /\*\*\*([\s\S]+?)\*\*\*/,
      },
      {
        type: "bold_italic_mixed1",
        regex: /\*\*\_([\s\S]+?)\_\*\*/,
      },
      {
        type: "bold_italic_mixed2",
        regex: /_\*\*([\s\S]+?)\*\_\_/,
      },
      {
        type: "bold_stars",
        regex: /\*\*([\s\S]+?)\*\*/,
      },
      {
        type: "underline_underscores",
        regex: /__([\s\S]+?)__/,
      },
      {
        type: "italic_stars",
        regex: /\*([\s\S]+?)\*/,
      },
      {
        type: "italic_underscores",
        regex: /_([\s\S]+?)_/,
      },
    ];

    // Find the earliest match
    let earliestMatch: any = null;
    let earliestIndex = Infinity;
    let selectedPattern: any = null;

    for (const p of patterns) {
      const match = p.regex.exec(text);
      if (match && match.index < earliestIndex) {
        earliestIndex = match.index;
        earliestMatch = match;
        selectedPattern = p;
      }
    }

    // If no patterns match, return the plain text as a single node
    if (!earliestMatch) {
      if (findQuery && text.toLowerCase().includes(findQuery.toLowerCase())) {
        const parts: React.ReactNode[] = [];
        const regex = new RegExp(`(${findQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, "gi");
        const matches = text.split(regex);
        matches.forEach((p, idx) => {
          if (p.toLowerCase() === findQuery.toLowerCase()) {
            parts.push(<mark key={`${keyPrefix}-find-${idx}`} className="bg-warning text-fg rounded px-0.5 font-semibold">{p}</mark>);
          } else {
            parts.push(<span key={`${keyPrefix}-text-${idx}`}>{p}</span>);
          }
        });
        return parts;
      }
      return [<span key={keyPrefix}>{text}</span>];
    }

    const parts: React.ReactNode[] = [];

    // 1. Add plain text before the match
    if (earliestIndex > 0) {
      parts.push(
        <span key={`${keyPrefix}-before`}>
          {text.substring(0, earliestIndex)}
        </span>
      );
    }

    // 2. Process the match
    const matchLength = earliestMatch[0].length;
    const matchContent = earliestMatch[1];
    const remainingText = text.substring(earliestIndex + matchLength);
    const currentKey = `${keyPrefix}-${earliestIndex}`;

    if (selectedPattern.type === "code") {
      parts.push(
        <code
          key={currentKey}
          className={`font-mono text-xs px-1.5 py-0.5 mx-0.5 rounded-md select-text ${
            theme === "dark"
              ? "bg-hover text-warning border border-line"
              : "bg-hover text-warning border border-line"
          }`}
        >
          {matchContent}
        </code>
      );
    } else if (selectedPattern.type === "link") {
      const linkUrl = earliestMatch[2];
      parts.push(
        <a
          key={currentKey}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline inline-flex items-center gap-0.5 font-medium cursor-pointer"
        >
          {renderInlineMarkdown(matchContent, `${currentKey}-link-label`)}
          <ExternalLink size={10} className="inline-block" />
        </a>
      );
    } else if (selectedPattern.type === "bold_italic_stars" || selectedPattern.type === "bold_italic_mixed1" || selectedPattern.type === "bold_italic_mixed2") {
      parts.push(
        <strong key={currentKey} className="font-bold text-fg">
          <em className="italic text-fg">
            {renderInlineMarkdown(matchContent, `${currentKey}-bold-italic`)}
          </em>
        </strong>
      );
    } else if (selectedPattern.type === "bold_stars") {
      parts.push(
        <strong key={currentKey} className="font-bold text-fg">
          {renderInlineMarkdown(matchContent, `${currentKey}-bold`)}
        </strong>
      );
    } else if (selectedPattern.type === "underline_underscores") {
      parts.push(
        <u key={currentKey} className="underline">
          {renderInlineMarkdown(matchContent, `${currentKey}-underline`)}
        </u>
      );
    } else if (selectedPattern.type === "italic_stars" || selectedPattern.type === "italic_underscores") {
      parts.push(
        <em key={currentKey} className="italic text-fg">
          {renderInlineMarkdown(matchContent, `${currentKey}-italic`)}
        </em>
      );
    }

    // 3. Add remaining text recursively
    if (remainingText) {
      parts.push(...renderInlineMarkdown(remainingText, `${keyPrefix}-after`));
    }

    return parts;
  };

  // Unified Live Block Editor helpers (merges Markdown & Rich Text into a single surface)
  const handleUnifiedBlockChange = (newVal: string, currentIdx: number, currentLines: string[]) => {
    setEditingBlockContent(newVal);
    if (newVal.endsWith("/")) {
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }
    const updatedLines = [...currentLines];
    updatedLines[currentIdx] = newVal;
    const joined = updatedLines.join("\n");
    setLocalContent(joined);
    handleContentChange(joined, true);
  };

  const handleUnifiedBlockKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    currentIdx: number,
    currentLines: string[]
  ) => {
    if (e.key === "Escape") {
      setShowSlashMenu(false);
      setEditingBlockIndex(null);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setShowSlashMenu(false);
      const line = editingBlockContent;

      // If pressing Enter on an empty list/quote prefix, convert to plain line
      if (/^(- \[[ xX]\]\s*|- |\* |\d+\.\s*|>\s*)$/.test(line.trim() + " ")) {
        const updatedLines = [...currentLines];
        updatedLines[currentIdx] = "";
        const joined = updatedLines.join("\n");
        setLocalContent(joined);
        handleContentChange(joined, true);
        setEditingBlockContent("");
        return;
      }

      // Carry over list prefixes automatically on new line
      let nextLinePrefix = "";
      if (line.startsWith("- [ ] ") || line.startsWith("- [x] ") || line.startsWith("- [X] ")) {
        nextLinePrefix = "- [ ] ";
      } else if (line.startsWith("- ")) {
        nextLinePrefix = "- ";
      } else if (line.startsWith("* ")) {
        nextLinePrefix = "* ";
      } else {
        const numMatch = line.match(/^(\d+)\.\s+/);
        if (numMatch) {
          nextLinePrefix = `${parseInt(numMatch[1], 10) + 1}. `;
        }
      }

      const updatedLines = [...currentLines];
      updatedLines.splice(currentIdx + 1, 0, nextLinePrefix);
      const joined = updatedLines.join("\n");
      setLocalContent(joined);
      handleContentChange(joined, true);
      setEditingBlockIndex(currentIdx + 1);
      setEditingBlockContent(nextLinePrefix);
      return;
    }

    if (e.key === "Backspace" && editingBlockContent === "" && currentLines.length > 1) {
      e.preventDefault();
      setShowSlashMenu(false);
      const updatedLines = [...currentLines];
      updatedLines.splice(currentIdx, 1);
      const prevIdx = Math.max(0, currentIdx - 1);
      const joined = updatedLines.join("\n");
      setLocalContent(joined);
      handleContentChange(joined, true);
      setEditingBlockIndex(prevIdx);
      setEditingBlockContent(updatedLines[prevIdx] || "");
      return;
    }

    if (e.key === "ArrowUp" && currentIdx > 0) {
      const target = e.currentTarget;
      if (target.selectionStart === 0) {
        e.preventDefault();
        setEditingBlockIndex(currentIdx - 1);
        setEditingBlockContent(currentLines[currentIdx - 1] || "");
      }
      return;
    }

    if (e.key === "ArrowDown" && currentIdx < currentLines.length - 1) {
      const target = e.currentTarget;
      if (target.selectionStart === target.value.length) {
        e.preventDefault();
        setEditingBlockIndex(currentIdx + 1);
        setEditingBlockContent(currentLines[currentIdx + 1] || "");
      }
      return;
    }
  };

  // Render unified live document in the client (merges Markdown and formatted rich text in one view)
  const renderRichPreview = () => {
    const lines = (note.content || "").split("\n");
    const renderedElements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 1. CODE BLOCK RENDERING
      if (line.startsWith("```")) {
        const langPart = line.substring(3).trim();
        const blockId = `code-block-${i}`;
        
        // Language lookup (local overrides or defaults)
        const currentLang = codeBlockLanguages[blockId] || langPart || "javascript";
        
        // Capture multi-line blocks
        const codeLines: string[] = [];
        i++; // skip opening backticks
        while (i < lines.length && !lines[i].startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        
        const rawCode = codeLines.join("\n");
        if (i < lines.length && lines[i].startsWith("```")) {
          i++; // skip closing backticks
        }

        renderedElements.push(
          <CodeBlockContainer
            key={blockId}
            blockId={blockId}
            code={rawCode}
            defaultLanguage={currentLang}
            theme={theme}
            wordWrap={!!codeBlockWordWrap[blockId]}
            toggleWordWrap={() => setCodeBlockWordWrap(prev => ({ ...prev, [blockId]: !prev[blockId] }))}
            setLanguage={(lang) => {
              setCodeBlockLanguages(prev => ({ ...prev, [blockId]: lang }));
              handleUpdateCodeBlockLanguage(blockId, lang, rawCode);
            }}
          />
        );
        continue;
      }

      // 2. RESPONSIVE DATA TABLES
      if (line.startsWith("|")) {
        const tableLines: string[] = [];
        const tableStartIndex = i;
        while (i < lines.length && lines[i].startsWith("|")) {
          tableLines.push(lines[i]);
          i++;
        }
        renderedElements.push(
          <TableContainer
            key={`table-${i}`}
            rows={tableLines}
            theme={theme}
            isLocked={note.isLocked}
            onUpdateTable={(newTableLines) => {
              const updatedLines = [...lines];
              updatedLines.splice(tableStartIndex, tableLines.length, ...newTableLines);
              handleContentChange(updatedLines.join("\n"), true);
            }}
          />
        );
        continue;
      }

      // 3. INTERACTIVE CHECKLIST ITEMS
      const isUnchecked = line.startsWith("- [ ] ");
      const isChecked = line.startsWith("- [x] ") || line.startsWith("- [X] ");
      if (isUnchecked || isChecked) {
        const labelText = line.replace("- [ ] ", "").replace("- [x] ", "").replace("- [X] ", "");
        const currentIdx = i;
        if (editingBlockIndex === currentIdx && !note.isLocked) {
          renderedElements.push(
            <div key={`edit-checklist-${currentIdx}`} className="flex items-center gap-2.5 my-2 select-none animate-fade-in w-full">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggleChecklistItem(currentIdx);
                }}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                  isChecked
                    ? "bg-accent border-accent/40 text-accent-fg"
                    : "border-line hover:border-accent/40"
                } cursor-pointer`}
              >
                {isChecked && <Check size={11} className="stroke-[3]" />}
              </button>
              <input
                type="text"
                value={editingBlockContent}
                onChange={(e) => handleUnifiedBlockChange(e.target.value, currentIdx, lines)}
                onBlur={() => setEditingBlockIndex(null)}
                onKeyDown={(e) => handleUnifiedBlockKeyDown(e, currentIdx, lines)}
                autoFocus
                className="w-full bg-accent-soft rounded-lg px-2 py-0.5 border border-accent/40 outline-none text-[14px] text-fg"
              />
            </div>
          );
        } else {
          renderedElements.push(
            <div
              key={`checklist-${i}`}
              onClick={() => {
                if (!note.isLocked) {
                  setEditingBlockIndex(currentIdx);
                  setEditingBlockContent(line);
                }
              }}
              className={`flex items-center gap-2.5 my-2 select-none animate-fade-in rounded-lg px-1.5 py-0.5 hover:bg-hover transition-colors ${!note.isLocked ? "cursor-text" : ""}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleChecklistItem(currentIdx);
                }}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                  isChecked
                    ? "bg-accent border-accent/40 text-accent-fg"
                    : "border-line hover:border-accent/40"
                } cursor-pointer`}
              >
                {isChecked && <Check size={11} className="stroke-[3]" />}
              </button>
              <span className={`text-[14px] ${isChecked ? "line-through text-fg-subtle" : "text-fg"}`}>
                {renderInlineMarkdown(labelText)}
              </span>
            </div>
          );
        }
        i++;
        continue;
      }

      // 4. UNORDERED LISTS
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const currentIdx = i;
        if (editingBlockIndex === currentIdx && !note.isLocked) {
          renderedElements.push(
            <div key={`edit-bullet-${currentIdx}`} className="pl-2 my-1 w-full animate-fade-in">
              <input
                type="text"
                value={editingBlockContent}
                onChange={(e) => handleUnifiedBlockChange(e.target.value, currentIdx, lines)}
                onBlur={() => setEditingBlockIndex(null)}
                onKeyDown={(e) => handleUnifiedBlockKeyDown(e, currentIdx, lines)}
                autoFocus
                className="w-full bg-accent-soft rounded-lg px-2 py-0.5 border border-accent/40 outline-none text-sm text-fg"
              />
            </div>
          );
        } else {
          renderedElements.push(
            <li
              key={`bullet-${i}`}
              onClick={() => {
                if (!note.isLocked) {
                  setEditingBlockIndex(currentIdx);
                  setEditingBlockContent(line);
                }
              }}
              className={`text-sm list-disc list-inside text-fg my-1 px-2 py-0.5 rounded-lg hover:bg-hover transition-colors ${!note.isLocked ? "cursor-text" : ""}`}
            >
              {renderInlineMarkdown(line.substring(2))}
            </li>
          );
        }
        i++;
        continue;
      }

      // 5. ORDERED LISTS
      const matchNumbered = line.match(/^(\d+)\.\s(.*)/);
      if (matchNumbered) {
        const currentIdx = i;
        if (editingBlockIndex === currentIdx && !note.isLocked) {
          renderedElements.push(
            <div key={`edit-numbered-${currentIdx}`} className="pl-2 my-1 w-full animate-fade-in">
              <input
                type="text"
                value={editingBlockContent}
                onChange={(e) => handleUnifiedBlockChange(e.target.value, currentIdx, lines)}
                onBlur={() => setEditingBlockIndex(null)}
                onKeyDown={(e) => handleUnifiedBlockKeyDown(e, currentIdx, lines)}
                autoFocus
                className="w-full bg-accent-soft rounded-lg px-2 py-0.5 border border-accent/40 outline-none text-sm text-fg"
              />
            </div>
          );
        } else {
          renderedElements.push(
            <li
              key={`numbered-${i}`}
              onClick={() => {
                if (!note.isLocked) {
                  setEditingBlockIndex(currentIdx);
                  setEditingBlockContent(line);
                }
              }}
              className={`text-sm list-decimal list-inside text-fg my-1 px-2 py-0.5 rounded-lg hover:bg-hover transition-colors ${!note.isLocked ? "cursor-text" : ""}`}
            >
              {renderInlineMarkdown(matchNumbered[2])}
            </li>
          );
        }
        i++;
        continue;
      }

      // 6. HEADINGS
      if (line.startsWith("# ")) {
        const currentIdx = i;
        if (editingBlockIndex === currentIdx && !note.isLocked) {
          renderedElements.push(
            <div key={`edit-h1-${currentIdx}`} className="mb-4 mt-6 w-full animate-fade-in">
              <input
                type="text"
                value={editingBlockContent}
                onChange={(e) => handleUnifiedBlockChange(e.target.value, currentIdx, lines)}
                onBlur={() => setEditingBlockIndex(null)}
                onKeyDown={(e) => handleUnifiedBlockKeyDown(e, currentIdx, lines)}
                autoFocus
                className="w-full bg-accent-soft rounded-lg px-2 py-1 border border-accent/40 outline-none text-2xl font-bold tracking-tight text-fg"
              />
            </div>
          );
        } else {
          renderedElements.push(
            <h1
              key={`h1-${i}`}
              onClick={() => {
                if (!note.isLocked) {
                  setEditingBlockIndex(currentIdx);
                  setEditingBlockContent(line);
                }
              }}
              className={`text-2xl font-bold tracking-tight mb-4 mt-6 text-fg flex items-center gap-2 rounded-lg px-1.5 py-0.5 hover:bg-hover transition-colors ${!note.isLocked ? "cursor-text" : ""}`}
            >
              {renderInlineMarkdown(line.replace("# ", ""))}
            </h1>
          );
        }
        i++;
        continue;
      }
      if (line.startsWith("## ")) {
        const currentIdx = i;
        if (editingBlockIndex === currentIdx && !note.isLocked) {
          renderedElements.push(
            <div key={`edit-h2-${currentIdx}`} className="mb-3 mt-5 w-full animate-fade-in">
              <input
                type="text"
                value={editingBlockContent}
                onChange={(e) => handleUnifiedBlockChange(e.target.value, currentIdx, lines)}
                onBlur={() => setEditingBlockIndex(null)}
                onKeyDown={(e) => handleUnifiedBlockKeyDown(e, currentIdx, lines)}
                autoFocus
                className="w-full bg-accent-soft rounded-lg px-2 py-1 border border-accent/40 outline-none text-xl font-semibold tracking-tight text-fg"
              />
            </div>
          );
        } else {
          renderedElements.push(
            <h2
              key={`h2-${i}`}
              onClick={() => {
                if (!note.isLocked) {
                  setEditingBlockIndex(currentIdx);
                  setEditingBlockContent(line);
                }
              }}
              className={`text-xl font-semibold tracking-tight mb-3 mt-5 text-fg flex items-center gap-2 rounded-lg px-1.5 py-0.5 hover:bg-hover transition-colors ${!note.isLocked ? "cursor-text" : ""}`}
            >
              {renderInlineMarkdown(line.replace("## ", ""))}
            </h2>
          );
        }
        i++;
        continue;
      }
      if (line.startsWith("### ")) {
        const currentIdx = i;
        if (editingBlockIndex === currentIdx && !note.isLocked) {
          renderedElements.push(
            <div key={`edit-h3-${currentIdx}`} className="mb-2 mt-4 w-full animate-fade-in">
              <input
                type="text"
                value={editingBlockContent}
                onChange={(e) => handleUnifiedBlockChange(e.target.value, currentIdx, lines)}
                onBlur={() => setEditingBlockIndex(null)}
                onKeyDown={(e) => handleUnifiedBlockKeyDown(e, currentIdx, lines)}
                autoFocus
                className="w-full bg-accent-soft rounded-lg px-2 py-0.5 border border-accent/40 outline-none text-lg font-medium text-fg"
              />
            </div>
          );
        } else {
          renderedElements.push(
            <h3
              key={`h3-${i}`}
              onClick={() => {
                if (!note.isLocked) {
                  setEditingBlockIndex(currentIdx);
                  setEditingBlockContent(line);
                }
              }}
              className={`text-lg font-medium mb-2 mt-4 text-fg flex items-center gap-2 rounded-lg px-1.5 py-0.5 hover:bg-hover transition-colors ${!note.isLocked ? "cursor-text" : ""}`}
            >
              {renderInlineMarkdown(line.replace("### ", ""))}
            </h3>
          );
        }
        i++;
        continue;
      }

      // 7. BLOCKQUOTES
      if (line.startsWith("> ")) {
        const currentIdx = i;
        if (editingBlockIndex === currentIdx && !note.isLocked) {
          renderedElements.push(
            <div key={`edit-quote-${currentIdx}`} className="my-3 pl-4 border-l-4 border-accent/40 w-full animate-fade-in">
              <input
                type="text"
                value={editingBlockContent}
                onChange={(e) => handleUnifiedBlockChange(e.target.value, currentIdx, lines)}
                onBlur={() => setEditingBlockIndex(null)}
                onKeyDown={(e) => handleUnifiedBlockKeyDown(e, currentIdx, lines)}
                autoFocus
                className="w-full bg-accent-soft rounded-lg px-2 py-0.5 border border-accent/40 outline-none text-sm text-fg-muted"
              />
            </div>
          );
        } else {
          renderedElements.push(
            <blockquote
              key={`quote-${i}`}
              onClick={() => {
                if (!note.isLocked) {
                  setEditingBlockIndex(currentIdx);
                  setEditingBlockContent(line);
                }
              }}
              className={`border-l-4 border-accent/40 pl-4 py-1 italic my-3 text-fg-muted rounded-r-lg hover:bg-hover transition-colors ${!note.isLocked ? "cursor-text" : ""}`}
            >
              {renderInlineMarkdown(line.substring(2))}
            </blockquote>
          );
        }
        i++;
        continue;
      }

      // 8. TEXT AND PARAGRAPHS (including clickable empty lines)
      const currentIdx = i;
      if (editingBlockIndex === currentIdx && !note.isLocked) {
        renderedElements.push(
          <div key={`edit-p-${currentIdx}`} className="my-1.5 w-full animate-fade-in">
            <input
              type="text"
              value={editingBlockContent}
              onChange={(e) => handleUnifiedBlockChange(e.target.value, currentIdx, lines)}
              onBlur={() => setEditingBlockIndex(null)}
              onKeyDown={(e) => handleUnifiedBlockKeyDown(e, currentIdx, lines)}
              placeholder="Write something, or type '/' for commands & blocks..."
              autoFocus
              className="w-full bg-accent-soft rounded-lg px-2 py-1 border border-accent/40 outline-none text-[14.5px] text-fg placeholder:text-fg-subtle"
            />
          </div>
        );
      } else if (line.trim() === "") {
        renderedElements.push(
          <div
            key={`empty-${i}`}
            onClick={() => {
              if (!note.isLocked) {
                setEditingBlockIndex(currentIdx);
                setEditingBlockContent("");
              }
            }}
            className={`h-6 my-0.5 rounded-lg hover:bg-hover transition-colors flex items-center px-2 ${!note.isLocked ? "cursor-text" : ""}`}
          >
            {lines.length === 1 && !note.isLocked && (
              <span className="text-sm text-fg-subtle italic select-none">
                Click here to start writing, or type &apos;/&apos; for blocks...
              </span>
            )}
          </div>
        );
      } else {
        renderedElements.push(
          <p
            key={`p-${i}`}
            onClick={() => {
              if (!note.isLocked) {
                setEditingBlockIndex(currentIdx);
                setEditingBlockContent(line);
              }
            }}
            className={`text-[14.5px] text-fg my-1.5 leading-relaxed rounded-lg px-1.5 py-0.5 hover:bg-hover transition-colors ${!note.isLocked ? "cursor-text" : ""}`}
          >
            {renderInlineMarkdown(line)}
          </p>
        );
      }
      i++;
    }

    return (
      <div
        className="markdown-body px-4 py-6 sm:px-6 md:py-10 min-h-full max-w-[720px] w-full mx-auto flex flex-col"
        onClick={(e) => {
          // If clicking in the bottom empty space of the canvas, append/focus last line
          if (e.target === e.currentTarget && !note.isLocked) {
            const lastIdx = lines.length - 1;
            if (lines[lastIdx]?.trim() === "") {
              setEditingBlockIndex(lastIdx);
              setEditingBlockContent("");
            } else {
              const updatedLines = [...lines, ""];
              const joined = updatedLines.join("\n");
              setLocalContent(joined);
              handleContentChange(joined, true);
              setEditingBlockIndex(updatedLines.length - 1);
              setEditingBlockContent("");
            }
          }
        }}
      >
        {renderedElements}
      </div>
    );
  };

  const fontSizeClass =
    settings?.fontSize === "sm" ? "text-sm" :
    settings?.fontSize === "lg" ? "text-lg" :
    settings?.fontSize === "xl" ? "text-xl" :
    "text-[14.5px]"; // default base

  const lineWrappingClass = 
    settings?.lineWrapping === false ? "whitespace-pre overflow-x-auto" : "whitespace-pre-wrap break-words";



  const lines = localContent.split("\n");

  return (
    <div
      id="editor-pane-container"
      className="flex-grow h-full min-w-0 flex flex-col relative select-text w-full bg-surface text-fg"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-accent-soft border-2 border-dashed border-accent pointer-events-none">
          <div className="p-3 rounded-full bg-panel shadow-pop border border-line text-accent mb-3">
            <Paperclip size={24} />
          </div>
          <p className="font-semibold text-[14px] text-fg">Drop file to embed in note</p>
          <p className="text-[12px] text-fg-muted mt-1">Images, spreadsheets and documents</p>
        </div>
      )}

      {/* Top Header Controls Bar */}
      {!isFocusMode && (
        <div className="flex flex-col flex-shrink-0 select-none border-b border-line bg-surface">
          {/* Action bar (48px) */}
          <div className="flex h-12 w-full min-w-0 flex-nowrap items-center justify-between gap-2 px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2 text-[12px] text-fg-muted">
              {extras?.onBack && (
                <IconButton label="Back to notes" className="md:hidden max-md:!h-10 max-md:!w-10" onClick={extras.onBack}>
                  <ArrowLeft size={16} />
                </IconButton>
              )}
              <span className="truncate">{folderName}</span>
              {encrypted && <Badge tone="success" className="gap-1"><ShieldCheck size={10} />Encrypted</Badge>}
              {note.isLocked && (
                <Badge tone="accent" className="gap-1"><Lock size={10} />Locked</Badge>
              )}
              {note.isTrashed && <Badge tone="danger">In trash</Badge>}
              {note.isArchived && !note.isTrashed && <Badge>Archived</Badge>}
            </div>

            {/* Right Action buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {!note.isTrashed && !note.isArchived && (
                <div className="relative shrink-0" ref={statusDropdownRef}>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={showStatusDropdown}
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-md border border-line px-2 text-[12px] font-medium cursor-pointer transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent",
                      note.status === "Published" ? "text-success" : note.status === "In Review" ? "text-warning" : "text-fg-muted",
                    )}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      note.status === "Published" ? "bg-success" : note.status === "In Review" ? "bg-warning" : "bg-fg-subtle"
                    }`}></span>
                    <span>{note.status || "Draft"}</span>
                    <ChevronDown size={11} className="shrink-0 opacity-70" />
                  </button>

                  {showStatusDropdown && (
                    <div role="menu" className="absolute right-0 mt-1.5 w-40 rounded-lg shadow-pop border border-line bg-raised p-1 z-50 flex flex-col text-fg">
                      {(["Draft", "In Review", "Published"] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            handleUpdateStatus(status);
                            setShowStatusDropdown(false);
                          }}
                          className={`w-full min-h-9 text-left px-2 rounded-md text-[13px] transition-colors hover:bg-hover flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-accent ${
                            note.status === status ? "font-medium text-accent" : ""
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            status === "Published" ? "bg-success" : status === "In Review" ? "bg-warning" : "bg-fg-subtle"
                          }`}></span>
                          <span>{status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Clipboard feedback indicator */}
              {copyFeedback && (
                <span className="text-[12px] text-success font-medium motion-safe:animate-fade-in hidden sm:inline" role="status">
                  Link copied!
                </span>
              )}

              {/* Version History - Desktop only */}
              <IconButton
                id="version-history-btn"
                label="Version history"
                aria-pressed={showHistory}
                onClick={() => setShowHistory(!showHistory)}
                className={cn("hidden md:inline-flex", showHistory && "!bg-accent-soft !text-accent")}
              >
                <History size={15} />
              </IconButton>

              {/* Find/Search within Note - Desktop only */}
              <IconButton
                label="Find in note"
                aria-pressed={showFindBar}
                onClick={() => {
                  const next = !showFindBar;
                  setShowFindBar(next);
                  if (!next) setFindQuery("");
                }}
                className={cn("hidden md:inline-flex", showFindBar && "!bg-accent-soft !text-accent")}
              >
                <Search size={15} />
              </IconButton>

              {/* Text to Speech button */}
              <IconButton
                label={isSpeaking ? "Stop reading aloud" : "Read note aloud"}
                aria-pressed={isSpeaking}
                onClick={handleToggleSpeak}
                className={cn(isSpeaking && "!bg-danger-soft !text-danger")}
              >
                {isSpeaking ? <VolumeX size={15} className="motion-safe:animate-pulse" /> : <Volume2 size={15} />}
              </IconButton>

              {/* Focus Mode button - Desktop only */}
              <IconButton
                id="focus-mode-btn"
                label="Focus mode (Alt+F)"
                onClick={() => setIsFocusMode(!isFocusMode)}
                className="hidden md:inline-flex"
              >
                <Maximize2 size={15} />
              </IconButton>

              {/* Launch AI panel trigger if closed */}
              {!isAiPanelOpen && (
                <Button
                  id="ai-panel-open-editor-btn"
                  variant="primary"
                  size="md"
                  onClick={onOpenAiAssistant}
                  leadingIcon={<Sparkles size={13} />}
                  className="max-md:!px-0 max-md:w-10 max-md:h-10"
                  aria-label="Ask AI"
                >
                  <span className="hidden sm:inline">Ask AI</span>
                </Button>
              )}

              {/* More Actions (⋮) Dropdown */}
              <div ref={moreMenuRef} className="relative">
                <IconButton
                  id="more-actions-trigger"
                  label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={showMoreMenu}
                  className={cn("max-md:!h-10 max-md:!w-10", showMoreMenu && "!bg-active !text-fg")}
                  onClick={() => {
                    setShowMoreMenu(!showMoreMenu);
                    setShowMoveSubmenu(false);
                    setShowCopySubmenu(false);
                    setShowFolderSubmenu(false);
                  }}
                >
                  <MoreVertical size={15} />
                </IconButton>

                {showMoreMenu && (
                  <div
                    id="more-actions-dropdown"
                    className={`absolute right-0 mt-2 w-56 rounded-lg shadow-pop border p-1 z-50 flex flex-col max-h-[75vh] overflow-y-auto scrollbar-none ${
                      theme === "dark"
                        ? "bg-panel border-line text-fg"
                        : "bg-panel border-line text-fg"
                    }`}
                  >
                    {/* Mobile Only Actions Group */}
                    {isMobile && (
                      <>
                        <button
                          onClick={() => {
                            setShowHistory(!showHistory);
                            setShowMoreMenu(false);
                          }}
                          className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                        >
                          <History size={13} />
                          <span>Version History</span>
                        </button>

                        <button
                          onClick={() => {
                            setShowFindBar(!showFindBar);
                            setFindQuery("");
                            setShowMoreMenu(false);
                          }}
                          className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                        >
                          <Search size={13} />
                          <span>Find in Note</span>
                        </button>

                        {!note.isTrashed && !note.isArchived && (
                          <div className="flex flex-col gap-0.5 border-t border-line pt-1.5 mt-1.5">
                            <div className="text-[10px] font-semibold text-fg-subtle uppercase px-3 py-1">
                              Publishing
                            </div>
                            {note.status === "Published" ? (
                              <button
                                onClick={() => {
                                  handleUpdateStatus("Draft");
                                  setShowMoreMenu(false);
                                }}
                                className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                              >
                                <Eye size={13} />
                                <span>Revert to Draft</span>
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    handleUpdateStatus("In Review");
                                    setShowMoreMenu(false);
                                  }}
                                  className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                                >
                                  <Eye size={13} />
                                  <span>Submit for Review</span>
                                </button>
                                <button
                                  onClick={() => {
                                    handleUpdateStatus("Published");
                                    setShowMoreMenu(false);
                                  }}
                                  className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover text-success font-semibold"
                                >
                                  <Eye size={13} />
                                  <span>Publish Live</span>
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        <div className="h-px bg-hover my-1.5"></div>
                      </>
                    )}

                    {/* Pin action */}
                    <button
                      onClick={handleTogglePin}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover ${
                      note.isPinned ? "text-warning font-medium animate-pulse" : ""
                    }`}
                  >
                    <Star size={13} className={note.isPinned ? "fill-current" : ""} />
                    <span>{note.isPinned ? "Unpin Note" : "Pin Note"}</span>
                  </button>

                  {/* Favorite action */}
                  <button
                    onClick={handleToggleFavorite}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover ${
                      note.isFavorite ? "text-warning font-medium" : ""
                    }`}
                  >
                    <Star size={13} className={note.isFavorite ? "fill-current" : ""} />
                    <span>{note.isFavorite ? "Remove Favorite" : "Favorite Note"}</span>
                  </button>

                  {/* Lock action */}
                  <button
                    onClick={handleToggleLock}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover ${
                      note.isLocked ? "text-accent font-medium" : ""
                    }`}
                  >
                    {note.isLocked ? <Unlock size={13} /> : <Lock size={13} />}
                    <span>{note.isLocked ? "Unlock Editor" : "Lock Note (Read-Only)"}</span>
                  </button>

                  {/* Opt-in encryption (password, no recovery) */}
                  {!encrypted && !note.isTrashed && (
                    <button
                      onClick={() => { setShowMoreMenu(false); setEncryptOpen(true); }}
                      className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                    >
                      <ShieldCheck size={13} />
                      <span>Encrypt this note…</span>
                    </button>
                  )}

                  <div className="h-px bg-hover my-1"></div>

                  {/* Move & Copy workspace commands */}
                  {workspaces.length > 1 && (
                    <>
                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowMoveSubmenu(!showMoveSubmenu);
                            setShowCopySubmenu(false);
                          }}
                          className="flex items-center justify-between w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                        >
                          <span className="flex items-center gap-2.5">
                            <FolderOpen size={13} />
                            <span>Move to Workspace</span>
                          </span>
                          <ChevronRight size={12} />
                        </button>
                        
                        {showMoveSubmenu && (
                          <div className={`absolute right-full top-0 mr-1 w-48 rounded-lg shadow-pop border p-1 z-50 flex flex-col ${
                            theme === "dark" ? "bg-panel border-line text-fg" : "bg-panel border-line text-fg"
                          }`}>
                            <div className="text-[10px] font-semibold text-fg-subtle uppercase px-2 py-1 border-b border-line mb-1">
                              Select Workspace
                            </div>
                            {workspaces.filter(w => w.id !== activeWorkspaceId).map(w => (
                              <button
                                key={w.id}
                                onClick={() => {
                                  if (onMoveNote) onMoveNote(note.id, w.id);
                                  setShowMoveSubmenu(false);
                                  setShowMoreMenu(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-hover truncate"
                              >
                                {w.icon} {w.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowCopySubmenu(!showCopySubmenu);
                            setShowMoveSubmenu(false);
                          }}
                          className="flex items-center justify-between w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                        >
                          <span className="flex items-center gap-2.5">
                            <Copy size={13} />
                            <span>Copy to Workspace</span>
                          </span>
                          <ChevronRight size={12} />
                        </button>

                        {showCopySubmenu && (
                          <div className={`absolute right-full top-0 mr-1 w-48 rounded-lg shadow-pop border p-1 z-50 flex flex-col ${
                            theme === "dark" ? "bg-panel border-line text-fg" : "bg-panel border-line text-fg"
                          }`}>
                            <div className="text-[10px] font-semibold text-fg-subtle uppercase px-2 py-1 border-b border-line mb-1">
                              Select Workspace
                            </div>
                            {workspaces.filter(w => w.id !== activeWorkspaceId).map(w => (
                              <button
                                key={w.id}
                                onClick={() => {
                                  if (onCopyNote) onCopyNote(note.id, w.id);
                                  setShowCopySubmenu(false);
                                  setShowMoreMenu(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-hover truncate"
                              >
                                {w.icon} {w.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Move to Folder */}
                  {folders.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => {
                          setShowFolderSubmenu(!showFolderSubmenu);
                          setShowMoveSubmenu(false);
                          setShowCopySubmenu(false);
                        }}
                        className="flex items-center justify-between w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                      >
                        <span className="flex items-center gap-2.5">
                          <FolderOpen size={13} className="text-success" />
                          <span>Move to Folder</span>
                        </span>
                        <ChevronRight size={12} />
                      </button>

                      {showFolderSubmenu && (
                        <div className={`absolute right-full top-0 mr-1 w-48 rounded-lg shadow-pop border p-1 z-50 flex flex-col ${
                          theme === "dark" ? "bg-panel border-line text-fg" : "bg-panel border-line text-fg"
                        }`}>
                          <div className="text-[10px] font-semibold text-fg-subtle uppercase px-2 py-1 border-b border-line mb-1">
                            Select Folder
                          </div>
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 no-scrollbar">
                            {folders.map((f) => (
                              <button
                                key={f.id}
                                onClick={() => {
                                  onUpdateNote({ ...note, folder: f.id, updatedAt: new Date().toISOString() });
                                  setShowFolderSubmenu(false);
                                  setShowMoreMenu(false);
                                }}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-hover truncate ${
                                  note.folder === f.id ? "text-success font-semibold" : ""
                                }`}
                              >
                                {f.icon || "📁"} {f.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Duplicate Note */}
                  {onDuplicateNote && (
                    <button
                      onClick={() => {
                        onDuplicateNote(note.id);
                        setShowMoreMenu(false);
                      }}
                      className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                    >
                      <Copy size={13} />
                      <span>Duplicate Note</span>
                    </button>
                  )}

                  {/* Archive Note */}
                  {onArchiveNote && (
                    <button
                      onClick={() => {
                        onArchiveNote(note.id);
                        setShowMoreMenu(false);
                      }}
                      className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                    >
                      <Archive size={13} />
                      <span>{note.isArchived ? "Unarchive Note" : "Archive Note"}</span>
                    </button>
                  )}

                  <div className="h-px bg-hover my-1"></div>

                  {/* Share action */}
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                  >
                    <Share2 size={13} />
                    <span>Copy Share Link</span>
                  </button>

                  {/* Print action */}
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover"
                  >
                    <Printer size={13} />
                    <span>Print Document</span>
                  </button>

                  {/* Export format triggers */}
                  <div className="text-[10px] font-semibold text-fg-subtle uppercase px-3 py-1.5 border-t border-line">
                    Export Format
                  </div>
                  <div className="flex gap-1 px-2 pb-1.5 justify-between">
                    <button
                      onClick={() => handleExport("markdown")}
                      className="px-2 py-1 rounded-md bg-hover hover:bg-active text-[10px] text-center flex-1 font-semibold cursor-pointer"
                    >
                      MD
                    </button>
                    <button
                      onClick={() => handleExport("html")}
                      className="px-2 py-1 rounded-md bg-hover hover:bg-active text-[10px] text-center flex-1 font-semibold cursor-pointer"
                    >
                      HTML
                    </button>
                    <button
                      onClick={() => handleExport("json")}
                      className="px-2 py-1 rounded-md bg-hover hover:bg-active text-[10px] text-center flex-1 font-semibold cursor-pointer"
                    >
                      JSON
                    </button>
                  </div>

                  <div className="h-px bg-hover my-1"></div>

                  {/* Delete Note / Restore */}
                  {note.isTrashed ? (
                    <div className="flex flex-col gap-0.5">
                      {onRestoreNote && (
                        <button
                          onClick={() => {
                            onRestoreNote(note.id);
                            setShowMoreMenu(false);
                          }}
                          className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover text-success font-medium cursor-pointer"
                        >
                          <RotateCcw size={13} />
                          <span>Restore Note</span>
                        </button>
                      )}
                      {onDeletePermanently && (
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to permanently delete "${note.title || 'Untitled Note'}"? This action cannot be undone.`)) {
                              onDeletePermanently(note.id);
                              setShowMoreMenu(false);
                            }
                          }}
                          className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-danger-soft text-danger font-medium cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>Delete Permanently</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    onDeleteNote && (
                      <button
                        onClick={() => {
                          onDeleteNote(note.id);
                          setShowMoreMenu(false);
                        }}
                        className="flex items-center gap-2.5 w-full text-left px-3 py-2 max-md:min-h-10 rounded-lg text-xs transition-colors hover:bg-hover text-danger font-medium cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Move to Trash</span>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

          {/* Title + properties column */}
          <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6 pt-4 pb-3 flex flex-col gap-2 min-w-0">
            <input
              id="active-note-title-input"
              type="text"
              aria-label="Note title"
              value={note.title}
              onChange={(e) => onUpdateNote({ ...note, title: e.target.value, updatedAt: new Date().toISOString() })}
              onBlur={(e) => {
                if (!e.target.value.trim()) {
                  onUpdateNote({ ...note, title: "Untitled Note", updatedAt: new Date().toISOString() });
                }
              }}
              className="w-full border-none bg-transparent p-0 text-[26px] font-semibold leading-tight text-fg outline-none placeholder:text-fg-subtle focus:ring-0 truncate"
              placeholder="Untitled Note"
              readOnly={note.isLocked}
            />

            {/* Property row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
              <span className="inline-flex items-center gap-1"><FolderOpen size={12} className="text-fg-subtle" />{folderName}</span>
              <span aria-hidden className="h-3 w-px bg-line" />
              <span>Edited {new Date(note.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}, {new Date(note.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span aria-hidden className="h-3 w-px bg-line" />
              <span className="tabular-nums">{note.wordCount} words</span>
              <span className="tabular-nums">{note.readingTime} min read</span>
            </div>

          <div ref={tagContainerRef} className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-none w-full select-text">
            <span className="text-[12px] font-medium text-fg-subtle flex items-center gap-1 mr-1 shrink-0">
              <Tag size={12} />
              Tags
            </span>

            {note.tags.length === 0 ? (
              <span className="text-[12px] text-fg-subtle mr-1 shrink-0">None yet</span>
            ) : (
              <>
                {((isMobile && !isTagsExpanded) ? note.tags.slice(0, 2) : note.tags).map((tag) => (
                  <span
                    key={tag}
                    className="group flex items-center gap-1 text-[12px] px-2 h-6 rounded-full bg-hover hover:bg-active text-fg-muted select-none shrink-0"
                  >
                    {tag}
                    {!note.isLocked && (
                      <button
                        onClick={() => {
                          const updatedTags = note.tags.filter((t) => t !== tag);
                          onUpdateNote({ ...note, tags: updatedTags, updatedAt: new Date().toISOString() });
                        }}
                        className="opacity-60 hover:opacity-100 text-[13px] leading-none pl-0.5 cursor-pointer text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent rounded"
                        title="Remove tag"
                        aria-label={`Remove tag ${tag}`}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {isMobile && !isTagsExpanded && note.tags.length > 2 && (
                  <button
                    onClick={() => {
                      setIsTagsExpanded(true);
                      setTimeout(() => {
                        if (tagContainerRef.current) {
                          tagContainerRef.current.scrollTo({
                            left: tagContainerRef.current.scrollWidth,
                            behavior: "smooth"
                          });
                        }
                      }, 50);
                    }}
                    title={note.tags.slice(2).join(", ")}
                    className="text-[12px] px-2 h-6 rounded-full bg-accent-soft text-accent font-medium select-none shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    +{note.tags.length - 2}
                  </button>
                )}
              </>
            )}

            {!note.isLocked && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const input = form.elements.namedItem("newTag") as HTMLInputElement;
                  const val = input.value.trim();
                  if (val && !note.tags.includes(val)) {
                    onUpdateNote({
                      ...note,
                      tags: [...note.tags, val],
                      updatedAt: new Date().toISOString()
                    });
                    input.value = "";
                  }
                }}
                className="flex items-center"
              >
                <input
                  type="text"
                  name="newTag"
                  placeholder="+ tag"
                  aria-label="Add tag"
                  className="text-[12px] px-2 h-6 rounded-full border border-dashed border-line-strong bg-transparent outline-none text-fg-muted placeholder:text-fg-subtle focus:border-solid focus:border-accent w-16 focus:w-24 text-center transition-all"
                />
              </form>
            )}
          </div>
          </div>
        </div>
      )}

      {showFindBar && (
        <div className="flex h-10 items-center gap-2 border-b border-line bg-panel px-3 sm:px-4 text-[13px] select-none">
          <Search size={13} className="text-fg-subtle shrink-0" />
          <input
            type="text"
            aria-label="Find in note"
            autoFocus
            placeholder="Find in note"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            className="min-w-0 flex-grow bg-transparent border-none outline-none focus:ring-0 text-[13px] text-fg placeholder:text-fg-subtle"
          />
          <IconButton
            size="sm"
            label="Close find"
            onClick={() => {
              setShowFindBar(false);
              setFindQuery("");
            }}
          >
            <X size={13} />
          </IconButton>
        </div>
      )}

      {/* Focus Mode Header Overlay (Allows escaping) */}
      {isFocusMode && (
        <button
          id="exit-focus-mode-btn"
          onClick={() => setIsFocusMode(false)}
          className="absolute top-3 right-3 z-20 flex items-center gap-1.5 h-9 px-3 rounded-md bg-panel border border-line hover:bg-hover text-[13px] text-fg-muted shadow-soft cursor-pointer focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Minimize2 size={12} />
          <span>Exit Focus</span>
        </button>
      )}

      {/* Formatting Toolbar (legacy markdown editor only) */}
      {!isFocusMode && !tiptapOn && !encrypted && (
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex h-11 shrink-0 select-none flex-row items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-line bg-surface px-3 sm:px-4 scrollbar-none md:h-10"
        >
          <IconButton
            label="Undo (Ctrl+Z)"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <Undo size={15} />
          </IconButton>
          <IconButton
            label="Redo (Ctrl+Y)"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <Redo size={15} />
          </IconButton>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
          <IconButton
            label="Bold"
            onClick={() => toggleFormat("bold")}
            aria-pressed={!!activeStyles.bold}
            
            className={cn("shrink-0 max-md:!h-10 max-md:!w-10", activeStyles.bold && "!bg-accent-soft !text-accent")}
          >
            <Bold size={15} />
          </IconButton>
          <IconButton
            label="Italic"
            onClick={() => toggleFormat("italic")}
            aria-pressed={!!activeStyles.italic}
            
            className={cn("shrink-0 max-md:!h-10 max-md:!w-10", activeStyles.italic && "!bg-accent-soft !text-accent")}
          >
            <Italic size={15} />
          </IconButton>
          <IconButton
            label="Underline"
            onClick={() => toggleFormat("underline")}
            aria-pressed={!!activeStyles.underline}
            
            className={cn("shrink-0 max-md:!h-10 max-md:!w-10", activeStyles.underline && "!bg-accent-soft !text-accent")}
          >
            <Underline size={15} />
          </IconButton>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
          <IconButton
            label="Heading 1"
            onClick={() => insertMarkdown("# ")}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <Heading1 size={15} />
          </IconButton>
          <IconButton
            label="Heading 2"
            onClick={() => insertMarkdown("## ")}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <Heading2 size={15} />
          </IconButton>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
          <IconButton
            label="Bullet list"
            onClick={() => insertMarkdown("- ")}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <List size={15} />
          </IconButton>
          <IconButton
            label="Numbered list"
            onClick={() => insertMarkdown("1. ")}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <ListOrdered size={15} />
          </IconButton>
          <IconButton
            label="Checklist"
            onClick={() => insertMarkdown("- [ ] ")}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <CheckSquare size={15} />
          </IconButton>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
          <IconButton
            label="Code block"
            onClick={() => insertMarkdown("```typescript\n", "\n```")}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <Code size={15} />
          </IconButton>
          <IconButton
            label="Insert table"
            onClick={() => insertMarkdown("| Header 1 | Header 2 |\n|---|---|\n| Value 1 | Value 2 |\n")}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <TableIcon size={15} />
          </IconButton>
          <IconButton
            label="Add link"
            onClick={() => insertMarkdown("[Link Text](", ")")}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <Link size={15} />
          </IconButton>
          <IconButton
            label="Insert image"
            onClick={() => setIsImageModalOpen(true)}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <Image size={15} />
          </IconButton>
          <IconButton
            label="Attach file"
            onClick={handleFileUploadMock}
            
            className={"shrink-0 max-md:!h-10 max-md:!w-10"}
          >
            <Paperclip size={15} />
          </IconButton>

          <span className="hidden lg:inline-flex ml-auto shrink-0 items-center gap-1 text-[12px] text-fg-subtle">
            Type <Kbd>/</Kbd> for blocks
          </span>
        </div>
      )}

      {/* Unified Live Document Canvas */}
      <div className="flex-grow flex flex-col min-h-0 relative">
        <div
          ref={previewContainerRef}
          onScroll={handlePreviewScroll}
          className="h-full w-full overflow-y-auto bg-surface relative"
        >
          {note.isLocked && (
            <div className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-[720px] px-3 py-2 rounded-lg bg-accent-soft text-[13px] text-accent flex items-center gap-2 select-none">
              <Lock size={12} className="flex-shrink-0" />
              <span>This note is locked and read-only. Unlock it from the more actions menu to edit.</span>
            </div>
          )}

          {isFocusMode && (
            <div className="px-4 sm:px-6 pt-8 mx-auto w-full max-w-[720px]">
              <input
                type="text"
                aria-label="Note title"
                value={note.title}
                onChange={(e) => onUpdateNote({ ...note, title: e.target.value, updatedAt: new Date().toISOString() })}
                onBlur={(e) => {
                  if (!e.target.value.trim()) {
                    onUpdateNote({ ...note, title: "Untitled Note", updatedAt: new Date().toISOString() });
                  }
                }}
                className="text-[26px] font-semibold leading-tight border-none outline-none focus:ring-0 bg-transparent text-fg placeholder:text-fg-subtle w-full"
                placeholder="Untitled Note"
                readOnly={note.isLocked}
              />
            </div>
          )}

          {encrypted ? (
            <EncryptedNotePanel note={note} onUpdateNote={onUpdateNote} />
          ) : tiptapOn && extras ? (
            <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6 pb-8">
              <NoteBodyEditor
                key={note.id}
                noteId={note.id}
                value={note.content || ""}
                readOnly={!!note.isLocked || !!note.isTrashed}
                notes={extras.workspaceNotes ?? []}
                onChange={(md) => handleContentChange(md)}
                onOpenLink={(title) => {
                  const id = extras.indexes?.link.resolve(title) ?? extras.createNoteWithTitle?.(title);
                  if (id) extras.openNote?.(id);
                }}
              />
            </div>
          ) : (
            renderRichPreview()
          )}

          {/* Floating Notion-like Slash Menu */}
          {showSlashMenu && (
            <div
              id="slash-commands-dropdown"
              ref={slashMenuRef}
              style={{ top: slashMenuCoords.top, left: slashMenuCoords.left }}
              className={`fixed z-50 w-60 p-1 rounded-lg shadow-pop border bg-raised flex flex-col max-w-[calc(100vw-1rem)] ${
                theme === "dark"
                  ? "bg-panel border-line text-fg"
                  : "bg-panel border-line text-fg"
              }`}
            >
              <div className="text-[11px] font-medium text-fg-subtle uppercase tracking-wide px-2 py-1.5">
                Insert block
              </div>
              {[
                { id: "h1", label: "Heading 1", sub: "# Large section title" },
                { id: "h2", label: "Heading 2", sub: "## Medium subsection" },
                { id: "todo", label: "Checklist Item", sub: "- [ ] Actionable task" },
                { id: "bullet", label: "Bullet Point", sub: "- Unordered list item" },
                { id: "code", label: "Code Block", sub: "``` Syntax highlighted code" },
                { id: "table", label: "Data Table", sub: "Interactive rows & columns" },
                { id: "quote", label: "Blockquote", sub: "> Callout or citation" },
              ].map((cmd) => (
                <button
                  key={cmd.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleInsertSlashCommand(cmd.id);
                  }}
                  className={`w-full text-left min-h-10 px-2 py-1.5 rounded-md text-[13px] flex flex-col transition-colors cursor-pointer ${
                    theme === "dark" ? "hover:bg-hover" : "hover:bg-hover"
                  }`}
                >
                  <span className="font-medium text-fg">{cmd.label}</span>
                  <span className="text-[11px] text-fg-subtle">{cmd.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Version History side-drawer overlay */}
        {showHistory && (
          <div
            id="version-history-drawer"
            className={`absolute top-0 right-0 w-80 max-w-full h-full border-l z-30 shadow-pop p-4 flex flex-col bg-raised ${
              theme === "dark"
                ? "bg-panel border-line text-fg"
                : "bg-panel border-line text-fg"
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <h4 className="font-semibold text-[14px] flex items-center gap-2">
                <History size={15} />
                Version History
              </h4>
              <IconButton size="sm" label="Close version history" onClick={() => setShowHistory(false)}>
                <X size={14} />
              </IconButton>
            </div>

            <p className="text-[12px] text-fg-muted mb-3 leading-relaxed">
              We capture significant snapshots automatically as you draft. Click any record to roll back content instantly.
            </p>

            {/* Filters Section */}
            <div className="flex flex-col gap-2 mb-4">
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Search snapshots"
                aria-label="Search snapshots"
                className={`w-full h-8 px-2.5 rounded-md border outline-none text-[13px] focus:border-accent focus:ring-2 focus:ring-accent/25 ${
                  theme === "dark" ? "bg-panel border-line text-fg placeholder:text-fg-subtle" : "bg-panel border-line text-fg placeholder:text-fg-subtle"
                }`}
              />
              <div className="flex gap-2 items-center">
                <span className="text-[12px] text-fg-muted">Size</span>
                <select
                  value={historySizeFilter}
                  onChange={(e) => setHistorySizeFilter(e.target.value as any)}
                  className={`flex-grow h-8 px-2 rounded-md border outline-none text-[12px] cursor-pointer focus:border-accent ${
                    theme === "dark" ? "bg-panel border-line text-fg" : "bg-panel border-line text-fg"
                  }`}
                >
                  <option value="all">All Snapshots</option>
                  <option value="large">Large Snapshots (&gt;500 chars)</option>
                  <option value="small">Small Snapshots (&le;500 chars)</option>
                </select>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto flex flex-col gap-2">
              {filteredHistory && filteredHistory.length > 0 ? (
                filteredHistory.map((version, index) => (
                  <div
                    key={index}
                    onClick={() => handleRestoreVersion(version.content)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRestoreVersion(version.content); } }}
                    className={`p-3 rounded-lg border text-[13px] cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                      theme === "dark"
                        ? "bg-panel border-line hover:border-line-strong"
                        : "bg-panel border-line hover:border-line-strong"
                    }`}
                  >
                    <div className="font-semibold text-fg flex items-center gap-1.5">
                      <Clock size={12} />
                      {new Date(version.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                    <div className="text-[12px] text-fg-muted mt-1">
                      {new Date(version.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })} • {version.content.length} characters
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-center text-fg-muted">
                  <Info size={18} className="mb-1 text-fg-subtle" />
                  <span className="text-[13px]">No snapshots yet</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!isFocusMode && extras?.indexes && extras.openNote && !encrypted && (
        <BacklinksPanel note={note} notes={extras.workspaceNotes ?? []} indexes={extras.indexes} onOpenNote={extras.openNote} />
      )}

      {/* Bottom Status Bar */}
      {!isFocusMode && (
        <div className="px-4 sm:px-6 h-8 border-t border-line flex items-center justify-between gap-3 text-[12px] select-none bg-surface text-fg-muted pb-[env(safe-area-inset-bottom)] box-content">
          <div className="flex items-center gap-3 min-w-0">
            <span className="tabular-nums hidden sm:inline">{note.wordCount} words</span>
            <Badge
              tone={note.isTrashed ? "danger" : note.isArchived ? "accent" : note.status === "Published" ? "success" : note.status === "In Review" ? "warning" : "neutral"}
            >
              {note.isTrashed ? "Trashed" : note.isArchived ? "Archived" : note.status || "Draft"}
            </Badge>
          </div>

          {/* Auto save indicator / Manual save button */}
          {settings?.autoSave === false ? (
            <div className="flex items-center gap-2 flex-shrink-0" role="status">
              <span className={`text-[12px] ${note.content !== localContent ? "text-warning" : "text-fg-subtle"}`}>
                {note.content !== localContent ? "Unsaved changes" : "Saved"}
              </span>
              {note.content !== localContent && (
                <button
                  onClick={handleManualSave}
                  className="h-6 px-2 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-accent"
                  title="Save changes (Ctrl+S)"
                >
                  Save
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-fg-subtle flex-shrink-0" role="status">
              <span className={`w-1.5 h-1.5 rounded-full ${isSaving ? "bg-warning motion-safe:animate-pulse" : "bg-success"}`}></span>
              <span>{isSaving ? "Saving" : "Saved"}</span>
            </div>
          )}
        </div>
      )}
      <EncryptNoteDialog
        open={encryptOpen}
        note={note}
        onClose={() => setEncryptOpen(false)}
        onEncrypted={(n) => onUpdateNote(n)}
      />
      <ImageUploadModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onInsert={(markdown) => insertMarkdown(markdown)}
        theme={theme}
      />
    </div>
  );
}

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
  theme: "light" | "dark";
}

function ImageUploadModal({ isOpen, onClose, onInsert, theme }: ImageUploadModalProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("aura-imgbb-key") || "");
  const [caption, setCaption] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!caption) {
        setCaption(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
      setError("");
    }
  };

  const handleUploadAndInsert = async () => {
    setError("");
    if (activeTab === "upload") {
      if (!file) {
        setError("Please select an image file first.");
        return;
      }
      if (!apiKey.trim()) {
        setError("An ImgBB API key is required to upload. You can get one for free at imgbb.com.");
        return;
      }

      setIsUploading(true);
      try {
        localStorage.setItem("aura-imgbb-key", apiKey.trim());
        const formData = new FormData();
        formData.append("image", file);

        const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey.trim()}`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error("Upload failed. Check your API key or network connection.");
        }

        const data = await res.json();
        const uploadedUrl = data.data.url;
        insertFormattedImage(uploadedUrl);
      } catch (err: any) {
        setError(err.message || "Something went wrong during upload.");
      } finally {
        setIsUploading(false);
      }
    } else {
      if (!url.trim()) {
        setError("Please enter a valid image URL.");
        return;
      }
      insertFormattedImage(url.trim());
    }
  };

  const insertFormattedImage = (finalUrl: string) => {
    let markdown = "";
    const altText = caption.trim() || "Image";
    
    if (width.trim() || height.trim() || align !== "center") {
      let style = "";
      if (align === "left") style = "float: left; margin-right: 1em;";
      else if (align === "right") style = "float: right; margin-left: 1em;";
      else style = "display: block; margin: 0 auto;";

      markdown = `<img src="${finalUrl}" alt="${altText}" ${
        width ? `width="${width}" ` : ""
      }${height ? `height="${height}" ` : ""}${style ? `style="${style}"` : ""} />`;
    } else {
      markdown = `![${altText}](${finalUrl})`;
    }

    onInsert(markdown);
    onClose();
    setFile(null);
    setUrl("");
    setCaption("");
    setWidth("");
    setHeight("");
    setAlign("center");
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 select-none cursor-pointer"
    >
      <div
        className="w-full max-w-md rounded-lg shadow-pop border border-line overflow-hidden p-5 flex flex-col gap-4 animate-fade-in bg-panel text-fg cursor-default"
      >
        <div className="flex justify-between items-center pb-2.5 border-b border-line">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Upload size={14} className="text-accent" />
            Upload & Edit Image
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-hover text-fg-muted cursor-pointer max-md:min-h-10 max-md:min-w-10 inline-flex items-center justify-center">
            <X size={14} />
          </button>
        </div>

        {/* Tabs switcher */}
        <div className="flex border-b border-line">
          <button
            onClick={() => {
              setActiveTab("upload");
              setError("");
            }}
            className={`flex-grow pb-2 max-md:min-h-10 text-xs font-semibold text-center border-b-2 cursor-pointer transition-all ${
              activeTab === "upload"
                ? "border-accent/40 text-accent"
                : "border-transparent text-fg-subtle hover:text-fg-muted"
            }`}
          >
            Upload to ImgBB
          </button>
          <button
            onClick={() => {
              setActiveTab("url");
              setError("");
            }}
            className={`flex-grow pb-2 max-md:min-h-10 text-xs font-semibold text-center border-b-2 cursor-pointer transition-all ${
              activeTab === "url"
                ? "border-accent/40 text-accent"
                : "border-transparent text-fg-subtle hover:text-fg-muted"
            }`}
          >
            Insert Image URL
          </button>
        </div>

        {error && (
          <div className="p-3 text-[11px] font-semibold border border-danger/40 bg-danger-soft text-danger rounded-lg leading-relaxed">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3.5 text-xs">
          {activeTab === "upload" ? (
            <>
              {/* ImgBB API Key Field */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">ImgBB API Key</label>
                  <a
                    href="https://api.imgbb.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9.5px] text-accent hover:underline font-semibold"
                  >
                    Get Key
                  </a>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste your 32-character ImgBB API key..."
                  className={`w-full px-3 py-2 max-md:min-h-10 rounded-lg border outline-none font-mono ${
                    theme === "dark" ? "bg-panel border-line text-fg placeholder:text-fg-subtle" : "bg-panel border-line text-fg placeholder:text-fg-subtle"
                  }`}
                />
              </div>

              {/* File Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">Select Image</label>
                <div className="flex items-center gap-2">
                  <label
                    className={`flex-grow px-3 py-2 max-md:min-h-10 rounded-lg border border-dashed flex items-center justify-center gap-1.5 cursor-pointer text-center text-fg-muted hover:bg-hover transition-colors ${
                      file ? "border-success/40 bg-success-soft text-success" : "border-line"
                    }`}
                  >
                    <Upload size={12} />
                    <span className="truncate max-w-[200px]">
                      {file ? file.name : "Choose file..."}
                    </span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>
                </div>
              </div>
            </>
          ) : (
            /* From URL */
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">Image Address (URL)</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className={`w-full px-3 py-2 max-md:min-h-10 rounded-lg border outline-none ${
                  theme === "dark" ? "bg-panel border-line text-fg placeholder:text-fg-subtle" : "bg-panel border-line text-fg placeholder:text-fg-subtle"
                }`}
              />
            </div>
          )}

          {/* EDIT DETAILS SECTION (Alt text, width, alignment) */}
          <div className="border-t border-line pt-3 flex flex-col gap-3">
            <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">Image Configurations</span>

            {/* Alt / Caption */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-fg-muted">Caption / Alternative text</label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Optional description of the image"
                className={`w-full px-3 py-2 max-md:min-h-10 rounded-lg border outline-none ${
                  theme === "dark" ? "bg-panel border-line text-fg placeholder:text-fg-subtle" : "bg-panel border-line text-fg placeholder:text-fg-subtle"
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Width / Height */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-fg-muted">Width (e.g. 300, 100%)</label>
                <input
                  type="text"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="Auto"
                  className={`w-full px-3 py-1.5 rounded-lg border outline-none ${
                    theme === "dark" ? "bg-panel border-line text-fg" : "bg-panel border-line text-fg"
                  }`}
                />
              </div>

              {/* Alignment */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-fg-muted">Alignment</label>
                <select
                  value={align}
                  onChange={(e) => setAlign(e.target.value as any)}
                  className={`w-full px-3 py-1.5 rounded-lg border outline-none font-semibold ${
                    theme === "dark" ? "bg-panel border-line text-fg" : "bg-panel border-line text-fg"
                  }`}
                >
                  <option value="center">Center</option>
                  <option value="left">Left (Float)</option>
                  <option value="right">Right (Float)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2.5 pt-2 border-t border-line animate-fade-in">
          <button
            onClick={onClose}
            className={`px-4 py-2 max-md:min-h-10 rounded-lg text-xs font-semibold border ${
              theme === "dark" ? "border-line text-fg-muted hover:bg-hover" : "border-line text-fg-muted hover:bg-hover"
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleUploadAndInsert}
            disabled={isUploading}
            className="px-4 py-2 max-md:min-h-10 bg-accent hover:bg-accent-hover text-accent-fg font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-soft cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <>
                <div className="w-3 h-3 rounded-full border border-white/20 border-t-white animate-spin"></div>
                <span>Uploading...</span>
              </>
            ) : (
              <span>Insert Image</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
