import React, { useState, useMemo } from 'react';
import {
  Users, Building2, CreditCard, Shield, Activity, Lock, ArrowLeft,
  Search, Plus, ChevronDown, Download, Eye, EyeOff, X,
  AlertTriangle, Info, AlertCircle, Trash2, Mail, Link as LinkIcon,
  Server, Key, Database, Cpu, Calendar, Sliders
} from 'lucide-react';

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
  { id: '1', name: 'Alice Chen', email: 'alice@auranext.com', role: 'OrgOwner', lastActive: 'Just now', avatar: 'https://i.pravatar.cc/150?u=alice' },
  { id: '2', name: 'Bob Smith', email: 'bob@auranext.com', role: 'OrgAdmin', lastActive: '2 hours ago', avatar: 'https://i.pravatar.cc/150?u=bob' },
  { id: '3', name: 'Carol Williams', email: 'carol@auranext.com', role: 'BillingAdmin', lastActive: '1 day ago', avatar: 'https://i.pravatar.cc/150?u=carol' },
  { id: '4', name: 'David Lee', email: 'david@auranext.com', role: 'DeptLead', lastActive: '3 days ago', avatar: 'https://i.pravatar.cc/150?u=david' },
  { id: '5', name: 'Eve Martinez', email: 'eve@auranext.com', role: 'Member', lastActive: '1 week ago', avatar: 'https://i.pravatar.cc/150?u=eve' },
  { id: '6', name: 'Frank Taylor', email: 'frank@auranext.com', role: 'Member', lastActive: '2 weeks ago', avatar: 'https://i.pravatar.cc/150?u=frank' },
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

const getRoleBadgeColor = (role: Role) => {
  switch (role) {
    case 'OrgOwner': return 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800';
    case 'OrgAdmin': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'BillingAdmin': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    case 'DeptLead': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800';
    case 'Member': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
};

const getSeverityBadge = (severity: Severity) => {
  switch (severity) {
    case 'info': return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800"><Info className="w-3 h-3 mr-1"/> Info</span>;
    case 'warning': return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800"><AlertTriangle className="w-3 h-3 mr-1"/> Warning</span>;
    case 'critical': return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800"><AlertCircle className="w-3 h-3 mr-1"/> Critical</span>;
  }
};

// --- Subcomponents ---

const MembersTab = () => {
  const [members, setMembers] = useState(mockMembers);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('Member');

  const handleRemove = (id: string) => {
    setMembers(members.filter(m => m.id !== id));
  };

  const handleRoleChange = (id: string, newRole: Role) => {
    setMembers(members.map(m => m.id === id ? { ...m, role: newRole } : m));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Members & Access</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage your organization members and their roles.</p>
        </div>
        <button
          onClick={() => setShowInviteForm(!showInviteForm)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-slate-900"
        >
          <Plus className="w-4 h-4 mr-2" />
          Bulk Invite
        </button>
      </div>

      {showInviteForm && (
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <h3 className="text-sm font-medium text-slate-900 dark:text-white">Invite New Members</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Email Addresses (comma separated or new lines)</label>
              <textarea
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                placeholder="email@example.com, another@example.com"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Assign Role</label>
                <div className="relative">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="w-full appearance-none px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white pr-8"
                  >
                    <option value="Member">Member</option>
                    <option value="DeptLead">Department Lead</option>
                    <option value="BillingAdmin">Billing Admin</option>
                    <option value="OrgAdmin">Organization Admin</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="pt-5">
                <button
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteEmails('');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-slate-900"
                >
                  Send Invites
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3 font-medium">Member</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Last Active</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No members found.</p>
                  </td>
                </tr>
              ) : members.map((member, idx) => (
                <tr key={member.id} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/20'}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 object-cover" />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{member.name}</div>
                        <div className="text-slate-500 dark:text-slate-400 text-xs">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(member.role)}`}>
                      {member.role.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                    {member.lastActive}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="relative group">
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                          className="appearance-none bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-md py-1.5 pl-2 pr-6 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        >
                          <option value="OrgOwner">Org Owner</option>
                          <option value="OrgAdmin">Org Admin</option>
                          <option value="BillingAdmin">Billing Admin</option>
                          <option value="DeptLead">Dept Lead</option>
                          <option value="Member">Member</option>
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                      <button
                        onClick={() => handleRemove(member.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const DepartmentsTab = () => {
  const [departments, setDepartments] = useState(mockDepartments);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Departments</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Organize your enterprise workspaces into departments.</p>
        </div>
        <button className="inline-flex items-center px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-offset-slate-900">
          <Plus className="w-4 h-4 mr-2" />
          Add Department
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 dark:text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No departments created yet.</p>
          </div>
        ) : departments.map(dept => (
          <div key={dept.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:shadow-md transition-shadow group relative">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white">{dept.name}</h3>
              </div>
              <button 
                onClick={() => setDepartments(departments.filter(d => d.id !== dept.id))}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:opacity-100"
                title="Delete department"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Members</div>
                <div className="font-semibold text-slate-900 dark:text-white text-lg">{dept.memberCount}</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Workspaces</div>
                <div className="font-semibold text-slate-900 dark:text-white text-lg">{dept.workspaceCount}</div>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center text-slate-600 dark:text-slate-300">
                <Mail className="w-4 h-4 mr-2 text-slate-400" />
                <span className="truncate">{dept.leadEmail}</span>
              </div>
              <div className="flex items-center text-slate-600 dark:text-slate-300">
                <Calendar className="w-4 h-4 mr-2 text-slate-400" />
                <span>Created {new Date(dept.createdDate).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BillingTab = () => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Billing & Usage</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage your subscription, view usage, and download invoices.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Plan */}
        <div className="lg:col-span-1 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 border border-slate-800 dark:border-slate-700 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-6">
              <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-medium backdrop-blur-sm border border-white/20">Current Plan</span>
              <CreditCard className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-3xl font-bold mb-1">Enterprise Plus</h3>
            <div className="text-slate-300 mb-6">$1,250 <span className="text-sm font-normal text-slate-400">/ month</span></div>
            
            <div className="space-y-3 text-sm text-slate-300 mb-8">
              <div className="flex items-center"><Check className="w-4 h-4 mr-2 text-blue-400"/> 250 Seats Included</div>
              <div className="flex items-center"><Check className="w-4 h-4 mr-2 text-blue-400"/> Unlimited Storage</div>
              <div className="flex items-center"><Check className="w-4 h-4 mr-2 text-blue-400"/> Advanced Security Features</div>
              <div className="flex items-center"><Check className="w-4 h-4 mr-2 text-blue-400"/> Priority 24/7 Support</div>
            </div>

            <div className="text-xs text-slate-400 mb-4">Next renewal: Aug 1, 2026</div>
            <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900">
              Upgrade Plan
            </button>
          </div>
        </div>

        {/* Usage Stats */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-6 flex items-center">
              <Activity className="w-5 h-5 mr-2 text-blue-500" /> Resource Usage
            </h3>
            
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center"><Users className="w-4 h-4 mr-1.5 text-slate-400"/> Active Seats</span>
                  <span className="text-slate-500 dark:text-slate-400">142 / 250 (56%)</span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '56%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center"><Database className="w-4 h-4 mr-1.5 text-slate-400"/> Storage Used</span>
                  <span className="text-slate-500 dark:text-slate-400">845 GB / Unlimited</span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: '40%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center"><Cpu className="w-4 h-4 mr-1.5 text-slate-400"/> AI Quota</span>
                  <span className="text-slate-500 dark:text-slate-400">8,450 / 10,000 requests (84%)</span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '84%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/30">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center">
                <FileText className="w-5 h-5 mr-2 text-slate-500" /> Invoice History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Invoice ID</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mockInvoices.map((inv, idx) => (
                    <tr key={inv.id} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/30 dark:bg-slate-800/10'}>
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{inv.id}</td>
                      <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{new Date(inv.date).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-slate-900 dark:text-white">${inv.amount.toFixed(2)}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800">
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <Download className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SSOTab = () => {
  const [provider, setProvider] = useState('google');
  const [showSecret, setShowSecret] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Single Sign-On (SSO)</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Configure enterprise authentication for your organization.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-8">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">Enable SSO Authentication</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">When enabled, members must sign in via your Identity Provider.</p>
          </div>
          <button 
            onClick={() => setSsoEnabled(!ssoEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${ssoEnabled ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ssoEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Provider Selection */}
        <div className={`space-y-6 ${!ssoEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Identity Provider</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: 'google', name: 'Google Workspace' },
                { id: 'okta', name: 'Okta' },
                { id: 'azure', name: 'Azure AD' },
                { id: 'saml', name: 'Custom SAML' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`px-4 py-3 border rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    provider === p.id 
                      ? 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-300' 
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/80'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Client ID</label>
              <input 
                type="text" 
                defaultValue="48392-xyz-example-client-id"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Client Secret</label>
              <div className="relative">
                <input 
                  type={showSecret ? "text" : "password"} 
                  defaultValue="super-secret-key-123456789"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white pr-10"
                />
                <button 
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Redirect URI <span className="text-slate-400 font-normal ml-1">(Read-only)</span></label>
              <div className="relative">
                <input 
                  type="text" 
                  readOnly
                  value="https://app.auranext.com/api/auth/callback/saml"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed pl-8"
                />
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center gap-3">
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-slate-900">
              Save Configuration
            </button>
            <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 dark:focus:ring-offset-slate-900">
              Test Connection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AuditLogsTab = () => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');

  const filteredLogs = useMemo(() => {
    return mockAuditLogs.filter(log => {
      const matchSearch = log.action.toLowerCase().includes(search.toLowerCase()) || log.userEmail.toLowerCase().includes(search.toLowerCase());
      const matchSeverity = severityFilter === 'all' || log.severity === severityFilter;
      return matchSearch && matchSeverity;
    });
  }, [search, severityFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Audit Logs</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track and monitor administrative actions across your organization.</p>
        </div>
        <button className="inline-flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 dark:focus:ring-offset-slate-900">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search actions or users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400"
            />
          </div>
          <div className="relative w-full sm:w-48">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full appearance-none px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white pr-8 cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3 font-medium">Timestamp</th>
                <th className="px-6 py-3 font-medium">User</th>
                <th className="px-6 py-3 font-medium">Action</th>
                <th className="px-6 py-3 font-medium">Resource</th>
                <th className="px-6 py-3 font-medium">IP Address</th>
                <th className="px-6 py-3 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No audit logs match your filters.</p>
                  </td>
                </tr>
              ) : filteredLogs.map((log, idx) => (
                <tr key={log.id} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/30 dark:bg-slate-800/10'}>
                  <td className="px-6 py-3 text-slate-500 dark:text-slate-400 text-xs">{log.timestamp}</td>
                  <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{log.userEmail}</td>
                  <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{log.action}</td>
                  <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{log.resource}</td>
                  <td className="px-6 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs">{log.ipAddress}</td>
                  <td className="px-6 py-3">
                    {getSeverityBadge(log.severity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SecurityTab = () => {
  const [enforce2FA, setEnforce2FA] = useState(true);
  const [apiLimit, setApiLimit] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState(60);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Security Policies</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Configure global security settings for your workspace.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
        
        {/* 2FA */}
        <div className="p-6 flex items-start justify-between">
          <div className="pr-8">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center">
              <Shield className="w-4 h-4 mr-2 text-slate-400"/> Enforce Two-Factor Authentication
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Require all organization members to set up 2FA before they can access any workspace data.</p>
          </div>
          <button 
            onClick={() => setEnforce2FA(!enforce2FA)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${enforce2FA ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enforce2FA ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* API Limits */}
        <div className="p-6 flex items-start justify-between">
          <div className="pr-8">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center">
              <Server className="w-4 h-4 mr-2 text-slate-400"/> Strict API Rate Limiting
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Enforce strict rate limits on Personal Access Tokens to prevent abuse.</p>
          </div>
          <button 
            onClick={() => setApiLimit(!apiLimit)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${apiLimit ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${apiLimit ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Password Policy */}
        <div className="p-6">
          <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center mb-4">
            <Key className="w-4 h-4 mr-2 text-slate-400"/> Password Complexity Policy
          </h3>
          <div className="max-w-xs relative">
            <select
              defaultValue="strong"
              className="w-full appearance-none px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white pr-8 cursor-pointer"
            >
              <option value="standard">Standard (8+ chars)</option>
              <option value="strong">Strong (12+ chars, special char)</option>
              <option value="custom">Custom...</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Session Timeout */}
        <div className="p-6">
          <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center mb-4">
            <Activity className="w-4 h-4 mr-2 text-slate-400"/> Idle Session Timeout
          </h3>
          <div className="max-w-md">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span>15 min</span>
              <span className="font-medium text-blue-600 dark:text-blue-400">{sessionTimeout} minutes</span>
              <span>8 hours</span>
            </div>
            <input 
              type="range" 
              min="15" 
              max="480" 
              step="15"
              value={sessionTimeout}
              onChange={(e) => setSessionTimeout(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        </div>

        {/* IP Allowlist */}
        <div className="p-6">
          <h3 className="text-sm font-medium text-slate-900 dark:text-white flex items-center mb-4">
            <Lock className="w-4 h-4 mr-2 text-slate-400"/> IP Allowlist
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Restrict access to your workspace to specific IP addresses or CIDR ranges. Leave blank to allow all.</p>
          <textarea
            rows={3}
            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-600"
            placeholder="192.168.1.0/24&#10;203.0.113.45"
            defaultValue="203.0.113.0/24"
          />
        </div>

      </div>
      
      <div className="flex justify-end pt-2">
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-slate-900">
          Save Security Settings
        </button>
      </div>
    </div>
  );
};

// --- Main Page Component ---

type TabId = 'members' | 'departments' | 'billing' | 'sso' | 'audit' | 'security';

export default function AdminConsolePage({ theme, orgId, userEmail, onNavigateBack }: AdminConsolePageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('members');

  const tabs = [
    { id: 'members', label: 'Members & Access', icon: Users },
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard },
    { id: 'sso', label: 'SSO Configuration', icon: Key },
    { id: 'audit', label: 'Audit Logs', icon: Activity },
    { id: 'security', label: 'Security', icon: Shield },
  ] as const;

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 font-sans ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Top Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onNavigateBack}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Admin Console</h1>
            <div className="text-xs text-slate-500 dark:text-slate-400">Aura Next Enterprise &bull; Org ID: {orgId}</div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <div className="text-sm text-slate-600 dark:text-slate-300 font-medium">
            {userEmail}
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">
            {userEmail.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row p-4 sm:p-6 gap-6 sm:gap-8 h-[calc(100vh-73px)]">
        
        {/* Sidebar */}
        <aside className="md:w-56 shrink-0 overflow-x-auto md:overflow-x-visible no-scrollbar pb-2 md:pb-0">
          <nav className="flex md:flex-col gap-1 min-w-max md:min-w-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 relative ${
                    isActive 
                      ? 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' 
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-600 dark:bg-blue-500 rounded-r-full hidden md:block" />
                  )}
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto pb-12 pr-2 custom-scrollbar">
          {activeTab === 'members' && <MembersTab />}
          {activeTab === 'departments' && <DepartmentsTab />}
          {activeTab === 'billing' && <BillingTab />}
          {activeTab === 'sso' && <SSOTab />}
          {activeTab === 'audit' && <AuditLogsTab />}
          {activeTab === 'security' && <SecurityTab />}
        </main>
      </div>
      
      {/* Scrollbar styles to add to global CSS or inline for completeness */}
      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 20px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(71, 85, 105, 0.5);
        }
      `}} />
    </div>
  );
}
