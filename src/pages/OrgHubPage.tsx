import React, { useState } from "react";
import {
  Shield,
  Users,
  Briefcase,
  Layers,
  Zap,
  TrendingUp,
  TrendingDown,
  Wrench,
  Megaphone,
  DollarSign,
  Palette,
  Clock,
  MessageSquare,
  FileText,
  Share2,
  Archive,
  Check,
  X,
  ChevronRight,
  FolderOpen
} from "lucide-react";

export interface OrgHubPageProps {
  theme: "light" | "dark";
  orgId: string;
  userEmail: string;
  onNavigateToAdmin: () => void;
  onNavigateToWorkspace: (wsId: string) => void;
}

// --- MOCK DATA ---

const METRICS = [
  { id: 1, label: "Total Members", value: "42", change: "+12%", isUp: true, icon: Users, color: "from-blue-500 to-cyan-400" },
  { id: 2, label: "Active Workspaces", value: "24", change: "+5%", isUp: true, icon: Briefcase, color: "from-indigo-500 to-purple-400" },
  { id: 3, label: "Departments", value: "5", change: "0%", isUp: true, icon: Layers, color: "from-fuchsia-500 to-pink-400" },
  { id: 4, label: "AI Actions This Month", value: "8,432", change: "-2%", isUp: false, icon: Zap, color: "from-amber-500 to-orange-400" },
];

const DEPARTMENTS = [
  { id: "dept-1", name: "Engineering", icon: Wrench, colorClass: "bg-blue-500", borderClass: "border-l-blue-500", members: 12, workspaces: 5, lead: { name: "Alice E.", email: "alice@auranext.com" }, lastActivity: "10 mins ago" },
  { id: "dept-2", name: "Marketing", icon: Megaphone, colorClass: "bg-pink-500", borderClass: "border-l-pink-500", members: 8, workspaces: 3, lead: { name: "Bob M.", email: "bob@auranext.com" }, lastActivity: "1 hour ago" },
  { id: "dept-3", name: "Sales", icon: Briefcase, colorClass: "bg-green-500", borderClass: "border-l-green-500", members: 15, workspaces: 7, lead: { name: "Charlie S.", email: "charlie@auranext.com" }, lastActivity: "5 mins ago" },
  { id: "dept-4", name: "Finance", icon: DollarSign, colorClass: "bg-amber-500", borderClass: "border-l-amber-500", members: 6, workspaces: 2, lead: { name: "Diana F.", email: "diana@auranext.com" }, lastActivity: "3 hours ago" },
  { id: "dept-5", name: "Design", icon: Palette, colorClass: "bg-purple-500", borderClass: "border-l-purple-500", members: 9, workspaces: 4, lead: { name: "Eve D.", email: "eve@auranext.com" }, lastActivity: "Just now" },
];

const RECENT_ACTIVITIES = [
  { id: 1, user: "john@auranext.com", initials: "JD", action: "created a new note in", workspace: "Q3 Roadmap", time: "10 mins ago", icon: FileText },
  { id: 2, user: "sarah@auranext.com", initials: "SM", action: "commented on", workspace: "Brand Guidelines", time: "25 mins ago", icon: MessageSquare },
  { id: 3, user: "mike@auranext.com", initials: "MK", action: "shared a document from", workspace: "Sales Playbook", time: "1 hour ago", icon: Share2 },
  { id: 4, user: "anna@auranext.com", initials: "AL", action: "edited specs in", workspace: "Frontend Architecture", time: "2 hours ago", icon: FileText },
  { id: 5, user: "tom@auranext.com", initials: "TH", action: "archived old assets in", workspace: "2024 Campaign", time: "3 hours ago", icon: Archive },
  { id: 6, user: "emma@auranext.com", initials: "EW", action: "created a new workspace", workspace: "Client Onboarding", time: "5 hours ago", icon: FolderOpen },
  { id: 7, user: "chris@auranext.com", initials: "CP", action: "commented on", workspace: "Budget Planning", time: "Yesterday", icon: MessageSquare },
  { id: 8, user: "olivia@auranext.com", initials: "OJ", action: "shared meeting notes in", workspace: "All Hands", time: "Yesterday", icon: Share2 },
  { id: 9, user: "lucas@auranext.com", initials: "LB", action: "edited", workspace: "Security Policies", time: "2 days ago", icon: FileText },
  { id: 10, user: "mia@auranext.com", initials: "MR", action: "archived", workspace: "Old Designs", time: "3 days ago", icon: Archive },
];

const QUICK_ACCESS_WORKSPACES = [
  { id: "ws-1", name: "Frontend Architecture", dept: "Engineering", members: 8, lastModified: "2 hours ago", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { id: "ws-2", name: "Brand Guidelines", dept: "Design", members: 5, lastModified: "25 mins ago", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { id: "ws-3", name: "Q3 Roadmap", dept: "Product", members: 12, lastModified: "10 mins ago", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  { id: "ws-4", name: "Sales Playbook", dept: "Sales", members: 15, lastModified: "1 hour ago", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  { id: "ws-5", name: "Budget Planning", dept: "Finance", members: 4, lastModified: "Yesterday", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
];

const INITIAL_INVITES = [
  { id: "inv-1", email: "newhire@auranext.com", role: "Member", date: "Today" },
  { id: "inv-2", email: "contractor@agency.com", role: "Guest", date: "Yesterday" },
];

// --- COMPONENT ---

export default function OrgHubPage({
  theme,
  orgId,
  userEmail,
  onNavigateToAdmin,
  onNavigateToWorkspace
}: OrgHubPageProps) {
  const isDark = theme === "dark";
  const [invites, setInvites] = useState(INITIAL_INVITES);
  const [showInvitesBanner, setShowInvitesBanner] = useState(true);

  const handleDismissInvites = () => setShowInvitesBanner(false);

  const handleAcceptInvite = (id: string) => {
    setInvites(invites.filter(inv => inv.id !== id));
    if (invites.length === 1) setShowInvitesBanner(false);
  };

  const handleDeclineInvite = (id: string) => {
    setInvites(invites.filter(inv => inv.id !== id));
    if (invites.length === 1) setShowInvitesBanner(false);
  };

  // Helper classes for glassmorphism
  const glassCardClasses = `rounded-xl border shadow-sm backdrop-blur-md transition-all
    ${isDark 
      ? "bg-slate-800/60 border-slate-700/50 hover:border-slate-600/80" 
      : "bg-white/80 border-slate-200/60 hover:border-slate-300/80"}`;

  const textPrimary = isDark ? "text-slate-100" : "text-slate-900";
  const textSecondary = isDark ? "text-slate-400" : "text-slate-500";
  const textMuted = isDark ? "text-slate-500" : "text-slate-400";
  const bgBody = isDark ? "bg-slate-900" : "bg-slate-50";

  return (
    <div className={`min-h-screen ${bgBody} ${textPrimary} font-sans selection:bg-violet-500/30 overflow-x-hidden`}>
      {/* HEADER */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md px-6 py-4 flex items-center justify-between
        ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white/80 border-slate-200"}`}>
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">Acme Corp</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20`}>
                Enterprise
              </span>
            </div>
            <p className={`text-sm ${textSecondary} flex items-center gap-2 mt-0.5`}>
              <Users size={14} /> 42 / 100 seats used
            </p>
          </div>
        </div>
        
        <button 
          onClick={onNavigateToAdmin}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${isDark 
              ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700" 
              : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm"}`}
        >
          <Shield size={16} className="text-violet-500" />
          Admin Console
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Main Content */}
        <div className="xl:col-span-8 flex flex-col gap-8">
          
          {/* STATS ROW */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {METRICS.map((metric) => (
              <div key={metric.id} className={`${glassCardClasses} p-5 flex flex-col`}>
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-lg bg-gradient-to-br ${metric.color} shadow-inner`}>
                    <metric.icon size={20} className="text-white" />
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md
                    ${metric.isUp 
                      ? (isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-700") 
                      : (isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-100 text-rose-700")}`}>
                    {metric.isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {metric.change}
                  </div>
                </div>
                <div>
                  <h3 className={`text-sm font-medium ${textSecondary}`}>{metric.label}</h3>
                  <p className="text-2xl font-bold mt-1 tracking-tight">{metric.value}</p>
                </div>
              </div>
            ))}
          </section>

          {/* QUICK ACCESS WORKSPACES */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock size={18} className="text-violet-500" />
                Quick Access
              </h2>
              <button className={`text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline`}>
                View all
              </button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar">
              {QUICK_ACCESS_WORKSPACES.map((ws) => (
                <div 
                  key={ws.id} 
                  onClick={() => onNavigateToWorkspace(ws.id)}
                  className={`${glassCardClasses} p-4 min-w-[260px] cursor-pointer snap-start flex-shrink-0 group`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${ws.color}`}>
                      {ws.dept}
                    </span>
                    <FolderOpen size={16} className={`${textMuted} group-hover:text-violet-500 transition-colors`} />
                  </div>
                  <h3 className="font-semibold mb-1 truncate group-hover:text-violet-500 transition-colors">{ws.name}</h3>
                  <div className={`flex items-center justify-between text-xs ${textSecondary} mt-3 pt-3 border-t ${isDark ? "border-slate-700/50" : "border-slate-100"}`}>
                    <span className="flex items-center gap-1"><Users size={12}/> {ws.members}</span>
                    <span>{ws.lastModified}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* DEPARTMENTS GRID */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Layers size={18} className="text-violet-500" />
                Departments
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DEPARTMENTS.map((dept) => (
                <div key={dept.id} className={`${glassCardClasses} border-l-4 ${dept.borderClass} p-5 flex flex-col justify-between`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${dept.colorClass} flex items-center justify-center shadow-sm text-white`}>
                        <dept.icon size={20} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{dept.name}</h3>
                        <p className={`text-xs ${textSecondary}`}>Updated {dept.lastActivity}</p>
                      </div>
                    </div>
                    <button className={`p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${textSecondary}`}>
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5
                      ${isDark ? "bg-slate-700/50 text-slate-300" : "bg-slate-100 text-slate-700"}`}>
                      <Users size={14} /> {dept.members} members
                    </div>
                    <div className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5
                      ${isDark ? "bg-slate-700/50 text-slate-300" : "bg-slate-100 text-slate-700"}`}>
                      <Briefcase size={14} /> {dept.workspaces} workspaces
                    </div>
                  </div>

                  <div className={`flex items-center justify-between pt-4 border-t ${isDark ? "border-slate-700/50" : "border-slate-100"}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-slate-300 to-slate-200 dark:from-slate-600 dark:to-slate-500 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-200">
                        {dept.lead.name.charAt(0)}
                      </div>
                      <div className="text-xs">
                        <span className="block font-medium">{dept.lead.name}</span>
                        <span className={textMuted}>{dept.lead.email}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* RIGHT COLUMN: Sidebar Content */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          
          {/* PENDING INVITATIONS */}
          {showInvitesBanner && invites.length > 0 && (
            <div className={`rounded-xl border shadow-sm p-4 ${isDark ? "bg-violet-900/20 border-violet-800/50" : "bg-violet-50 border-violet-100"}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-violet-700 dark:text-violet-300">
                  <Shield size={16} /> Pending Approvals ({invites.length})
                </h3>
                <button onClick={handleDismissInvites} className="text-violet-500 hover:text-violet-700 dark:hover:text-violet-300">
                  <X size={16} />
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {invites.map(inv => (
                  <div key={inv.id} className={`flex items-center justify-between p-3 rounded-lg text-sm
                    ${isDark ? "bg-slate-800/60" : "bg-white"}`}>
                    <div className="truncate pr-2">
                      <p className="font-medium truncate">{inv.email}</p>
                      <p className={`text-xs ${textSecondary}`}>Req: {inv.role}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleAcceptInvite(inv.id)} className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                        <Check size={16} />
                      </button>
                      <button onClick={() => handleDeclineInvite(inv.id)} className="p-1.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVITY FEED */}
          <div className={`${glassCardClasses} p-5 flex-1`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Cross-Workspace Activity</h2>
            </div>
            
            <div className="relative pl-3 border-l-2 border-slate-200 dark:border-slate-800 space-y-6">
              {RECENT_ACTIVITIES.map((activity) => (
                <div key={activity.id} className="relative group">
                  {/* Timeline dot */}
                  <div className={`absolute -left-[17px] top-1 w-[11px] h-[11px] rounded-full ring-4 
                    ${isDark ? "bg-violet-500 ring-slate-800/60" : "bg-violet-500 ring-white/80"}`} 
                  />
                  
                  <div className="pl-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold
                        ${isDark ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-700"}`}>
                        {activity.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate inline-block max-w-[120px] align-bottom">
                            {activity.user.split('@')[0]}
                          </span>
                          <span className={textSecondary}> {activity.action} </span>
                          <span className="font-medium text-violet-600 dark:text-violet-400">{activity.workspace}</span>
                        </p>
                        <p className={`text-xs ${textMuted} mt-1 flex items-center gap-1.5`}>
                          <activity.icon size={12} />
                          {activity.time}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <button className={`w-full mt-6 py-2 rounded-lg text-sm font-medium transition-colors border
              ${isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              View all activity
            </button>
          </div>

        </div>
      </main>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
