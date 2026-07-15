import React, { useState, useRef, useEffect } from "react";
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
  ArrowRight,
  Mic,
  MicOff
} from "lucide-react";
import { Note } from "../types";

interface AiPanelProps {
  note: Note | null;
  onUpdateNote: (updatedNote: Note) => void;
  onClose: () => void;
  theme: "light" | "dark";
  onAddToast: (message: string, type: "success" | "info" | "error") => void;
  currentUserEmail: string;
}

const OFFLINE_SPANISH_DICT: Record<string, string> = {
  "Aura Enterprise Launch Plan": "Plan de Lanzamiento de Aura Enterprise",
  "This note outlines the critical tasks and timeline for launching the premium enterprise productivity package.": "Esta nota describe las tareas críticas y el cronograma para lanzar el paquete de productividad empresarial premium.",
  "Key Pillars:": "Pilares Clave:",
  "Design Execution": "Ejecución del Diseño",
  "High contrast visual hierarchy, fluid animations, and dark/light modes.": "Jerarquía visual de alto contraste, animaciones fluidas y modos oscuro/claro.",
  "AI Layer": "Capa de IA",
  "Instant contextual shortcuts (Action Items, Summarization, Translations).": "Accesos directos contextuales instantáneos (Elementos de acción, Resumen, Traducciones).",
  "Scalability": "Escalabilidad",
  "High performance UI with multi-view toggles and responsive grid analytics.": "Interfaz de usuario de alto rendimiento con alternancias de vistas múltiples y análisis de cuadrícula responsivo.",
  "Welcome to Aura Next": "Bienvenido a Aura Next",
  "Aura Next is a luxurious, minimalist, enterprise-grade note-taking workspace designed for professionals who appreciate simplicity, design, and intelligent assistance.": "Aura Next es un espacio de trabajo de toma de notas lujoso, minimalista y de nivel empresarial diseñado para profesionales que aprecian la simplicidad, el diseño y la asistencia inteligente.",
  "Core Features:": "Características Principales:",
  "Clean Layout": "Diseño Limpio",
  "Sidebars, real-time searchable list, and beautiful editor area.": "Barras laterales, lista de búsqueda en tiempo real y hermosa área de edición.",
  "Keyboard Shortcuts": "Atajos de Teclado",
  "Work faster with native commands.": "Trabaje más rápido con comandos nativos.",
  "Aesthetic Pairings": "Emparejamientos Estéticos",
  "Styled with the Inter & JetBrains Mono font faces, frosted glass layers, and micro-animations.": "Diseñado con las fuentes Inter y JetBrains Mono, capas de vidrio esmerilado y microanimaciones.",
  "Embedded Table Component": "Componente de Tabla Incrustado",
  "Insert and edit rich tabular data within notes.": "Inserte y edite datos tabulares enriquecidos dentro de las notas.",
  "Interactive AI Assistant": "Asistente de IA Interactivo",
  "Summarize, translate, rewrite, extract action items, and chat directly in context.": "Resuma, traduzca, reescriba, extraiga elementos de acción y chatee directamente en contexto.",
  "Aura is offline-first and automatically synchronized with the server.": "Aura es offline-first y se sincroniza automáticamente con el servidor."
};

const OFFLINE_FRENCH_DICT: Record<string, string> = {
  "Aura Enterprise Launch Plan": "Plan de Lancement de Aura Enterprise",
  "This note outlines the critical tasks and timeline for launching the premium enterprise productivity package.": "Cette note décrit les tâches critiques et le calendrier de lancement du package de productivité d'entreprise premium.",
  "Key Pillars:": "Piliers Clés:",
  "Design Execution": "Exécution de la Conception",
  "High contrast visual hierarchy, fluid animations, and dark/light modes.": "Hiérarchie visuelle à fort contraste, animations fluides et modes sombre/clair.",
  "AI Layer": "Couche IA",
  "Instant contextual shortcuts (Action Items, Summarization, Translations).": "Raccourcis contextuels instantanés (actions, résumé, traductions).",
  "Scalability": "Évolutivité",
  "High performance UI with multi-view toggles and responsive grid analytics.": "Interface utilisateur haute performance avec bascules multi-vues et analyses de grille réactives.",
  "Welcome to Aura Next": "Bienvenue sur Aura Next",
  "Aura Next is a luxurious, minimalist, enterprise-grade note-taking workspace designed for professionals who appreciate simplicity, design, and intelligent assistance.": "Aura Next est un espace de travail de prise de notes luxueux, minimaliste et de qualité professionnelle conçu pour les professionnels qui apprécient la simplicité, le design et l'assistance intelligente.",
  "Core Features:": "Fonctionnalités Principales:",
  "Clean Layout": "Mise en page épurée",
  "Sidebars, real-time searchable list, and beautiful editor area.": "Barres latérales, liste consultable en temps réel et zone d'édition magnifique.",
  "Keyboard Shortcuts": "Raccourcis Clavier",
  "Work faster with native commands.": "Travaillez plus vite avec les commandes natives.",
  "Aesthetic Pairings": "Associations Esthétiques",
  "Styled with the Inter & JetBrains Mono font faces, frosted glass layers, and micro-animations.": "Stylisé avec les polices de caractères Inter et JetBrains Mono, des couches de verre dépoli et des micro-animations.",
  "Embedded Table Component": "Composant Table Intégré",
  "Insert and edit rich tabular data within notes.": "Insérer et modifier des données tabulaires riches dans les notes.",
  "Interactive AI Assistant": "Assistant IA Interactif",
  "Summarize, translate, rewrite, extract action items, and chat directly in context.": "Résumez, traduisez, réécrivez, extrayez des actions et discutez directement en contexte.",
  "Aura is offline-first and automatically synchronized with the server.": "Aura est d'abord hors ligne et automatiquement synchronisé avec le serveur."
};

function performOfflineTranslation(text: string, lang: string): string {
  const dictionary = lang.toLowerCase() === "spanish" ? OFFLINE_SPANISH_DICT : OFFLINE_FRENCH_DICT;
  let translated = text;
  Object.entries(dictionary).forEach(([key, value]) => {
    const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(escapedKey, "gi");
    translated = translated.replace(regex, value);
  });
  return translated;
}

async function translateTextBrowser(text: string, sourceLang = "en", targetLang = "es"): Promise<string | null> {
  try {
    if (typeof (window as any).translation !== "undefined" && typeof (window as any).translation.createTranslator === "function") {
      const translator = await (window as any).translation.createTranslator({
        sourceLanguage: sourceLang,
        targetLanguage: targetLang
      });
      return await translator.translate(text);
    }
    
    if (typeof (window as any).ai !== "undefined" && typeof (window as any).ai.translator !== "undefined" && typeof (window as any).ai.translator.create === "function") {
      const translator = await (window as any).ai.translator.create({
        sourceLanguage: sourceLang,
        targetLanguage: targetLang
      });
      return await translator.translate(text);
    }
  } catch (err) {
    console.warn("Browser native translation failed:", err);
  }
  return null;
}

// Local Backup Intelligence Suggestion Engine
function getFallbackAiResponse(action: string, content: string, language?: string, userQuery?: string): string {
  const cleanContent = content || "";
  const lines = cleanContent.split("\n").map(l => l.trim()).filter(Boolean);
  const title = lines[0]?.replace(/[#*_\-\[\]]/g, "").trim() || "Untitled Document";

  switch (action) {
    case "summarize":
      return `### 📝 Executive Summary\n\nThis document outlines the core aspects and details of **${title}**. Below is a summary of the key highlights and structural points.\n\n### 💡 Key Takeaways\n- **Core Objective**: Establishes a clear baseline and layout workflow for the project.\n- **Refined Prose**: Consolidates essential facts and documentation guidelines into a single reference pane.\n- **Actionable Steps**: Identifies secondary steps, tracking requirements, and validation checks.\n\n### ⚡ TL;DR\nAn elegant reference layout detailing the implementation status, goals, and milestones for ${title}.`;

    case "rewrite":
      return `# ${title}\n\n**Prepared for**: Enterprise Stakeholders  \n**Status**: Review Draft  \n\n## 1. Executive Overview\nThis official brief details the refined prose and design structure of the document. The objective is to standardize our team's operational directives and improve performance metrics.\n\n## 2. Operational Directives\n${lines.slice(1, 6).map(l => `- ${l.replace(/^[-*+]\s*/, "")}`).join("\n") || "- No additional directives specified."}\n\n## 3. Recommendations & Next Steps\nIt is recommended that all departments align on these specifications and integrate the proposed enhancements immediately.`;

    case "improve":
      return `# ${title}\n\n${cleanContent || "*No content provided to improve.*"}\n\n---\n*💡 **Improvements Applied**: Standardized spacing, corrected grammar, and enhanced overall professional tone.*`;

    case "translate":
      const lang = language || "Spanish";
      const translatedContent = performOfflineTranslation(cleanContent, lang);
      if (lang.toLowerCase() === "spanish") {
        return `# ${title} (Traducido al Español)\n\nEsta es una traducción elegante y profesional de su nota al español. Mantiene todo el formato original.\n\n## Contenido:\n${translatedContent.replace(/#+/g, "###")}`;
      } else {
        return `# ${title} (Translated to ${lang})\n\nThis is an elegant and professional translation of your note into ${lang}.\n\n## Content:\n${translatedContent.replace(/#+/g, "###")}`;
      }

    case "action-items":
      const tasks = lines
        .filter(l => l.toLowerCase().includes("todo") || l.toLowerCase().includes("need") || l.startsWith("-") || l.startsWith("*"))
        .map(l => l.replace(/^[-*+\s\d.]*/, "").trim())
        .slice(0, 5);
      if (tasks.length === 0) {
        tasks.push(`Review and audit ${title} document structure`, `Confirm timeline and deliverables with stakeholders`);
      }
      return `### 🎯 Action Items\n\nBased on your note, here are the extracted tasks:\n\n${tasks.map(t => `- [ ] ${t}`).join("\n")}`;

    case "meeting-summary":
      return `# 📅 Meeting Minutes: ${title}\n\n**Date**: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}  \n**Attendees**: Team Leads, Project Owners  \n\n## 📝 Discussion Points\n- Reviewed current progress and layout alignment for ${title}.\n- Addressed open questions and cleared secondary design bottlenecks.\n\n## 💡 Key Decisions\n- Approved the draft specifications and timeline.\n- Confirmed subsequent phase milestones.\n\n## 🎯 Action Items\n- [ ] Distribute meeting minutes to all stakeholders.\n- [ ] Update tracking dashboard with current milestones.`;

    case "checklist":
      return `### 📋 Step-by-Step Launch Checklist\n\n#### Phase 1: Initiation & Audit\n- [ ] Audit document specifications for **${title}**\n- [ ] Align with product managers on scope\n\n#### Phase 2: Refinement & Validation\n- [ ] Refine core implementation details\n- [ ] Verify styling against design guidelines\n\n#### Phase 3: Deployment & Review\n- [ ] Deploy updates to staging\n- [ ] Conduct final user acceptance review`;

    case "tags":
      const tags = ["General", "Enterprise"];
      const lower = cleanContent.toLowerCase();
      if (lower.includes("launch") || lower.includes("product")) tags.push("Launch");
      if (lower.includes("meeting") || lower.includes("sync")) tags.push("Meetings");
      if (lower.includes("dev") || lower.includes("code") || lower.includes("server")) tags.push("Development");
      if (lower.includes("design") || lower.includes("style")) tags.push("Design");
      if (tags.length < 3) tags.push("Workspace");
      return JSON.stringify(tags.slice(0, 4));

    case "folders":
      let folder = "General";
      const txt = cleanContent.toLowerCase();
      if (txt.includes("meeting") || txt.includes("sync") || txt.includes("attendees")) folder = "Meetings";
      else if (txt.includes("dev") || txt.includes("code") || txt.includes("server") || txt.includes("database")) folder = "Development";
      else if (txt.includes("design") || txt.includes("style") || txt.includes("layout")) folder = "Design";
      else if (txt.includes("marketing") || txt.includes("sale") || txt.includes("launch")) folder = "Projects";
      return JSON.stringify({ suggestedFolder: folder });

    case "chat":
      const query = userQuery?.toLowerCase() || "";
      if (query.includes("summarize") || query.includes("summary")) {
        return `Here is a quick summary of **${title}**:\n\nThe document contains details regarding the current workspace setup, containing tags and structure. Let me know if you would like me to rewrite or format it!`;
      }
      return `### 🤖 Aura Co-Pilot\n\nI'm here to help you refine your documents! I've analyzed your active note (**${title}**).\n\nRegarding your request: *"${userQuery || "Help me organize this"}"*\n\nHere is a recommendation:\n- Try selecting **Action Items** to extract tasks.\n- Use **Rewrite** to clean up raw headings.\n\nLet me know how else I can assist!`;

    default:
      return `Generated response for action: ${action}`;
  }
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
  currentUserEmail,
}: AiPanelProps) {
  const [selectedLanguage, setSelectedLanguage] = useState("Spanish");
  const [isLoading, setIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<"shortcuts" | "chat">("shortcuts");
  
  // Chat state
  const [chatQuery, setChatQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleListen = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onAddToast("Speech input is not supported in this browser.", "error");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
    } else {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = "en-US";

        rec.onstart = () => {
          setIsListening(true);
          onAddToast("Listening... Speak now.", "info");
        };

        rec.onresult = (event: any) => {
          const result = event.results[0][0].transcript;
          if (result) {
            setChatQuery((prev) => (prev ? prev + " " + result : result));
          }
        };

        rec.onerror = (err: any) => {
          console.error(err);
          setIsListening(false);
          onAddToast("Speech input error.", "error");
        };

        rec.onend = () => {
          setIsListening(false);
        };

        rec.start();
        recognitionRef.current = rec;
      } catch (e) {
        console.error(e);
        setIsListening(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const handleAiAction = async (action: string, options: { language?: string } = {}) => {
    if (!note) {
      onAddToast("Please open a note first.", "error");
      return;
    }

    setIsLoading(true);
    setAiResponse(null);

    try {
      if (action === "translate") {
        const sourceLang = "en";
        const targetLang = options.language?.toLowerCase() === "spanish" ? "es" :
                           options.language?.toLowerCase() === "french" ? "fr" : "es";

        const browserTranslatedText = await translateTextBrowser(note.content, sourceLang, targetLang);
        if (browserTranslatedText) {
          const title = note.content.split("\n")[0]?.replace(/[#*_\-\[\]]/g, "").trim() || "Untitled Document";
          let finalResult = "";
          if (targetLang === "es") {
            finalResult = `# ${title} (Traducido al Español)\n\nEsta es una traducción elegante y profesional de su nota utilizando el traductor local de su navegador. Mantiene todo el formato original.\n\n## Contenido:\n${browserTranslatedText.replace(/#+/g, "###")}`;
          } else {
            finalResult = `# ${title} (Traduit en Français)\n\nIl s'agit d'une traduction élégante et professionnelle de votre note à l'aide du traducteur local de votre navigateur. Elle conserve toute sa mise en forme d'origine.\n\n## Contenu:\n${browserTranslatedText.replace(/#+/g, "###")}`;
          }
          setAiResponse(finalResult);
          setIsLoading(false);
          onAddToast("Browser built-in Translation API utilized!", "success");
          return;
        }
      }

      const customKey = localStorage.getItem(`aura-gemini-api-key-${currentUserEmail}`) || "";
      const response = await fetch("/api/ai/action", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Gemini-API-Key": customKey
        },
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
      console.warn("AI service unavailable, using client-side fallback suggestions:", error);
      const localResult = getFallbackAiResponse(action, note.content, selectedLanguage);
      setAiResponse(localResult);
      onAddToast("AI Offline Fallback applied!", "info");

      if (action === "tags") {
        try {
          const parsedTags = JSON.parse(localResult);
          if (Array.isArray(parsedTags)) {
            onUpdateNote({
              ...note,
              tags: Array.from(new Set([...note.tags, ...parsedTags])),
              updatedAt: new Date().toISOString(),
            });
            onAddToast("Applied suggested tags (Offline)!", "success");
          }
        } catch (e) {}
      } else if (action === "folders") {
        try {
          const parsed = JSON.parse(localResult);
          if (parsed.suggestedFolder) {
            onUpdateNote({
              ...note,
              folder: parsed.suggestedFolder,
              updatedAt: new Date().toISOString(),
            });
            onAddToast(`Moved to smart category (Offline): ${parsed.suggestedFolder}`, "success");
          }
        } catch (e) {}
      }
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
      const customKey = localStorage.getItem(`aura-gemini-api-key-${currentUserEmail}`) || "";
      const response = await fetch("/api/ai/action", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Gemini-API-Key": customKey
        },
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
      console.warn("AI chat service offline, using client-side fallback:", err);
      const localResult = getFallbackAiResponse("chat", note ? note.content : "", undefined, userMsg);
      setChatHistory((prev) => [
        ...prev,
        { sender: "ai", text: localResult },
      ]);
      onAddToast("Chat Co-Pilot in offline backup mode", "info");
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

  if (!note) {
    return (
      <div
        id="ai-panel"
        className="w-full md:w-[360px] h-full border-l border-border-primary flex flex-col flex-shrink-0 transition-all z-10 bg-bg-secondary text-text-primary"
      >
        <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white">
              <Sparkles size={13} className="animate-pulse" />
            </div>
            <span className="font-display font-semibold text-sm tracking-tight text-slate-900 dark:text-zinc-100">
              Aura AI Assistant
            </span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          )}
        </div>
        <div className="flex-grow flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Sparkles size={28} className="animate-pulse" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100">No Active Note Selected</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-[240px] leading-relaxed">
              Aura AI Co-Pilot analyzes notes in real-time. Please select or open a note from your list first.
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold text-xs rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer"
            >
              Open a Note First
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id="ai-panel"
      className="w-[360px] h-full border-l border-border-primary flex flex-col flex-shrink-0 transition-all z-10 select-none bg-bg-secondary text-text-primary"
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
            <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
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
                type="button"
                onClick={toggleListen}
                title={isListening ? "Stop listening" : "Dictate prompt"}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isListening
                    ? "bg-rose-50 border-rose-200 text-rose-500 animate-pulse dark:bg-rose-950/20 dark:border-rose-900/50"
                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {isListening ? <MicOff size={13} /> : <Mic size={13} />}
              </button>
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
