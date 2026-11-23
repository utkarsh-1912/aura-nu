import { apiFetch } from "../lib/apiClient";
import { useNoteSync } from "../hooks/useNoteSync";
import { useFlowTriggers } from "../features/flows/useFlowTriggers";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import NotesList from "../components/NotesList";
import EditorArea from "../components/EditorArea";
import AiPanel from "../components/AiPanel";
import Dashboard from "../components/Dashboard";
import SettingsModal from "../components/SettingsModal";
import CommandPalette from "../components/CommandPalette";
import TrashView from "../components/views/TrashView";
import ArchiveView from "../components/views/ArchiveView";
import { Avatar, Badge, Button, Dialog, EmptyState, IconButton, ToastViewport } from "../ui";
import { Drawer, MobileTabBar, SwitchingOverlay, TopBar } from "../components/shell/Shell";

import { useNoteIndexes } from "../features/indexes/useNoteIndexes";
import { useTitleRename } from "../features/indexes/useTitleRename";
import { loadSmartFolders, saveSmartFolders, upsertSmartFolder, removeSmartFolder, SMART_PREFIX, type SmartFolder } from "../features/smartFolders/store";
import { useLaunchIntents } from "../features/pwa/useLaunchIntents";
import { applyShare, quickNoteTitle, type SharePayload } from "../features/pwa/shareTarget";
import { useDesktopBridge } from "../features/desktop/useDesktopBridge";
import { makeNote, DEFAULT_FOLDER_ID } from "../features/noteUtils";
import type { ImportPlan } from "../features/import/plan";
import type { EditorExtras } from "../components/EditorArea";
import { Note, Settings, Reminder, Activity, Workspace, WorkspaceType, Folder } from "../types";
import { INITIAL_WORKSPACES, INITIAL_NOTES, INITIAL_REMINDERS, INITIAL_ACTIVITIES, DEFAULT_SETTINGS, getCleanInitialWorkspaces } from "../data";
import {
  Sparkles,
  X,
  Plus,
  ArrowLeft,
  Mic,
  PenTool,
  Volume2,
  Trash2,
  Archive,
  Star,
  Share2,
  Globe,
  FileEdit,
  FileText,
  Settings as SettingsIcon,
  Home,
  Menu,
  Search
} from "lucide-react";

interface WorkspacePageProps {
  userEmail: string;
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;
  activeTheme: "light" | "dark";
  onSignOut: () => void;
}

export default function WorkspacePage({
  userEmail,
  theme,
  setTheme,
  activeTheme,
  onSignOut,
}: WorkspacePageProps) {
  const { wsId } = useParams<{ wsId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const activeWorkspaceId = wsId || "ws-aura-core";

  // Responsive breakpoints detection
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Multi-Workspace State Engine
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [lastOpenedNotes, setLastOpenedNotes] = useState<Record<string, string | null>>({});
  const [lastOpenedFolders, setLastOpenedFolders] = useState<Record<string, string>>({});
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesHydratedFor, setNotesHydratedFor] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Derived state from URL path
  const { activeFolder, activeNoteId } = useMemo(() => {
    const path = location.pathname;
    const parts = path.split("/").filter(Boolean); // e.g. ["w", "wsId", "note", "noteId"]
    
    let folder = "Dashboard";
    let noteId: string | null = null;
    
    // Parse query parameter to preserve sidebar folder context
    const searchParams = new URLSearchParams(location.search);
    const fId = searchParams.get("f_id") || searchParams.get("folder");
    
    if (parts.length >= 3) {
      const type = parts[2]; // e.g. "dashboard", "trash", "archive", "folder", "note", "all", "pin"
      const val = parts[3];  // e.g. folderId or noteId
      
      if (type === "dashboard") {
        folder = "Dashboard";
      } else if (type === "trash") {
        folder = "Trash";
      } else if (type === "archive") {
        folder = "Archive";
      } else if (type === "all") {
        folder = "All Notes";
      } else if (type === "pin" || type === "pinned") {
        folder = "Pinned";
      } else if (type === "draft" || type === "drafts") {
        folder = "Drafts";
      } else if (type === "published") {
        folder = "Published";
      } else if (type === "favorites" || type === "favorite") {
        folder = "Favorites";
      } else if (type === "shared") {
        folder = "Shared";
      } else if (type === "folder" && val) {
        folder = val;
      } else if (type === "note" && val) {
        noteId = val;
        
        if (fId) {
          if (fId === "all") folder = "All Notes";
          else if (fId === "pin" || fId === "pinned") folder = "Pinned";
          else if (fId === "draft" || fId === "drafts") folder = "Drafts";
          else if (fId === "published") folder = "Published";
          else if (fId === "favorites") folder = "Favorites";
          else if (fId === "shared") folder = "Shared";
          else if (fId === "trash") folder = "Trash";
          else if (fId === "archive") folder = "Archive";
          else folder = fId;
        } else {
          // Derive folder from the active note
          const note = notes.find(n => n.id === val);
          if (note) {
            folder = note.folder;
          }
        }
      }
    }
    return { activeFolder: folder, activeNoteId: noteId };
  }, [location.pathname, location.search, notes]);

  const setActiveFolder = (folderId: string) => {
    // Centralized first note lookup inside the selected folder
    const filteredNotes = notes.filter((note) => {
      if (note.workspaceId !== activeWorkspaceId) return false;
      if (folderId === "All Notes") return !note.isTrashed && !note.isArchived;
      if (folderId === "Pinned") return note.isPinned && !note.isTrashed && !note.isArchived;
      if (folderId === "Drafts") return (note.status === "Draft" || note.tags.includes("Draft")) && !note.isTrashed && !note.isArchived;
      if (folderId === "Published") return (note.status === "Published" || note.tags.includes("Published")) && !note.isTrashed && !note.isArchived;
      if (folderId === "Favorites") return note.isFavorite && !note.isTrashed && !note.isArchived;
      if (folderId === "Shared") return note.isShared && !note.isTrashed && !note.isArchived;
      if (folderId === "Archive") return note.isArchived;
      if (folderId === "Trash") return note.isTrashed;
      return note.folder === folderId && !note.isTrashed && !note.isArchived;
    });

    const firstNoteId = (isMobile || filteredNotes.length === 0) ? null : filteredNotes[0].id;
    const folderParam = folderId === "All Notes" ? "all" :
                        folderId === "Pinned" ? "pin" :
                        folderId === "Drafts" ? "draft" :
                        folderId === "Published" ? "published" :
                        folderId === "Favorites" ? "favorites" :
                        folderId === "Shared" ? "shared" :
                        folderId === "Trash" ? "trash" :
                        folderId === "Archive" ? "archive" : folderId;

    if (folderId === "Dashboard") {
      navigate(`/w/${activeWorkspaceId}/dashboard`);
    } else if (folderId === "Trash") {
      if (firstNoteId) {
        navigate(`/w/${activeWorkspaceId}/note/${firstNoteId}?f_id=trash`);
      } else {
        navigate(`/w/${activeWorkspaceId}/trash`);
      }
    } else if (folderId === "Archive") {
      if (firstNoteId) {
        navigate(`/w/${activeWorkspaceId}/note/${firstNoteId}?f_id=archive`);
      } else {
        navigate(`/w/${activeWorkspaceId}/archive`);
      }
    } else {
      if (firstNoteId) {
        navigate(`/w/${activeWorkspaceId}/note/${firstNoteId}?f_id=${folderParam}`);
      } else {
        if (folderParam === "all") navigate(`/w/${activeWorkspaceId}/all`);
        else if (folderParam === "pin") navigate(`/w/${activeWorkspaceId}/pin`);
        else if (folderParam === "draft") navigate(`/w/${activeWorkspaceId}/draft`);
        else if (folderParam === "published") navigate(`/w/${activeWorkspaceId}/published`);
        else if (folderParam === "favorites") navigate(`/w/${activeWorkspaceId}/favorites`);
        else if (folderParam === "shared") navigate(`/w/${activeWorkspaceId}/shared`);
        else navigate(`/w/${activeWorkspaceId}/folder/${folderId}`);
      }
    }
  };

  const setActiveNoteId = (noteId: string | null) => {
    if (noteId === null) {
      if (activeFolder && activeFolder !== "Dashboard") {
        if (["Trash", "Archive"].includes(activeFolder)) {
          navigate(`/w/${activeWorkspaceId}/${activeFolder.toLowerCase()}`);
        } else if (activeFolder === "All Notes") {
          navigate(`/w/${activeWorkspaceId}/all`);
        } else if (activeFolder === "Pinned") {
          navigate(`/w/${activeWorkspaceId}/pin`);
        } else if (activeFolder === "Drafts") {
          navigate(`/w/${activeWorkspaceId}/draft`);
        } else if (activeFolder === "Published") {
          navigate(`/w/${activeWorkspaceId}/published`);
        } else if (activeFolder === "Favorites") {
          navigate(`/w/${activeWorkspaceId}/favorites`);
        } else if (activeFolder === "Shared") {
          navigate(`/w/${activeWorkspaceId}/shared`);
        } else {
          navigate(`/w/${activeWorkspaceId}/folder/${activeFolder}`);
        }
      } else {
        navigate(`/w/${activeWorkspaceId}/dashboard`);
      }
    } else {
      const folderParam = activeFolder === "All Notes" ? "all" :
                          activeFolder === "Pinned" ? "pin" :
                          activeFolder === "Drafts" ? "draft" :
                          activeFolder === "Published" ? "published" :
                          activeFolder === "Favorites" ? "favorites" :
                          activeFolder === "Shared" ? "shared" :
                          activeFolder === "Trash" ? "trash" :
                          activeFolder === "Archive" ? "archive" : activeFolder;
      navigate(`/w/${activeWorkspaceId}/note/${noteId}?f_id=${folderParam}`);
    }
  };

  // Save active workspace ID on change
  useEffect(() => {
    localStorage.setItem(`aura-active-workspace-id-${userEmail}`, activeWorkspaceId);
  }, [activeWorkspaceId, userEmail]);

  // Reminders and Activities
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  // Settings
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Layout states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [notesListWidth, setNotesListWidth] = useState(360);
  const isDraggingNotesList = useRef(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Mobile Bottom Navigation tab selector: "home" | "notes" | "ai" | "settings"
  const [mobileTab, setMobileTab] = useState<"home" | "notes" | "ai" | "settings">("home");

  // Mobile FAB state
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Voice recording browser speech states
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [voiceTimer, setVoiceTimer] = useState(0); // Not using timer for active speech, but can keep for tracking active seconds
  const [voiceStatus, setVoiceStatus] = useState<"recording" | "transcribing" | "success" | "idle">("idle");
  const [transcribedText, setTranscribedText] = useState("");
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  // Drawing pad simulation states
  const [showDrawingPad, setShowDrawingPad] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Toast System
  const [toasts, setToasts] = useState<{ id: string; text: string; type: "success" | "info" | "error" }[]>([]);
  const toastTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => clearTimeout(timer));
      toastTimersRef.current.clear();
    };
  }, []);

  const addToast = (text: string, type: "success" | "info" | "error" = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, text, type }]);
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(timer);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
    toastTimersRef.current.add(timer);
  };

  // Helper to log user timeline activity
  const addActivity = (text: string, type: Activity["type"]) => {
    const newAct: Activity = {
      id: crypto.randomUUID(),
      workspaceId: activeWorkspaceId,
      text,
      timestamp: new Date().toISOString(),
      type,
    };
    setActivities((prev) => [newAct, ...prev].slice(0, 15));
  };

  const resizeRafId = useRef<number | null>(null);
  const latestMouseXRef = useRef<number>(0);

  const handleNotesListResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingNotesList.current = true;
    document.body.style.cursor = "col-resize";
    document.body.classList.add("select-none");
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingNotesList.current) return;
      latestMouseXRef.current = e.clientX;

      if (resizeRafId.current === null) {
        resizeRafId.current = requestAnimationFrame(() => {
          resizeRafId.current = null;
          const sidebarWidth = isSidebarCollapsed ? 56 : 240;
          let width = latestMouseXRef.current - sidebarWidth;
          
          if (width < 240) width = 240;
          if (width > 480) width = 480;
          
          setNotesListWidth(width);
        });
      }
    };

    const handleMouseUp = () => {
      if (isDraggingNotesList.current) {
        isDraggingNotesList.current = false;
        document.body.style.cursor = "";
        document.body.classList.remove("select-none");
      }
      if (resizeRafId.current !== null) {
        cancelAnimationFrame(resizeRafId.current);
        resizeRafId.current = null;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (resizeRafId.current !== null) {
        cancelAnimationFrame(resizeRafId.current);
        resizeRafId.current = null;
      }
    };
  }, [isSidebarCollapsed]);

  // Breakpoint tracking
  useEffect(() => {
    const updateBreakpoints = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };

    updateBreakpoints();

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateBreakpoints();
      }, 150);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          setIsCommandPaletteOpen(prev => !prev);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }

      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewNote();
      }

      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setIsSettingsOpen(prev => !prev);
      }

      if (e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsFocusMode(prev => !prev);
        addToast("Toggled Focus Mode", "info");
      }

      if (activeNoteId) {
        const currentActiveNote = notes.find(n => n.id === activeNoteId);
        if (currentActiveNote) {
          if (e.altKey && e.key.toLowerCase() === "d") {
            e.preventDefault();
            handleDuplicateNote(activeNoteId);
          }

          if (e.altKey && e.key.toLowerCase() === "a") {
            e.preventDefault();
            handleToggleArchiveNote(activeNoteId);
          }

          if (e.altKey && e.key.toLowerCase() === "t") {
            e.preventDefault();
            handleDeleteNote(activeNoteId);
          }

          if (e.altKey && e.key.toLowerCase() === "l") {
            e.preventDefault();
            handleToggleLockNote(activeNoteId);
          }

          if (e.altKey && e.key.toLowerCase() === "p") {
            e.preventDefault();
            const nextStatus: Note["status"] = currentActiveNote.status === "Published" ? "Draft" : "Published";
            const updated = notes.map(n => n.id === activeNoteId ? { ...n, status: nextStatus, updatedAt: new Date().toISOString() } : n);
            handleUpdateNotesAndSync(updated);
            addToast(`Note status set to ${nextStatus}`, "success");
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeNoteId, notes, workspaces, activeWorkspaceId]);

  // Initial State Loading & Resilient Dual Sync Client-Server Sync
  useEffect(() => {
    // Reset tags on load
    setActiveTag(null);

    // Load local workspaces or bootstrap dynamically
    let localWorkspaces = getCleanInitialWorkspaces(userEmail);
    const wsStr = localStorage.getItem(`aura-workspaces-${userEmail}`);
    if (wsStr) {
      try {
        localWorkspaces = JSON.parse(wsStr);
      } catch (e) {
        console.error(e);
      }
    } else {
      localStorage.setItem(`aura-workspaces-${userEmail}`, JSON.stringify(localWorkspaces));
    }

    // Dynamically replace hardcoded email references with active user email
    const dynamicWorkspaces = localWorkspaces.map(ws => {
      const sanitizedName = (userEmail && typeof userEmail === "string" && userEmail.includes("@")) ? userEmail.split("@")[0] : "user";
      const displayName = sanitizedName.charAt(0).toUpperCase() + sanitizedName.slice(1);
      
      const members = (ws.members || []).map(m => {
        if (m.email === "gutkarshlb@gmail.com" || m.email === "utkarsh.gupta@aura.io") {
          return {
            ...m,
            email: userEmail,
            name: displayName,
            avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayName}`
          };
        }
        return m;
      });

      const auditLogs = (ws.auditLogs || []).map(a => {
        if (a.userEmail === "gutkarshlb@gmail.com" || a.userEmail === "utkarsh.gupta@aura.io") {
          return {
            ...a,
            userEmail: userEmail
          };
        }
        return a;
      });

      return {
        ...ws,
        members,
        auditLogs
      };
    });

    setWorkspaces(dynamicWorkspaces);

    const savedActiveWs = localStorage.getItem(`aura-active-workspace-id-${userEmail}`);
    if (savedActiveWs && !wsId) {
      navigate(`/w/${savedActiveWs}/dashboard`);
    }

    // Load local backup state
    const localNotes = localStorage.getItem(`aura-notes-backup-${userEmail}`);
    const localReminders = localStorage.getItem(`aura-reminders-${userEmail}`);
    const localActivities = localStorage.getItem(`aura-activities-${userEmail}`);
    const localSettings = localStorage.getItem(`aura-settings-${userEmail}`);
    const localFolders = localStorage.getItem(`aura-folders-backup-${userEmail}`);

    let loadedFolders: Folder[] = [];
    if (localFolders) {
      try {
        loadedFolders = JSON.parse(localFolders) as Folder[];
      } catch (e) {
        console.error("Local folders corrupted:", e);
      }
    }
    if (loadedFolders.length === 0) {
      loadedFolders = [
        { id: "f-general", workspaceId: "ws-aura-core", name: "General", color: "#3b82f6", icon: "📁", isExpanded: true },
        { id: "f-projects", workspaceId: "ws-aura-core", name: "Projects", color: "#10b981", icon: "🚀", isExpanded: true },
        { id: "f-strategy", workspaceId: "ws-aura-core", name: "Strategy", color: "#f59e0b", icon: "💡", isExpanded: true }
      ];
    }
    setFolders(loadedFolders);
    localStorage.setItem(`aura-folders-backup-${userEmail}`, JSON.stringify(loadedFolders));
    fetchFoldersFromServer();

    let loadedNotes: Note[] = [];
    if (localNotes) {
      try {
        const parsed = JSON.parse(localNotes) as Note[];
        loadedNotes = parsed.map(n => {
          let updatedFolder = n.folder;
          if (updatedFolder === "General") updatedFolder = "f-general";
          else if (updatedFolder === "Projects") updatedFolder = "f-projects";
          else if (updatedFolder === "Strategy") updatedFolder = "f-strategy";
          return {
            ...n,
            workspaceId: n.workspaceId || "ws-aura-core",
            folder: updatedFolder || "f-general"
          };
        });
      } catch (e) {
        console.error("Local notes corrupted:", e);
      }
    }

    if (loadedNotes.length === 0) {
      loadedNotes = INITIAL_NOTES.map(n => {
        let updatedFolder = n.folder;
        if (updatedFolder === "General") updatedFolder = "f-general";
        else if (updatedFolder === "Projects") updatedFolder = "f-projects";
        else if (updatedFolder === "Strategy") updatedFolder = "f-strategy";
        return {
          ...n,
          workspaceId: n.workspaceId || "ws-aura-core",
          folder: updatedFolder || "f-general"
        };
      });
    }
    setNotes(loadedNotes);
    setNotesHydratedFor(userEmail); // same batch as setNotes: sync may start once this render commits
    localStorage.setItem(`aura-notes-backup-${userEmail}`, JSON.stringify(loadedNotes));

    if (localReminders) {
      try {
        setReminders(JSON.parse(localReminders));
      } catch {
        setReminders([]);
      }
    } else {
      setReminders([]);
    }

    if (localActivities) {
      try {
        setActivities(JSON.parse(localActivities));
      } catch {
        setActivities([]);
      }
    } else {
      setActivities([]);
    }

    if (localSettings) {
      try {
        const parsed = JSON.parse(localSettings);
        setSettings(parsed);
        setTheme(parsed.theme || "light");
      } catch (e) {
        console.error(e);
      }
    }

    fetchNotesFromServer();
  }, [userEmail]);

  // Online / Offline synchronization mechanism
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast("Network connection restored. Auto-synchronizing changes to cloud database...", "success");
      fetchNotesFromServer();
      fetchFoldersFromServer();
    };
    const handleOffline = () => {
      setIsOnline(false);
      addToast("Network connection lost. Switched to offline cache mode.", "error");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [userEmail]);

  // Periodic network checker and health ping
  useEffect(() => {
    const interval = setInterval(async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch("/api/health");
          if (res.ok) {
            if (!isOnline) {
              setIsOnline(true);
              fetchNotesFromServer();
              fetchFoldersFromServer();
            }
          } else {
            if (isOnline) setIsOnline(false);
          }
        } catch {
          if (isOnline) setIsOnline(false);
        }
      } else {
        if (isOnline) setIsOnline(false);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [isOnline, userEmail]);

  // Welcome Note Auto-Select Effect
  useEffect(() => {
    // Only auto-select when we have notes, we are not on mobile, and we are not in Dashboard or other non-note views
    if (isMobile || notes.length === 0 || activeNoteId !== null || activeFolder === "Dashboard") return;

    // Filter notes matching the current folder context and current workspace
    const filteredNotes = notes.filter((note) => {
      if (note.workspaceId !== activeWorkspaceId) return false;
      if (activeFolder === "All Notes") return !note.isTrashed && !note.isArchived;
      if (activeFolder === "Pinned") return note.isPinned && !note.isTrashed && !note.isArchived;
      if (activeFolder === "Drafts") return (note.status === "Draft" || note.tags.includes("Draft")) && !note.isTrashed && !note.isArchived;
      if (activeFolder === "Published") return (note.status === "Published" || note.tags.includes("Published")) && !note.isTrashed && !note.isArchived;
      if (activeFolder === "Favorites") return note.isFavorite && !note.isTrashed && !note.isArchived;
      if (activeFolder === "Shared") return note.isShared && !note.isTrashed && !note.isArchived;
      if (activeFolder === "Archive") return note.isArchived;
      if (activeFolder === "Trash") return note.isTrashed;
      return note.folder === activeFolder && !note.isTrashed && !note.isArchived;
    });

    if (filteredNotes.length > 0) {
      const folderParam = activeFolder === "All Notes" ? "all" :
                          activeFolder === "Pinned" ? "pin" :
                          activeFolder === "Drafts" ? "draft" :
                          activeFolder === "Published" ? "published" :
                          activeFolder === "Favorites" ? "favorites" :
                          activeFolder === "Shared" ? "shared" :
                          activeFolder === "Trash" ? "trash" :
                          activeFolder === "Archive" ? "archive" : activeFolder;
      navigate(`/w/${activeWorkspaceId}/note/${filteredNotes[0].id}?f_id=${folderParam}`, { replace: true });
    }
  }, [notes, activeFolder, activeNoteId, activeWorkspaceId, navigate]);

  // Notes sync: per-note v2 API with conflict-safe merging (see src/core/syncEngine.ts).
  // Changes to `notes` are detected by diffing, so every mutation site is covered.
  const noteSync = useNoteSync<Note>({
    userEmail,
    enabled: notesHydratedFor === userEmail,
    notes,
    setNotes,
    onToast: addToast,
  });

  // Keep the offline cache equal to the in-memory list, including notes merged in by sync.
  useEffect(() => {
    if (notesHydratedFor !== userEmail) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`aura-notes-backup-${userEmail}`, JSON.stringify(notes));
      } catch (err) {
        console.warn("Could not update offline notes cache:", err);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [notes, notesHydratedFor, userEmail]);

  const fetchNotesFromServer = async () => {
    await noteSync.syncNow();
  };

  // Kept so existing call sites compile; the sync hook now pushes changes itself.
  const syncNotesToServer = (_notesToSync: Note[]) => {
    void noteSync.syncNow();
  };

  const handleUpdateNotesAndSync = (newNotes: Note[]) => {
    setNotes(newNotes);
    localStorage.setItem(`aura-notes-backup-${userEmail}`, JSON.stringify(newNotes));
    syncNotesToServer(newNotes);
  };

  // Workflow triggers (note.created/updated/tagged, schedules): enabled flows run while the app is open.
  useFlowTriggers({
    userEmail,
    notes,
    updateNotes: handleUpdateNotesAndSync,
    enabled: notesHydratedFor === userEmail,
  });

  const fetchFoldersFromServer = async () => {
    try {
      const response = await apiFetch("/api/folders", {
        headers: {
          "X-User-Email": userEmail
        }
      });
      const data = await response.json();
      if (response.ok && data.folders) {
        const serverFolders = data.folders;
        const lastSync = Number(localStorage.getItem(`aura-last-sync-folders-${userEmail}`) || "0");
        const now = Date.now();

        setFolders((currentLocalFolders) => {
          if (currentLocalFolders.length === 0) {
            localStorage.setItem(`aura-folders-backup-${userEmail}`, JSON.stringify(serverFolders));
            localStorage.setItem(`aura-last-sync-folders-${userEmail}`, String(now));
            return serverFolders;
          }

          const localOnlyOrNewer: Folder[] = [];
          currentLocalFolders.forEach((lFolder) => {
            const sFolder = serverFolders.find((f: Folder) => f.id === lFolder.id);
            if (!sFolder) {
              if (lastSync === 0) {
                localOnlyOrNewer.push(lFolder);
              }
            }
          });

          const finalMap = new Map<string, Folder>();
          serverFolders.forEach((sFolder: Folder) => finalMap.set(sFolder.id, sFolder));
          localOnlyOrNewer.forEach((lFolder) => finalMap.set(lFolder.id, lFolder));

          const finalList = Array.from(finalMap.values());
          localStorage.setItem(`aura-folders-backup-${userEmail}`, JSON.stringify(finalList));
          localStorage.setItem(`aura-last-sync-folders-${userEmail}`, String(now));

          if (localOnlyOrNewer.length > 0) {
            syncFoldersToServer(finalList);
          }

          return finalList;
        });
      }
    } catch (err) {
      console.warn("Express server folders fallback:", err);
    }
  };

  const syncFoldersToServer = async (foldersToSync: Folder[]) => {
    try {
      await apiFetch("/api/folders", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-User-Email": userEmail
        },
        body: JSON.stringify({ folders: foldersToSync }),
      });
    } catch (err) {
      console.warn("Unable to sync folders to server:", err);
    }
  };

  const handleUpdateFoldersAndSync = (newFolders: Folder[]) => {
    setFolders(newFolders);
    localStorage.setItem(`aura-folders-backup-${userEmail}`, JSON.stringify(newFolders));
    syncFoldersToServer(newFolders);
  };

  const handleNewFolder = (name: string, parentId?: string, color?: string, icon?: string): string => {
    const newId = `folder-${Date.now()}`;
    const newFolder: Folder = {
      id: newId,
      workspaceId: activeWorkspaceId,
      name: name || "Untitled Folder",
      parentId,
      color: color || "#3b82f6",
      icon: icon || "📁",
      isExpanded: true
    };
    const updated = [...folders, newFolder];
    handleUpdateFoldersAndSync(updated);
    addToast(`Folder "${newFolder.name}" created`, "success");
    return newId;
  };

  const handleRenameFolder = (id: string, newName: string) => {
    const updated = folders.map(f => f.id === id ? { ...f, name: newName } : f);
    handleUpdateFoldersAndSync(updated);
    addToast("Folder renamed", "success");
  };

  const handleDeleteFolder = (id: string, mode: "uncategorize" | "move" | "trash", targetFolderId?: string) => {
    const getDescendants = (folderId: string): string[] => {
      const direct = folders.filter(f => f.parentId === folderId).map(f => f.id);
      return [...direct, ...direct.flatMap(getDescendants)];
    };
    const targetIds = [id, ...getDescendants(id)];

    const updatedFolders = folders.filter(f => !targetIds.includes(f.id));
    handleUpdateFoldersAndSync(updatedFolders);

    const updatedNotes = notes.map(note => {
      if (note.workspaceId === activeWorkspaceId && targetIds.includes(note.folder)) {
        if (mode === "trash") {
          return { ...note, isTrashed: true, updatedAt: new Date().toISOString() };
        } else if (mode === "move" && targetFolderId) {
          return { ...note, folder: targetFolderId, updatedAt: new Date().toISOString() };
        } else {
          return { ...note, folder: "f-general", updatedAt: new Date().toISOString() };
        }
      }
      return note;
    });
    handleUpdateNotesAndSync(updatedNotes);
    addToast("Folder deleted successfully", "error");
  };

  const handleMoveFolder = (folderId: string, parentId: string | undefined) => {
    const getDescendants = (fid: string): string[] => {
      const direct = folders.filter(f => f.parentId === fid).map(f => f.id);
      return [...direct, ...direct.flatMap(getDescendants)];
    };
    if (folderId === parentId || (parentId && getDescendants(folderId).includes(parentId))) {
      addToast("Invalid move: Cannot move a folder inside itself or its descendants", "error");
      return;
    }

    const updated = folders.map(f => f.id === folderId ? { ...f, parentId } : f);
    handleUpdateFoldersAndSync(updated);
    addToast("Folder structure updated", "success");
  };

  const handleUpdateFolderExpanded = (id: string, isExpanded: boolean) => {
    const updated = folders.map(f => f.id === id ? { ...f, isExpanded } : f);
    handleUpdateFoldersAndSync(updated);
  };

  const handleMoveNotesToFolder = (noteIds: string[], folderId: string) => {
    const updated = notes.map(n => noteIds.includes(n.id) ? { ...n, folder: folderId, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    addToast(`Moved ${noteIds.length} ${noteIds.length === 1 ? "note" : "notes"} successfully`, "success");
  };

  const handleBulkDeleteNotes = (noteIds: string[]) => {
    const updated = notes.map(n => noteIds.includes(n.id) ? { ...n, isTrashed: true, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    if (noteIds.includes(activeNoteId || "")) {
      setActiveNoteId(null);
    }
    addToast(`Moved ${noteIds.length} notes to trash`, "error");
  };

  const handleBulkArchiveNotes = (noteIds: string[], archive: boolean) => {
    const updated = notes.map(n => noteIds.includes(n.id) ? { ...n, isArchived: archive, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    if (archive && noteIds.includes(activeNoteId || "")) {
      setActiveNoteId(null);
    }
    addToast(`${archive ? "Archived" : "Restored"} ${noteIds.length} notes`, "success");
  };

  const handleBulkFavoriteNotes = (noteIds: string[], favorite: boolean) => {
    const updated = notes.map(n => noteIds.includes(n.id) ? { ...n, isFavorite: favorite, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    addToast(`${favorite ? "Favorited" : "Unfavorited"} ${noteIds.length} notes`, "success");
  };

  const handleSelectWorkspace = (id: string) => {
    if (id === activeWorkspaceId) return;

    setIsTransitioning(true);
    setLastOpenedNotes(prev => ({ ...prev, [activeWorkspaceId]: activeNoteId }));
    setLastOpenedFolders(prev => ({ ...prev, [activeWorkspaceId]: activeFolder }));

    setTimeout(() => {
      localStorage.setItem(`aura-active-workspace-id-${userEmail}`, id);

      const nextNoteId = isMobile ? null : (lastOpenedNotes[id] || null);
      const nextFolder = lastOpenedFolders[id] || "Dashboard";

      // Verify custom folder exists in the target workspace, else default to Dashboard
      let resolvedFolder = nextFolder;
      const standardFolders = ["Dashboard", "All Notes", "Pinned", "Drafts", "Published", "Favorites", "Shared", "Archive", "Trash"];
      if (!standardFolders.includes(resolvedFolder)) {
        const folderExists = folders.some(f => f.id === resolvedFolder && f.workspaceId === id);
        if (!folderExists) {
          resolvedFolder = "Dashboard";
        }
      }

      const existsInNext = notes.some(n => n.id === nextNoteId && n.workspaceId === id);
      const targetNoteId = existsInNext ? nextNoteId : null;

      // Navigate to target path
      if (targetNoteId) {
        const folderParam = resolvedFolder === "All Notes" ? "all" :
                            resolvedFolder === "Pinned" ? "pin" :
                            resolvedFolder === "Drafts" ? "draft" :
                            resolvedFolder === "Published" ? "published" :
                            resolvedFolder === "Favorites" ? "favorites" :
                            resolvedFolder === "Shared" ? "shared" :
                            resolvedFolder === "Trash" ? "trash" :
                            resolvedFolder === "Archive" ? "archive" : resolvedFolder;
        navigate(`/w/${id}/note/${targetNoteId}?f_id=${folderParam}`);
      } else {
        if (["Dashboard", "Trash", "Archive"].includes(resolvedFolder)) {
          navigate(`/w/${id}/${resolvedFolder.toLowerCase()}`);
        } else if (resolvedFolder === "All Notes") {
          navigate(`/w/${id}/all`);
        } else if (resolvedFolder === "Pinned") {
          navigate(`/w/${id}/pin`);
        } else if (resolvedFolder === "Drafts") {
          navigate(`/w/${id}/draft`);
        } else if (resolvedFolder === "Published") {
          navigate(`/w/${id}/published`);
        } else if (resolvedFolder === "Favorites") {
          navigate(`/w/${id}/favorites`);
        } else if (resolvedFolder === "Shared") {
          navigate(`/w/${id}/shared`);
        } else {
          navigate(`/w/${id}/folder/${resolvedFolder}`);
        }
      }

      setActiveTag(null);

      const targetWorkspace = workspaces.find(w => w.id === id);
      if (targetWorkspace) {
        setTheme(targetWorkspace.settings?.theme || "light");
      }

      setIsTransitioning(false);
      addToast(`Switched to: ${targetWorkspace?.name || id}`, "info");
    }, 250);
  };

  const handleCreateWorkspace = (name: string, type: WorkspaceType, icon: string) => {
    const newId = `ws-${Date.now()}`;
    const newWorkspace: Workspace = {
      id: newId,
      name,
      type,
      icon,
      role: "Owner",
      isPinned: false,
      isFavorite: false,
      storageUsage: 0,
      storageQuota: 5 * 1024 * 1024,
      settings: { ...DEFAULT_SETTINGS, theme: "light" },
      members: [
        { id: `m-${Date.now()}`, name: (userEmail && typeof userEmail === "string" && userEmail.includes("@")) ? userEmail.split("@")[0] : "user", email: userEmail, role: "Owner", joinedAt: new Date().toISOString().split("T")[0], avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}` }
      ],
      templates: [],
      integrations: [],
      sharedLinks: [],
      invitations: [],
      auditLogs: [
        { id: `aud-${Date.now()}`, userId: "current-user", userEmail, action: "Created Workspace Node", timestamp: new Date().toISOString(), ipAddress: "127.0.0.1" }
      ],
      departments: [],
      aiHistory: []
    };

    const updated = [...workspaces, newWorkspace];
    setWorkspaces(updated);
    localStorage.setItem(`aura-workspaces-${userEmail}`, JSON.stringify(updated));
    addToast(`Workspace "${name}" provisioned`, "success");
    handleSelectWorkspace(newId);
  };

  const handleDeleteWorkspace = (id: string) => {
    if (workspaces.length <= 1) {
      addToast("Cannot delete the last workspace", "error");
      return;
    }
    const targetWorkspace = workspaces.find((w) => w.id === id);
    if (!targetWorkspace) return;

    const updated = workspaces.filter((w) => w.id !== id);
    setWorkspaces(updated);
    localStorage.setItem(`aura-workspaces-${userEmail}`, JSON.stringify(updated));

    // Also delete notes and folders belonging to this workspace
    const updatedNotes = notes.filter((n) => n.workspaceId !== id);
    setNotes(updatedNotes);

    const updatedFolders = folders.filter((f) => f.workspaceId !== id);
    setFolders(updatedFolders);

    addToast(`Workspace "${targetWorkspace.name}" deleted`, "success");

    // Select the first remaining workspace
    handleSelectWorkspace(updated[0].id);
  };

  const handleUpdateWorkspace = (updatedWorkspace: Workspace) => {
    const updated = workspaces.map(w => w.id === updatedWorkspace.id ? updatedWorkspace : w);
    setWorkspaces(updated);
    localStorage.setItem(`aura-workspaces-${userEmail}`, JSON.stringify(updated));
  };

  const handleTogglePinWorkspace = (id: string) => {
    const updated = workspaces.map(w => w.id === id ? { ...w, isPinned: !w.isPinned } : w);
    setWorkspaces(updated);
    localStorage.setItem(`aura-workspaces-${userEmail}`, JSON.stringify(updated));
  };

  const handleToggleFavoriteWorkspace = (id: string) => {
    const updated = workspaces.map(w => w.id === id ? { ...w, isFavorite: !w.isFavorite } : w);
    setWorkspaces(updated);
    localStorage.setItem(`aura-workspaces-${userEmail}`, JSON.stringify(updated));
  };

  const handleCopyNote = (noteId: string, targetWsId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const copiedNote: Note = {
      ...note,
      id: `note-copy-${Date.now()}`,
      workspaceId: targetWsId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPinned: false,
      isFavorite: false,
      title: `${note.title} (Copy)`
    };

    const updated = [copiedNote, ...notes];
    handleUpdateNotesAndSync(updated);
    const targetName = workspaces.find(w => w.id === targetWsId)?.name || targetWsId;
    addToast(`Copied Note to ${targetName}`, "success");
  };

  const handleMoveNote = (noteId: string, targetWsId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const updated = notes.map(n => n.id === noteId ? { ...n, workspaceId: targetWsId, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    const targetName = workspaces.find(w => w.id === targetWsId)?.name || targetWsId;
    addToast(`Moved Note to ${targetName}`, "success");
    if (activeNoteId === noteId) {
      setActiveNoteId(null);
    }
  };

  const handleDuplicateNote = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const duplicated: Note = {
      ...note,
      id: `note-dup-${Date.now()}`,
      title: `${note.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPinned: false,
      isFavorite: false
    };

    const updated = [duplicated, ...notes];
    handleUpdateNotesAndSync(updated);
    addToast(`Duplicated note "${note.title}"`, "success");
  };

  const handleDeleteNote = (noteId: string) => {
    const noteToDelete = notes.find(n => n.id === noteId);
    const updated = notes.map(n => n.id === noteId ? { ...n, isTrashed: true, status: "Archived" as any, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    addToast(noteToDelete ? `"${noteToDelete.title}" moved to trash` : "Note trashed", "error");
    if (activeNoteId === noteId) {
      setActiveNoteId(null);
    }
  };

  const handleRestoreNote = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const updated = notes.map(n => n.id === noteId ? { ...n, isTrashed: false, isArchived: false, status: n.status || "Draft", updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    addToast(`"${note.title}" restored successfully`, "success");
  };

  const handleDeletePermanently = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const updated = notes.filter(n => n.id !== noteId);
    handleUpdateNotesAndSync(updated);
    addToast(`"${note.title}" deleted permanently`, "error");
    if (activeNoteId === noteId) {
      setActiveNoteId(null);
    }
  };

  const handleEmptyTrash = () => {
    const updated = notes.filter(n => !(n.workspaceId === activeWorkspaceId && n.isTrashed));
    handleUpdateNotesAndSync(updated);
    addToast("Trash emptied completely", "success");
    setActiveNoteId(null);
  };

  const handleBulkDeletePermanently = (noteIds: string[]) => {
    const updated = notes.filter(n => !noteIds.includes(n.id));
    handleUpdateNotesAndSync(updated);
    addToast(`${noteIds.length} notes permanently deleted`, "error");
    if (noteIds.includes(activeNoteId || "")) {
      setActiveNoteId(null);
    }
  };

  const handleBulkRestoreNotes = (noteIds: string[]) => {
    const updated = notes.map(n =>
      noteIds.includes(n.id)
        ? {
            ...n,
            isTrashed: false,
            isArchived: false,
            status: n.status === "Archived" ? ("Draft" as any) : n.status || "Draft",
            updatedAt: new Date().toISOString(),
          }
        : n
    );
    handleUpdateNotesAndSync(updated);
    addToast(`${noteIds.length} notes restored successfully`, "success");
  };

  const handleToggleArchiveNote = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const nextArchived = !note.isArchived;
    const updated = notes.map(n => n.id === noteId ? { ...n, isArchived: nextArchived, status: (nextArchived ? "Archived" : (n.status === "Archived" ? "Draft" : n.status || "Draft")) as Note["status"], updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    addToast(nextArchived ? `"${note.title}" archived` : `"${note.title}" restored from archive`, "success");
    if (nextArchived && activeNoteId === noteId) {
      setActiveNoteId(null);
    }
  };

  const handleToggleLockNote = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const nextLocked = !note.isLocked;
    const updated = notes.map(n => n.id === noteId ? { ...n, isLocked: nextLocked, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    addToast(nextLocked ? `"${note.title}" locked. Read-only enabled.` : `"${note.title}" unlocked for editing`, "info");
  };

  const handleToggleShareNote = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const nextShared = !note.isShared;
    const updated = notes.map(n => n.id === noteId ? { ...n, isShared: nextShared, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    addToast(nextShared ? `"${note.title}" shared. Public link active.` : `"${note.title}" sharing disabled`, "success");
  };

  const handleToggleFavoriteNote = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const nextFavorite = !note.isFavorite;
    const updated = notes.map(n => n.id === noteId ? { ...n, isFavorite: nextFavorite, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    addToast(nextFavorite ? `"${note.title}" added to favorites` : `"${note.title}" removed from favorites`, "success");
  };

  const handleTogglePinNote = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const nextPinned = !note.isPinned;
    const updated = notes.map(n => n.id === noteId ? { ...n, isPinned: nextPinned, updatedAt: new Date().toISOString() } : n);
    handleUpdateNotesAndSync(updated);
    addToast(nextPinned ? `"${note.title}" pinned` : `"${note.title}" unpinned`, "success");
  };

  const handleNewNote = () => {
    const newNoteId = `note-${Date.now()}`;
    const defaultFolder = activeFolder && 
      !["Dashboard", "All Notes", "Pinned", "Drafts", "Published", "Favorites", "Shared", "Archive", "Trash"].includes(activeFolder)
        ? activeFolder
        : "f-general";

    const newNote: Note = {
      id: newNoteId,
      workspaceId: activeWorkspaceId,
      title: "",
      content: "",
      tags: ["Draft"],
      isPinned: false,
      isShared: false,
      isFavorite: false,
      folder: defaultFolder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      wordCount: 0,
      readingTime: 0,
      versionHistory: []
    };

    const updatedNotes = [newNote, ...notes];
    handleUpdateNotesAndSync(updatedNotes);
    setActiveNoteId(newNoteId);
    setActiveFolder(defaultFolder);
    setActiveTag(null);
    setIsFabOpen(false);
    addToast("Note created", "success");
    addActivity("Created a new note", "create");
    
    if (isMobile) {
      setMobileTab("notes");
    }
  };

  useEffect(() => {
    const handlePreselectFolder = (e: Event) => {
      const folderId = (e as CustomEvent).detail;
      if (folderId) {
        setNotes((currentNotes) => {
          if (currentNotes.length === 0) return currentNotes;
          const updated = currentNotes.map((n, idx) => idx === 0 ? { ...n, folder: folderId } : n);
          syncNotesToServer(updated);
          localStorage.setItem(`aura-notes-${userEmail}`, JSON.stringify(updated));
          return updated;
        });
      }
    };
    const handleSaveFoldersDirect = (e: Event) => {
      const updated = (e as CustomEvent).detail;
      if (updated) {
        handleUpdateFoldersAndSync(updated);
      }
    };
    window.addEventListener("aura-preselect-note-folder", handlePreselectFolder);
    window.addEventListener("aura-save-folders-direct", handleSaveFoldersDirect);
    return () => {
      window.removeEventListener("aura-preselect-note-folder", handlePreselectFolder);
      window.removeEventListener("aura-save-folders-direct", handleSaveFoldersDirect);
    };
  }, [notes, folders]);

  const handleNewNoteWithContent = (title: string, content: string, folder: string, tags: string[]) => {
    const newNoteId = `note-${Date.now()}`;
    const newNote: Note = {
      id: newNoteId,
      workspaceId: activeWorkspaceId,
      title,
      content,
      tags,
      isPinned: false,
      isShared: false,
      isFavorite: false,
      folder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      wordCount: content.trim().split(/\s+/).filter(Boolean).length,
      readingTime: Math.max(1, Math.ceil(content.trim().split(/\s+/).filter(Boolean).length / 200)),
      versionHistory: []
    };

    const updatedNotes = [newNote, ...notes];
    handleUpdateNotesAndSync(updatedNotes);
    setActiveNoteId(newNoteId);
    setActiveFolder("All Notes");
    setActiveTag(null);
    addToast(`Generated template: ${title}`, "success");
    addActivity(`Generated template: ${title}`, "create");

    if (isMobile) {
      setMobileTab("notes");
    }
  };

  const handleUpdateActiveNote = (updatedNote: Note) => {
    const updated = notes.map((n) => (n.id === updatedNote.id ? updatedNote : n));
    handleUpdateNotesAndSync(updated);
  };

  const handleDeleteActiveNote = () => {
    if (!activeNoteId) return;
    const noteToDelete = notes.find((n) => n.id === activeNoteId);
    const updated = notes.filter((n) => n.id !== activeNoteId);
    
    handleUpdateNotesAndSync(updated);
    setActiveNoteId(null);
    addToast(noteToDelete ? `"${noteToDelete.title}" moved to trash` : "Note deleted", "error");
    addActivity(noteToDelete ? `Trashed note: ${noteToDelete.title}` : "Deleted a note", "trash");
  };

  const allWorkspaceNotes = useMemo(() => {
    return notes.filter((n) => n.workspaceId === activeWorkspaceId);
  }, [notes, activeWorkspaceId]);

  const workspaceNotes = useMemo(() => {
    return allWorkspaceNotes.filter((n) => !n.isTrashed && !n.isArchived);
  }, [allWorkspaceNotes]);

  const activeNote = useMemo(() => {
    const found = notes.find((n) => n.id === activeNoteId);
    return (found && found.workspaceId === activeWorkspaceId) ? found : null;
  }, [notes, activeNoteId, activeWorkspaceId]);

  // ---- Indexes (backlinks, search), smart folders, link rename, launch intents, desktop bridge ----
  const indexes = useNoteIndexes(notes, activeWorkspaceId, notesHydratedFor === userEmail);
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([]);
  useEffect(() => { setSmartFolders(loadSmartFolders(userEmail)); }, [userEmail]);
  const handleSaveSmartFolder = (sf: SmartFolder) => {
    setSmartFolders((cur) => { const next = upsertSmartFolder(cur, sf); saveSmartFolders(userEmail, next); return next; });
  };
  const handleDeleteSmartFolder = (id: string) => {
    setSmartFolders((cur) => { const next = removeSmartFolder(cur, id); saveSmartFolders(userEmail, next); return next; });
    if (activeFolder === SMART_PREFIX + id) setActiveFolder("All Notes");
  };

  useTitleRename({
    activeNote,
    notes,
    indexes,
    applyNotes: handleUpdateNotesAndSync,
    onRewritten: (n, t) => addToast(`Updated ${n} note${n === 1 ? "" : "s"} linking to "${t}"`, "info"),
  });

  const openNoteById = (id: string) => {
    setActiveNoteId(id);
    if (isMobile) setMobileTab("notes");
  };
  /** Create-on-click for unresolved [[links]]. */
  const createNoteWithTitle = (title: string): string | undefined => {
    const t = title.trim();
    if (!t) return undefined;
    const id = `note-${Date.now()}`;
    const folder = activeNote?.folder || DEFAULT_FOLDER_ID;
    handleUpdateNotesAndSync([makeNote({ id, workspaceId: activeWorkspaceId, title: t, content: "", folder, tags: [] }), ...notes]);
    addToast(`Created "${t}"`, "success");
    return id;
  };
  const handleImportPlan = (plan: ImportPlan) => {
    if (plan.newFolders.length) handleUpdateFoldersAndSync([...folders, ...plan.newFolders]);
    handleUpdateNotesAndSync([...plan.notes, ...notes]);
    addToast(`Imported ${plan.notes.length} note${plan.notes.length === 1 ? "" : "s"}`, "success");
  };
  const newLocalId = () => `note-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  useLaunchIntents({
    ready: notesHydratedFor === userEmail,
    onNewNote: () => handleNewNote(),
    onQuickNote: () => {
      const id = newLocalId();
      handleUpdateNotesAndSync([makeNote({ id, workspaceId: activeWorkspaceId, title: quickNoteTitle(), content: "", folder: DEFAULT_FOLDER_ID, tags: ["Quick"] }), ...notes]);
      openNoteById(id);
    },
    onShare: (p: SharePayload) => {
      const r = applyShare(notes, p, { workspaceId: activeWorkspaceId, folder: DEFAULT_FOLDER_ID, newId: newLocalId });
      handleUpdateNotesAndSync(r.notes);
      openNoteById(r.noteId);
      addToast(r.skipped.length ? `Shared content saved. ${r.skipped[0]}` : "Shared content saved as a new note", r.skipped.length ? "info" : "success");
    },
  });
  useDesktopBridge({
    ready: notesHydratedFor === userEmail,
    workspaceId: activeWorkspaceId,
    notes,
    folders,
    applyNotes: handleUpdateNotesAndSync,
    applyFolders: handleUpdateFoldersAndSync,
    onQuickNote: (q) => {
      const id = newLocalId();
      handleUpdateNotesAndSync([makeNote({ id, workspaceId: activeWorkspaceId, title: q.title, content: q.content, folder: DEFAULT_FOLDER_ID, tags: ["Quick"], createdAt: q.createdAt, updatedAt: q.createdAt }), ...notes]);
      addToast("Quick note saved", "success");
    },
    onError: (m) => addToast(m, "error"),
  });
  const workspaceNotesForEditor = useMemo(() => notes.filter((n) => n.workspaceId === activeWorkspaceId), [notes, activeWorkspaceId]);

  const prevActiveNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevActiveNoteIdRef.current;
    if (prevId && prevId !== activeNoteId) {
      const prevNote = notes.find(n => n.id === prevId);
      if (prevNote && !prevNote.title.trim()) {
        const updated = notes.map(n => n.id === prevId ? { ...n, title: "Untitled Note", updatedAt: new Date().toISOString() } : n);
        handleUpdateNotesAndSync(updated);
      }
    }
    prevActiveNoteIdRef.current = activeNoteId;
  }, [activeNoteId, notes]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeNoteId) {
        setNotes(prevNotes => {
          const activeNote = prevNotes.find(n => n.id === activeNoteId);
          if (activeNote && !activeNote.title.trim()) {
            const updated = prevNotes.map(n => n.id === activeNoteId ? { ...n, title: "Untitled Note", updatedAt: new Date().toISOString() } : n);
            localStorage.setItem(`aura-notes-backup-${userEmail}`, JSON.stringify(updated));
            return updated;
          }
          return prevNotes;
        });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeNoteId]);

  const workspaceFolders = useMemo(() => {
    return folders.filter(f => f.workspaceId === activeWorkspaceId);
  }, [folders, activeWorkspaceId]);

  const tagsList = useMemo(() => {
    return Array.from(new Set(["Draft", "Onboarding", "Guides", "Enterprise", ...workspaceNotes.flatMap((n) => n.tags).filter(Boolean)]));
  }, [workspaceNotes]);

  const workspaceReminders = useMemo(() => {
    return reminders.filter((r) => r.workspaceId === activeWorkspaceId);
  }, [reminders, activeWorkspaceId]);

  const workspaceActivities = useMemo(() => {
    return activities.filter((a) => a.workspaceId === activeWorkspaceId);
  }, [activities, activeWorkspaceId]);

  const handleAddReminder = (text: string, date: string) => {
    const newRem: Reminder = {
      id: `rem-${Date.now()}`,
      workspaceId: activeWorkspaceId,
      text,
      date,
      completed: false,
    };
    const updated = [...reminders, newRem];
    setReminders(updated);
    localStorage.setItem(`aura-reminders-${userEmail}`, JSON.stringify(updated));
    addToast("Reminder added", "success");
  };

  const handleToggleReminder = (id: string) => {
    const updated = reminders.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r));
    setReminders(updated);
    localStorage.setItem(`aura-reminders-${userEmail}`, JSON.stringify(updated));
    const isCompleted = updated.find((r) => r.id === id)?.completed;
    addToast(isCompleted ? "Task completed!" : "Task uncompleted", "info");
  };

  const handleDeleteReminder = (id: string) => {
    const updated = reminders.filter((r) => r.id !== id);
    setReminders(updated);
    localStorage.setItem(`aura-reminders-${userEmail}`, JSON.stringify(updated));
    addToast("Reminder cleared", "error");
  };

  useEffect(() => {
    let timerInterval: NodeJS.Timeout;
    if (!showVoiceRecorder) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setVoiceStatus("idle");
      return;
    }

    setTranscribedText("Requesting microphone permission...");
    setVoiceTimer(0);
    setVoiceStatus("recording");

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSpeechSupported(false);
      setTranscribedText("Web Speech API is not supported in this browser. Fallback simulated: We are finalizing the aura offline first replication and design specs.");
      // Start a simulated timer to increase seconds
      timerInterval = setInterval(() => {
        setVoiceTimer((t) => t + 1);
      }, 1000);
      return;
    }

    setIsSpeechSupported(true);
    let rec: any;
    try {
      rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setTranscribedText("Listening... speak clearly into your mic.");
        timerInterval = setInterval(() => {
          setVoiceTimer((t) => t + 1);
        }, 1000);
      };

      rec.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        const combined = finalTranscript || interimTranscript;
        if (combined.trim()) {
          setTranscribedText(combined);
        }
      };

      rec.onerror = (err: any) => {
        console.error("Speech Recognition Error:", err);
        if (err.error === "not-allowed") {
          setTranscribedText("Microphone access denied. Please allow microphone permissions in your browser settings.");
        } else {
          setTranscribedText(`Error: ${err.error}. Check browser microphone setup.`);
        }
      };

      rec.onend = () => {
        // If ended but still showing voice recorder, restart or stay idle
      };

      rec.start();
      recognitionRef.current = rec;
    } catch (e) {
      console.error("Speech init failure:", e);
      setTranscribedText("Speech Recognition could not be initialized.");
    }

    return () => {
      clearInterval(timerInterval);
      if (rec) {
        try {
          rec.stop();
        } catch (e) {}
      }
    };
  }, [showVoiceRecorder]);

  useEffect(() => {
    if (showDrawingPad && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = activeTheme === "dark" ? "#818cf8" : "#3b82f6";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
      }
    }
  }, [showDrawingPad, activeTheme]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ("touches" in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ("touches" in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleSaveDrawing = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL();
    
    if (activeNoteId && activeNote) {
      const updatedContent = `${activeNote.content || ""}\n\n![Aura Sketch signature](${dataUrl})\n`;
      handleUpdateActiveNote({
        ...activeNote,
        content: updatedContent,
        updatedAt: new Date().toISOString()
      });
      addToast("Sketch appended to current note!", "success");
    } else {
      handleNewNoteWithContent(
        "🎨 Quick Drawing Scratchpad",
        `# 🎨 Quick Drawing Scratchpad\n\nThis document is a visual container for your drawn strategy doodles or signatures.\n\n![Aura Sketch signature](${dataUrl})\n\nFeel free to write descriptions or annotations below this block.`,
        "General",
        ["Doodle", "Drawing"]
      );
      addToast("Sketch saved to new note!", "success");
    }
    
    setShowDrawingPad(false);
  };

  const handleSaveVoiceNote = () => {
    const text = transcribedText.trim();
    if (!text || text === "Requesting microphone permission..." || text.startsWith("Listening...")) {
      addToast("No speech transcribed yet!", "error");
      return;
    }

    if (activeNoteId && activeNote) {
      const updatedContent = `${activeNote.content || ""}\n\n🎙️ **Voice dictation transcript** (${voiceTimer}s):\n> ${text}\n`;
      handleUpdateActiveNote({
        ...activeNote,
        content: updatedContent,
        updatedAt: new Date().toISOString()
      });
      addToast("Transcription appended to current note!", "success");
    } else {
      handleNewNoteWithContent(
        "🎙️ Voice Notes Strategy Minutes",
        `# 🎙️ Voice Notes Strategy Minutes\n\n- **Date**: ${new Date().toLocaleDateString()}\n- **Duration**: ${voiceTimer} seconds\n- **Format**: Browser Web Speech API\n\n## 📝 Transcribed Synopsis:\n"${text}"\n\nFeel free to write descriptions or annotations below this block.`,
        "General",
        ["Draft", "AI Transcribe"]
      );
      addToast("Voice note saved to new note!", "success");
    }
    
    setShowVoiceRecorder(false);
    setVoiceTimer(0);
    setTranscribedText("");
  };

  const sidebarProps = {
    notes: allWorkspaceNotes,
    folders: workspaceFolders,
    tags: tagsList,
    activeFolder,
    setActiveFolder,
    activeTag,
    setActiveTag,
    onNewNote: handleNewNote,
    activeNoteId,
    setActiveNoteId,
    onOpenSettings: () => setIsSettingsOpen(true),
    onOpenCommandPalette: () => setIsCommandPaletteOpen(true),
    theme: activeTheme,
    currentUserEmail: userEmail,
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId: handleSelectWorkspace,
    onCreateWorkspace: handleCreateWorkspace,
    onDeleteWorkspace: handleDeleteWorkspace,
    onTogglePinWorkspace: handleTogglePinWorkspace,
    onToggleFavoriteWorkspace: handleToggleFavoriteWorkspace,
    onNewFolder: handleNewFolder,
    onRenameFolder: handleRenameFolder,
    onDeleteFolder: handleDeleteFolder,
    onMoveFolder: handleMoveFolder,
    onUpdateFolderExpanded: handleUpdateFolderExpanded,
    onMoveNotesToFolder: handleMoveNotesToFolder,
    onToggleFavoriteNote: handleToggleFavoriteNote,
    onToggleArchiveNote: handleToggleArchiveNote,
    onDeleteNote: handleDeleteNote,
    onSignOut,
    isOnline,
    smartFolders,
    onSaveSmartFolder: handleSaveSmartFolder,
    onDeleteSmartFolder: handleDeleteSmartFolder,
  };

  const cancelVoiceNote = () => {
    setShowVoiceRecorder(false);
    setVoiceTimer(0);
    setTranscribedText("");
  };

  const dashboardEl = (onPick: (id: string) => void) => (
    <Dashboard
      notes={workspaceNotes}
      setActiveNoteId={(id) => {
        const targetNote = workspaceNotes.find((n) => n.id === id);
        if (targetNote) {
          setActiveFolder(targetNote.folder || "All Notes");
        }
        onPick(id);
      }}
      onNewNoteWithContent={handleNewNoteWithContent}
      reminders={workspaceReminders}
      onAddReminder={handleAddReminder}
      onToggleReminder={handleToggleReminder}
      onDeleteReminder={handleDeleteReminder}
      activities={workspaceActivities}
      theme={activeTheme}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      onSelectWorkspace={handleSelectWorkspace}
      onUpdateWorkspace={handleUpdateWorkspace}
      onCopyNote={handleCopyNote}
      onMoveNote={handleMoveNote}
      onDuplicateNote={handleDuplicateNote}
      onDeleteNote={handleDeleteNote}
      currentUserEmail={userEmail}
    />
  );

  const notesListEl = (width?: number) => (
    <NotesList
      indexes={indexes}
      smartFolders={smartFolders}
      activeWorkspaceId={activeWorkspaceId}
      notes={allWorkspaceNotes}
      folders={workspaceFolders}
      activeNoteId={activeNoteId}
      setActiveNoteId={setActiveNoteId}
      activeFolder={activeFolder}
      activeTag={activeTag}
      setActiveTag={setActiveTag}
      onNewNote={handleNewNote}
      theme={activeTheme}
      onBulkMoveNotes={handleMoveNotesToFolder}
      onBulkDeleteNotes={handleBulkDeleteNotes}
      onBulkArchiveNotes={handleBulkArchiveNotes}
      onBulkFavoriteNotes={handleBulkFavoriteNotes}
      onBulkDeletePermanently={handleBulkDeletePermanently}
      onBulkRestoreNotes={handleBulkRestoreNotes}
      onEmptyTrash={handleEmptyTrash}
      width={width}
      onTogglePinNote={handleTogglePinNote}
      onToggleFavoriteNote={handleToggleFavoriteNote}
      onDeleteNote={handleDeleteNote}
    />
  );

  const editorEl = (onOpenAi: () => void) => (
    <EditorArea
      note={activeNote}
      onUpdateNote={handleUpdateActiveNote}
      onOpenAiAssistant={onOpenAi}
      theme={activeTheme}
      isAiPanelOpen={isAiPanelOpen}
      onDeleteNote={handleDeleteNote}
      onDuplicateNote={handleDuplicateNote}
      onRestoreNote={handleRestoreNote}
      onDeletePermanently={handleDeletePermanently}
      onArchiveNote={handleToggleArchiveNote}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      onMoveNote={handleMoveNote}
      onCopyNote={handleCopyNote}
      folders={workspaceFolders}
      isFocusMode={isFocusMode}
      setIsFocusMode={setIsFocusMode}
      settings={settings}
      extras={{
        indexes,
        workspaceNotes: workspaceNotesForEditor,
        openNote: openNoteById,
        createNoteWithTitle,
        onBack: isMobile ? () => setActiveNoteId(null) : undefined,
      } satisfies EditorExtras}
    />
  );

  const aiPanelEl = (onClose: () => void, onSelectNote: (id: string) => void) => (
    <AiPanel
      note={activeNote}
      onUpdateNote={handleUpdateActiveNote}
      onClose={onClose}
      theme={activeTheme}
      onAddToast={addToast}
      currentUserEmail={userEmail}
      notes={notes}
      folders={folders}
      reminders={reminders}
      activeWorkspaceId={activeWorkspaceId}
      onUpdateNotes={handleUpdateNotesAndSync}
      onUpdateFolders={handleUpdateFoldersAndSync}
      onUpdateReminders={(updated) => {
        setReminders(updated);
        localStorage.setItem(`aura-reminders-${userEmail}`, JSON.stringify(updated));
      }}
      onSelectNote={onSelectNote}
      onNavigateToAgentStudio={() => navigate("/org/org-aura-main/agents")}
    />
  );

  const emptyPaneMeta: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
    Favorites: { icon: <Star size={18} />, title: "Favorite notes", description: "Select one of your favorite notes to start editing." },
    Shared: { icon: <Share2 size={18} />, title: "Shared notes", description: "Select a shared note to view or copy the link." },
    Drafts: { icon: <FileEdit size={18} />, title: "Draft notes", description: "Select a draft note to continue writing." },
    Published: { icon: <Globe size={18} />, title: "Published notes", description: "Select a published note to manage publication or edit content." },
  };
  const emptyMeta = emptyPaneMeta[activeFolder] ?? {
    icon: <FileText size={18} />,
    title: folders.find((f) => f.id === activeFolder)?.name || activeFolder,
    description: "Select a note from the list to view and edit its contents, or create a new note.",
  };

  const mobileTitle =
    mobileTab === "home" ? "Home" : mobileTab === "notes" ? (activeNoteId ? "Note" : "Notes") : mobileTab === "ai" ? "AI co-pilot" : "More";

  return (
    <div
      id="aura-app-wrapper"
      className="flex h-dvh w-full overflow-hidden bg-surface font-sans text-fg"
    >
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      {isMobile ? (
        /* PHONE: single pane + bottom tab bar */
        <div id="mobile-viewport" className="flex h-full w-full min-w-0 flex-col overflow-hidden">
          <TopBar
            title={mobileTitle}
            leading={
              mobileTab === "notes" && activeNoteId ? (
                <IconButton label="Back to notes" size="lg" onClick={() => setActiveNoteId(null)}>
                  <ArrowLeft size={18} />
                </IconButton>
              ) : (
                <IconButton label="Open sidebar" size="lg" onClick={() => setIsMobileSidebarOpen(true)}>
                  <Menu size={18} />
                </IconButton>
              )
            }
            trailing={
              !activeNoteId && (
                <IconButton label="Search workspace" size="lg" onClick={() => setIsCommandPaletteOpen(true)}>
                  <Search size={18} />
                </IconButton>
              )
            }
          />

          <div className="relative min-h-0 w-full flex-1 overflow-hidden">
            <Drawer open={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} label="Sidebar">
              <Sidebar
                {...sidebarProps}
                onMobileClose={() => setIsMobileSidebarOpen(false)}
                isSidebarCollapsed={false}
                setIsSidebarCollapsed={() => {}}
              />
            </Drawer>

            {isTransitioning && <SwitchingOverlay label="Switching workspace..." />}

            {mobileTab === "home" &&
              dashboardEl((id) => {
                setActiveNoteId(id);
                setMobileTab("notes");
              })}

            {mobileTab === "notes" &&
              (activeNoteId === null ? notesListEl() : editorEl(() => setMobileTab("ai")))}

            {mobileTab === "ai" &&
              aiPanelEl(
                () => setMobileTab("notes"),
                (noteId) => {
                  setActiveNoteId(noteId);
                  setMobileTab("notes");
                },
              )}

            {mobileTab === "settings" && (
              <div className="h-full overflow-y-auto p-4">
                <div className="mx-auto flex max-w-md flex-col gap-4">
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
                    <Avatar name={userEmail.split("@")[0] || "User"} size={40} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[14px] font-medium text-fg">{userEmail.split("@")[0]}</span>
                      <span className="truncate text-[12px] text-fg-muted">{userEmail}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="!justify-start"
                      leadingIcon={<Home size={16} />}
                      onClick={() => {
                        setActiveFolder("Dashboard");
                        setMobileTab("home");
                      }}
                    >
                      Home dashboard
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="!justify-start"
                      leadingIcon={<SettingsIcon size={16} />}
                      onClick={() => setIsSettingsOpen(true)}
                    >
                      Settings
                    </Button>
                    <Button variant="danger" size="lg" onClick={onSignOut}>
                      Sign out
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {(!activeNoteId || mobileTab !== "notes") && (
            <MobileTabBar
              active={mobileTab}
              onNotes={() => {
                setActiveNoteId(null);
                setMobileTab("notes");
              }}
              onSearch={() => setIsCommandPaletteOpen(true)}
              onNew={() => setIsFabOpen(true)}
              onAi={() => {
                setActiveNoteId(null);
                setMobileTab("ai");
              }}
              onMore={() => {
                setActiveNoteId(null);
                setMobileTab("settings");
              }}
            />
          )}
        </div>
      ) : (
        /* TABLET + DESKTOP */
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {isTablet && !isFocusMode && (
            <TopBar
              title={folders.find((f) => f.id === activeFolder)?.name || activeFolder}
              leading={
                <IconButton label="Open sidebar" size="lg" onClick={() => setIsMobileSidebarOpen(true)}>
                  <Menu size={18} />
                </IconButton>
              }
              trailing={
                <>
                  <IconButton label="Search and commands" size="lg" onClick={() => setIsCommandPaletteOpen(true)}>
                    <Search size={18} />
                  </IconButton>
                  <Button variant="primary" onClick={handleNewNote} leadingIcon={<Plus size={14} />}>
                    New note
                  </Button>
                </>
              }
            />
          )}

          <div className="flex min-h-0 flex-1">
            {isTablet && (
              <Drawer open={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} label="Sidebar">
                <Sidebar
                  {...sidebarProps}
                  onMobileClose={() => setIsMobileSidebarOpen(false)}
                  isSidebarCollapsed={false}
                  setIsSidebarCollapsed={() => {}}
                />
              </Drawer>
            )}

            {!isTablet && !isFocusMode && (
              <Sidebar {...sidebarProps} isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setIsSidebarCollapsed} />
            )}

            {!isFocusMode && activeFolder !== "Dashboard" && notesListEl(isTablet ? Math.min(notesListWidth, 320) : notesListWidth)}

            {!isFocusMode && activeFolder !== "Dashboard" && !isTablet && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize notes list"
                aria-valuenow={notesListWidth}
                aria-valuemin={240}
                aria-valuemax={480}
                tabIndex={0}
                onMouseDown={handleNotesListResizeMouseDown}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") setNotesListWidth((w) => Math.max(240, w - 16));
                  if (e.key === "ArrowRight") setNotesListWidth((w) => Math.min(480, w + 16));
                }}
                className="group relative z-40 -ml-px h-full w-1 shrink-0 cursor-col-resize select-none outline-none"
              >
                <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-active:bg-accent" />
              </div>
            )}

            <div id="main-content-pane" className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface">
              {isTransitioning && <SwitchingOverlay label="Syncing workspace..." />}

              {activeFolder === "Dashboard" ? (
                dashboardEl((id) => setActiveNoteId(id))
              ) : activeNoteId === null ? (
                activeFolder === "Trash" ? (
                  <TrashView hasNotes={allWorkspaceNotes.some((n) => n.isTrashed)} onEmptyTrash={handleEmptyTrash} />
                ) : activeFolder === "Archive" ? (
                  <ArchiveView />
                ) : (
                  <div className="flex h-full flex-1 select-none items-center justify-center bg-surface">
                    <EmptyState
                      icon={emptyMeta.icon}
                      title={emptyMeta.title}
                      description={emptyMeta.description}
                      action={
                        <Button variant="primary" onClick={handleNewNote} leadingIcon={<Plus size={14} />}>
                          New note
                        </Button>
                      }
                    />
                  </div>
                )
              ) : (
                editorEl(() => setIsAiPanelOpen(true))
              )}

              {isAiPanelOpen &&
                activeFolder !== "Dashboard" &&
                !isFocusMode &&
                aiPanelEl(
                  () => setIsAiPanelOpen(false),
                  (noteId) => setActiveNoteId(noteId),
                )}
            </div>
          </div>
        </div>
      )}

      {/* Quick create sheet (phone) */}
      <Dialog open={isFabOpen} onClose={() => setIsFabOpen(false)} title="Create" size="sm">
        <div className="flex flex-col gap-2 pb-1">
          <Button
            variant="secondary"
            size="lg"
            className="!justify-start"
            leadingIcon={<Plus size={16} />}
            onClick={() => {
              handleNewNote();
              setIsFabOpen(false);
            }}
          >
            New text note
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="!justify-start"
            leadingIcon={<Mic size={16} />}
            onClick={() => {
              setShowVoiceRecorder(true);
              setIsFabOpen(false);
            }}
          >
            Voice memo (AI transcribe)
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="!justify-start"
            leadingIcon={<PenTool size={16} />}
            onClick={() => {
              setShowDrawingPad(true);
              setIsFabOpen(false);
            }}
          >
            Quick sketch pad
          </Button>
        </div>
      </Dialog>

      {/* Voice recorder / speech-to-text */}
      <Dialog
        open={showVoiceRecorder}
        onClose={cancelVoiceNote}
        title="Voice memo"
        description="Live browser speech-to-text. Speak and the transcript appears below."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={cancelVoiceNote}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveVoiceNote}>
              Save to note
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
            <span className="absolute inset-0 rounded-full border border-danger/40 motion-safe:animate-ping" aria-hidden />
            <Mic size={20} />
          </div>
          <Badge tone="danger">Recording {voiceTimer}s</Badge>
          <div
            aria-live="polite"
            className="h-32 w-full select-text overflow-y-auto rounded-lg border border-line bg-panel p-3 text-left text-[13px] leading-relaxed text-fg"
          >
            {transcribedText || <span className="text-fg-subtle">Listening...</span>}
          </div>
        </div>
      </Dialog>

      {/* Drawing scratchpad */}
      <Dialog
        open={showDrawingPad}
        onClose={() => setShowDrawingPad(false)}
        title="Quick sketch"
        description="Doodle layouts or mockups with mouse or touch."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                const canvas = canvasRef.current;
                const ctx = canvas?.getContext("2d");
                if (canvas && ctx) {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
              }}
            >
              Clear
            </Button>
            <Button variant="primary" onClick={handleSaveDrawing}>
              Save sketch to note
            </Button>
          </>
        }
      >
        <canvas
          ref={canvasRef}
          width={360}
          height={180}
          aria-label="Sketch canvas"
          onMouseDown={startDrawing}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onMouseMove={draw}
          onTouchStart={startDrawing}
          onTouchEnd={stopDrawing}
          onTouchMove={draw}
          className="h-[180px] w-full cursor-crosshair touch-none rounded-lg border border-dashed border-line-strong bg-panel outline-none"
        ></canvas>
      </Dialog>

      {/* Settings dialog */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(updated) => {
          setSettings(updated);
          localStorage.setItem(`aura-settings-${userEmail}`, JSON.stringify(updated));
        }}
        theme={theme}
        setTheme={setTheme}
        currentUserEmail={userEmail}
        notes={notes}
        importContext={{ workspaceId: activeWorkspaceId, folders: workspaceFolders, onImport: handleImportPlan }}
        onForceSync={async () => {
          await fetchNotesFromServer();
          await fetchFoldersFromServer();
        }}
        onClearCache={async () => {
          // Push any pending edits first; abort (keeping local data) if that is not possible.
          const ok = await noteSync.resetAndPull();
          if (!ok) {
            addToast("Could not upload pending changes, so the local cache was kept.", "error");
            return;
          }
          localStorage.removeItem(`aura-folders-backup-${userEmail}`);
          localStorage.setItem(`aura-last-sync-folders-${userEmail}`, "0");

          const responseFolders = await apiFetch("/api/folders", {
            headers: { "X-User-Email": userEmail }
          });
          const dataFolders = await responseFolders.json();
          if (responseFolders.ok && dataFolders.folders) {
            setFolders(dataFolders.folders);
            localStorage.setItem(`aura-folders-backup-${userEmail}`, JSON.stringify(dataFolders.folders));
          }
        }}
      />

      {/* Command palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNewNote={handleNewNote}
        onDeleteNote={handleDeleteActiveNote}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAi={() => {
          setIsAiPanelOpen(true);
          if (isMobile) {
            setMobileTab("ai");
          }
        }}
        theme={activeTheme}
        setTheme={setTheme}
        folders={workspaceFolders.map(f => f.name)}
        setActiveFolder={setActiveFolder}
        setActiveNoteId={(id) => {
          setActiveNoteId(id);
          if (isMobile) {
            setMobileTab("notes");
          }
        }}
        notes={notes}
        activeWorkspaceId={activeWorkspaceId}
        workspaces={workspaces}
        onSelectWorkspace={handleSelectWorkspace}
        indexes={indexes}
      />
    </div>
  );
}
