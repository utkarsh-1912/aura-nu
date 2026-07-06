export interface Note {
  id: string;
  workspaceId: string;
  departmentId?: string;
  projectId?: string;
  title: string;
  content: string;
  tags: string[];
  isPinned: boolean;
  isShared: boolean;
  isFavorite: boolean;
  folder: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  readingTime: number;
  isArchived?: boolean;
  isTrashed?: boolean;
  isLocked?: boolean;
  status?: "Draft" | "In Review" | "Published" | "Archived";
  versionHistory?: { timestamp: string; content: string }[];
}

export interface Reminder {
  id: string;
  workspaceId: string;
  text: string;
  date: string;
  completed: boolean;
  noteId?: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  text: string;
  completed: boolean;
  noteId?: string;
}

export interface Activity {
  id: string;
  workspaceId: string;
  text: string;
  timestamp: string;
  type: "create" | "edit" | "ai" | "share" | "pin" | "archive" | "trash" | "favorite" | "workspace";
}

export interface Settings {
  theme: "light" | "dark" | "system";
  fontSize: "sm" | "base" | "lg" | "xl";
  autoSave: boolean;
  aiModel: string;
  defaultFolder: string;
  shortcutsEnabled: boolean;
  enableNotifications: boolean;
  lineWrapping: boolean;
  showLineNumbers: boolean;
}

export interface WorkspaceAnalytics {
  totalNotes: number;
  pinnedCount: number;
  sharedCount: number;
  favoriteCount: number;
  totalWords: number;
  folderDistribution: { name: string; value: number }[];
  tagCloud: { name: string; count: number }[];
}

export type WorkspaceType = "Personal" | "Team" | "Organization" | "Client" | "Project" | "Department";

export type WorkspaceRole = "Owner" | "Admin" | "Manager" | "Editor" | "Contributor" | "Commenter" | "Viewer" | "Guest";

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
  avatarUrl?: string;
}

export interface WorkspaceTemplate {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface WorkspaceIntegration {
  id: string;
  name: string;
  desc: string;
  status: "Connected" | "Disconnected";
  icon: string;
}

export interface SharedLink {
  id: string;
  noteId: string;
  title: string;
  url: string;
  expiresAt: string;
  viewsCount: number;
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: "pending" | "approved" | "expired";
  sentAt: string;
  expiresAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  timestamp: string;
  ipAddress: string;
}

export interface Project {
  id: string;
  name: string;
  folders: string[];
}

export interface Department {
  id: string;
  name: string;
  projects: Project[];
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  logoUrl?: string;
  icon: string;
  role: WorkspaceRole;
  isPinned: boolean;
  isFavorite: boolean;
  storageUsage: number; // in bytes or KB
  storageQuota: number; // in MB (e.g., 5MB or 100MB)
  members: WorkspaceMember[];
  templates: WorkspaceTemplate[];
  settings: Settings;
  integrations: WorkspaceIntegration[];
  sharedLinks: SharedLink[];
  invitations: WorkspaceInvitation[];
  auditLogs: AuditLogEntry[];
  departments: Department[];
  aiHistory: { prompt: string; result: string; timestamp: string }[];
}

export interface Folder {
  id: string;
  workspaceId: string;
  name: string;
  parentId?: string; // Supports unlimited nesting
  color?: string; // Supports custom folder colors (e.g. hex code or tailwind class)
  icon?: string; // Emoji or Lucide icon name
  isExpanded?: boolean; // Remember expanded/collapsed state
}

