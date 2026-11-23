import React, { useState, useMemo } from 'react';
import {
  Users, Building2, CreditCard, Shield, Activity, Lock, ArrowLeft,
  Search, Plus, Download, Eye, EyeOff,
  AlertTriangle, Info, AlertCircle, Trash2, Mail, Link as LinkIcon,
  Server, Key, Database, Cpu, Calendar, Check, FileText, ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, Input, LogoMark, Panel,
  Select, Separator, Switch, Textarea, cn,
} from '../ui';
import type { BadgeTone } from '../ui';

export interface AdminConsolePageProps {
  theme: "light" | "dark";
  orgId: string;
  userEmail: string;
  onNavigateBack: () => void;
}

// --- Mock Data ---

type Role = 'OrgOwner' | 'OrgAdmin' | 'BillingAdmin' | 'DeptLead' | 'Member';

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastActive: string;
  avatar: string;
}

const mockMembers: Member[] = [
  { id: '1', name: 'Alice Chen', email: 'alice@auranext.com', role: 'OrgOwner', lastActive: 'Just now', avatar: '' },
  { id: '2', name: 'Bob Smith', email: 'bob@auranext.com', role: 'OrgAdmin', lastActive: '2 hours ago', avatar: '' },
  { id: '3', name: 'Carol Williams', email: 'carol@auranext.com', role: 'BillingAdmin', lastActive: '1 day ago', avatar: '' },
  { id: '4', name: 'David Lee', email: 'david@auranext.com', role: 'DeptLead', lastActive: '3 days ago', avatar: '' },
  { id: '5', name: 'Eve Martinez', email: 'eve@auranext.com', role: 'Member', lastActive: '1 week ago', avatar: '' },
  { id: '6', name: 'Frank Taylor', email: 'frank@auranext.com', role: 'Member', lastActive: '2 weeks ago', avatar: '' },
];

interface Department {
  id: string;
  name: string;
  memberCount: number;
  workspaceCount: number;
  leadEmail: string;
  createdDate: string;
}

const mockDepartments: Department[] = [
  { id: 'd1', name: 'Engineering', memberCount: 42, workspaceCount: 15, leadEmail: 'david@auranext.com', createdDate: '2023-01-15' },
  { id: 'd2', name: 'Marketing', memberCount: 18, workspaceCount: 8, leadEmail: 'sarah@auranext.com', createdDate: '2023-03-22' },
  { id: 'd3', name: 'Sales', memberCount: 35, workspaceCount: 12, leadEmail: 'mike@auranext.com', createdDate: '2023-02-10' },
  { id: 'd4', name: 'Design', memberCount: 12, workspaceCount: 5, leadEmail: 'lisa@auranext.com', createdDate: '2023-04-05' },
];

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Failed';
}

const mockInvoices: Invoice[] = [
  { id: 'INV-001', date: '2026-07-01', amount: 1250.00, status: 'Paid' },
  { id: 'INV-002', date: '2026-06-01', amount: 1250.00, status: 'Paid' },
  { id: 'INV-003', date: '2026-05-01', amount: 1250.00, status: 'Paid' },
  { id: 'INV-004', date: '2026-04-01', amount: 1250.00, status: 'Paid' },
];

type Severity = 'info' | 'warning' | 'critical';

interface AuditLog {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  resource: string;
  ipAddress: string;
  severity: Severity;
}

const mockAuditLogs: AuditLog[] = [
  { id: 'L1', timestamp: '2026-07-30 10:15:22', userEmail: 'bob@auranext.com', action: 'Update SSO Settings', resource: 'SSO Config', ipAddress: '192.168.1.105', severity: 'warning' },
  { id: 'L2', timestamp: '2026-07-30 09:42:11', userEmail: 'alice@auranext.com', action: 'Invite User', resource: 'Org Members', ipAddress: '10.0.0.42', severity: 'info' },
  { id: 'L3', timestamp: '2026-07-29 16:30:05', userEmail: 'carol@auranext.com', action: 'Download Invoice', resource: 'Billing', ipAddress: '172.16.0.8', severity: 'info' },
  { id: 'L4', timestamp: '2026-07-29 14:12:33', userEmail: 'unknown', action: 'Failed Login', resource: 'Authentication', ipAddress: '203.0.113.45', severity: 'critical' },
  { id: 'L5', timestamp: '2026-07-28 11:20:00', userEmail: 'david@auranext.com', action: 'Delete Workspace', resource: 'Engineering Workspace', ipAddress: '192.168.1.201', severity: 'warning' },
];

// --- Helpers ---

const ROLE_TONE: Record<Role, BadgeTone> = {
  OrgOwner: 'accent',
  OrgAdmin: 'accent',
  BillingAdmin: 'warning',
  DeptLead: 'success',
  Member: 'neutral',
};

const SEVERITY: Record<Severity, { tone: BadgeTone; label: string; icon: React.ReactNode }> = {
  info: { tone: 'neutral', label: 'Info', icon: <Info className="h-3 w-3" aria-hidden /> },
  warning: { tone: 'warning', label: 'Warning', icon: <AlertTriangle className="h-3 w-3" aria-hidden /> },
  critical: { tone: 'danger', label: 'Critical', icon: <AlertCircle className="h-3 w-3" aria-hidden /> },
};

const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <Badge tone={SEVERITY[severity].tone}>
    {SEVERITY[severity].icon} {SEVERITY[severity].label}
  </Badge>
);

const TH = 'px-4 py-2 text-[12px] font-medium text-fg-muted';
const TOUCH = 'h-10 w-10 sm:h-8 sm:w-8';

function SectionHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-[16px] font-semibold text-fg">{title}</h2>
        <p className="text-[13px] text-fg-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function Meter({ value, max, label, tone = 'accent' }: { value: number; max: number; label: string; tone?: 'accent' | 'neutral' }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-2 w-full overflow-hidden rounded-full bg-hover"
    >
      <div className={cn('h-full rounded-full', tone === 'accent' ? 'bg-accent' : 'bg-line-strong')} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SettingRow({ icon, title, description, control }: { icon: React.ReactNode; title: string; description: string; control: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <span className="text-fg-subtle">{icon}</span> {title}
        </h3>
        <p className="mt-1 text-[13px] text-fg-muted">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

// --- Subcomponents ---

const MembersTab = () => {
  const [members, setMembers] = useState(mockMembers);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('Member');
  const [toRemove, setToRemove] = useState<Member | null>(null);

  const handleRemove = (id: string) => {
    setMembers(members.filter(m => m.id !== id));
  };

  const handleRoleChange = (id: string, newRole: Role) => {
    setMembers(members.map(m => m.id === id ? { ...m, role: newRole } : m));
  };

  const roleLabel = (r: Role) => r.replace(/([A-Z])/g, ' $1').trim();

  const roleSelect = (m: Member) => (
    <Select
      aria-label={`Role for ${m.name}`}
      value={m.role}
      onChange={(e) => handleRoleChange(m.id, e.target.value as Role)}
      className="h-10 sm:h-8 w-36"
    >
      <option value="OrgOwner">Org Owner</option>
      <option value="OrgAdmin">Org Admin</option>
      <option value="BillingAdmin">Billing Admin</option>
      <option value="DeptLead">Dept Lead</option>
      <option value="Member">Member</option>
    </Select>
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Members & access"
        description="Manage your organization members and their roles."
        action={
          <Button variant="primary" leadingIcon={<Plus size={14} />} className="h-10 sm:h-8" onClick={() => setShowInviteForm(!showInviteForm)} aria-expanded={showInviteForm}>
            Bulk invite
          </Button>
        }
      />

      {showInviteForm && (
        <Panel className="space-y-4 p-4">
          <h3 className="text-[13px] font-medium text-fg">Invite new members</h3>
          <Field label="Email addresses" hint="Comma separated or one per line.">
            {(p) => (
              <Textarea {...p} value={inviteEmails} onChange={(e) => setInviteEmails(e.target.value)} rows={3} placeholder="email@example.com, another@example.com" />
            )}
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Assign role" className="w-full sm:w-64">
              {(p) => (
                <Select {...p} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                  <option value="Member">Member</option>
                  <option value="DeptLead">Department Lead</option>
                  <option value="BillingAdmin">Billing Admin</option>
                  <option value="OrgAdmin">Organization Admin</option>
                </Select>
              )}
            </Field>
            <Button
              variant="primary"
              className="h-10 sm:h-8"
              onClick={() => {
                setShowInviteForm(false);
                setInviteEmails('');
              }}
            >
              Send invites
            </Button>
          </div>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        {members.length === 0 ? (
          <EmptyState icon={<Users size={18} />} title="No members found" description="Invite people to give them access to this organization." />
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {members.map((m) => (
                <li key={m.id} className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-fg">{m.name}</p>
                      <p className="truncate text-[12px] text-fg-muted">{m.email}</p>
                    </div>
                    <IconButton label={`Remove ${m.name}`} className={cn(TOUCH, 'hover:text-danger')} onClick={() => setToRemove(m)}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-fg-muted">Active {m.lastActive}</span>
                    {roleSelect(m)}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line">
                  <tr>
                    <th scope="col" className={TH}>Member</th>
                    <th scope="col" className={TH}>Role</th>
                    <th scope="col" className={TH}>Last active</th>
                    <th scope="col" className={cn(TH, 'text-right')}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-hover">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={m.name} size={28} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-fg">{m.name}</div>
                            <div className="truncate text-[12px] text-fg-muted">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><Badge tone={ROLE_TONE[m.role]}>{roleLabel(m.role)}</Badge></td>
                      <td className="px-4 py-2.5 text-fg-muted">{m.lastActive}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          {roleSelect(m)}
                          <IconButton label={`Remove ${m.name}`} className="hover:text-danger" onClick={() => setToRemove(m)}>
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Dialog
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        title="Remove member"
        description={toRemove ? `${toRemove.name} (${toRemove.email}) will lose access to this organization.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToRemove(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (toRemove) handleRemove(toRemove.id);
                setToRemove(null);
              }}
            >
              Remove member
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-muted">Their notes stay in the workspaces they belong to.</p>
      </Dialog>
    </div>
  );
};

const DepartmentsTab = () => {
  const [departments, setDepartments] = useState(mockDepartments);
  const [toDelete, setToDelete] = useState<Department | null>(null);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Departments"
        description="Organize your enterprise workspaces into departments."
        action={
          <Button variant="primary" className="h-10 sm:h-8" leadingIcon={<Plus size={14} />}>
            Add department
          </Button>
        }
      />

      {departments.length === 0 ? (
        <Panel>
          <EmptyState icon={<Building2 size={18} />} title="No departments yet" description="Create a department to group workspaces and members." />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {departments.map(dept => (
            <Panel key={dept.id} className="p-4">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hover text-fg-muted">
                    <Building2 size={18} aria-hidden />
                  </div>
                  <h3 className="truncate text-[14px] font-medium text-fg">{dept.name}</h3>
                </div>
                <IconButton label={`Delete ${dept.name} department`} className={cn(TOUCH, 'hover:text-danger')} onClick={() => setToDelete(dept)}>
                  <Trash2 size={15} />
                </IconButton>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-surface p-3">
                  <div className="text-[12px] text-fg-muted">Members</div>
                  <div className="text-[16px] font-semibold text-fg">{dept.memberCount}</div>
                </div>
                <div className="rounded-md bg-surface p-3">
                  <div className="text-[12px] text-fg-muted">Workspaces</div>
                  <div className="text-[16px] font-semibold text-fg">{dept.workspaceCount}</div>
                </div>
              </div>

              <div className="space-y-2 text-[13px] text-fg-muted">
                <div className="flex items-center"><Mail className="mr-2 h-4 w-4 text-fg-subtle" aria-hidden /><span className="truncate">{dept.leadEmail}</span></div>
                <div className="flex items-center"><Calendar className="mr-2 h-4 w-4 text-fg-subtle" aria-hidden /><span>Created {new Date(dept.createdDate).toLocaleDateString()}</span></div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Dialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete department"
        description={toDelete ? `Delete "${toDelete.name}"? Its ${toDelete.memberCount} members and ${toDelete.workspaceCount} workspaces will be unassigned.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (toDelete) setDepartments(departments.filter(d => d.id !== toDelete.id));
                setToDelete(null);
              }}
            >
              Delete department
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-muted">This cannot be undone.</p>
      </Dialog>
    </div>
  );
};

const BillingTab = () => {
  const usage = [
    { icon: <Users className="h-4 w-4" aria-hidden />, label: 'Active seats', text: '142 / 250 (56%)', value: 142, max: 250, tone: 'accent' as const },
    { icon: <Database className="h-4 w-4" aria-hidden />, label: 'Storage used', text: '845 GB / Unlimited', value: 40, max: 100, tone: 'neutral' as const },
    { icon: <Cpu className="h-4 w-4" aria-hidden />, label: 'AI quota', text: '8,450 / 10,000 requests (84%)', value: 8450, max: 10000, tone: 'accent' as const },
  ];
  return (
    <div className="space-y-5">
      <SectionHeader title="Billing & usage" description="Manage your subscription, view usage, and download invoices." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="space-y-4 p-5 lg:col-span-1">
          <div className="flex items-center justify-between">
            <Badge tone="accent">Current plan</Badge>
            <CreditCard className="h-4 w-4 text-fg-muted" aria-hidden />
          </div>
          <div>
            <h3 className="text-[20px] font-semibold text-fg">Enterprise Plus</h3>
            <div className="text-[13px] text-fg-muted">$1,250 / month</div>
          </div>
          <ul className="space-y-2 text-[13px] text-fg-muted">
            {['250 seats included', 'Unlimited storage', 'Advanced security features', 'Priority 24/7 support'].map((t) => (
              <li key={t} className="flex items-center"><Check className="mr-2 h-4 w-4 text-success" aria-hidden /> {t}</li>
            ))}
          </ul>
          <div className="text-[12px] text-fg-subtle">Next renewal: Aug 1, 2026</div>
          <Button variant="primary" className="w-full">Upgrade plan</Button>
        </Panel>

        <div className="space-y-4 lg:col-span-2">
          <Panel className="p-5">
            <h3 className="mb-4 flex items-center text-[14px] font-medium text-fg">
              <Activity className="mr-2 h-4 w-4 text-fg-muted" aria-hidden /> Resource usage
            </h3>
            <div className="space-y-5">
              {usage.map((u) => (
                <div key={u.label}>
                  <div className="mb-2 flex flex-wrap justify-between gap-1 text-[13px]">
                    <span className="flex items-center gap-1.5 font-medium text-fg"><span className="text-fg-subtle">{u.icon}</span>{u.label}</span>
                    <span className="text-fg-muted">{u.text}</span>
                  </div>
                  <Meter value={u.value} max={u.max} label={u.label} tone={u.tone} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="flex items-center border-b border-line px-4 py-3">
              <h3 className="flex items-center text-[14px] font-medium text-fg">
                <FileText className="mr-2 h-4 w-4 text-fg-muted" aria-hidden /> Invoice history
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line">
                  <tr>
                    <th scope="col" className={TH}>Invoice</th>
                    <th scope="col" className={TH}>Date</th>
                    <th scope="col" className={TH}>Amount</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={cn(TH, 'text-right')}><span className="sr-only">Download</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mockInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-hover">
                      <td className="px-4 py-2 font-medium text-fg">{inv.id}</td>
                      <td className="px-4 py-2 text-fg-muted">{new Date(inv.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-fg">${inv.amount.toFixed(2)}</td>
                      <td className="px-4 py-2"><Badge tone={inv.status === 'Paid' ? 'success' : inv.status === 'Pending' ? 'warning' : 'danger'}>{inv.status}</Badge></td>
                      <td className="px-4 py-2 text-right">
                        <IconButton label={`Download invoice ${inv.id}`} className={TOUCH}><Download size={15} /></IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};

const SSOTab = () => {
  const [provider, setProvider] = useState('google');
  const [showSecret, setShowSecret] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [scimEnabled, setScimEnabled] = useState(false);

  const providers = [
    { id: 'google', name: 'Google Workspace' },
    { id: 'okta', name: 'Okta' },
    { id: 'azure', name: 'Azure AD' },
    { id: 'saml', name: 'Custom SAML' },
  ];
  const ssoSteps = [
    'Create an application in your identity provider.',
    'Paste the Redirect URI shown below as the allowed callback.',
    'Copy the Client ID and Client Secret back here, then test the connection.',
  ];
  const scimSteps = [
    'Generate a SCIM token in your identity provider.',
    'Point provisioning to the SCIM base URL below.',
    'Assign users or groups; they will sync into departments automatically.',
  ];

  return (
    <div className="max-w-3xl space-y-5">
      <SectionHeader title="Single sign-on" description="Configure enterprise authentication for your organization." />

      <Panel className="divide-y divide-line">
        <SettingRow
          icon={<Key size={15} />}
          title="Enable SSO authentication"
          description="When enabled, members must sign in via your identity provider."
          control={<Switch checked={ssoEnabled} onChange={setSsoEnabled} label="Enable SSO authentication" />}
        />

        <fieldset disabled={!ssoEnabled} className={cn('space-y-5 p-4', !ssoEnabled && 'opacity-60')}>
          <legend className="sr-only">SSO configuration</legend>
          <ol className="space-y-2">
            {ssoSteps.map((s, i) => (
              <li key={s} className="flex items-start gap-2.5 text-[13px] text-fg-muted">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>

          <div>
            <div className="mb-2 text-[12px] font-medium text-fg-muted" id="idp-label">Identity provider</div>
            <div role="radiogroup" aria-labelledby="idp-label" className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {providers.map(p => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={provider === p.id}
                  onClick={() => setProvider(p.id)}
                  className={cn(
                    'h-10 rounded-md border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    provider === p.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel text-fg-muted hover:bg-hover hover:text-fg',
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="max-w-xl space-y-4">
            <Field label="Client ID">
              {(p) => <Input {...p} type="text" defaultValue="48392-xyz-example-client-id" />}
            </Field>
            <Field label="Client secret">
              {(p) => (
                <Input
                  {...p}
                  type={showSecret ? 'text' : 'password'}
                  defaultValue="super-secret-key-123456789"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      aria-label={showSecret ? 'Hide client secret' : 'Show client secret'}
                      className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  }
                />
              )}
            </Field>
            <Field label="Redirect URI" hint="Read-only. Add this to your identity provider.">
              {(p) => <Input {...p} readOnly value="https://app.auranext.com/api/auth/callback/saml" leadingIcon={<LinkIcon size={14} />} />}
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" className="h-10 sm:h-8">Save configuration</Button>
            <Button className="h-10 sm:h-8">Test connection</Button>
          </div>
        </fieldset>
      </Panel>

      <Panel className="divide-y divide-line">
        <SettingRow
          icon={<RefreshCw size={15} />}
          title="SCIM provisioning"
          description="Automatically create and deactivate members from your identity provider."
          control={<Switch checked={scimEnabled} onChange={setScimEnabled} label="Enable SCIM provisioning" />}
        />
        <fieldset disabled={!scimEnabled} className={cn('space-y-4 p-4', !scimEnabled && 'opacity-60')}>
          <legend className="sr-only">SCIM configuration</legend>
          <ol className="space-y-2">
            {scimSteps.map((s, i) => (
              <li key={s} className="flex items-start gap-2.5 text-[13px] text-fg-muted">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <Field label="SCIM base URL" className="max-w-xl">
            {(p) => <Input {...p} readOnly value="https://app.auranext.com/api/scim/v2" className="font-mono" />}
          </Field>
        </fieldset>
      </Panel>
    </div>
  );
};

const PAGE_SIZE = 3;

const AuditLogsTab = () => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [page, setPage] = useState(0);

  const filteredLogs = useMemo(() => {
    return mockAuditLogs.filter(log => {
      const matchSearch = log.action.toLowerCase().includes(search.toLowerCase()) || log.userEmail.toLowerCase().includes(search.toLowerCase());
      const matchSeverity = severityFilter === 'all' || log.severity === severityFilter;
      return matchSearch && matchSeverity;
    });
  }, [search, severityFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filteredLogs.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Audit logs"
        description="Track and monitor administrative actions across your organization."
        action={<Button className="h-10 sm:h-8" leadingIcon={<Download size={14} />}>Export CSV</Button>}
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row">
          <div className="max-w-md flex-1">
            <Input
              aria-label="Search audit logs"
              leadingIcon={<Search size={14} />}
              placeholder="Search actions or users..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="h-10 sm:h-8"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select aria-label="Filter by severity" value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }} className="h-10 sm:h-8">
              <option value="all">All severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </Select>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={<Search size={18} />}
            title="No audit logs match your filters"
            action={<Button onClick={() => { setSearch(''); setSeverityFilter('all'); }}>Clear filters</Button>}
          />
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {visible.map((log) => (
                <li key={log.id} className="space-y-1.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-fg">{log.action}</span>
                    <SeverityBadge severity={log.severity} />
                  </div>
                  <p className="truncate text-[12px] text-fg-muted">{log.userEmail} &middot; {log.resource}</p>
                  <p className="text-[12px] text-fg-subtle">{log.timestamp} &middot; <span className="font-mono">{log.ipAddress}</span></p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full whitespace-nowrap text-left text-[13px]">
                <thead className="border-b border-line">
                  <tr>
                    <th scope="col" className={TH}>Timestamp</th>
                    <th scope="col" className={TH}>User</th>
                    <th scope="col" className={TH}>Action</th>
                    <th scope="col" className={TH}>Resource</th>
                    <th scope="col" className={TH}>IP address</th>
                    <th scope="col" className={TH}>Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((log) => (
                    <tr key={log.id} className="hover:bg-hover">
                      <td className="px-4 py-2 text-[12px] text-fg-muted">{log.timestamp}</td>
                      <td className="px-4 py-2 font-medium text-fg">{log.userEmail}</td>
                      <td className="px-4 py-2 text-fg">{log.action}</td>
                      <td className="px-4 py-2 text-fg-muted">{log.resource}</td>
                      <td className="px-4 py-2 font-mono text-[12px] text-fg-muted">{log.ipAddress}</td>
                      <td className="px-4 py-2"><SeverityBadge severity={log.severity} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-2">
              <span className="text-[12px] text-fg-muted">
                Page {safePage + 1} of {pageCount} &middot; {filteredLogs.length} events
              </span>
              <div className="flex items-center gap-1">
                <IconButton label="Previous page" className={TOUCH} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  <ChevronLeft size={16} />
                </IconButton>
                <IconButton label="Next page" className={TOUCH} disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                  <ChevronRight size={16} />
                </IconButton>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
};

const SecurityTab = ({ orgId }: { orgId: string }) => {
  const [enforce2FA, setEnforce2FA] = useState(true);
  const [apiLimit, setApiLimit] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState(60);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [dangerDone, setDangerDone] = useState(false);

  const closeDanger = () => {
    setDangerOpen(false);
    setConfirmText('');
  };

  return (
    <div className="max-w-3xl space-y-5">
      <SectionHeader title="Security policies" description="Configure global security settings for your workspace." />

      <Panel className="divide-y divide-line">
        <SettingRow
          icon={<Shield size={15} />}
          title="Enforce two-factor authentication"
          description="Require all organization members to set up 2FA before they can access any workspace data."
          control={<Switch checked={enforce2FA} onChange={setEnforce2FA} label="Enforce two-factor authentication" />}
        />
        <SettingRow
          icon={<Server size={15} />}
          title="Strict API rate limiting"
          description="Enforce strict rate limits on personal access tokens to prevent abuse."
          control={<Switch checked={apiLimit} onChange={setApiLimit} label="Strict API rate limiting" />}
        />

        <div className="p-4">
          <Field label="Password complexity policy">
            {(p) => (
              <Select {...p} defaultValue="strong" className="max-w-xs">
                <option value="standard">Standard (8+ chars)</option>
                <option value="strong">Strong (12+ chars, special char)</option>
                <option value="custom">Custom...</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="p-4">
          <Field label="Idle session timeout">
            {(p) => (
              <div className="max-w-md">
                <div className="mb-2 flex justify-between text-[12px] text-fg-muted">
                  <span>15 min</span>
                  <span className="font-medium text-accent">{sessionTimeout} minutes</span>
                  <span>8 hours</span>
                </div>
                <input
                  id={p.id}
                  type="range"
                  min="15"
                  max="480"
                  step="15"
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(parseInt(e.target.value))}
                  className="h-6 w-full cursor-pointer accent-[var(--c-accent)]"
                />
              </div>
            )}
          </Field>
        </div>

        <div className="p-4">
          <Field label="IP allowlist" hint="Restrict access to specific IP addresses or CIDR ranges. Leave blank to allow all.">
            {(p) => <Textarea {...p} rows={3} className="font-mono" placeholder={'192.168.1.0/24\n203.0.113.45'} defaultValue="203.0.113.0/24" />}
          </Field>
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button variant="primary" className="h-10 sm:h-8">Save security settings</Button>
      </div>

      <Separator />

      <section aria-labelledby="danger-title" className="rounded-lg border border-danger/40 bg-panel">
        <div className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
          <div>
            <h3 id="danger-title" className="flex items-center gap-2 text-[14px] font-medium text-danger">
              <AlertTriangle size={15} aria-hidden /> Danger zone
            </h3>
            <p className="mt-1 text-[13px] text-fg-muted">Permanently delete this organization and all of its workspaces, notes and audit history.</p>
            {dangerDone && <p role="status" className="mt-2 text-[12px] text-fg-subtle">Demo mode: nothing was deleted.</p>}
          </div>
          <Button variant="danger" className="h-10 sm:h-8" leadingIcon={<Trash2 size={14} />} onClick={() => setDangerOpen(true)}>
            Delete organization
          </Button>
        </div>
      </section>

      <Dialog
        open={dangerOpen}
        onClose={closeDanger}
        title="Delete organization"
        description={`This permanently deletes ${orgId} and everything in it. This cannot be undone.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeDanger}>Cancel</Button>
            <Button
              variant="danger"
              disabled={confirmText !== orgId}
              onClick={() => {
                setDangerDone(true);
                closeDanger();
              }}
            >
              Delete organization
            </Button>
          </>
        }
      >
        <Field label={`Type ${orgId} to confirm`}>
          {(p) => <Input {...p} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />}
        </Field>
      </Dialog>
    </div>
  );
};

// --- Main Page Component ---

type TabId = 'members' | 'departments' | 'billing' | 'sso' | 'audit' | 'security';

export default function AdminConsolePage({ orgId, userEmail, onNavigateBack }: AdminConsolePageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('members');

  const tabs = [
    { id: 'members', label: 'Members & Access', icon: Users },
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard },
    { id: 'sso', label: 'SSO & SCIM', icon: Key },
    { id: 'audit', label: 'Audit Logs', icon: Activity },
    { id: 'security', label: 'Security', icon: Lock },
  ] as const;

  return (
    <div className="min-h-screen bg-surface text-fg">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-line bg-surface px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="Back to organization" className={TOUCH} onClick={onNavigateBack}>
            <ArrowLeft size={16} />
          </IconButton>
          <LogoMark size={20} />
          <h1 className="text-[14px] font-semibold text-fg">Admin Console</h1>
          <span className="hidden truncate text-[12px] text-fg-muted sm:inline">Org ID: {orgId}</span>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-[12px] text-fg-muted">{userEmail}</span>
          <Avatar name={userEmail || '?'} size={24} />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6 md:flex-row md:gap-8">
        {/* Phones: section select */}
        <div className="md:hidden">
          <Field label="Section">
            {(p) => (
              <Select {...p} value={activeTab} onChange={(e) => setActiveTab(e.target.value as TabId)} className="h-10">
                {tabs.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <aside className="hidden w-52 shrink-0 md:block">
          <nav aria-label="Admin sections" className="sticky top-16 flex flex-col gap-0.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    isActive ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-hover hover:text-fg',
                  )}
                >
                  <Icon size={15} aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-12">
          {activeTab === 'members' && <MembersTab />}
          {activeTab === 'departments' && <DepartmentsTab />}
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'sso' && <SSOTab />}
          {activeTab === 'audit' && <AuditLogsTab />}
          {activeTab === 'security' && <SecurityTab orgId={orgId} />}
        </main>
      </div>
    </div>
  );
}
