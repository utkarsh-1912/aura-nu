import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  Bot,
  Users,
  Briefcase,
  Layers,
  Zap,
  TrendingUp,
  TrendingDown,
  CreditCard,
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
  FolderOpen,
} from "lucide-react";
import { Avatar, Badge, Button, EmptyState, IconButton, LogoMark, Panel, Select, Tabs, cn } from "../ui";
import type { BadgeTone } from "../ui";

export interface OrgHubPageProps {
  theme: "light" | "dark";
  orgId: string;
  userEmail: string;
  onNavigateToAdmin: () => void;
  onNavigateToWorkspace: (wsId: string) => void;
}

// --- MOCK DATA ---

const METRICS = [
  { id: 1, label: "Total members", value: "42", change: "+12%", isUp: true, icon: Users },
  { id: 2, label: "Active workspaces", value: "24", change: "+5%", isUp: true, icon: Briefcase },
  { id: 3, label: "Departments", value: "5", change: "0%", isUp: true, icon: Layers },
  { id: 4, label: "AI actions this month", value: "8,432", change: "-2%", isUp: false, icon: Zap },
];

const DEPARTMENTS = [
  { id: "dept-1", name: "Engineering", icon: Wrench, members: 12, workspaces: 5, lead: { name: "Alice E.", email: "alice@auranext.com" }, lastActivity: "10 mins ago" },
  { id: "dept-2", name: "Marketing", icon: Megaphone, members: 8, workspaces: 3, lead: { name: "Bob M.", email: "bob@auranext.com" }, lastActivity: "1 hour ago" },
  { id: "dept-3", name: "Sales", icon: Briefcase, members: 15, workspaces: 7, lead: { name: "Charlie S.", email: "charlie@auranext.com" }, lastActivity: "5 mins ago" },
  { id: "dept-4", name: "Finance", icon: DollarSign, members: 6, workspaces: 2, lead: { name: "Diana F.", email: "diana@auranext.com" }, lastActivity: "3 hours ago" },
  { id: "dept-5", name: "Design", icon: Palette, members: 9, workspaces: 4, lead: { name: "Eve D.", email: "eve@auranext.com" }, lastActivity: "Just now" },
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
  { id: "ws-1", name: "Frontend Architecture", dept: "Engineering", members: 8, lastModified: "2 hours ago" },
  { id: "ws-2", name: "Brand Guidelines", dept: "Design", members: 5, lastModified: "25 mins ago" },
  { id: "ws-3", name: "Q3 Roadmap", dept: "Product", members: 12, lastModified: "10 mins ago" },
  { id: "ws-4", name: "Sales Playbook", dept: "Sales", members: 15, lastModified: "1 hour ago" },
  { id: "ws-5", name: "Budget Planning", dept: "Finance", members: 4, lastModified: "Yesterday" },
];

const INITIAL_INVITES = [
  { id: "inv-1", email: "newhire@auranext.com", role: "Member", date: "Today" },
  { id: "inv-2", email: "contractor@agency.com", role: "Guest", date: "Yesterday" },
];

const MEMBERS: { id: string; name: string; email: string; role: "Owner" | "Admin" | "Member" | "Guest"; dept: string; status: "Active" | "Invited" | "Suspended"; lastActive: string }[] = [
  { id: "m-1", name: "Alice Engel", email: "alice@auranext.com", role: "Owner", dept: "Engineering", status: "Active", lastActive: "10 mins ago" },
  { id: "m-2", name: "Bob Marsh", email: "bob@auranext.com", role: "Admin", dept: "Marketing", status: "Active", lastActive: "1 hour ago" },
  { id: "m-3", name: "Charlie Sato", email: "charlie@auranext.com", role: "Member", dept: "Sales", status: "Active", lastActive: "5 mins ago" },
  { id: "m-4", name: "Diana Fox", email: "diana@auranext.com", role: "Member", dept: "Finance", status: "Active", lastActive: "3 hours ago" },
  { id: "m-5", name: "Eve Dunn", email: "eve@auranext.com", role: "Member", dept: "Design", status: "Active", lastActive: "Just now" },
  { id: "m-6", name: "Newhire", email: "newhire@auranext.com", role: "Member", dept: "Engineering", status: "Invited", lastActive: "Never" },
  { id: "m-7", name: "Contractor", email: "contractor@agency.com", role: "Guest", dept: "Design", status: "Suspended", lastActive: "2 weeks ago" },
];

const ROLE_TONE: Record<string, BadgeTone> = { Owner: "accent", Admin: "accent", Member: "neutral", Guest: "warning" };
const STATUS_TONE: Record<string, BadgeTone> = { Active: "success", Invited: "warning", Suspended: "danger" };

type HubTab = "overview" | "workspaces" | "members" | "departments" | "billing";

// --- COMPONENT ---

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-1.5 w-full overflow-hidden rounded-full bg-hover"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function OrgHubPage({ orgId, onNavigateToAdmin, onNavigateToWorkspace }: OrgHubPageProps) {
  const [invites, setInvites] = useState(INITIAL_INVITES);
  const [showInvitesBanner, setShowInvitesBanner] = useState(true);
  const [tab, setTab] = useState<HubTab>("overview");
  const [deptFilter, setDeptFilter] = useState("all");

  const handleDismissInvites = () => setShowInvitesBanner(false);

  const removeInvite = (id: string) => {
    setInvites((prev) => {
      const updated = prev.filter((inv) => inv.id !== id);
      if (updated.length === 0) setShowInvitesBanner(false);
      return updated;
    });
  };
  const handleAcceptInvite = (id: string) => removeInvite(id);
  const handleDeclineInvite = (id: string) => removeInvite(id);

  const base = `/org/${orgId || "org-aura-main"}`;
  const linkBtn =
    "inline-flex h-10 sm:h-8 items-center justify-center gap-2 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent bg-panel text-fg border border-line hover:bg-hover hover:border-line-strong shadow-soft";

  const members = MEMBERS.filter((m) => deptFilter === "all" || m.dept === deptFilter);

  const workspaceList = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {QUICK_ACCESS_WORKSPACES.map((ws) => (
        <button
          key={ws.id}
          type="button"
          onClick={() => onNavigateToWorkspace(ws.id)}
          className="group rounded-lg border border-line bg-panel p-4 text-left transition-colors hover:border-line-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <div className="mb-3 flex items-start justify-between">
            <Badge>{ws.dept}</Badge>
            <FolderOpen size={16} className="text-fg-subtle group-hover:text-accent" aria-hidden />
          </div>
          <h3 className="truncate text-[14px] font-medium text-fg">{ws.name}</h3>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[12px] text-fg-muted">
            <span className="flex items-center gap-1">
              <Users size={12} aria-hidden /> {ws.members}
            </span>
            <span>{ws.lastModified}</span>
          </div>
        </button>
      ))}
    </div>
  );

  const departmentGrid = (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {DEPARTMENTS.map((dept) => (
        <Panel key={dept.id} className="flex flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hover text-fg-muted">
                <dept.icon size={18} aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-[14px] font-medium text-fg">{dept.name}</h3>
                <p className="text-[12px] text-fg-muted">Updated {dept.lastActivity}</p>
              </div>
            </div>
            <IconButton label={`Open ${dept.name} department`} className="h-10 w-10 sm:h-8 sm:w-8">
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <Users size={12} aria-hidden /> {dept.members} members
            </Badge>
            <Badge>
              <Briefcase size={12} aria-hidden /> {dept.workspaces} workspaces
            </Badge>
          </div>
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <Avatar name={dept.lead.name} size={24} />
            <div className="min-w-0 text-[12px]">
              <span className="block truncate font-medium text-fg">{dept.lead.name}</span>
              <span className="block truncate text-fg-muted">{dept.lead.email}</span>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );

  const memberTable = (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-medium text-fg">
          Members <span className="text-fg-subtle">{members.length}</span>
        </h2>
        <div className="w-44">
          <Select aria-label="Filter members by department" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="all">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {members.length === 0 ? (
        <EmptyState icon={<Users size={18} />} title="No members in this department" description="Try another department filter." />
      ) : (
        <>
          <ul className="divide-y divide-line md:hidden">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={m.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-fg">{m.name}</p>
                  <p className="truncate text-[12px] text-fg-muted">{m.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge>
                  <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-fg-muted">
                  <th scope="col" className="px-4 py-2 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2 font-medium">Role</th>
                  <th scope="col" className="px-4 py-2 font-medium">Department</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-hover">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} size={28} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-fg">{m.name}</p>
                          <p className="truncate text-[12px] text-fg-muted">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2"><Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge></td>
                    <td className="px-4 py-2 text-fg-muted">{m.dept}</td>
                    <td className="px-4 py-2"><Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge></td>
                    <td className="px-4 py-2 text-fg-muted">{m.lastActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );

  const invitesPanel =
    showInvitesBanner && invites.length > 0 ? (
      <Panel className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <Shield size={14} className="text-accent" aria-hidden /> Pending approvals
            <Badge tone="accent">{invites.length}</Badge>
          </h3>
          <IconButton label="Dismiss pending approvals" size="sm" onClick={handleDismissInvites}>
            <X size={14} />
          </IconButton>
        </div>
        <ul className="flex flex-col gap-2">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-2 rounded-md bg-surface p-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-fg">{inv.email}</p>
                <p className="text-[12px] text-fg-muted">Requested: {inv.role}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconButton label={`Approve ${inv.email}`} className="h-10 w-10 text-success sm:h-8 sm:w-8" onClick={() => handleAcceptInvite(inv.id)}>
                  <Check size={16} />
                </IconButton>
                <IconButton label={`Decline ${inv.email}`} className="h-10 w-10 text-danger sm:h-8 sm:w-8" onClick={() => handleDeclineInvite(inv.id)}>
                  <X size={16} />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    ) : null;

  const activityPanel = (
    <Panel className="p-4">
      <h2 className="mb-3 text-[14px] font-medium text-fg">Cross-workspace activity</h2>
      <ul className="divide-y divide-line">
        {RECENT_ACTIVITIES.map((a) => (
          <li key={a.id} className="flex items-start gap-3 py-2.5">
            <Avatar name={a.user.split("@")[0]} size={24} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-fg-muted">
                <span className="font-medium text-fg">{a.user.split("@")[0]}</span> {a.action}{" "}
                <span className="font-medium text-accent">{a.workspace}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-subtle">
                <a.icon size={11} aria-hidden /> {a.time}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="secondary" className="mt-3 w-full">
        View all activity
      </Button>
    </Panel>
  );

  const billing = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Panel className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[14px] font-medium text-fg">
            <CreditCard size={15} className="text-fg-muted" aria-hidden /> Plan
          </h2>
          <Badge tone="accent">Enterprise</Badge>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[12px] text-fg-muted"><span>Seats</span><span>42 / 100</span></div>
          <Meter value={42} max={100} label="Seats used" />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[12px] text-fg-muted"><span>AI actions this month</span><span>8,432 / 20,000</span></div>
          <Meter value={8432} max={20000} label="AI actions used" />
        </div>
      </Panel>
      <Panel className="space-y-3 p-4">
        <h2 className="text-[14px] font-medium text-fg">Manage billing</h2>
        <p className="text-[13px] text-fg-muted">Invoices, payment methods and seat changes live in the Admin Console.</p>
        <Button variant="primary" leadingIcon={<Shield size={14} />} onClick={onNavigateToAdmin}>
          Open Admin Console
        </Button>
      </Panel>
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-surface text-fg">
      <header className="sticky top-0 z-30 flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-1.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark size={22} />
          <Avatar name="Acme Corp" size={24} />
          <h1 className="truncate text-[16px] font-semibold text-fg">Acme Corp</h1>
          <Badge tone="accent">Enterprise</Badge>
          <span className="hidden items-center gap-1.5 text-[12px] text-fg-muted sm:flex">
            <Users size={13} aria-hidden /> 42 / 100 seats
          </span>
        </div>
        <nav aria-label="Organization tools" className="flex flex-wrap items-center gap-2">
          <Link to={`${base}/agents`} className={linkBtn}>
            <Bot size={14} aria-hidden /> Agent Studio
          </Link>
          <Link to={`${base}/workflows`} className={linkBtn}>
            <Zap size={14} aria-hidden /> Workflows
          </Link>
          <Button variant="primary" className="h-10 sm:h-8" leadingIcon={<Shield size={14} />} onClick={onNavigateToAdmin}>
            Admin Console
          </Button>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Tabs<HubTab>
          className="overflow-x-auto"
          value={tab}
          onChange={setTab}
          items={[
            { id: "overview", label: "Overview" },
            { id: "workspaces", label: "Workspaces", count: QUICK_ACCESS_WORKSPACES.length },
            { id: "members", label: "Members", count: MEMBERS.length },
            { id: "departments", label: "Departments", count: DEPARTMENTS.length },
            { id: "billing", label: "Billing" },
          ]}
        />

        <main className="space-y-6 py-6" role="tabpanel">
          {tab === "overview" && (
            <>
              <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {METRICS.map((metric) => (
                  <Panel key={metric.id} className="p-4">
                    <div className="flex items-center justify-between text-fg-muted">
                      <h3 className="text-[12px] font-medium">{metric.label}</h3>
                      <metric.icon size={14} aria-hidden />
                    </div>
                    <p className="mt-2 text-[20px] font-semibold tracking-tight text-fg">{metric.value}</p>
                    <span className={cn("mt-1 inline-flex items-center gap-1 text-[12px] font-medium", metric.isUp ? "text-success" : "text-danger")}>
                      {metric.isUp ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
                      {metric.change}
                    </span>
                  </Panel>
                ))}
              </section>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="flex flex-col gap-6 xl:col-span-8">
                  <section>
                    <h2 className="mb-3 flex items-center gap-2 text-[14px] font-medium text-fg">
                      <Clock size={14} className="text-fg-muted" aria-hidden /> Quick access
                    </h2>
                    {workspaceList}
                  </section>
                  <section>
                    <h2 className="mb-3 flex items-center gap-2 text-[14px] font-medium text-fg">
                      <Layers size={14} className="text-fg-muted" aria-hidden /> Departments
                    </h2>
                    {departmentGrid}
                  </section>
                </div>
                <div className="flex flex-col gap-4 xl:col-span-4">
                  {invitesPanel}
                  {activityPanel}
                </div>
              </div>
            </>
          )}
          {tab === "workspaces" && (
            <section aria-label="Workspaces">
              {QUICK_ACCESS_WORKSPACES.length === 0 ? (
                <EmptyState icon={<FolderOpen size={18} />} title="No workspaces yet" description="Create a workspace to get started." />
              ) : (
                workspaceList
              )}
            </section>
          )}
          {tab === "members" && (
            <section aria-label="Members" className="space-y-4">
              {invitesPanel}
              {memberTable}
            </section>
          )}
          {tab === "departments" && <section aria-label="Departments">{departmentGrid}</section>}
          {tab === "billing" && <section aria-label="Billing">{billing}</section>}
        </main>
      </div>
    </div>
  );
}
