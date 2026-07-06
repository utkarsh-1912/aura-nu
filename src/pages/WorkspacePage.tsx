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
  Menu
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

  // Multi-Workspace State Engine
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [lastOpenedNotes, setLastOpenedNotes] = useState<Record<string, string | null>>({});
  const [lastOpenedFolders, setLastOpenedFolders] = useState<Record<string, string>>({});
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  const [notes, setNotes] = useState<Note[]>([]);
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

    const firstNoteId = filteredNotes.length > 0 ? filteredNotes[0].id : null;
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

  // Responsive breakpoints detection
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Mobile Bottom Navigation tab selector: "home" | "notes" | "ai" | "settings"
  const [mobileTab, setMobileTab] = useState<"home" | "notes" | "ai" | "settings">("home");

  // Mobile FAB state
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Voice recording simulation states
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [voiceTimer, setVoiceTimer] = useState(3);
  const [voiceStatus, setVoiceStatus] = useState<"recording" | "transcribing" | "success">("recording");

  // Drawing pad simulation states
  const [showDrawingPad, setShowDrawingPad] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Toast System
  const [toasts, setToasts] = useState<{ id: string; text: string; type: "success" | "info" | "error" }[]>([]);

  const addToast = (text: string, type: "success" | "info" | "error" = "info") => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Helper to log user timeline activity
  const addActivity = (text: string, type: Activity["type"]) => {
    const newAct: Activity = {
      id: `act-${Date.now()}-${Math.random()}`,
      workspaceId: activeWorkspaceId,
      text,
      timestamp: new Date().toISOString(),
      type,
    };
    setActivities((prev) => [newAct, ...prev].slice(0, 15));
  };

  const handleNotesListResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingNotesList.current = true;
    document.body.style.cursor = "col-resize";
    document.body.classList.add("select-none");
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingNotesList.current) return;
      const sidebarWidth = isSidebarCollapsed ? 64 : 256;
      let width = e.clientX - sidebarWidth;
      
      if (width < 240) width = 240;
      if (width > 480) width = 480;
      
      setNotesListWidth(width);
    };

    const handleMouseUp = () => {
      if (isDraggingNotesList.current) {
        isDraggingNotesList.current = false;
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
  }, [isSidebarCollapsed]);

  // Breakpoint tracking
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
            const nextStatus = currentActiveNote.status === "Published" ? "Draft" : "Published";
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
      const sanitizedName = userEmail.split("@")[0];
      const displayName = sanitizedName.charAt(0).toUpperCase() + sanitizedName.slice(1);
      
      const members = (ws.members || []).map(m => {
        if (m.email === "gutkarshlb@gmail.com") {
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
        if (a.userEmail === "gutkarshlb@gmail.com") {
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

  // Welcome Note Auto-Select Effect
  useEffect(() => {
    // Only auto-select when we have notes and we are not in Dashboard or other non-note views
    if (notes.length === 0 || activeNoteId !== null || activeFolder === "Dashboard") return;

    // Filter notes matching the current folder context
    const filteredNotes = notes.filter((note) => {
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

  const fetchNotesFromServer = async () => {
    try {
      const response = await fetch("/api/notes", {
        headers: {
          "X-User-Email": userEmail
        }
      });
      const data = await response.json();
      if (response.ok && data.notes) {
        const serverNotes = data.notes;
        
        setNotes((currentLocalNotes) => {
          const validLocal = currentLocalNotes.map(n => n.workspaceId ? n : { ...n, workspaceId: "ws-aura-core" });
          if (validLocal.length === 0) {
            localStorage.setItem(`aura-notes-backup-${userEmail}`, JSON.stringify(serverNotes));
            return serverNotes;
          }

          const mergedMap = new Map<string, Note>();
          validLocal.forEach((note) => mergedMap.set(note.id, note));

          serverNotes.forEach((sNote: Note) => {
            const cleanSNote = sNote.workspaceId ? sNote : { ...sNote, workspaceId: "ws-aura-core" };
            const lNote = mergedMap.get(cleanSNote.id);
            if (!lNote || new Date(cleanSNote.updatedAt).getTime() > new Date(lNote.updatedAt).getTime()) {
              mergedMap.set(cleanSNote.id, cleanSNote);
            }
          });

          const mergedList = Array.from(mergedMap.values());
          localStorage.setItem(`aura-notes-backup-${userEmail}`, JSON.stringify(mergedList));
          syncNotesToServer(mergedList);

          return mergedList;
        });

        addToast("Redundant cloud synchronization complete", "info");
      }
    } catch (error) {
      console.warn("Express server offline, fallback to local storage cache:", error);
    }
  };

  const syncNotesToServer = async (notesToSync: Note[]) => {
    try {
      await fetch("/api/notes", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-User-Email": userEmail
        },
        body: JSON.stringify({ notes: notesToSync }),
      });
    } catch (err) {
      console.warn("Unable to sync notes to server, saving locally:", err);
    }
  };

  const handleUpdateNotesAndSync = (newNotes: Note[]) => {
    setNotes(newNotes);
    localStorage.setItem(`aura-notes-backup-${userEmail}`, JSON.stringify(newNotes));
    syncNotesToServer(newNotes);
  };

  const fetchFoldersFromServer = async () => {
    try {
      const response = await fetch("/api/folders", {
        headers: {
          "X-User-Email": userEmail
        }
      });
      const data = await response.json();
      if (response.ok && data.folders) {
        setFolders(data.folders);
        localStorage.setItem(`aura-folders-backup-${userEmail}`, JSON.stringify(data.folders));
      }
    } catch (err) {
      console.warn("Express server folders fallback:", err);
    }
  };

  const syncFoldersToServer = async (foldersToSync: Folder[]) => {
    try {
      await fetch("/api/folders", {
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

      const nextNoteId = lastOpenedNotes[id] || null;
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
      storageQuota: 5,
      settings: { ...DEFAULT_SETTINGS, theme: "light" },
      members: [
        { id: `m-${Date.now()}`, name: userEmail.split("@")[0], email: userEmail, role: "Owner", joinedAt: new Date().toISOString().split("T")[0], avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}` }
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
    const updated = notes.map(n => n.id === noteId ? { ...n, isArchived: nextArchived, status: nextArchived ? "Archived" : (n.status === "Archived" ? "Draft" : n.status || "Draft"), updatedAt: new Date().toISOString() } : n);
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
    return notes.find((n) => n.id === activeNoteId) || null;
  }, [notes, activeNoteId]);

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
    let interval: NodeJS.Timeout;
    if (showVoiceRecorder) {
      if (voiceTimer > 0 && voiceStatus === "recording") {
        interval = setInterval(() => {
          setVoiceTimer((t) => t - 1);
        }, 1000);
      } else if (voiceTimer === 0 && voiceStatus === "recording") {
        setVoiceStatus("transcribing");
        setTimeout(() => {
          setVoiceStatus("success");
          setTimeout(() => {
            setShowVoiceRecorder(false);
            handleNewNoteWithContent(
              "🎙️ Voice Notes Strategy Minutes",
              `# 🎙️ Voice Notes Strategy Minutes\n\n- **Date**: ${new Date().toLocaleDateString()}\n- **Format**: Smart voice memo compiled by Gemini Flash 3.5\n\n## 📝 Transcribed Synopsis:\n"We must compress the Webpack and Vite split bundles down to 180ms and build dual redundant cloud storage sync hooks."\n\n## 🧠 Gemini Generated Action-items:\n- [ ] Optimize lazy components code splitting\n- [ ] Configure PostgreSQL replication checkpoints`,
              "General",
              ["Draft", "AI Transcribe"]
            );
            setVoiceTimer(3);
            setVoiceStatus("recording");
          }, 1000);
        }, 2000);
      }
    }
    return () => clearInterval(interval);
  }, [showVoiceRecorder, voiceTimer, voiceStatus]);

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
    
    handleNewNoteWithContent(
      "🎨 Quick Drawing Scratchpad",
      `# 🎨 Quick Drawing Scratchpad\n\nThis document is a visual container for your drawn strategy doodles or signatures.\n\n![Aura Sketch signature](${dataUrl})\n\nFeel free to write descriptions or annotations below this block.`,
      "General",
      ["Doodle", "Drawing"]
    );
    
    setShowDrawingPad(false);
    addToast("Sketch saved to note!", "success");
  };

  return (
    <div
      id="aura-app-wrapper"
      className="w-screen h-screen flex flex-col md:flex-row overflow-hidden font-sans transition-colors duration-200 bg-bg-primary text-text-primary"
    >
      {/* Toast Notification Container */}
      <div id="toast-notifications-rack" className="fixed bottom-20 md:bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border text-xs font-medium animate-slide-in pointer-events-auto ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-100 text-emerald-800 dark:bg-zinc-900 dark:border-emerald-500/20 dark:text-emerald-400"
                : toast.type === "error"
                ? "bg-rose-50 border-rose-100 text-rose-800 dark:bg-zinc-900 dark:border-rose-500/20 dark:text-rose-400"
                : "bg-white border-slate-200 text-slate-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-200"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${
              toast.type === "success" ? "bg-emerald-500" : toast.type === "error" ? "bg-rose-500" : "bg-blue-500"
            }`}></div>
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      {/* MOBILE PORT LAYOUT */}
      {isMobile ? (
        <div id="mobile-viewport" className={`flex-grow w-full h-full flex flex-col overflow-hidden ${(activeNoteId && mobileTab === "notes") ? "pb-0" : "pb-16"}`}>
          <header className={`px-4 py-3.5 border-b flex items-center justify-between select-none ${
            activeTheme === "dark" ? "bg-zinc-950/80 border-zinc-850" : "bg-white/80 border-slate-200"
          }`}>
             <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 cursor-pointer"
                title="Open Sidebar"
              >
                <Menu size={16} />
              </button>
              <span className="font-display font-bold text-xs tracking-tight">
                {mobileTab === "home" && "Dashboard Analytics"}
                {mobileTab === "notes" && (activeNoteId ? "Document Editor" : "Notes List")}
                {mobileTab === "ai" && "Gemini Co-Pilot"}
                {mobileTab === "settings" && "Aura Settings"}
              </span>
            </div>

            {mobileTab === "notes" && activeNoteId && (
              <button
                onClick={() => setActiveNoteId(null)}
                className="flex items-center gap-1 text-[11px] font-bold text-blue-500 py-1 px-2.5 rounded-lg bg-blue-500/10 cursor-pointer"
              >
                <ArrowLeft size={11} />
                Exit Note
              </button>
            )}

            {!activeNoteId && (
              <button
                onClick={() => setIsCommandPaletteOpen(true)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 cursor-pointer"
              >
                <Sparkles size={14} className="text-blue-500 animate-pulse" />
              </button>
            )}
          </header>

          <div className="flex-grow w-full overflow-hidden relative">
            {/* Mobile Slide-in Drawer */}
            {isMobileSidebarOpen && (
              <div className="fixed inset-0 z-50 flex select-none">
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-xs"
                  onClick={() => setIsMobileSidebarOpen(false)}
                ></div>

                {/* Sidebar Content container */}
                <div
                  className={`relative w-72 max-w-[85%] h-full flex flex-col shadow-2xl border-r transition-transform duration-300 ${
                    activeTheme === "dark" ? "bg-zinc-950 text-zinc-100 border-zinc-800" : "bg-white text-slate-800 border-slate-200"
                  }`}
                >
                  {/* Sidebar Component */}
                  <div className="flex-grow overflow-y-auto" onClick={() => setIsMobileSidebarOpen(false)}>
                    <Sidebar
                      notes={allWorkspaceNotes}
                      folders={workspaceFolders}
                      tags={tagsList}
                      activeFolder={activeFolder}
                      setActiveFolder={setActiveFolder}
                      activeTag={activeTag}
                      setActiveTag={setActiveTag}
                      onNewNote={handleNewNote}
                      activeNoteId={activeNoteId}
                      setActiveNoteId={setActiveNoteId}
                      onOpenSettings={() => setIsSettingsOpen(true)}
                      onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
                      isSidebarCollapsed={false}
                      setIsSidebarCollapsed={() => {}}
                      theme={activeTheme}
                      currentUserEmail={userEmail}
                      workspaces={workspaces}
                      activeWorkspaceId={activeWorkspaceId}
                      setActiveWorkspaceId={handleSelectWorkspace}
                      onCreateWorkspace={handleCreateWorkspace}
                      onDeleteWorkspace={handleDeleteWorkspace}
                      onTogglePinWorkspace={handleTogglePinWorkspace}
                      onToggleFavoriteWorkspace={handleToggleFavoriteWorkspace}
                      onNewFolder={handleNewFolder}
                      onRenameFolder={handleRenameFolder}
                      onDeleteFolder={handleDeleteFolder}
                      onMoveFolder={handleMoveFolder}
                      onUpdateFolderExpanded={handleUpdateFolderExpanded}
                      onMoveNotesToFolder={handleMoveNotesToFolder}
                      onToggleFavoriteNote={handleToggleFavoriteNote}
                      onToggleArchiveNote={handleToggleArchiveNote}
                      onDeleteNote={handleDeleteNote}
                      onSignOut={onSignOut}
                    />
                  </div>
                </div>
              </div>
            )}
            {isTransitioning && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#FAFAFC]/90 dark:bg-[#09090b]/90 backdrop-blur-xs transition-opacity duration-200">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                <span className="text-[10px] font-mono tracking-widest text-slate-400 dark:text-zinc-500 uppercase mt-3">
                  Switching Nodes...
                </span>
              </div>
            )}

            {mobileTab === "home" && (
              <Dashboard
                notes={workspaceNotes}
                setActiveNoteId={(id) => {
                  setActiveNoteId(id);
                  setMobileTab("notes");
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
            )}

            {mobileTab === "notes" && (
              activeNoteId === null ? (
                <NotesList
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
                  onTogglePinNote={handleTogglePinNote}
                  onToggleFavoriteNote={handleToggleFavoriteNote}
                  onDeleteNote={handleDeleteNote}
                />
              ) : (
                <EditorArea
                  note={activeNote}
                  onUpdateNote={handleUpdateActiveNote}
                  onOpenAiAssistant={() => setMobileTab("ai")}
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
                />
              )
            )}

            {mobileTab === "ai" && (
              <AiPanel
                note={activeNote}
                onUpdateNote={handleUpdateActiveNote}
                onClose={() => setMobileTab("notes")}
                theme={activeTheme}
                onAddToast={addToast}
              />
            )}

            {mobileTab === "settings" && (
              <div className="h-full overflow-y-auto p-4 flex flex-col gap-6 text-xs">
                <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center font-bold text-white text-sm">
                    {userEmail[0].toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 dark:text-zinc-100">{userEmail.split("@")[0]}</span>
                    <span className="text-[10px] text-slate-400">{userEmail}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className={`p-3.5 rounded-xl border flex items-center justify-between font-bold ${
                      activeTheme === "dark" ? "bg-zinc-900 border-zinc-800" : "bg-white border-slate-200"
                    } cursor-pointer`}
                  >
                    <div className="flex items-center gap-2.5">
                      <SettingsIcon size={14} className="text-blue-500" />
                      <span>Adjust Settings Panel</span>
                    </div>
                    <span className="text-slate-400 text-[10px]">Open Settings</span>
                  </button>

                  <button
                    onClick={onSignOut}
                    className="p-3.5 rounded-xl border flex items-center justify-between font-bold border-rose-500/20 bg-rose-500/5 text-rose-500 cursor-pointer"
                  >
                    <span>Sign Out from Workspace</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {(!activeNoteId || mobileTab === "home") && (
            <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3 select-none">
              {isFabOpen && (
                <div className={`p-1.5 rounded-2xl border flex flex-col gap-1 shadow-2xl transition-all ${
                  activeTheme === "dark" ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-white border-slate-200 text-slate-700"
                }`}>
                  <button
                    onClick={handleNewNote}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 text-left w-full cursor-pointer"
                  >
                    <Plus size={13} className="text-blue-500" />
                    New Text Note
                  </button>
                  <button
                    onClick={() => {
                      setShowVoiceRecorder(true);
                      setIsFabOpen(false);
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 text-left w-full cursor-pointer"
                  >
                    <Mic size={13} className="text-purple-500" />
                    Voice Memo (AI Transcribe)
                  </button>
                  <button
                    onClick={() => {
                      setShowDrawingPad(true);
                      setIsFabOpen(false);
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800 text-left w-full cursor-pointer"
                  >
                    <PenTool size={13} className="text-pink-500" />
                    Quick Sketch Pad
                  </button>
                </div>
              )}

              <button
                onClick={() => setIsFabOpen(!isFabOpen)}
                className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
              >
                {isFabOpen ? <X size={18} /> : <Plus size={18} />}
              </button>
            </div>
          )}

          {(!activeNoteId || mobileTab !== "notes") && (
            <nav className={`fixed bottom-0 left-0 right-0 h-16 border-t flex items-center justify-around z-30 shadow-md ${
              activeTheme === "dark" ? "bg-[#141416]/95 border-zinc-850" : "bg-white/95 border-slate-200"
            }`}>
            {[
              { id: "home", label: "Home", icon: Home },
              { id: "notes", label: "Notes", icon: FileText },
              { id: "ai", label: "Co-Pilot", icon: Sparkles },
              { id: "settings", label: "Settings", icon: SettingsIcon },
            ].map((tab) => {
              const isSelected = mobileTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setMobileTab(tab.id as any);
                    if (tab.id !== "notes") {
                      setActiveNoteId(null);
                    }
                  }}
                  className={`flex flex-col items-center justify-center py-1 flex-1 cursor-pointer min-h-[44px] ${
                    isSelected
                      ? "text-blue-500"
                      : "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400"
                  }`}
                >
                  <tab.icon size={16} />
                  <span className="text-[10px] font-semibold mt-1 tracking-tight">{tab.label}</span>
                </button>
              );
            })}
          </nav>
          )}
        </div>
      ) : (
        /* DESKTOP / TABLET LAYOUT */
        <>
          {!isFocusMode && (
            <Sidebar
              notes={allWorkspaceNotes}
              folders={workspaceFolders}
              tags={tagsList}
              activeFolder={activeFolder}
              setActiveFolder={setActiveFolder}
              activeTag={activeTag}
              setActiveTag={setActiveTag}
              onNewNote={handleNewNote}
              activeNoteId={activeNoteId}
              setActiveNoteId={setActiveNoteId}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
              isSidebarCollapsed={isSidebarCollapsed}
              setIsSidebarCollapsed={setIsSidebarCollapsed}
              theme={activeTheme}
              currentUserEmail={userEmail}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              setActiveWorkspaceId={handleSelectWorkspace}
              onCreateWorkspace={handleCreateWorkspace}
              onDeleteWorkspace={handleDeleteWorkspace}
              onTogglePinWorkspace={handleTogglePinWorkspace}
              onToggleFavoriteWorkspace={handleToggleFavoriteWorkspace}
              onNewFolder={handleNewFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onMoveFolder={handleMoveFolder}
              onUpdateFolderExpanded={handleUpdateFolderExpanded}
              onMoveNotesToFolder={handleMoveNotesToFolder}
              onToggleFavoriteNote={handleToggleFavoriteNote}
              onToggleArchiveNote={handleToggleArchiveNote}
              onDeleteNote={handleDeleteNote}
              onSignOut={onSignOut}
            />
          )}

          {!isFocusMode && activeFolder !== "Dashboard" && (
            <NotesList
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
              width={notesListWidth}
              onTogglePinNote={handleTogglePinNote}
              onToggleFavoriteNote={handleToggleFavoriteNote}
              onDeleteNote={handleDeleteNote}
            />
          )}

          {!isFocusMode && activeFolder !== "Dashboard" && (
            <div
              className="w-1.5 h-full hover:bg-blue-500/20 active:bg-blue-500/40 cursor-col-resize transition-colors flex-shrink-0 select-none flex items-center justify-center relative z-40"
              onMouseDown={handleNotesListResizeMouseDown}
            >
              <div className="w-[1px] h-full bg-slate-200 dark:bg-zinc-800/80 hover:bg-blue-500"></div>
            </div>
          )}

          <div id="main-content-pane" className="flex-grow h-full flex overflow-hidden min-w-0 relative">
            {isTransitioning && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#FAFAFC]/90 dark:bg-[#09090b]/90 backdrop-blur-xs transition-opacity duration-200">
                <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                <span className="text-[10px] font-mono tracking-widest text-slate-400 dark:text-zinc-500 uppercase mt-3">
                  Syncing Workspace Node...
                </span>
              </div>
            )}

            {activeFolder === "Dashboard" ? (
              <Dashboard
                notes={workspaceNotes}
                setActiveNoteId={setActiveNoteId}
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
            ) : activeNoteId === null ? (
              activeFolder === "Trash" ? (
                <TrashView
                  hasNotes={allWorkspaceNotes.some(n => n.isTrashed)}
                  onEmptyTrash={handleEmptyTrash}
                />
              ) : activeFolder === "Archive" ? (
                <ArchiveView />
              ) : (
                <div className="flex-grow h-full flex flex-col items-center justify-center p-8 text-center bg-[#FAFAFC] dark:bg-[#09090b] select-none animate-fade-in">
                  <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-zinc-900/60 flex items-center justify-center mb-4 text-slate-400 dark:text-zinc-500">
                    {activeFolder === "Favorites" ? (
                      <Star size={28} className="text-yellow-500 fill-yellow-500/10" />
                    ) : activeFolder === "Shared" ? (
                      <Share2 size={28} className="text-blue-500" />
                    ) : activeFolder === "Drafts" ? (
                      <FileEdit size={28} className="text-amber-500" />
                    ) : activeFolder === "Published" ? (
                      <Globe size={28} className="text-emerald-500" />
                    ) : (
                      <FileText size={28} className="text-slate-500" />
                    )}
                  </div>
                  <h3 className="font-display font-semibold text-slate-800 dark:text-zinc-200 text-base mb-1">
                    {activeFolder === "Favorites"
                      ? "Favorite Notes"
                      : activeFolder === "Drafts"
                      ? "Draft Notes"
                      : activeFolder === "Published"
                      ? "Published Notes"
                      : activeFolder === "Shared"
                      ? "Shared Notes"
                      : (folders.find((f) => f.id === activeFolder)?.name || activeFolder)}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-xs leading-relaxed">
                    {activeFolder === "Favorites"
                      ? "Select one of your favorite notes to start editing."
                      : activeFolder === "Drafts"
                      ? "Select a draft note to continue writing."
                      : activeFolder === "Published"
                      ? "Select a published note to manage publication or edit content."
                      : activeFolder === "Shared"
                      ? "Select a shared note to view or copy the link."
                      : "Select a note from the list to view and edit its contents, or create a new note."}
                  </p>
                  <button
                    onClick={handleNewNote}
                    className="mt-5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 animate-bounce-slow"
                  >
                    <Plus size={14} />
                    <span>Create New Note</span>
                  </button>
                </div>
              )
            ) : (
              <EditorArea
                note={activeNote}
                onUpdateNote={handleUpdateActiveNote}
                onOpenAiAssistant={() => setIsAiPanelOpen(true)}
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
              />
            )}

            {isAiPanelOpen && activeFolder !== "Dashboard" && activeNoteId !== null && !isFocusMode && (
              <AiPanel
                note={activeNote}
                onUpdateNote={handleUpdateActiveNote}
                onClose={() => setIsAiPanelOpen(false)}
                theme={activeTheme}
                onAddToast={addToast}
              />
            )}
          </div>
        </>
      )}

      {/* GLOBAL SHARED SIMULATED DIALOGS & OVERLAYS */}

      {/* 1. Simulated Voice Recorder overlay */}
      {showVoiceRecorder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none p-4">
          <div className={`w-full max-w-sm p-6 rounded-3xl border text-center flex flex-col items-center shadow-2xl ${
            activeTheme === "dark" ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-white border-slate-200 text-slate-800"
          }`}>
            <div className="relative mb-4 flex items-center justify-center">
              {voiceStatus === "recording" && (
                <div className="absolute inset-0 w-16 h-16 rounded-full border border-red-500/30 animate-ping"></div>
              )}
              <div className={`w-14 h-14 rounded-full flex items-center justify-center relative ${
                voiceStatus === "recording"
                  ? "bg-red-500/10 text-red-500 animate-pulse"
                  : "bg-blue-500/10 text-blue-500"
              }`}>
                {voiceStatus === "recording" ? <Mic size={24} /> : <Volume2 size={24} className="animate-bounce" />}
              </div>
            </div>

            <h4 className="font-semibold text-sm">
              {voiceStatus === "recording" && "Recording Strategy Voice Memo"}
              {voiceStatus === "transcribing" && "Gemini compiling audio logs..."}
              {voiceStatus === "success" && "Voice compilation complete!"}
            </h4>

            <p className="text-[10px] text-slate-400 mt-1 max-w-[240px] leading-relaxed">
              {voiceStatus === "recording" && `Audio stream recording active. Speak clearly... (${voiceTimer}s remaining)`}
              {voiceStatus === "transcribing" && "Formulating document outline, tags, and action-items checklists from transcription buffers."}
              {voiceStatus === "success" && "Successfully launched transcript record into active space."}
            </p>

            {voiceStatus === "recording" && (
              <div className="flex gap-1 items-center justify-center h-8 mt-5">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-red-500 rounded-full animate-voice-bar"
                    style={{
                      height: `${Math.random() * 24 + 6}px`,
                      animationDelay: `${i * 0.15}s`
                    }}
                  ></div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Drawing Scratchpad overlay */}
      {showDrawingPad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl border flex flex-col gap-4 shadow-2xl ${
            activeTheme === "dark" ? "bg-zinc-900 border-zinc-800 text-zinc-100" : "bg-white border-slate-200 text-slate-800"
          }`}>
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-sm">Quick Drawing Scratchpad</h4>
              <button
                onClick={() => setShowDrawingPad(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={15} />
              </button>
            </div>

            <p className="text-[10.5px] text-slate-400 leading-snug">
              Doodle your strategy layouts, product mockups, or sign-offs below using touch gestures.
            </p>

            <canvas
              ref={canvasRef}
              width={360}
              height={180}
              onMouseDown={startDrawing}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onMouseMove={draw}
              onTouchStart={startDrawing}
              onTouchEnd={stopDrawing}
              onTouchMove={draw}
              className={`w-full h-[180px] rounded-xl border border-dashed outline-none ${
                activeTheme === "dark" ? "bg-zinc-950 border-zinc-800 cursor-crosshair" : "bg-slate-50 border-slate-300 cursor-crosshair"
              }`}
            ></canvas>

            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={() => {
                  const canvas = canvasRef.current;
                  const ctx = canvas?.getContext("2d");
                  if (canvas && ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                  }
                }}
                className={`px-3 py-2 border text-[11px] font-semibold rounded-lg ${
                  activeTheme === "dark" ? "border-zinc-800 hover:bg-zinc-800" : "border-slate-200 hover:bg-slate-50"
                } cursor-pointer`}
              >
                Clear Sketch
              </button>

              <button
                onClick={handleSaveDrawing}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg text-[11px] cursor-pointer"
              >
                Save Sketch to Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. SETTINGS DIALOG MODAL */}
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
      />

      {/* 4. COMMAND PALETTE SPOTLIGHT MODAL */}
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
      />
    </div>
  );
}
