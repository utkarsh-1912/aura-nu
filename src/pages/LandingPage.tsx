import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Minus,
  Moon,
  Sun,
  HardDrive,
  Cpu,
  Workflow,
  Search,
  FileText,
  Folder,
  Sparkles,
  Hash,
} from "lucide-react";
import { Badge, Button, IconButton, Kbd, Logo, Separator, cn } from "../ui";
import { TIER_LABELS, TIER_PERMISSIONS } from "../lib/tierPermissions";

interface LandingPageProps {
  theme: "light" | "dark";
  onSetTheme: (theme: "light" | "dark") => void;
  onNavigateToAuth: (flow: "login" | "register") => void;
  onEnterDemo: () => void;
}

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#compare", label: "Compare" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

const FAQS = [
  {
    q: "Does Aura work offline?",
    a: "Yes. Notes are written to your device first and synced in the background. When you reconnect, changes are reconciled with the server revision.",
  },
  {
    q: "Is AI required?",
    a: "No. Every AI feature is optional and off until you turn it on. You choose the provider, including a model running locally on your machine, and you can bring your own key.",
  },
  {
    q: "Where does my data live?",
    a: "On your device, plus your workspace server when sync is enabled. Notes are plain Markdown, so you can export them and open them in any other editor.",
  },
  {
    q: "Can my team use it?",
    a: "Team and Enterprise workspaces support member invites, shared workspaces and an admin console. Enterprise adds SSO configuration and audit log export.",
  },
];

const COMPARE: { label: string; aura: boolean; apple: boolean | string }[] = [
  { label: "Cross-platform (web, desktop, mobile)", aura: true, apple: "Apple devices only" },
  { label: "Open Markdown files", aura: true, apple: false },
  { label: "Team collaboration", aura: true, apple: "Limited sharing" },
  { label: "Backlinks between notes", aura: true, apple: false },
  { label: "Automation and workflows", aura: true, apple: "Shortcuts only" },
];

function fmt(n: number, unit = "") {
  return n < 0 ? "Unlimited" : `${n.toLocaleString()}${unit}`;
}

function tierLines(tier: "personal" | "team" | "enterprise") {
  const p = TIER_PERMISSIONS[tier];
  const lines = [
    `${fmt(p.maxWorkspaces)} workspaces`,
    `${fmt(p.maxMembersPerWorkspace)} ${p.maxMembersPerWorkspace === 1 ? "member" : "members"} per workspace`,
    `${fmt(p.aiActionsPerMonth)} AI actions per month`,
    `${fmt(p.storageLimitGB, " GB")} storage`,
  ];
  if (p.canInviteMembers) lines.push("Member invites");
  if (p.canAccessAdminConsole) lines.push("Admin console");
  if (p.canConfigureSSO) lines.push("SSO configuration");
  if (p.canExportAuditLogs) lines.push("Audit log export");
  if (p.prioritySupport) lines.push("Priority support");
  return lines;
}

/** Faithful three-pane preview built from tokens. Decorative, so hidden from assistive tech. */
function ProductMock() {
  const notes = [
    { t: "Q3 planning", m: "Today", sel: true },
    { t: "Weekly sync notes", m: "Yesterday" },
    { t: "API design review", m: "Mon" },
    { t: "Reading list", m: "Last week" },
  ];
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
    >
      <div className="flex h-9 items-center gap-1.5 border-b border-line bg-sidebar px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
      </div>
      <div className="grid h-[320px] grid-cols-1 sm:h-[380px] sm:grid-cols-[180px_1fr] lg:grid-cols-[180px_240px_1fr]">
        <div className="hidden flex-col gap-0.5 border-r border-line bg-sidebar p-2 sm:flex">
          <div className="mb-2 flex items-center gap-2 px-1.5 py-1">
            <Logo size={20} />
          </div>
          <div className="flex h-7 items-center gap-2 rounded-md bg-hover px-2 text-[12px] text-fg-subtle">
            <Search size={12} /> Search <Kbd className="ml-auto">K</Kbd>
          </div>
          <div className="mt-3 px-2 text-[11px] font-medium text-fg-subtle">Folders</div>
          {["Work", "Personal", "Research"].map((f, i) => (
            <div
              key={f}
              className={cn(
                "flex h-7 items-center gap-2 rounded-md px-2 text-[12px]",
                i === 0 ? "bg-accent-soft text-accent" : "text-fg-muted",
              )}
            >
              <Folder size={12} /> {f}
            </div>
          ))}
          <div className="mt-3 px-2 text-[11px] font-medium text-fg-subtle">Tags</div>
          {["planning", "ideas"].map((f) => (
            <div key={f} className="flex h-7 items-center gap-2 rounded-md px-2 text-[12px] text-fg-muted">
              <Hash size={12} /> {f}
            </div>
          ))}
        </div>
        <div className="hidden flex-col border-r border-line bg-panel lg:flex">
          <div className="border-b border-line px-3 py-2.5 text-[12px] font-medium text-fg">Work</div>
          {notes.map((n) => (
            <div
              key={n.t}
              className={cn("border-b border-line px-3 py-2", n.sel && "bg-accent-soft")}
            >
              <div className="text-[13px] font-medium text-fg">{n.t}</div>
              <div className="text-[12px] text-fg-muted">{n.m}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col bg-surface p-5 sm:p-7">
          <div className="text-[11px] text-fg-subtle">Work / Q3 planning</div>
          <div className="mt-2 text-[22px] font-semibold tracking-tight text-fg">Q3 planning</div>
          <div className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-fg-muted">
            <p>Goals for the quarter, linked to the roadmap in [[Roadmap 2026]].</p>
            <p className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-[4px] border border-line-strong" /> Draft launch checklist
            </p>
            <p className="flex items-center gap-2">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-accent text-accent-fg">
                <Check size={10} />
              </span>
              Confirm sync rollout
            </p>
          </div>
          <div className="mt-auto flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-[12px] text-fg-muted">
            <Sparkles size={12} className="text-accent" /> Summarize this note
            <Badge className="ml-auto">Local model</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({ theme, onSetTheme, onNavigateToAuth, onEnterDemo }: LandingPageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const features = [
    {
      icon: HardDrive,
      title: "Local-first, with sync",
      body: "Your notes open instantly because they live on your device. Edit offline, then sync across web, desktop and mobile when you are back online. Notes stay plain Markdown, so there is no lock-in.",
      points: ["Works with no connection", "Revision-aware conflict handling", "Export to Markdown at any time"],
    },
    {
      icon: Cpu,
      title: "Private AI, your choice of model",
      body: "AI is optional. Turn it on when you want summaries, rewrites or questions about your notes, and point it at a local model or your own provider key. Nothing is sent anywhere until you decide.",
      points: ["Run a model locally", "Bring your own provider key", "Off by default"],
    },
    {
      icon: Workflow,
      title: "Workflows and agents",
      body: "Automate the repetitive parts: capture, tag, file and follow up. Build workflows visually, or let an agent work through your notes with the tools you grant it.",
      points: ["Visual workflow studio", "Agents with scoped tools", "Team workspaces and roles"],
    },
  ];

  const tiers = (["personal", "team", "enterprise"] as const).map((t) => ({
    id: t,
    name: TIER_LABELS[t],
    price: t === "personal" ? "Free" : t === "team" ? "Per seat" : "Custom",
    blurb:
      t === "personal"
        ? "For individuals who want fast, private notes."
        : t === "team"
          ? "For teams that share workspaces and knowledge."
          : "For organizations that need SSO, audit and control.",
    lines: tierLines(t),
    cta: t === "personal" ? "Get started" : t === "team" ? "Start with Team" : "Talk to us",
    featured: t === "team",
  }));

  return (
    <div id="landing-page" className="min-h-screen overflow-x-hidden bg-surface text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-[13px] focus:text-accent-fg"
      >
        Skip to content
      </a>

      <header id="landing-nav" className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo size={24} />
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-md px-2.5 py-1.5 text-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <IconButton
              label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              variant="ghost"
              onClick={() => onSetTheme(theme === "light" ? "dark" : "light")}
              className="max-sm:h-10 max-sm:w-10"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </IconButton>
            <Button
              id="landing-login-btn"
              variant="ghost"
              onClick={() => onNavigateToAuth("login")}
              className="max-sm:h-10"
            >
              Sign in
            </Button>
            <Button
              id="landing-register-btn"
              variant="primary"
              onClick={() => onNavigateToAuth("register")}
              className="max-sm:h-10"
            >
              Get started
            </Button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <Badge tone="accent">Open, local-first, AI-optional</Badge>
            <h1 className="mt-5 text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[46px]">
              Notes your team owns, that work everywhere.
            </h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-fg-muted">
              Aura is an open notes app for teams. Fast and offline on every device, stored as Markdown you can take
              anywhere, with AI only when you want it.
            </p>
            <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
              <Button
                variant="primary"
                size="lg"
                onClick={() => onNavigateToAuth("register")}
                trailingIcon={<ArrowRight size={15} />}
                className="max-sm:h-11"
              >
                Get started free
              </Button>
              <Button variant="secondary" size="lg" onClick={onEnterDemo} className="max-sm:h-11">
                Try the demo
              </Button>
            </div>
            <p className="mt-3 text-[12px] text-fg-subtle">No credit card needed. The demo runs without an account.</p>
          </div>
          <div className="mt-12">
            <ProductMock />
          </div>
        </section>

        <Separator />

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:px-6">
          <h2 className="text-[26px] font-semibold tracking-tight">Built for how teams actually write</h2>
          <p className="mt-2 max-w-xl text-[14px] text-fg-muted">
            Three ideas run through the whole product: your data stays yours, AI stays optional, and repetitive work
            gets automated.
          </p>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {features.map((f) => (
              <div key={f.title} className="grid gap-4 py-8 md:grid-cols-[1fr_1.2fr] md:gap-10">
                <div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <f.icon size={17} />
                  </span>
                  <h3 className="mt-4 text-[16px] font-semibold">{f.title}</h3>
                </div>
                <div>
                  <p className="text-[14px] leading-relaxed text-fg-muted">{f.body}</p>
                  <ul className="mt-4 space-y-2">
                    {f.points.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-[13px] text-fg">
                        <Check size={14} className="text-success" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Compare */}
        <section id="compare" className="mx-auto max-w-6xl scroll-mt-16 px-4 pb-16 sm:px-6">
          <h2 className="text-[20px] font-semibold tracking-tight">Aura and Apple Notes</h2>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            Apple Notes is a good personal notebook. Here is where Aura is different.
          </p>
          <div className="mt-6 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[480px] text-left text-[13px]">
              <caption className="sr-only">Feature comparison between Aura and Apple Notes</caption>
              <thead className="bg-sidebar text-[12px] text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Capability</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-fg">Aura</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Apple Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {COMPARE.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="px-4 py-3 font-normal text-fg">{r.label}</th>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-success">
                        <Check size={14} /> <span className="sr-only">Yes</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {r.apple === false ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Minus size={14} /> <span className="sr-only">No</span>
                        </span>
                      ) : (
                        r.apple
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-16 px-4 pb-16 sm:px-6">
          <h2 className="text-[26px] font-semibold tracking-tight">Plans</h2>
          <p className="mt-2 text-[14px] text-fg-muted">Limits shown are the ones enforced in the app.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {tiers.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "flex flex-col rounded-lg border bg-panel p-5",
                  t.featured ? "border-accent shadow-soft" : "border-line",
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold">{t.name}</h3>
                  {t.featured && <Badge tone="accent">Most teams</Badge>}
                </div>
                <div className="mt-3 text-[26px] font-semibold tracking-tight">{t.price}</div>
                <p className="mt-1 text-[13px] text-fg-muted">{t.blurb}</p>
                <ul className="mt-5 flex-1 space-y-2">
                  {t.lines.map((l) => (
                    <li key={l} className="flex items-start gap-2 text-[13px]">
                      <Check size={14} className="mt-0.5 shrink-0 text-success" /> {l}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={t.featured ? "primary" : "secondary"}
                  size="lg"
                  className="mt-6 w-full max-sm:h-11"
                  onClick={() => onNavigateToAuth("register")}
                >
                  {t.cta}
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 pb-20 sm:px-6">
          <h2 className="text-[26px] font-semibold tracking-tight">Questions</h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-btn-${i}`}
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="flex min-h-12 w-full items-center justify-between gap-4 py-3 text-left text-[14px] font-medium text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {f.q}
                      <ChevronDown
                        size={16}
                        className={cn("shrink-0 text-fg-subtle motion-safe:transition-transform", open && "rotate-180")}
                      />
                    </button>
                  </h3>
                  <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-btn-${i}`} hidden={!open}>
                    <p className="pb-4 text-[14px] leading-relaxed text-fg-muted">{f.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-line bg-sidebar">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="text-[20px] font-semibold tracking-tight">Start writing in a minute</h2>
              <p className="mt-1 text-[13px] text-fg-muted">Create a workspace, or look around in the demo first.</p>
            </div>
            <div className="flex w-full gap-2.5 sm:w-auto">
              <Button variant="primary" size="lg" onClick={() => onNavigateToAuth("register")} className="max-sm:h-11 max-sm:flex-1">
                Get started
              </Button>
              <Button variant="secondary" size="lg" onClick={onEnterDemo} className="max-sm:h-11 max-sm:flex-1">
                Try the demo
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-[13px] text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size={20} />
            <span className="text-fg-subtle">&copy; {new Date().getFullYear()}</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/network-status" className="py-1 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">
              System status
            </Link>
            <Link to="/terms" className="py-1 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">
              Terms
            </Link>
            <Link to="/privacy" className="py-1 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
