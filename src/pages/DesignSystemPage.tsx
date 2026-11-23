import React, { useState } from "react";
import { Bell, Plus, Search, Settings, Trash2, FileText } from "lucide-react";
import {
  Avatar, Badge, Button, Checkbox, Dialog, EmptyState, Field, IconButton, Input, Kbd, Logo, LogoMark, Menu,
  Panel, Segmented, Select, Separator, Skeleton, Spinner, Switch, Tabs, Textarea, ToastViewport, Tooltip,
} from "../ui";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-[12px] font-semibold uppercase tracking-wider text-fg-subtle">{title}</h2>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </section>
);

const SWATCHES = ["surface", "sidebar", "panel", "raised", "hover", "active", "line", "line-strong", "accent", "accent-soft", "success", "warning", "danger"];

/** Living reference for the design system. Route: /design */
export default function DesignSystemPage({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const [tab, setTab] = useState("all");
  const [seg, setSeg] = useState("list");
  const [on, setOn] = useState(true);
  const [dlg, setDlg] = useState(false);
  const [checked, setChecked] = useState(false);

  return (
    <div className="min-h-dvh bg-surface text-fg">
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-line bg-surface/90 px-6 backdrop-blur">
        <Logo />
        <Button size="sm" onClick={onToggleTheme}>{theme === "dark" ? "Light" : "Dark"} mode</Button>
      </header>
      <main className="mx-auto max-w-4xl space-y-10 px-6 py-10">
        <Section title="Logo">
          <LogoMark size={64} />
          <LogoMark size={32} />
          <LogoMark size={20} />
          <LogoMark size={32} mono className="text-fg" />
          <Logo size={36} />
        </Section>

        <Section title="Color tokens">
          {SWATCHES.map((s) => (
            <div key={s} className="w-24 space-y-1">
              <div className={`h-10 rounded-md border border-line bg-${s}`} style={{ background: `var(--c-${s})` }} />
              <p className="text-[11px] text-fg-muted">{s}</p>
            </div>
          ))}
        </Section>

        <Section title="Buttons">
          <Button variant="primary" leadingIcon={<Plus size={14} />}>New note</Button>
          <Button>Secondary</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" leadingIcon={<Trash2 size={14} />}>Delete</Button>
          <Button variant="primary" loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg" variant="primary">Large</Button>
          <IconButton label="Settings"><Settings size={16} /></IconButton>
          <IconButton label="Notifications" variant="secondary"><Bell size={16} /></IconButton>
        </Section>

        <Section title="Form">
          <div className="grid w-full max-w-xl gap-4 sm:grid-cols-2">
            <Field label="Search" hint="Press / to focus">{(p) => <Input leadingIcon={<Search size={14} />} placeholder="Search notes" {...p} />}</Field>
            <Field label="Email" error="Enter a valid address">{(p) => <Input defaultValue="not-an-email" {...p} />}</Field>
            <Field label="Folder">{(p) => <Select {...p}><option>General</option><option>Projects</option></Select>}</Field>
            <Field label="Description" className="sm:col-span-2">{(p) => <Textarea placeholder="Write something" {...p} />}</Field>
          </div>
          <div className="flex w-full items-center gap-6">
            <label className="flex items-center gap-2 text-[13px]">Auto-save <Switch label="Auto-save" checked={on} onChange={setOn} /></label>
            <Checkbox label="Include archived" checked={checked} onChange={setChecked} />
          </div>
        </Section>

        <Section title="Navigation">
          <div className="w-full space-y-4">
            <Tabs value={tab} onChange={setTab} items={[{ id: "all", label: "All", count: 12 }, { id: "shared", label: "Shared" }, { id: "archive", label: "Archive" }]} />
            <Segmented value={seg} onChange={setSeg} items={[{ id: "list", label: "List" }, { id: "grid", label: "Grid" }, { id: "table", label: "Table" }]} />
          </div>
        </Section>

        <Section title="Display">
          <Badge>Neutral</Badge><Badge tone="accent">Accent</Badge><Badge tone="success">Published</Badge>
          <Badge tone="warning">In review</Badge><Badge tone="danger">Locked</Badge>
          <Kbd>⌘</Kbd><Kbd>K</Kbd>
          <Avatar name="Utkarsh Gupta" /><Avatar name="Ana Raj" size={32} /><Avatar name="Sam" size={40} />
          <Spinner /><Skeleton className="h-4 w-40" />
          <Separator className="my-2" />
        </Section>

        <Section title="Overlays">
          <Button onClick={() => setDlg(true)}>Open dialog</Button>
          <Menu
            trigger={({ props }) => <Button {...props}>Menu</Button>}
            items={[
              { id: "a", label: "Rename", icon: <FileText size={14} />, shortcut: "R", onSelect: () => {} },
              { id: "b", label: "Duplicate", onSelect: () => {} },
              "separator",
              { id: "c", label: "Delete", danger: true, icon: <Trash2 size={14} />, onSelect: () => {} },
            ]}
          />
          <Tooltip text="Create a note"><IconButton label="New note" variant="secondary"><Plus size={16} /></IconButton></Tooltip>
        </Section>

        <Panel className="w-full">
          <EmptyState icon={<FileText size={18} />} title="No notes yet" description="Create your first note to get started." action={<Button variant="primary" size="sm">New note</Button>} />
        </Panel>
      </main>

      <Dialog open={dlg} onClose={() => setDlg(false)} title="Rename note" description="Titles are shown in the list and search." footer={<><Button onClick={() => setDlg(false)}>Cancel</Button><Button variant="primary" onClick={() => setDlg(false)}>Save</Button></>}>
        <Field label="Title">{(p) => <Input data-autofocus defaultValue="Q3 Strategy" {...p} />}</Field>
      </Dialog>
      <ToastViewport toasts={[{ id: "1", text: "Synced just now", type: "success" }]} />
    </div>
  );
}
