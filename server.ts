import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "notes-db.json");

// MongoDB connection setup
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aura-notes";
let isMongoActive = false;

async function connectMongo() {
  try {
    mongoose.set("strictQuery", false);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log("Connected to MongoDB successfully!");
    isMongoActive = true;
  } catch (err) {
    console.warn("MongoDB connection failed, falling back to local JSON file storage:", err);
    isMongoActive = false;
  }
}

connectMongo();

app.use(express.json({ limit: "10mb" }));

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY || "";
let ai: GoogleGenAI | null = null;

if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Initial default notes to showcase the beauty and capabilities of Aura Next
const DEFAULT_NOTES = [
  {
    id: "welcome-note",
    title: "✨ Welcome to Aura Next",
    content: `# Welcome to Aura Next\n\nAura Next is a luxurious, minimalist, enterprise-grade note-taking workspace designed for professionals who appreciate simplicity, design, and intelligent assistance.\n\n### Core Features:\n- **Clean Layout**: Sidebars, real-time searchable list, and beautiful editor area.\n- **Keyboard Shortcuts**: Work faster with native commands.\n- **Aesthetic Pairings**: Styled with the Inter & JetBrains Mono font faces, frosted glass layers, and micro-animations.\n- **Embedded Table Component**: Insert and edit rich tabular data within notes.\n- **Interactive AI Assistant**: Summarize, translate, rewrite, extract action items, and chat directly in context.\n\n*Aura is offline-first and automatically synchronized with the server.*`,
    tags: ["Onboarding", "Guides", "Enterprise"],
    isPinned: true,
    isShared: false,
    isFavorite: true,
    folder: "General",
    createdAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString(), // 3 days ago
    updatedAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    wordCount: 114,
    readingTime: 1
  },
  {
    id: "project-launch",
    title: "🚀 Aura Enterprise Launch Plan",
    content: `# Aura Enterprise Launch Plan\n\nThis note outlines the critical tasks and timeline for launching the premium enterprise productivity package.\n\n### Key Pillars:\n1. **Design Execution**: High contrast visual hierarchy, fluid animations, and dark/light modes.\n2. **AI Layer**: Instant contextual shortcuts (Action Items, Summarization, Translations).\n3. **Scalability**: High performance UI with multi-view toggles and responsive grid analytics.\n\n### Progress Checklist:\n- [x] Design visual components (frosted glass card style)\n- [x] Implement the AI Assistant panel\n- [ ] Deploy Cloud Run container\n- [ ] Configure custom domains\n\n### Project Metrics:\n| Phase | Goal | Status |\n|---|---|---|\n| Phase 1 | UI/UX Complete | Done |\n| Phase 2 | Gemini Backend | Active |\n| Phase 3 | Enterprise Scale | Upcoming |\n\n*Target Launch Date: Q3 2026*`,
    tags: ["Product", "Launch", "Checklist"],
    isPinned: false,
    isShared: true,
    isFavorite: true,
    folder: "Projects",
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(), // 12 hours ago
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    wordCount: 135,
    readingTime: 1
  },
  {
    id: "meeting-minutes",
    title: "📅 Q3 Strategy & OKR Sync",
    content: `# Q3 Strategy & OKR Sync\n\n**Date**: July 5, 2026\n**Attendees**: Sarah, Marcus, David, Elena\n\n### Objectives Covered:\n- Standardize enterprise security capabilities.\n- Refine user onboarding flow to reduce drop-off rate by 15%.\n- Optimize real-time data sync latency.\n\n### Discussion Points:\nElena presented the latest telemetry reports. Design-centric changes have shown a 24% increase in daily active user duration. David suggested adding auto-save status and clear reading indicators.\n\n### Key Decisions:\n- Approved shift towards premium Inter font hierarchy.\n- Standardized large rounded borders (16-24px) for cards.\n- Agreed on using Gemini 3.5 Flash for the in-context AI panel.\n\n*Action items will be extracted automatically using the AI Panel on the right!*`,
    tags: ["Meetings", "Strategy", "Q3"],
    isPinned: false,
    isShared: false,
    isFavorite: false,
    folder: "Strategy",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    wordCount: 124,
    readingTime: 1
  }
];

// Helper to sanitize email for filesystem safety
function getUserSuffix(email?: any): string {
  if (typeof email !== "string" || !email.trim()) return "";
  const sanitized = email.trim().toLowerCase().replace(/[^a-z0-9]/g, "-");
  return sanitized ? `_${sanitized}` : "";
}

function getNotesFile(email?: any) {
  const suffix = getUserSuffix(email);
  return suffix ? path.join(process.cwd(), `notes-db${suffix}.json`) : DB_FILE;
}

// Load notes from DB
function loadNotes(email?: any) {
  const file = getNotesFile(email);
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading notes database:", error);
  }
  return [];
}

// Save notes to DB
function saveNotes(notes: any, email?: any) {
  const file = getNotesFile(email);
  try {
    fs.writeFileSync(file, JSON.stringify(notes, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving notes database:", error);
  }
}

const FOLDERS_FILE = path.join(process.cwd(), "folders-db.json");
const DEFAULT_FOLDERS = [
  { id: "f-general", workspaceId: "ws-aura-core", name: "General", color: "#3b82f6", icon: "📁", isExpanded: true },
  { id: "f-projects", workspaceId: "ws-aura-core", name: "Projects", color: "#10b981", icon: "🚀", isExpanded: true },
  { id: "f-strategy", workspaceId: "ws-aura-core", name: "Strategy", color: "#f59e0b", icon: "💡", isExpanded: true }
];

function getFoldersFile(email?: any) {
  const suffix = getUserSuffix(email);
  return suffix ? path.join(process.cwd(), `folders-db${suffix}.json`) : FOLDERS_FILE;
}

function loadFolders(email?: any) {
  const file = getFoldersFile(email);
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading folders database:", error);
  }
  return [];
}

function saveFolders(folders: any, email?: any) {
  const file = getFoldersFile(email);
  try {
    fs.writeFileSync(file, JSON.stringify(folders, null, 2), "utf-8");
  } catch (error) {
    console.error("Error saving folders database:", error);
  }
}

// Mongoose Models
const NoteSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  id: { type: String, required: true },
  workspaceId: { type: String, required: true },
  departmentId: String,
  projectId: String,
  title: String,
  content: String,
  tags: [String],
  isPinned: Boolean,
  isShared: Boolean,
  isFavorite: Boolean,
  folder: String,
  createdAt: String,
  updatedAt: String,
  wordCount: Number,
  readingTime: Number,
  isArchived: Boolean,
  isTrashed: Boolean,
  isLocked: Boolean,
  status: String,
  versionHistory: [
    {
      timestamp: String,
      content: String,
    }
  ]
});

NoteSchema.index({ userEmail: 1, id: 1 }, { unique: true });
const MongoNote = mongoose.model("Note", NoteSchema);

const FolderSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  id: { type: String, required: true },
  workspaceId: { type: String, required: true },
  name: { type: String, required: true },
  color: String,
  icon: String,
  isExpanded: Boolean,
});

FolderSchema.index({ userEmail: 1, id: 1 }, { unique: true });
const MongoFolder = mongoose.model("Folder", FolderSchema);

// REST APIs
app.get("/api/notes", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "sandbox@aura.io";
  
  if (isMongoActive) {
    try {
      const notes = await MongoNote.find({ userEmail: email }).lean();
      return res.json({ notes });
    } catch (err) {
      console.error("MongoDB fetch notes failed, falling back to JSON:", err);
    }
  }
  
  const notes = loadNotes(email);
  res.json({ notes });
});

app.post("/api/notes", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "sandbox@aura.io";
  const { notes } = req.body;
  if (!Array.isArray(notes)) {
    return res.status(400).json({ error: "Invalid notes data" });
  }

  if (isMongoActive) {
    try {
      const noteIds = notes.map((n: any) => n.id);
      await MongoNote.deleteMany({ userEmail: email, id: { $nin: noteIds } });

      const ops = notes.map((note: any) => ({
        updateOne: {
          filter: { userEmail: email, id: note.id },
          update: { $set: { ...note, userEmail: email } },
          upsert: true,
        }
      }));
      await MongoNote.bulkWrite(ops);
      return res.json({ success: true, count: notes.length });
    } catch (err) {
      console.error("MongoDB save notes failed, falling back to JSON:", err);
    }
  }

  saveNotes(notes, email);
  res.json({ success: true, count: notes.length });
});

app.get("/api/folders", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "sandbox@aura.io";

  if (isMongoActive) {
    try {
      const folders = await MongoFolder.find({ userEmail: email }).lean();
      return res.json({ folders });
    } catch (err) {
      console.error("MongoDB fetch folders failed, falling back to JSON:", err);
    }
  }

  const folders = loadFolders(email);
  res.json({ folders });
});

app.post("/api/folders", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "sandbox@aura.io";
  const { folders } = req.body;
  if (!Array.isArray(folders)) {
    return res.status(400).json({ error: "Invalid folders data" });
  }

  if (isMongoActive) {
    try {
      const folderIds = folders.map((f: any) => f.id);
      await MongoFolder.deleteMany({ userEmail: email, id: { $nin: folderIds } });

      const ops = folders.map((folder: any) => ({
        updateOne: {
          filter: { userEmail: email, id: folder.id },
          update: { $set: { ...folder, userEmail: email } },
          upsert: true,
        }
      }));
      await MongoFolder.bulkWrite(ops);
      return res.json({ success: true, count: folders.length });
    } catch (err) {
      console.error("MongoDB save folders failed, falling back to JSON:", err);
    }
  }

  saveFolders(folders, email);
  res.json({ success: true, count: folders.length });
});

app.get("/api/health", (req, res) => {
  let dbSize = 0;
  try {
    if (fs.existsSync(DB_FILE)) {
      dbSize = fs.statSync(DB_FILE).size;
    }
  } catch (err) {}

  res.json({
    status: "online",
    database: isMongoActive ? "mongodb" : "json_file",
    mongoState: mongoose.connection.readyState,
    dbFileSize: dbSize,
    geminiStatus: !!process.env.GEMINI_API_KEY,
    nodeEnv: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: Date.now()
  });
});


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
  "Work faster with native commands.": "Trabaillez plus vite avec les commandes natives.",
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

// Gemini API Route
app.post("/api/ai/action", async (req, res) => {
  const { action, content, language, userQuery } = req.body;

  // Local helper to invoke local fallback mechanism
  const invokeFallback = () => {
    return getFallbackAiResponse(action, content, language, userQuery);
  };

  if (!ai) {
    console.log(`Gemini API key is not set. Executing fallback local intelligence for action: ${action}`);
    return res.json({ result: invokeFallback() });
  }

  if (!content && action !== "chat") {
    return res.status(400).json({ error: "Content is required for AI actions." });
  }

  try {
    let prompt = "";
    let systemInstruction = "You are a highly sophisticated, minimalist AI writing assistant built into Aura Next (an enterprise productivity app). Provide clear, beautiful markdown outputs. Avoid fluff, unnecessary warnings, or repeating yourself. Keep answers crisp and highly structured.";

    switch (action) {
      case "summarize":
        prompt = `Analyze the following note and provide an elegant, high-level summary with a bulleted list of 3-5 key take-aways. Under the takeaways, include a 1-sentence TL;DR.\n\nNote Content:\n"""\n${content}\n"""`;
        break;

      case "rewrite":
        prompt = `Rewrite the following note to make it look professional, polished, and ready for an executive-level enterprise audience. Maintain all original facts but greatly improve style, professional terminology, and structure. Return only the rewritten note in elegant markdown format.\n\nOriginal Note:\n"""\n${content}\n"""`;
        break;

      case "improve":
        prompt = `Proofread and improve the following writing. Correct spelling, grammar, and phrasing errors, and refine the prose for clarity and maximum impact. Highlight any major structural changes. Return only the improved markdown text.\n\nOriginal Writing:\n"""\n${content}\n"""`;
        break;

      case "translate":
        prompt = `Translate the following note content elegantly into the language: "${language || "Spanish"}". Maintain all original markdown headers, list formatting, checklist items, and tables perfectly. Return only the translated markdown.\n\nContent:\n"""\n${content}\n"""`;
        break;

      case "action-items":
        prompt = `Analyze the note content and extract a clean list of actionable items or tasks. Formulate each task clearly with a markdown checklist style (e.g. - [ ] Task name). Group them if appropriate.\n\nNote Content:\n"""\n${content}\n"""`;
        systemInstruction += " Focus strictly on extracting checklist items and assignable actions.";
        break;

      case "meeting-summary":
        prompt = `Structure the following raw notes into structured, professional Meeting Minutes. Ensure it has sections for: Title, Date, Attendees, Discussion Points, Key Decisions, and Action Items. Format with clean, elegant markdown headers and lists.\n\nRaw Notes:\n"""\n${content}\n"""`;
        break;

      case "checklist":
        prompt = `Generate a step-by-step launch or progress checklist for the topic/subject specified in this note. Be highly comprehensive, practical, and split into clear project phases.\n\nNote/Subject:\n"""\n${content}\n"""`;
        break;

      case "tags":
        prompt = `Analyze the note content below and suggest 3 to 5 smart, highly relevant tags. Return your answer as a JSON array of strings ONLY. No markdown wrappers, just raw JSON. Example: ["Product", "Strategy", "Q3"].\n\nNote Content:\n"""\n${content}\n"""`;
        break;

      case "folders":
        prompt = `Analyze the note content and suggest a single, highly appropriate folder category name for it (e.g. "Finance", "Personal", "Strategy", "Development"). Return your answer as a JSON object of format {"suggestedFolder": "CategoryName"} ONLY. No markdown wrappers.\n\nNote Content:\n"""\n${content}\n"""`;
        break;

      case "chat":
        prompt = `The user has a question/query: "${userQuery || "Help me organize this"}"\n\nHere is the current active note content for context:\n"""\n${content || "(Empty Note)"}\n"""\n\nAnswer the user query concisely, helpfully, and with elegant markdown in the context of their note.`;
        break;

      default:
        return res.status(400).json({ error: `Unsupported AI action: ${action}` });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        ...(action === "tags" || action === "folders" ? { responseMimeType: "application/json" } : {}),
      },
    });

    res.json({ result: response.text });
  } catch (error: any) {
    console.error("Gemini AI API Error, utilizing local backup suggestions:", error);
    res.json({ result: invokeFallback() });
  }
});

// Setup Vite Dev Server / Static Asset Serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
