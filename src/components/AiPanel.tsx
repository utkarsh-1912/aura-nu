import React, { useState } from "react";
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  ListTodo,
  FileText,
  Languages,
  Tags,
  FolderPlus,
  Send,
  MessageSquare,
  HelpCircle,
  AlertCircle,
  Copy,
  ChevronRight,
  BookOpen,
  ArrowRight
} from "lucide-react";
import { Note } from "../types";

interface AiPanelProps {
  note: Note | null;
  onUpdateNote: (updatedNote: Note) => void;
  onClose: () => void;
  theme: "light" | "dark";
  onAddToast: (message: string, type: "success" | "info" | "error") => void;
}

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
}

export default function AiPanel({
  note,
  onUpdateNote,
  onClose,
  theme,
  onAddToast,
}: AiPanelProps) {
  const [selectedLanguage, setSelectedLanguage] = useState("Spanish");
  const [isLoading, setIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<"shortcuts" | "chat">("shortcuts");
  
  // Chat state
  const [chatQuery, setChatQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const handleAiAction = async (action: string, options: { language?: string } = {}) => {
    if (!note) {
      onAddToast("Please open a note first.", "error");
      return;
    }

    setIsLoading(true);
    setAiResponse(null);

    try {
      const response = await fetch("/api/ai/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          content: note.content,
          language: options.language,
        }),
      });

      const data = await response.json();
      if (response.ok && data.result) {
        setAiResponse(data.result);
        onAddToast(`AI ${action.charAt(0).toUpperCase() + action.slice(1)} completed!`, "success");

        // Special handlers to auto-apply outcomes
        if (action === "tags") {
          try {
            // Parser of JSON array
            const parsedTags = JSON.parse(data.result);
            if (Array.isArray(parsedTags)) {
              onUpdateNote({
                ...note,
                tags: Array.from(new Set([...note.tags, ...parsedTags])),
                updatedAt: new Date().toISOString(),
              });
              onAddToast("Applied suggested tags!", "success");
            }
          } catch (e) {
            console.error("Tags parser error, display as raw:", e);
          }
        } else if (action === "folders") {
          try {
            const parsed = JSON.parse(data.result);
            if (parsed.suggestedFolder) {
              onUpdateNote({
                ...note,
                folder: parsed.suggestedFolder,
                updatedAt: new Date().toISOString(),
              });
              onAddToast(`Moved to smart category: ${parsed.suggestedFolder}`, "success");
            }
          } catch (e) {
            console.error("Folder parser error:", e);
          }
        }
      } else {
        throw new Error(data.error || "Failed to generate AI action.");
      }
    } catch (error: any) {
      console.error(error);
      onAddToast(error.message || "AI model is busy. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatQuery.trim()) return;

    const userMsg = chatQuery.trim();
    setChatQuery("");
    setChatHistory((prev) => [...prev, { sender: "user", text: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          content: note ? note.content : "",
          userQuery: userMsg,
        }),
      });

      const data = await response.json();
      if (response.ok && data.result) {
        setChatHistory((prev) => [...prev, { sender: "ai", text: data.result }]);
      } else {
        throw new Error(data.error || "Failed to connect to AI chat.");
      }
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        { sender: "ai", text: `⚠️ Error: ${err.message || "AI is offline"}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    onAddToast("Copied to clipboard!", "success");
  };

  const appendToCurrentNote = (text: string) => {
    if (!note) return;
    onUpdateNote({
      ...note,
      content: note.content + "\n\n### AI Assistant Output:\n" + text,
      updatedAt: new Date().toISOString(),
    });
    onAddToast("Appended to current note!", "success");
  };

  const replaceNoteContent = (text: string) => {
    if (!note) return;
    onUpdateNote({
      ...note,
      content: text,
      updatedAt: new Date().toISOString(),
    });
    onAddToast("Replaced note with AI draft!", "success");
  };

  const shortcuts = [
    {
      id: "summarize",
      label: "Summarize Note",
      desc: "Distill content to core bullets & TL;DR",
      icon: FileText,
      color: "text-blue-500 bg-blue-500/10",
    },
    {
      id: "action-items",
      label: "Extract Action Items",
      desc: "Construct tasks and assign checklist",
      icon: ListTodo,
      color: "text-emerald-500 bg-emerald-500/10",
    },
    {
      id: "meeting-summary",
      label: "Format Strategy Minutes",
      desc: "Turn raw scribbles to structured sync outcomes",
      icon: BookOpen,
      color: "text-purple-500 bg-purple-500/10",
    },
    {
      id: "improve",
      label: "Polish Prose & Style",
      desc: "Fix sentence grammar, clarity, & flow",
      icon: RefreshCw,
      color: "text-rose-500 bg-rose-500/10",
    },
    {
      id: "rewrite",
      label: "Executive Rewrite",
      desc: "Formalize voice for boardrooms & clients",
      icon: Sparkles,
      color: "text-amber-500 bg-amber-500/10",
    },
  ];

  return (
    <div
      id="ai-panel"
      className={`w-[360px] h-full border-l flex flex-col flex-shrink-0 transition-all z-10 select-none ${
        theme === "dark"
          ? "bg-[#18181b] border-zinc-800 text-zinc-100"
          : "bg-white border-slate-200 text-slate-800"
      }`}
    >
      {/* Top Header */}
      <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white">
            <Sparkles size={13} className="animate-pulse" />
          </div>
          <span className="font-display font-semibold text-sm tracking-tight text-slate-900 dark:text-zinc-100">
            Aura AI Assistant
          </span>
        </div>
        <button
          id="ai-panel-close-btn"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-zinc-800 p-1">
        <button
          onClick={() => setCurrentTab("shortcuts")}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
            currentTab === "shortcuts"
              ? theme === "dark"
                ? "bg-zinc-800 text-white font-semibold"
                : "bg-slate-100 text-slate-950 font-semibold"
              : "text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300"
          } cursor-pointer`}
        >
          <Sparkles size={12} />
          Smart Shortcuts
        </button>
        <button
          onClick={() => setCurrentTab("chat")}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
            currentTab === "chat"
              ? theme === "dark"
                ? "bg-zinc-800 text-white font-semibold"
                : "bg-slate-100 text-slate-950 font-semibold"
              : "text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300"
          } cursor-pointer`}
        >
          <MessageSquare size={12} />
          In-Context Chat
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4">
        {currentTab === "shortcuts" ? (
          <>
            {/* Shortcut grid */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                One-Click Actions
              </span>
              {shortcuts.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => handleAiAction(sc.id)}
                  className={`w-full text-left p-3 rounded-xl border flex items-start gap-3 transition-all ${
                    theme === "dark"
                      ? "bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-800/40 hover:border-zinc-700 text-zinc-300"
                      : "bg-slate-50 border-slate-200/50 hover:bg-slate-100/40 hover:border-slate-300 text-slate-700"
                  } cursor-pointer`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${sc.color} flex-shrink-0`}>
                    <sc.icon size={15} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">{sc.label}</span>
                    <span className="text-[11px] opacity-60 leading-tight mt-0.5">{sc.desc}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Smart categorization */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                Smart Suggestions
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleAiAction("tags")}
                  className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 justify-center transition-all ${
                    theme === "dark"
                      ? "bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-800/40"
                      : "bg-slate-50 border-slate-200/50 hover:bg-slate-100/40"
                  } cursor-pointer`}
                >
                  <Tags size={13} className="text-blue-500" />
                  <span>Generate Tags</span>
                </button>
                <button
                  onClick={() => handleAiAction("folders")}
                  className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 justify-center transition-all ${
                    theme === "dark"
                      ? "bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-800/40"
                      : "bg-slate-50 border-slate-200/50 hover:bg-slate-100/40"
                  } cursor-pointer`}
                >
                  <FolderPlus size={13} className="text-purple-500" />
                  <span>Suggest Folder</span>
                </button>
              </div>
            </div>

            {/* Language translation */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                Language Translation
              </span>
              <div className="flex gap-1.5">
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className={`flex-grow text-xs p-2 rounded-xl border outline-none ${
                    theme === "dark"
                      ? "bg-zinc-950 border-zinc-800 text-zinc-300"
                      : "bg-slate-100/60 border-slate-200 text-slate-700"
                  }`}
                >
                  {["Spanish", "French", "Japanese", "German", "Mandarin", "Italian", "Portuguese"].map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleAiAction("translate", { language: selectedLanguage })}
                  className="px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <Languages size={13} />
                  Translate
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Chat mode workspace */
          <div className="flex-grow flex flex-col min-h-0">
            <div className="flex-grow overflow-y-auto flex flex-col gap-3 pb-4">
              {chatHistory.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-center opacity-40 p-4">
                  <HelpCircle size={24} className="mb-2" />
                  <span className="text-xs font-medium">Ask Aura anything about this Note</span>
                  <p className="text-[10px] mt-1 max-w-[200px]">
                    "Summarize Sarah's points", "Generate a tweet draft from this", or "Convert tasks to table format".
                  </p>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl text-xs max-w-[85%] leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-blue-500 text-white ml-auto"
                        : theme === "dark"
                        ? "bg-zinc-900 border border-zinc-800/80 text-zinc-200"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    {msg.sender === "ai" && (
                      <div className="mt-2.5 pt-1.5 border-t border-slate-200/40 dark:border-zinc-800/80 flex justify-end gap-2">
                        <button
                          onClick={() => copyToClipboard(msg.text)}
                          title="Copy reply"
                          className="text-[10px] opacity-60 hover:opacity-100 flex items-center gap-0.5"
                        >
                          <Copy size={10} />
                          Copy
                        </button>
                        {note && (
                          <button
                            onClick={() => appendToCurrentNote(msg.text)}
                            title="Append to active note"
                            className="text-[10px] text-blue-500 font-medium flex items-center gap-0.5"
                          >
                            <ArrowRight size={10} />
                            Append
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Input form */}
            <form onSubmit={handleSendChat} className="flex gap-2.5 mt-auto pt-2 border-t border-slate-100 dark:border-zinc-800">
              <input
                type="text"
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
                placeholder="Ask about this document..."
                className={`flex-grow text-xs px-3 py-2.5 rounded-xl border outline-none ${
                  theme === "dark"
                    ? "bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-600"
                    : "bg-slate-100/60 border-slate-200 text-slate-800 focus:bg-white focus:border-blue-400"
                }`}
              />
              <button
                type="submit"
                disabled={!chatQuery.trim() || isLoading}
                className={`p-2.5 rounded-xl text-white shadow-sm transition-all ${
                  !chatQuery.trim() || isLoading
                    ? "bg-slate-200 dark:bg-zinc-800 text-slate-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 active:scale-[0.98] cursor-pointer"
                }`}
              >
                <Send size={13} />
              </button>
            </form>
          </div>
        )}

        {/* AI Output / Result Panel for Shortcuts */}
        {currentTab === "shortcuts" && (aiResponse || isLoading) && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col flex-shrink-0 min-h-0">
            <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
              AI Insight Output
            </span>

            {isLoading ? (
              /* Shimmering Skeleton loader */
              <div className="shimmer-bg p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-100 dark:border-zinc-800/60 flex flex-col gap-2.5">
                <div className="h-3 w-1/3 bg-slate-200 dark:bg-zinc-800 rounded-full"></div>
                <div className="h-2 w-full bg-slate-200 dark:bg-zinc-800 rounded-full"></div>
                <div className="h-2 w-5/6 bg-slate-200 dark:bg-zinc-800 rounded-full"></div>
                <div className="h-2 w-4/5 bg-slate-200 dark:bg-zinc-800 rounded-full"></div>
              </div>
            ) : (
              aiResponse && (
                <div
                  className={`p-4 rounded-2xl text-xs max-h-[300px] overflow-y-auto leading-relaxed border ${
                    theme === "dark"
                      ? "bg-zinc-950 border-zinc-800/80 text-zinc-200"
                      : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap font-sans">{aiResponse}</p>

                  <div className="mt-4 pt-2.5 border-t border-slate-200/60 dark:border-zinc-800 flex justify-end gap-2">
                    <button
                      onClick={() => copyToClipboard(aiResponse)}
                      className="px-2.5 py-1.5 hover:bg-slate-200/50 dark:hover:bg-zinc-850 rounded-lg flex items-center gap-1 font-medium text-slate-600 dark:text-zinc-400 cursor-pointer"
                    >
                      <Copy size={11} />
                      Copy
                    </button>
                    {note && (
                      <>
                        <button
                          onClick={() => appendToCurrentNote(aiResponse)}
                          className="px-2.5 py-1.5 hover:bg-slate-200/50 dark:hover:bg-zinc-850 rounded-lg flex items-center gap-1 text-blue-500 font-semibold cursor-pointer"
                        >
                          Append
                        </button>
                        <button
                          onClick={() => replaceNoteContent(aiResponse)}
                          className="px-2.5 py-1.5 hover:bg-rose-100/50 dark:hover:bg-rose-950/20 rounded-lg flex items-center gap-1 text-rose-500 font-semibold cursor-pointer"
                        >
                          Replace
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
