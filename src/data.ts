import { Workspace, Note, Reminder, Activity, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  fontSize: "base",
  autoSave: true,
  aiModel: "gemini-3.5-flash",
  defaultFolder: "General",
  shortcutsEnabled: true,
  enableNotifications: true,
  lineWrapping: true,
  showLineNumbers: true,
};
export const getCleanInitialWorkspaces = (userEmail: string): Workspace[] => {
  const userName = userEmail.split("@")[0];
  const capitalized = userName.charAt(0).toUpperCase() + userName.slice(1);
  return [
    {
      id: "ws-personal",
      name: `${capitalized}'s Space`,
      type: "Personal",
      icon: "User",
      role: "Owner",
      isPinned: true,
      isFavorite: false,
      storageUsage: 0,
      storageQuota: 10,
      settings: {
        theme: "light",
        fontSize: "base",
        autoSave: true,
        aiModel: "gemini-3.5-flash",
        defaultFolder: "General",
        shortcutsEnabled: true,
        enableNotifications: true,
      },
      members: [
        { id: "m-1", name: capitalized, email: userEmail, role: "Owner", joinedAt: new Date().toISOString().split("T")[0] }
      ],
      templates: [],
      integrations: [],
      sharedLinks: [],
      invitations: [],
      auditLogs: [],
      departments: [],
      aiHistory: []
    }
  ];
};
export const INITIAL_WORKSPACES: Workspace[] = [
  {
    id: "ws-aura-core",
    name: "Aura Core Team",
    type: "Team",
    icon: "Users",
    role: "Admin",
    isPinned: true,
    isFavorite: true,
    storageUsage: 45056, // 44 KB
    storageQuota: 5, // 5 MB
    settings: { ...DEFAULT_SETTINGS, theme: "dark" },
    members: [
      { id: "m-1", name: "Utkarsh Gupta", email: "gutkarshlb@gmail.com", role: "Admin", joinedAt: "2026-01-10", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Utkarsh" },
      { id: "m-2", name: "Sarah Chen", email: "sarah.chen@aura.io", role: "Owner", joinedAt: "2026-01-02", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah" },
      { id: "m-3", name: "Marcus Brody", email: "marcus.brody@aura.io", role: "Manager", joinedAt: "2026-01-15", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus" },
      { id: "m-4", name: "Elena Rostova", email: "elena@aura.io", role: "Editor", joinedAt: "2026-02-01", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elena" },
      { id: "m-5", name: "David Kim", email: "david.k@aura.io", role: "Contributor", joinedAt: "2026-02-15", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=David" },
    ],
    templates: [
      { id: "t-1", title: "📋 Daily Standup Notes", content: "# 📋 Daily Standup Notes\n\n**Date**: {{date}}\n\n### ⚡ Yesterday's Progress\n- What did I accomplish yesterday?\n\n### 🎯 Today's Goals\n- What will I commit to completing today?\n\n### 🛑 Impediments / Blockers\n- Any dependencies or blockers?", tags: ["Standup", "Daily"] },
      { id: "t-2", title: "🚀 Product Spec (PRD)", content: "# 🚀 Product Requirements Document (PRD)\n\n## 📝 Executive Summary\nDescribe the high level concept and why we are building this.\n\n## 🎯 Objectives & Success Metrics\nHow do we define success? What are the key KPIs?\n\n## 👥 User Personas & Flows\nWho is this feature for and how will they use it?", tags: ["Product", "PRD"] }
    ],
    integrations: [
      { id: "int-1", name: "Google Drive Backup", desc: "Automate raw PDF export formats into private storage folders.", status: "Connected", icon: "HardDrive" },
      { id: "int-2", name: "Slack Communications", desc: "Broadcast generated board minutes and summaries to selected channels.", status: "Disconnected", icon: "Link" },
    ],
    sharedLinks: [
      { id: "sh-1", noteId: "welcome-note", title: "✨ Welcome to Aura Notes", url: "https://aura.io/s/welcome-aura", expiresAt: "2026-12-31", viewsCount: 142 }
    ],
    invitations: [
      { id: "inv-1", email: "claire.redfield@aura.io", role: "Contributor", status: "pending", sentAt: "2026-07-04", expiresAt: "2026-07-11" },
      { id: "inv-2", email: "leon.kennedy@umbrella.com", role: "Viewer", status: "expired", sentAt: "2026-06-01", expiresAt: "2026-06-08" }
    ],
    auditLogs: [
      { id: "aud-1", userId: "m-1", userEmail: "gutkarshlb@gmail.com", action: "Updated Settings", timestamp: "2026-07-05T10:30:00Z", ipAddress: "192.168.1.104" },
      { id: "aud-2", userId: "m-2", userEmail: "sarah.chen@aura.io", action: "Pinned welcome note", timestamp: "2026-07-05T09:15:00Z", ipAddress: "192.168.1.100" }
    ],
    departments: [
      {
        id: "dept-engineering",
        name: "Engineering",
        projects: [
          { id: "proj-core-app", name: "Core Notes App", folders: ["General", "Database", "UI Components"] },
          { id: "proj-api-layer", name: "Vite Server API", folders: ["Endpoints", "Security"] }
        ]
      },
      {
        id: "dept-product",
        name: "Product Design",
        projects: [
          { id: "proj-branding", name: "Aura Brand Identity", folders: ["Style Guide", "Logos"] }
        ]
      }
    ],
    aiHistory: [
      { prompt: "Summarize this note", result: "Aura Notes is a professional note taking client designed with custom fonts, keyboard shortcuts, and full local redundancy.", timestamp: "2026-07-05T11:00:00Z" }
    ]
  },
  {
    id: "ws-personal",
    name: "My Personal Space",
    type: "Personal",
    icon: "User",
    role: "Owner",
    isPinned: true,
    isFavorite: false,
    storageUsage: 8192, // 8 KB
    storageQuota: 2, // 2 MB
    settings: { ...DEFAULT_SETTINGS, theme: "light" },
    members: [
      { id: "m-1", name: "Utkarsh Gupta", email: "gutkarshlb@gmail.com", role: "Owner", joinedAt: "2026-01-01", avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Utkarsh" }
    ],
    templates: [
      { id: "t-personal-1", title: "☀️ Morning Journaling", content: "# ☀️ Morning Reflection\n\n- **Mood**: \n- **Intentions for Today**: \n- **Gratitude list**:\n  1.\n  2.\n  3.", tags: ["Journal", "Mental Health"] }
    ],
    integrations: [
      { id: "int-personal-1", name: "Fitbit Sync", desc: "Import health statistics into a daily logs folder.", status: "Disconnected", icon: "Activity" }
    ],
    sharedLinks: [],
    invitations: [],
    auditLogs: [],
    departments: [],
    aiHistory: []
  },
  {
    id: "ws-engineering",
    name: "Engineering Division",
    type: "Department",
    icon: "Cpu",
    role: "Manager",
    isPinned: false,
    isFavorite: true,
    storageUsage: 24576, // 24 KB
    storageQuota: 10, // 10 MB
    settings: { ...DEFAULT_SETTINGS, theme: "dark" },
    members: [
      { id: "m-1", name: "Utkarsh Gupta", email: "gutkarshlb@gmail.com", role: "Manager", joinedAt: "2026-01-05" },
      { id: "m-5", name: "David Kim", email: "david.k@aura.io", role: "Admin", joinedAt: "2026-01-10" },
      { id: "m-e1", name: "Linus T.", email: "linus@kernel.org", role: "Editor", joinedAt: "2026-02-15" }
    ],
    templates: [
      { id: "t-eng-1", title: "🐛 Bug Report Spec", content: "# 🐛 Bug Report: [Short Title]\n\n### 📝 Description\nProvide a clear summary of the unexpected behavior.\n\n### 👣 Steps to Reproduce\n1.\n2.\n3.\n\n### 🎯 Expected vs. Actual Outcome\n- Expected:\n- Actual:", tags: ["QA", "Bugs"] }
    ],
    integrations: [
      { id: "int-git", name: "GitHub Sync", desc: "Commit markdown documentation straight into codebase master branches.", status: "Connected", icon: "GitBranch" }
    ],
    sharedLinks: [],
    invitations: [],
    auditLogs: [],
    departments: [
      {
        id: "eng-core",
        name: "Backend Nodes",
        projects: [
          { id: "proj-express", name: "Express Container", folders: ["Routes", "Docker"] }
        ]
      }
    ],
    aiHistory: []
  },
  {
    id: "ws-acme",
    name: "Acme Corp Client Hub",
    type: "Client",
    icon: "Briefcase",
    role: "Editor",
    isPinned: false,
    isFavorite: false,
    storageUsage: 12288, // 12 KB
    storageQuota: 5, // 5 MB
    settings: DEFAULT_SETTINGS,
    members: [
      { id: "m-1", name: "Utkarsh Gupta", email: "gutkarshlb@gmail.com", role: "Editor", joinedAt: "2026-02-20" },
      { id: "m-ac1", name: "John Acme", email: "john@acme.com", role: "Owner", joinedAt: "2026-02-20" }
    ],
    templates: [],
    integrations: [],
    sharedLinks: [],
    invitations: [],
    auditLogs: [],
    departments: [],
    aiHistory: []
  }
];

export const INITIAL_NOTES: Note[] = [
  // 1. Aura Core Notes
  {
    id: "welcome-note",
    workspaceId: "ws-aura-core",
    departmentId: "dept-engineering",
    projectId: "proj-core-app",
    title: "✨ Welcome to Aura Notes",
    content: `# Welcome to Aura Notes\n\nAura Notes is a luxurious, minimalist, enterprise-grade note-taking workspace designed for professionals who appreciate simplicity, design, and intelligent assistance.\n\n### Core Features:\n- **Clean Layout**: Sidebars, real-time searchable list, and beautiful editor area.\n- **Keyboard Shortcuts**: Work faster with native commands.\n- **Aesthetic Pairings**: Styled with the Inter & JetBrains Mono font faces, frosted glass layers, and micro-animations.\n- **Embedded Table Component**: Insert and edit rich tabular data within notes.\n- **Interactive AI Assistant**: Summarize, translate, rewrite, extract action items, and chat directly in context.\n\n*Aura is offline-first and automatically synchronized with the server.*`,
    tags: ["Onboarding", "Guides", "Enterprise"],
    isPinned: true,
    isShared: false,
    isFavorite: true,
    folder: "UI Components",
    createdAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    wordCount: 114,
    readingTime: 1
  },
  {
    id: "project-launch",
    workspaceId: "ws-aura-core",
    departmentId: "dept-engineering",
    projectId: "proj-core-app",
    title: "🚀 Aura Enterprise Launch Plan",
    content: `# Aura Enterprise Launch Plan\n\nThis note outlines the critical tasks and timeline for launching the premium enterprise productivity package.\n\n### Key Pillars:\n1. **Design Execution**: High contrast visual hierarchy, fluid animations, and dark/light modes.\n2. **AI Layer**: Instant contextual shortcuts (Action Items, Summarization, Translations).\n3. **Scalability**: High performance UI with multi-view toggles and responsive grid analytics.\n\n### Progress Checklist:\n- [x] Design visual components (frosted glass card style)\n- [x] Implement the AI Assistant panel\n- [ ] Deploy Cloud Run container\n- [ ] Configure custom domains\n\n### Project Metrics:\n| Phase | Goal | Status |\n|---|---|---|\n| Phase 1 | UI/UX Complete | Done |\n| Phase 2 | Gemini Backend | Active |\n| Phase 3 | Enterprise Scale | Upcoming |\n\n*Target Launch Date: Q3 2026*`,
    tags: ["Product", "Launch", "Checklist"],
    isPinned: false,
    isShared: true,
    isFavorite: true,
    folder: "General",
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    wordCount: 135,
    readingTime: 1
  },
  {
    id: "meeting-minutes",
    workspaceId: "ws-aura-core",
    departmentId: "dept-product",
    projectId: "proj-branding",
    title: "📅 Q3 Strategy & OKR Sync",
    content: `# Q3 Strategy & OKR Sync\n\n**Date**: July 5, 2026\n**Attendees**: Sarah, Marcus, David, Elena\n\n### Objectives Covered:\n- Standardize enterprise security capabilities.\n- Refine user onboarding flow to reduce drop-off rate by 15%.\n- Optimize real-time data sync latency.\n\n### Discussion Points:\nElena presented the latest telemetry reports. Design-centric changes have shown a 24% increase in daily active user duration. David suggested adding auto-save status and clear reading indicators.\n\n### Key Decisions:\n- Approved shift towards premium Inter font hierarchy.\n- Standardized large rounded borders (16-24px) for cards.\n- Agreed on using Gemini 3.5 Flash for the in-context AI panel.\n\n*Action items will be extracted automatically using the AI Panel on the right!*`,
    tags: ["Meetings", "Strategy", "Q3"],
    isPinned: false,
    isShared: false,
    isFavorite: false,
    folder: "Style Guide",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    wordCount: 124,
    readingTime: 1
  },

  // 2. Personal Workspace Notes
  {
    id: "journal-note",
    workspaceId: "ws-personal",
    title: "☀️ Morning reflection",
    content: `# Morning Reflection & Wellness Log\n\n**Date**: July 5, 2026\n**Time**: 07:30 AM\n\n- **Mood**: Focused and calm\n- **Sleep Rating**: 8/10\n\n### 💡 Morning Intentions:\n- Spend at least 45 minutes coding core layout refinements without distractions.\n- Take a 15-minute walk outside after lunch.\n\n### 🌿 Gratitude list:\n1. Working on highly responsive and elegant React projects.\n2. Fresh single-origin drip coffee.\n3. Great summer weather.`,
    tags: ["Journal", "Personal", "Gratitude"],
    isPinned: true,
    isShared: false,
    isFavorite: true,
    folder: "General",
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    wordCount: 88,
    readingTime: 1
  },
  {
    id: "shopping-list",
    workspaceId: "ws-personal",
    title: "🛒 Shopping Checklist",
    content: `# 🛒 Shopping Checklist\n\n### Groceries:\n- [x] Ethiopian espresso whole beans\n- [ ] Oat milk (extra creamy)\n- [ ] Fresh organic spinach\n- [ ] avocados\n- [ ] Wild-caught salmon\n\n### Hardware:\n- [ ] USB-C Hub (4 Port, multi-display support)\n- [ ] Mechanical keyboard switch puller`,
    tags: ["Shopping", "Checklist"],
    isPinned: false,
    isShared: false,
    isFavorite: false,
    folder: "Lists",
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    wordCount: 52,
    readingTime: 1
  },

  // 3. Engineering Workspace Notes
  {
    id: "refactor-plan",
    workspaceId: "ws-engineering",
    departmentId: "eng-core",
    projectId: "proj-express",
    title: "⚙️ Express Server refactoring specs",
    content: `# Express Server Refactoring Spec\n\n**Objective**: Restructure the Node container server endpoints to safely isolate workspace contexts and optimize disk load pipelines.\n\n### 🛠️ Action Items:\n- [ ] Migrate \`notes-db.json\` into structural workspace volumes\n- [ ] Implement token authorization middlewares\n- [ ] Add Gzip compress filters to static client static trees`,
    tags: ["Dev", "Backend", "Express"],
    isPinned: true,
    isShared: false,
    isFavorite: true,
    folder: "Routes",
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    wordCount: 61,
    readingTime: 1
  },

  // 4. Acme Corp Workspace Notes
  {
    id: "acme-specs",
    workspaceId: "ws-acme",
    title: "💼 Acme Corporation Specifications",
    content: `# Acme Corp Client Hub Portal\n\n### Project Definition:\nDeploy a multi-tenant corporate communications engine powered by specialized models.\n\n### Deliverables:\n- Phase 1: Authentication gateway layout (Done)\n- Phase 2: Secure document sharing hub (Active)\n- Phase 3: SSO Integration (Upcoming)`,
    tags: ["Acme", "Specs", "Deliverables"],
    isPinned: true,
    isShared: true,
    isFavorite: false,
    folder: "General",
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    wordCount: 54,
    readingTime: 1
  }
];

export const INITIAL_REMINDERS: Reminder[] = [
  { id: "rem-1", workspaceId: "ws-aura-core", text: "Finalize marketing assets for landing page", date: new Date().toISOString(), completed: false },
  { id: "rem-2", workspaceId: "ws-aura-core", text: "Create OKR Strategy note template with Gemini", date: new Date().toISOString(), completed: false },
  { id: "rem-3", workspaceId: "ws-aura-core", text: "Refine dashboard visual progress bars", date: new Date().toISOString(), completed: true },
  { id: "rem-p1", workspaceId: "ws-personal", text: "Water the apartment monstera plants", date: new Date().toISOString(), completed: false },
  { id: "rem-e1", workspaceId: "ws-engineering", text: "Benchmark Express memory profiles", date: new Date().toISOString(), completed: false }
];

export const INITIAL_ACTIVITIES: Activity[] = [
  { id: "act-init-1", workspaceId: "ws-aura-core", text: "Synchronized workspace logs successfully", timestamp: new Date().toISOString(), type: "workspace" },
  { id: "act-init-2", workspaceId: "ws-aura-core", text: "Initialized Q3 OKR layout sheets", timestamp: new Date().toISOString(), type: "create" },
  { id: "act-init-3", workspaceId: "ws-personal", text: "Logged physical mood parameters", timestamp: new Date().toISOString(), type: "edit" }
];
