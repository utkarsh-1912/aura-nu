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
  Unlock,
  Trash2,
  Archive,
  Copy,
  FolderOpen,
  FileDown,
  Printer,
  ChevronRight,
  ExternalLink,
  Tag
} from "lucide-react";
import { Note, Workspace, Folder } from "../types";
import CodeBlockContainer from "./CodeBlockContainer";
import TableContainer from "./TableContainer";

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
}: EditorAreaProps) {
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "split">("split");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuCoords, setSlashMenuCoords] = useState({ top: 0, left: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [historySizeFilter, setHistorySizeFilter] = useState<"all" | "large" | "small">("all");

  const filteredHistory = useMemo(() => {
    let list = note?.versionHistory || [];

    if (historySearchQuery.trim()) {
      const q = historySearchQuery.toLowerCase();
      list = list.filter((v) => v.content.toLowerCase().includes(q));
    }

    if (historySizeFilter === "large") {
      list = list.filter((v) => v.content.length > 500);
    } else if (historySizeFilter === "small") {
      list = list.filter((v) => v.content.length <= 500);
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

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    lastHistoryPushTime.current = 0;
  }, [note?.id]);

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);

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
    if (!note) return;
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
      <div id="editor-empty-state" className="flex-grow h-full flex flex-col items-center justify-center p-8 bg-white dark:bg-[#09090b]">
        <div className="max-w-md text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-zinc-900 flex items-center justify-center mb-6 shadow-sm border border-slate-100 dark:border-zinc-800">
            <FileText size={32} className="text-slate-400 dark:text-zinc-500" />
          </div>
          <h3 className="font-display font-semibold text-lg text-slate-800 dark:text-zinc-200 mb-2">
            No Note Active
          </h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">
            Select an existing document from the notes list or launch a clean new workspace to start writing.
          </p>
        </div>
      </div>
    );
  }

  // Formatting Actions
  const insertMarkdown = (syntaxBefore: string, syntaxAfter = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const selectedText = text.substring(start, end);
    const replacement = syntaxBefore + selectedText + syntaxAfter;

    const newContent = text.substring(0, start) + replacement + text.substring(end);
    handleContentChange(newContent);

    // Refocus & restore selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + syntaxBefore.length, start + syntaxBefore.length + selectedText.length);
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

    handleContentChange(value);
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
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const text = textarea.value;

    // Remove the "/"
    const beforeSlash = text.substring(0, start - 1);
    const afterSlash = text.substring(start);

    let insertedContent = "";
    switch (command) {
      case "h1":
        insertedContent = "\n# Heading 1\n";
        break;
      case "h2":
        insertedContent = "\n## Heading 2\n";
        break;
      case "todo":
        insertedContent = "\n- [ ] Task item\n";
        break;
      case "bullet":
        insertedContent = "\n- Bullet point\n";
        break;
      case "code":
        insertedContent = "\n```typescript\n// Write your code here\n\n```\n";
        break;
      case "table":
        insertedContent = "\n| Header 1 | Header 2 |\n|---|---|\n| Value 1 | Value 2 |\n";
        break;
      case "quote":
        insertedContent = "\n> Elegant quote segment here\n";
        break;
    }

    const newContent = beforeSlash + insertedContent + afterSlash;
    handleContentChange(newContent);
    setShowSlashMenu(false);

    setTimeout(() => {
      textarea.focus();
    }, 50);
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
        type: "bold_stars",
        regex: /\*\*([\s\S]+?)\*\*/,
      },
      {
        type: "bold_underscores",
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
              ? "bg-zinc-800 text-amber-400 border border-zinc-700/50"
              : "bg-slate-100 text-amber-700 border border-slate-200"
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
          className="text-blue-500 hover:underline inline-flex items-center gap-0.5 font-medium cursor-pointer"
        >
          {renderInlineMarkdown(matchContent, `${currentKey}-link-label`)}
          <ExternalLink size={10} className="inline-block" />
        </a>
      );
    } else if (selectedPattern.type === "bold_stars" || selectedPattern.type === "bold_underscores") {
      parts.push(
        <strong key={currentKey} className="font-bold text-slate-900 dark:text-zinc-50">
          {renderInlineMarkdown(matchContent, `${currentKey}-bold`)}
        </strong>
      );
    } else if (selectedPattern.type === "italic_stars" || selectedPattern.type === "italic_underscores") {
      parts.push(
        <em key={currentKey} className="italic text-slate-850 dark:text-zinc-200">
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

  // Render markdown parser in the client beautifully
  const renderRichPreview = () => {
    const lines = note.content.split("\n");
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
        renderedElements.push(
          <div key={`checklist-${i}`} className="flex items-center gap-2.5 my-2.5 select-none animate-fade-in">
            <button
              onClick={() => toggleChecklistItem(currentIdx)}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                isChecked
                  ? "bg-blue-500 border-blue-500 text-white"
                  : "border-slate-300 dark:border-zinc-700 hover:border-blue-400"
              } cursor-pointer`}
            >
              {isChecked && <Check size={11} className="stroke-[3]" />}
            </button>
            <span className={`text-[14px] ${isChecked ? "line-through text-slate-400 dark:text-zinc-500" : "text-slate-800 dark:text-zinc-300"}`}>
              {renderInlineMarkdown(labelText)}
            </span>
          </div>
        );
        i++;
        continue;
      }

      // 4. UNORDERED LISTS
      if (line.startsWith("- ") || line.startsWith("* ")) {
        renderedElements.push(
          <li key={`bullet-${i}`} className="text-sm list-disc list-inside text-slate-700 dark:text-zinc-300 my-1 pl-2">
            {renderInlineMarkdown(line.substring(2))}
          </li>
        );
        i++;
        continue;
      }

      // 5. ORDERED LISTS
      const matchNumbered = line.match(/^(\d+)\.\s(.*)/);
      if (matchNumbered) {
        renderedElements.push(
          <li key={`numbered-${i}`} className="text-sm list-decimal list-inside text-slate-700 dark:text-zinc-300 my-1 pl-2">
            {renderInlineMarkdown(matchNumbered[2])}
          </li>
        );
        i++;
        continue;
      }

      // 6. HEADINGS
      if (line.startsWith("# ")) {
        renderedElements.push(
          <h1 key={`h1-${i}`} className="text-2xl font-bold tracking-tight mb-4 mt-6 text-slate-900 dark:text-zinc-50 flex items-center gap-2">
            {renderInlineMarkdown(line.replace("# ", ""))}
          </h1>
        );
        i++;
        continue;
      }
      if (line.startsWith("## ")) {
        renderedElements.push(
          <h2 key={`h2-${i}`} className="text-xl font-semibold tracking-tight mb-3 mt-5 text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            {renderInlineMarkdown(line.replace("## ", ""))}
          </h2>
        );
        i++;
        continue;
      }
      if (line.startsWith("### ")) {
        renderedElements.push(
          <h3 key={`h3-${i}`} className="text-lg font-medium mb-2 mt-4 text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            {renderInlineMarkdown(line.replace("### ", ""))}
          </h3>
        );
        i++;
        continue;
      }

      // 7. BLOCKQUOTES
      if (line.startsWith("> ")) {
        renderedElements.push(
          <blockquote key={`quote-${i}`} className="border-l-4 border-blue-500/80 dark:border-zinc-700 pl-4 py-1 italic my-3 text-slate-600 dark:text-zinc-400">
            {renderInlineMarkdown(line.substring(2))}
          </blockquote>
        );
        i++;
        continue;
      }

      // 8. TEXT AND PARAGRAPHS
      if (line.trim() === "") {
        renderedElements.push(<div key={`empty-${i}`} className="h-2"></div>);
      } else {
        renderedElements.push(
          <p key={`p-${i}`} className="text-[14px] text-slate-800 dark:text-zinc-300 my-2 leading-relaxed">
            {renderInlineMarkdown(line)}
          </p>
        );
      }
      i++;
    }

    return (
      <div className="markdown-body p-6 min-h-full">
        {renderedElements}
      </div>
    );
  };

  return (
    <div
      id="editor-pane-container"
      className={`flex-grow h-full flex flex-col relative select-text transition-colors duration-200 ${
        isFocusMode ? "max-w-3xl mx-auto" : "w-full"
      } ${theme === "dark" ? "bg-[#09090b] text-zinc-100" : "bg-white text-slate-900"}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-40 bg-blue-500/10 dark:bg-indigo-500/10 border-4 border-dashed border-blue-500 dark:border-indigo-400 flex flex-col items-center justify-center backdrop-blur-xs pointer-events-none">
          <div className="p-4 rounded-full bg-white dark:bg-zinc-900 shadow-xl border border-blue-100 dark:border-zinc-800 text-blue-500 mb-3 animate-bounce">
            <Paperclip size={28} />
          </div>
          <p className="font-display font-semibold text-sm text-slate-900 dark:text-zinc-100">
            Drop file to embed in Note
          </p>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
            Accepting images, Excel sheets, and documents
          </p>
        </div>
      )}

      {/* Top Header Controls Bar */}
      {!isFocusMode && (
        <div className={`px-4 py-2 border-b flex flex-col gap-1.5 flex-shrink-0 select-none ${
          theme === "dark" ? "border-zinc-800/80 bg-zinc-950/20" : "border-slate-200/60 bg-slate-50/50"
        }`}>
          {/* Row 1: Title, Status, Auto-save state AND Right Action buttons */}
          <div className="flex items-center justify-between w-full flex-wrap gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-grow">
              <input
                id="active-note-title-input"
                type="text"
                value={note.title}
                onChange={(e) => onUpdateNote({ ...note, title: e.target.value, updatedAt: new Date().toISOString() })}
                onBlur={(e) => {
                  if (!e.target.value.trim()) {
                    onUpdateNote({ ...note, title: "Untitled Note", updatedAt: new Date().toISOString() });
                  }
                }}
                className="font-display font-semibold text-base border-none outline-none focus:ring-0 bg-transparent text-slate-900 dark:text-zinc-100 placeholder-slate-400 flex-grow max-w-xl truncate"
                placeholder="Untitled Note"
                readOnly={note.isLocked}
              />
              
              {/* Status Badge */}
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider select-none flex-shrink-0 ${
                  note.isTrashed
                    ? "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                    : note.isArchived
                    ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400"
                    : note.status === "Published"
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : note.status === "In Review"
                    ? "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                    : "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {note.isTrashed ? "Trashed" : note.isArchived ? "Archived" : note.status || "Draft"}
              </span>

              {/* Auto save indicator */}
              <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500 font-mono flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{isSaving ? "Saving..." : "Synced"}</span>
              </div>
            </div>

            {/* Right Action buttons */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              {/* Clipboard feedback indicator */}
              {copyFeedback && (
                <span className="text-[10px] text-emerald-500 font-medium font-mono animate-fade-in">
                  Link copied!
                </span>
              )}

              {/* Publish / Draft Workflow buttons */}
              {!note.isTrashed && !note.isArchived && (
                <div className="flex items-center gap-1">
                  {note.status === "Published" ? (
                    <button
                      onClick={() => handleUpdateStatus("Draft")}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400 cursor-pointer"
                    >
                      Unpublish
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleUpdateStatus("In Review")}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border cursor-pointer transition-colors ${
                          note.status === "In Review"
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                            : "border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                        }`}
                      >
                        In Review
                      </button>
                      <button
                        onClick={() => handleUpdateStatus("Published")}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs cursor-pointer"
                      >
                        Publish
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="w-px h-5 bg-slate-200 dark:bg-zinc-800 mx-1"></div>

              {/* View Mode controls */}
              <div className="flex items-center border border-slate-200/80 dark:border-zinc-800 rounded-xl overflow-hidden p-0.5 bg-slate-100/60 dark:bg-zinc-950/40">
                <button
                  id="editor-edit-mode-btn"
                  onClick={() => setViewMode("edit")}
                  title="Edit Markdown"
                  className={`p-1.5 rounded-lg text-xs transition-all flex items-center gap-1 ${
                    viewMode === "edit"
                      ? "bg-white dark:bg-zinc-800 text-blue-500 dark:text-white shadow-xs font-semibold"
                      : "text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200"
                  } cursor-pointer`}
                >
                  <Edit3 size={13} />
                </button>
                <button
                  id="editor-split-mode-btn"
                  onClick={() => setViewMode("split")}
                  title="Split View"
                  className={`p-1.5 rounded-lg text-xs transition-all flex items-center gap-1 ${
                    viewMode === "split"
                      ? "bg-white dark:bg-zinc-800 text-blue-500 dark:text-white shadow-xs font-semibold"
                      : "text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200"
                  } cursor-pointer`}
                >
                  <Columns size={13} />
                </button>
                <button
                  id="editor-preview-mode-btn"
                  onClick={() => setViewMode("preview")}
                  title="Rich Preview"
                  className={`p-1.5 rounded-lg text-xs transition-all flex items-center gap-1 ${
                    viewMode === "preview"
                      ? "bg-white dark:bg-zinc-800 text-blue-500 dark:text-white shadow-xs font-semibold"
                      : "text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200"
                  } cursor-pointer`}
                >
                  <Eye size={13} />
                </button>
              </div>

              {/* Version History */}
              <button
                id="version-history-btn"
                onClick={() => setShowHistory(!showHistory)}
                title="Version History"
                className={`p-2 rounded-xl border transition-colors ${
                  showHistory
                    ? "bg-blue-50 text-blue-500 border-blue-200 dark:bg-zinc-800 dark:text-white"
                    : "bg-white border-slate-200 dark:bg-zinc-900 dark:border-zinc-800 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white"
                } cursor-pointer`}
              >
                <History size={14} />
              </button>

              {/* Focus Mode button */}
              <button
                id="focus-mode-btn"
                onClick={() => setIsFocusMode(!isFocusMode)}
                title="Focus Writing Mode (Alt+F)"
                className="p-2 rounded-xl border bg-white border-slate-200 dark:bg-zinc-900 dark:border-zinc-800 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
              >
                <Maximize2 size={14} />
              </button>

              {/* Launch AI panel trigger if closed */}
              {!isAiPanelOpen && (
                <button
                  id="ai-panel-open-editor-btn"
                  onClick={onOpenAiAssistant}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-xl shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Sparkles size={13} />
                  <span>Ask AI</span>
                </button>
              )}

              {/* More Actions (⋮) Dropdown */}
            <div ref={moreMenuRef} className="relative">
              <button
                id="more-actions-trigger"
                onClick={() => {
                  setShowMoreMenu(!showMoreMenu);
                  setShowMoveSubmenu(false);
                  setShowCopySubmenu(false);
                  setShowFolderSubmenu(false);
                }}
                title="More Actions"
                className={`p-2 rounded-xl border transition-colors ${
                  showMoreMenu
                    ? "bg-slate-100 dark:bg-zinc-800"
                    : "bg-white border-slate-200 dark:bg-zinc-900 dark:border-zinc-800 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white"
                } cursor-pointer`}
              >
                <MoreVertical size={14} />
              </button>

              {showMoreMenu && (
                <div
                  id="more-actions-dropdown"
                  className={`absolute right-0 mt-2 w-56 rounded-xl shadow-xl border p-1 z-50 flex flex-col ${
                    theme === "dark"
                      ? "bg-zinc-950 border-zinc-800 text-zinc-300"
                      : "bg-white border-slate-200 text-slate-700"
                  }`}
                >
                  {/* Pin action */}
                  <button
                    onClick={handleTogglePin}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 ${
                      note.isPinned ? "text-amber-500 font-medium animate-pulse" : ""
                    }`}
                  >
                    <Star size={13} className={note.isPinned ? "fill-amber-500/20" : ""} />
                    <span>{note.isPinned ? "Unpin Note" : "Pin Note"}</span>
                  </button>

                  {/* Favorite action */}
                  <button
                    onClick={handleToggleFavorite}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 ${
                      note.isFavorite ? "text-yellow-500 font-medium" : ""
                    }`}
                  >
                    <Star size={13} className={note.isFavorite ? "fill-yellow-500/20" : ""} />
                    <span>{note.isFavorite ? "Remove Favorite" : "Favorite Note"}</span>
                  </button>

                  {/* Lock action */}
                  <button
                    onClick={handleToggleLock}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 ${
                      note.isLocked ? "text-blue-500 font-medium" : ""
                    }`}
                  >
                    {note.isLocked ? <Unlock size={13} /> : <Lock size={13} />}
                    <span>{note.isLocked ? "Unlock Editor" : "Lock Note (Read-Only)"}</span>
                  </button>

                  <div className="h-px bg-slate-100 dark:bg-zinc-800 my-1"></div>

                  {/* Move & Copy workspace commands */}
                  {workspaces.length > 1 && (
                    <>
                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowMoveSubmenu(!showMoveSubmenu);
                            setShowCopySubmenu(false);
                          }}
                          className="flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
                        >
                          <span className="flex items-center gap-2.5">
                            <FolderOpen size={13} />
                            <span>Move to Workspace</span>
                          </span>
                          <ChevronRight size={12} />
                        </button>
                        
                        {showMoveSubmenu && (
                          <div className={`absolute right-full top-0 mr-1 w-48 rounded-xl shadow-xl border p-1 z-50 flex flex-col ${
                            theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
                          }`}>
                            <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase px-2 py-1 border-b border-slate-100 dark:border-zinc-800 mb-1">
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
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 truncate"
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
                          className="flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
                        >
                          <span className="flex items-center gap-2.5">
                            <Copy size={13} />
                            <span>Copy to Workspace</span>
                          </span>
                          <ChevronRight size={12} />
                        </button>

                        {showCopySubmenu && (
                          <div className={`absolute right-full top-0 mr-1 w-48 rounded-xl shadow-xl border p-1 z-50 flex flex-col ${
                            theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
                          }`}>
                            <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase px-2 py-1 border-b border-slate-100 dark:border-zinc-800 mb-1">
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
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 truncate"
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
                        className="flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
                      >
                        <span className="flex items-center gap-2.5">
                          <FolderOpen size={13} className="text-emerald-500" />
                          <span>Move to Folder</span>
                        </span>
                        <ChevronRight size={12} />
                      </button>

                      {showFolderSubmenu && (
                        <div className={`absolute right-full top-0 mr-1 w-48 rounded-xl shadow-xl border p-1 z-50 flex flex-col ${
                          theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
                        }`}>
                          <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase px-2 py-1 border-b border-slate-100 dark:border-zinc-800 mb-1">
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
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 truncate ${
                                  note.folder === f.id ? "text-emerald-500 font-semibold" : ""
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
                      className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
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
                      className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
                    >
                      <Archive size={13} />
                      <span>{note.isArchived ? "Unarchive Note" : "Archive Note"}</span>
                    </button>
                  )}

                  <div className="h-px bg-slate-100 dark:bg-zinc-800 my-1"></div>

                  {/* Share action */}
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
                  >
                    <Share2 size={13} />
                    <span>Copy Share Link</span>
                  </button>

                  {/* Print action */}
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
                  >
                    <Printer size={13} />
                    <span>Print Document</span>
                  </button>

                  {/* Export format triggers */}
                  <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase px-3 py-1.5 border-t border-slate-100 dark:border-zinc-800">
                    Export Format
                  </div>
                  <div className="flex gap-1 px-2 pb-1.5 justify-between">
                    <button
                      onClick={() => handleExport("markdown")}
                      className="px-2 py-1 rounded-md bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-[10px] text-center flex-1 font-semibold cursor-pointer"
                    >
                      MD
                    </button>
                    <button
                      onClick={() => handleExport("html")}
                      className="px-2 py-1 rounded-md bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-[10px] text-center flex-1 font-semibold cursor-pointer"
                    >
                      HTML
                    </button>
                    <button
                      onClick={() => handleExport("json")}
                      className="px-2 py-1 rounded-md bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-[10px] text-center flex-1 font-semibold cursor-pointer"
                    >
                      JSON
                    </button>
                  </div>

                  <div className="h-px bg-slate-100 dark:bg-zinc-800 my-1"></div>

                  {/* Delete Note / Restore */}
                  {note.isTrashed ? (
                    <div className="flex flex-col gap-0.5">
                      {onRestoreNote && (
                        <button
                          onClick={() => {
                            onRestoreNote(note.id);
                            setShowMoreMenu(false);
                          }}
                          className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 text-emerald-600 dark:text-emerald-400 font-medium cursor-pointer"
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
                          className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 font-medium cursor-pointer"
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
                        className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 text-rose-600 dark:text-rose-400 font-medium cursor-pointer"
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

          {/* Row 2: Tags list (Clean wrapping below the title & status) */}
          <div className="flex items-center gap-1.5 flex-wrap w-full mt-1 border-t border-slate-100 dark:border-zinc-800/80 pt-2 bg-transparent select-text">
            <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Tag size={10} />
              Tags:
            </span>
            
            {note.tags.length === 0 ? (
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 italic mr-1">No tags yet</span>
            ) : (
              note.tags.map((tag) => (
                <span
                  key={tag}
                  className="group flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 select-none font-mono"
                >
                  {tag}
                  {!note.isLocked && (
                    <button
                      onClick={() => {
                        const updatedTags = note.tags.filter((t) => t !== tag);
                        onUpdateNote({ ...note, tags: updatedTags, updatedAt: new Date().toISOString() });
                      }}
                      className="opacity-60 hover:opacity-100 text-[11px] leading-none pl-0.5 cursor-pointer text-slate-400 dark:text-zinc-500"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))
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
                  placeholder="+ Tag"
                  className="text-[10px] px-2 py-0.5 rounded border border-dashed border-slate-300 dark:border-zinc-800 bg-transparent outline-none text-slate-500 dark:text-zinc-400 focus:border-solid focus:border-blue-400 max-w-[70px] font-mono transition-colors"
                />
              </form>
            )}
          </div>
        </div>
      )}

      {/* Focus Mode Header Overlay (Allows escaping) */}
      {isFocusMode && (
        <button
          id="exit-focus-mode-btn"
          onClick={() => setIsFocusMode(false)}
          className="absolute top-4 right-4 z-20 flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs text-slate-600 dark:text-zinc-300 transition-all shadow-xs"
        >
          <Minimize2 size={12} />
          <span>Exit Focus</span>
        </button>
      )}

      {/* Formatting Toolbar */}
      {viewMode !== "preview" && !isFocusMode && (
        <div className={`px-4 py-1.5 border-b flex flex-wrap items-center gap-1 select-none ${
          theme === "dark" ? "border-zinc-800/50 bg-zinc-950/10" : "border-slate-100 bg-slate-50/20"
        }`}>
          {/* History Operations */}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer`}
          >
            <Undo size={14} />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Y)"
            className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer`}
          >
            <Redo size={14} />
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800 mx-1"></div>

          {/* Text treatments */}
          <button onClick={() => insertMarkdown("**", "**")} title="Bold" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <Bold size={14} />
          </button>
          <button onClick={() => insertMarkdown("*", "*")} title="Italic" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <Italic size={14} />
          </button>
          <button onClick={() => insertMarkdown("__", "__")} title="Underline" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <Underline size={14} />
          </button>
          
          <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800 mx-1"></div>

          {/* Block structures */}
          <button onClick={() => insertMarkdown("# ")} title="Header 1" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <Heading1 size={14} />
          </button>
          <button onClick={() => insertMarkdown("## ")} title="Header 2" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <Heading2 size={14} />
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800 mx-1"></div>

          {/* Lists */}
          <button onClick={() => insertMarkdown("- ")} title="Bullet List" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <List size={14} />
          </button>
          <button onClick={() => insertMarkdown("1. ")} title="Numbered List" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <ListOrdered size={14} />
          </button>
          <button onClick={() => insertMarkdown("- [ ] ")} title="Checklist" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <CheckSquare size={14} />
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800 mx-1"></div>

          {/* Blocks & Attachments */}
          <button onClick={() => insertMarkdown("```typescript\n", "\n```")} title="Code Block" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <Code size={14} />
          </button>
          <button onClick={() => insertMarkdown("| Header 1 | Header 2 |\n|---|---|\n| Value 1 | Value 2 |\n")} title="Insert Table" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <TableIcon size={14} />
          </button>
          <button onClick={() => insertMarkdown("[Link Text](", ")")} title="Add Link" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <Link size={14} />
          </button>
          <button onClick={() => setIsImageModalOpen(true)} title="Insert/Upload Image" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <Image size={14} />
          </button>
          <button onClick={handleFileUploadMock} title="Attach Simulated File" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 cursor-pointer">
            <Paperclip size={14} />
          </button>

          <span className="ml-auto text-[10px] font-mono opacity-50">
            Type <strong className="text-blue-500">/</strong> for blocks
          </span>
        </div>
      )}

      {/* Main Workspace split */}
      <div className="flex-grow flex min-h-0 relative">
        
        {/* EDIT PANE */}
        {(viewMode === "edit" || viewMode === "split") && (
          <div
            style={{ width: viewMode === "split" ? `${splitPercentage}%` : "100%", flexGrow: viewMode === "split" ? 0 : 1, flexShrink: 0 }}
            className="h-full flex flex-col p-6 overflow-hidden relative"
          >
            {note.isLocked && (
              <div className="mb-4 px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2 select-none shadow-xs animate-fade-in">
                <Lock size={12} className="flex-shrink-0" />
                <span>This note is locked. Unlock it from the actions menu (⋮) to edit contents.</span>
              </div>
            )}

            {isFocusMode && (
              <input
                type="text"
                value={note.title}
                onChange={(e) => onUpdateNote({ ...note, title: e.target.value, updatedAt: new Date().toISOString() })}
                onBlur={(e) => {
                  if (!e.target.value.trim()) {
                    onUpdateNote({ ...note, title: "Untitled Note", updatedAt: new Date().toISOString() });
                  }
                }}
                className="font-display font-bold text-2xl border-none outline-none focus:ring-0 bg-transparent text-slate-900 dark:text-zinc-100 placeholder-slate-400 w-full mb-6 pb-2 border-b border-slate-100 dark:border-zinc-800"
                placeholder="Untitled Note"
                readOnly={note.isLocked}
              />
            )}
            <textarea
              id="note-editor-textarea"
              ref={textareaRef}
              value={note.content}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              readOnly={note.isLocked}
              className={`w-full flex-grow resize-none border-none outline-none focus:ring-0 text-[14.5px] leading-relaxed font-mono placeholder:italic ${
                note.isLocked ? "opacity-65 cursor-not-allowed" : ""
              } ${
                theme === "dark" ? "text-zinc-300 placeholder-zinc-600" : "text-slate-800 placeholder-slate-400"
              }`}
              placeholder="Start writing your next masterpiece here..."
            />

            {/* Floating Notion-like Slash Menu */}
            {showSlashMenu && (
              <div
                id="slash-commands-dropdown"
                ref={slashMenuRef}
                style={{ top: slashMenuCoords.top, left: slashMenuCoords.left }}
                className={`absolute z-50 w-52 p-1 rounded-xl shadow-xl border flex flex-col ${
                  theme === "dark"
                    ? "bg-zinc-900 border-zinc-800 text-zinc-300"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase px-2 py-1.5 border-b border-slate-100 dark:border-zinc-800">
                  Basic Blocks
                </div>
                {[
                  { id: "h1", label: "Heading 1", sub: "# Title" },
                  { id: "h2", label: "Heading 2", sub: "## Subsection" },
                  { id: "todo", label: "Checklist Item", sub: "- [ ] Task" },
                  { id: "bullet", label: "Bullet Point", sub: "- Item" },
                  { id: "code", label: "Code Block", sub: "``` Javascript" },
                  { id: "table", label: "Data Table", sub: "Columns and rows" },
                  { id: "quote", label: "Blockquote", sub: "> Highlighted text" },
                ].map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={() => handleInsertSlashCommand(cmd.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex flex-col transition-colors ${
                      theme === "dark" ? "hover:bg-zinc-800" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="font-semibold text-slate-900 dark:text-zinc-100">{cmd.label}</span>
                    <span className="text-[10px] opacity-60">{cmd.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Draggable Divider for split view */}
        {viewMode === "split" && (
          <div
            className="w-1.5 h-full hover:bg-blue-500/20 active:bg-blue-500/40 cursor-col-resize transition-colors flex-shrink-0 select-none flex items-center justify-center relative group"
            onMouseDown={handleDividerMouseDown}
          >
            <div className="w-[1px] h-full bg-slate-200 dark:bg-zinc-800 group-hover:bg-blue-500"></div>
          </div>
        )}

        {/* PREVIEW PANE */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div
            style={{ width: viewMode === "split" ? `${100 - splitPercentage}%` : "100%", flexGrow: viewMode === "split" ? 0 : 1, flexShrink: 0 }}
            className="h-full overflow-y-auto bg-slate-50/20 dark:bg-zinc-950/10"
          >
            {renderRichPreview()}
          </div>
        )}

        {/* Version History side-drawer overlay */}
        {showHistory && (
          <div
            id="version-history-drawer"
            className={`absolute top-0 right-0 w-80 h-full border-l z-30 shadow-2xl p-4 flex flex-col ${
              theme === "dark"
                ? "bg-zinc-950 border-zinc-800 text-zinc-300"
                : "bg-white border-slate-200 text-slate-700"
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800 mb-4">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <History size={15} />
                Version History
              </h4>
              <button
                onClick={() => setShowHistory(false)}
                className="text-xs opacity-60 hover:opacity-100"
              >
                Close
              </button>
            </div>
            
            <p className="text-xs opacity-60 mb-3 leading-relaxed">
              We capture significant snapshots automatically as you draft. Click any record to roll back content instantly.
            </p>

            {/* Filters Section */}
            <div className="flex flex-col gap-2 mb-4">
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Search snapshots content..."
                className={`w-full px-2.5 py-1.5 rounded-xl border outline-none text-xs ${
                  theme === "dark" ? "bg-zinc-900 border-zinc-850 text-zinc-300 placeholder-zinc-600" : "bg-slate-50 border-slate-200 text-slate-700 placeholder-slate-400"
                }`}
              />
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-semibold">Size Range:</span>
                <select
                  value={historySizeFilter}
                  onChange={(e) => setHistorySizeFilter(e.target.value as any)}
                  className={`flex-grow px-2 py-1 rounded-lg border outline-none text-[11px] font-semibold cursor-pointer ${
                    theme === "dark" ? "bg-zinc-900 border-zinc-850 text-zinc-300" : "bg-slate-50 border-slate-200 text-slate-700"
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
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      theme === "dark"
                        ? "bg-zinc-900 border-zinc-800 hover:border-zinc-600"
                        : "bg-slate-50 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <Clock size={12} />
                      {new Date(version.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                    <div className="text-[11px] opacity-60 mt-1">
                      {new Date(version.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })} • {version.content.length} characters
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-center opacity-40">
                  <Info size={18} className="mb-1" />
                  <span className="text-[11px]">No matching snapshots found</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      {!isFocusMode && (
        <div className={`px-6 py-2 border-t flex items-center justify-between text-xs select-none ${
          theme === "dark"
            ? "border-zinc-800/80 bg-[#09090b] text-zinc-500"
            : "border-slate-200/60 bg-[#FAFAFC] text-slate-400"
        }`}>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="font-semibold text-slate-700 dark:text-zinc-400">{note.wordCount}</span> words
            </span>
            <span className="flex items-center gap-1">
              <span className="font-semibold text-slate-700 dark:text-zinc-400">{note.readingTime}</span> min read
            </span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[10.5px]">
            <span>Category: <strong>{note.folder}</strong></span>
            <span>Tags: <strong>{note.tags.join(", ") || "(None)"}</strong></span>
            <span>Modified: {new Date(note.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
      )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <div
        className={`w-full max-w-md rounded-3xl shadow-2xl border overflow-hidden p-5 flex flex-col gap-4 animate-fade-in ${
          theme === "dark" ? "bg-[#141416] border-zinc-800 text-zinc-200" : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 dark:border-zinc-800/80">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Upload size={14} className="text-blue-500" />
            Upload & Edit Image
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-805 text-slate-500 cursor-pointer">
            <X size={14} />
          </button>
        </div>

        {/* Tabs switcher */}
        <div className="flex border-b border-slate-100 dark:border-zinc-800/80">
          <button
            onClick={() => {
              setActiveTab("upload");
              setError("");
            }}
            className={`flex-grow pb-2 text-xs font-semibold text-center border-b-2 cursor-pointer transition-all ${
              activeTab === "upload"
                ? "border-blue-500 text-blue-500"
                : "border-transparent text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400"
            }`}
          >
            Upload to ImgBB
          </button>
          <button
            onClick={() => {
              setActiveTab("url");
              setError("");
            }}
            className={`flex-grow pb-2 text-xs font-semibold text-center border-b-2 cursor-pointer transition-all ${
              activeTab === "url"
                ? "border-blue-500 text-blue-500"
                : "border-transparent text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400"
            }`}
          >
            Insert Image URL
          </button>
        </div>

        {error && (
          <div className="p-3 text-[11px] font-semibold border border-rose-500/20 bg-rose-500/5 text-rose-500 rounded-xl leading-relaxed">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3.5 text-xs">
          {activeTab === "upload" ? (
            <>
              {/* ImgBB API Key Field */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">ImgBB API Key</label>
                  <a
                    href="https://api.imgbb.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9.5px] text-blue-500 hover:underline font-semibold"
                  >
                    Get Key
                  </a>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste your 32-character ImgBB API key..."
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-mono ${
                    theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300 placeholder-zinc-700" : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                  }`}
                />
              </div>

              {/* File Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Select Image</label>
                <div className="flex items-center gap-2">
                  <label
                    className={`flex-grow px-3 py-2 rounded-xl border border-dashed flex items-center justify-center gap-1.5 cursor-pointer text-center text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors ${
                      file ? "border-emerald-500 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" : "border-slate-300 dark:border-zinc-800"
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
              <label className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Image Address (URL)</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className={`w-full px-3 py-2 rounded-xl border outline-none ${
                  theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300 placeholder-zinc-700" : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                }`}
              />
            </div>
          )}

          {/* EDIT DETAILS SECTION (Alt text, width, alignment) */}
          <div className="border-t border-slate-100 dark:border-zinc-800/85 pt-3 flex flex-col gap-3">
            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Image Configurations</span>

            {/* Alt / Caption */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">Caption / Alternative text</label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Optional description of the image"
                className={`w-full px-3 py-2 rounded-xl border outline-none ${
                  theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300 placeholder-zinc-700" : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Width / Height */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">Width (e.g. 300, 100%)</label>
                <input
                  type="text"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="Auto"
                  className={`w-full px-3 py-1.5 rounded-xl border outline-none ${
                    theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                />
              </div>

              {/* Alignment */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">Alignment</label>
                <select
                  value={align}
                  onChange={(e) => setAlign(e.target.value as any)}
                  className={`w-full px-3 py-1.5 rounded-xl border outline-none font-semibold ${
                    theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-slate-50 border-slate-200 text-slate-800"
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
        <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800/80 animate-fade-in">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border ${
              theme === "dark" ? "border-zinc-800 text-zinc-400 hover:bg-zinc-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleUploadAndInsert}
            disabled={isUploading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
