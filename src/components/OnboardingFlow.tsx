import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Layers, Moon, Plus, Sun, X } from "lucide-react";
import { Button, Field, IconButton, Input, Kbd, Logo, cn } from "../ui";

interface OnboardingFlowProps {
  theme: "light" | "dark";
  onSetTheme: (theme: "light" | "dark") => void;
  onOnboardingComplete: (data: {
    workspaceName: string;
    theme: "light" | "dark";
    invitedEmails: string[];
    importedNotesCount: number;
  }) => void;
}

const TOTAL_STEPS = 6;

const IMPORT_OPTIONS = [
  { key: "guides", title: "Aura Markdown guide", meta: "2 notes. Recommended." },
  { key: "checklists", title: "Sprint checklists", meta: "1 note. Templates." },
  { key: "examples", title: "Strategy drafts and OKRs", meta: "3 notes. Examples." },
];

export default function OnboardingFlow({ theme, onSetTheme, onOnboardingComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);

  // Step state parameters
  const [workspaceName, setWorkspaceName] = useState("My Deep Space");
  const [workspaceSubdomain, setWorkspaceSubdomain] = useState("myspace");
  const [onboardTheme, setOnboardTheme] = useState<"light" | "dark">(theme);

  // Invited team emails
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitedList, setInvitedList] = useState<string[]>(["developer@company.com"]);

  // Imports option
  const [importSelected, setImportSelected] = useState<Record<string, boolean>>({
    guides: true,
    checklists: true,
    examples: false,
  });

  const headingRef = useRef<HTMLHeadingElement>(null);

  const handleAddInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail.trim() && inviteEmail.includes("@")) {
      setInvitedList([...invitedList, inviteEmail.trim()]);
      setInviteEmail("");
    }
  };

  const handleRemoveInvite = (index: number) => {
    setInvitedList(invitedList.filter((_, i) => i !== index));
  };

  const selectThemeMode = (mode: "light" | "dark") => {
    setOnboardTheme(mode);
    onSetTheme(mode);
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      // Completed, invoke success handler
      let importedNotesCount = 0;
      if (importSelected.guides) importedNotesCount += 2;
      if (importSelected.checklists) importedNotesCount += 1;
      if (importSelected.examples) importedNotesCount += 3;

      onOnboardingComplete({
        workspaceName,
        theme: onboardTheme,
        invitedEmails: invitedList,
        importedNotesCount,
      });
    }
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  // Move focus to the step heading so screen readers announce the new screen.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // Enter continues, unless it would activate a control or submit the invite form.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.defaultPrevented) return;
    const el = e.target as HTMLElement;
    const tag = el.tagName;
    if (tag === "BUTTON" || tag === "A" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (step === 5 && tag === "INPUT") return;
    e.preventDefault();
    handleNext();
  };

  const eyebrow = (n: number) => `Step ${n} of ${TOTAL_STEPS}`;
  const h2 = "text-[20px] font-semibold tracking-tight outline-none";
  const lead = "mt-1.5 text-[14px] leading-relaxed text-fg-muted";

  return (
    <div
      id="onboarding-viewport"
      onKeyDown={onKeyDown}
      className="flex min-h-screen flex-col items-center bg-surface px-4 py-6 text-fg"
    >
      <header className="flex w-full max-w-[480px] items-center justify-between">
        <Logo size={24} />
        {step < TOTAL_STEPS && (
          <Button variant="ghost" size="sm" onClick={handleNext} className="max-sm:h-10">
            Skip
          </Button>
        )}
      </header>

      <main className="flex w-full max-w-[480px] flex-1 flex-col justify-center py-8">
        <div className="mb-6" role="group" aria-label="Progress">
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={cn("h-1 flex-1 rounded-full motion-safe:transition-colors", i < step ? "bg-accent" : "bg-active")}
              />
            ))}
          </div>
          <p className="mt-2 text-[12px] text-fg-muted" aria-live="polite">
            {eyebrow(step)}
          </p>
        </div>

        <div className="min-h-[300px]">
          {step === 1 && (
            <div>
              <h1 ref={headingRef} tabIndex={-1} className="text-[26px] font-semibold leading-tight tracking-tight outline-none">
                Welcome to Aura
              </h1>
              <p className={lead}>A few quick choices, then your workspace is ready. It takes under a minute.</p>
              <ul className="mt-6 space-y-3 rounded-lg border border-line bg-panel p-4 text-[13px]">
                {[
                  "Notes are stored on your device first and synced when online",
                  "AI is optional and off until you turn it on",
                  "Jump anywhere with the command palette",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 ref={headingRef} tabIndex={-1} className={h2}>Name your workspace</h2>
              <p className={lead}>This is where your notes, folders and teammates live. You can change it later.</p>
              <div className="mt-6 flex flex-col gap-4">
                <Field label="Workspace name">
                  {(p) => (
                    <Input
                      {...p}
                      size="lg"
                      type="text"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      leadingIcon={<Layers size={14} />}
                      required
                    />
                  )}
                </Field>
                <Field label="URL prefix" hint="Lowercase letters and numbers only.">
                  {(p) => (
                    <div className="flex">
                      <span className="flex h-10 items-center rounded-l-lg border border-r-0 border-line bg-sidebar px-3 font-mono text-[13px] text-fg-muted">
                        auranotes.io/
                      </span>
                      <Input
                        {...p}
                        size="lg"
                        type="text"
                        value={workspaceSubdomain}
                        onChange={(e) => setWorkspaceSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                        className="rounded-l-none"
                        required
                      />
                    </div>
                  )}
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 ref={headingRef} tabIndex={-1} className={h2}>Pick a theme</h2>
              <p className={lead}>Choose what is easiest on your eyes. You can switch any time.</p>
              <div role="radiogroup" aria-label="Theme" className="mt-6 grid grid-cols-2 gap-3">
                {(
                  [
                    { id: "light", label: "Light", icon: Sun },
                    { id: "dark", label: "Dark", icon: Moon },
                  ] as const
                ).map((o) => {
                  const on = onboardTheme === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => selectThemeMode(o.id)}
                      className={cn(
                        "relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border bg-panel p-4 text-[13px] font-medium",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        on ? "border-accent bg-accent-soft text-accent" : "border-line text-fg hover:bg-hover",
                      )}
                    >
                      <o.icon size={18} />
                      {o.label}
                      {on && <Check size={14} className="absolute right-2.5 top-2.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 ref={headingRef} tabIndex={-1} className={h2}>Start with some notes</h2>
              <p className={lead}>Optional. Load starter notes so the workspace is not empty.</p>
              <div className="mt-6 flex flex-col gap-2">
                {IMPORT_OPTIONS.map((item) => {
                  const on = !!importSelected[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => setImportSelected({ ...importSelected, [item.key]: !on })}
                      className={cn(
                        "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border bg-panel px-3.5 py-2.5 text-left",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        on ? "border-accent bg-accent-soft" : "border-line hover:bg-hover",
                      )}
                    >
                      <span className="flex flex-col">
                        <span className="text-[13px] font-medium text-fg">{item.title}</span>
                        <span className="text-[12px] text-fg-muted">{item.meta}</span>
                      </span>
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          on ? "border-accent bg-accent text-accent-fg" : "border-line-strong",
                        )}
                      >
                        {on && <Check size={11} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 ref={headingRef} tabIndex={-1} className={h2}>Invite teammates</h2>
              <p className={lead}>Optional. They will get access to this workspace.</p>
              <form onSubmit={handleAddInvite} className="mt-6 flex items-end gap-2">
                <Field label="Email address" className="flex-1">
                  {(p) => (
                    <Input
                      {...p}
                      size="lg"
                      type="email"
                      autoComplete="off"
                      placeholder="teammate@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  )}
                </Field>
                <Button
                  type="submit"
                  variant="secondary"
                  size="lg"
                  disabled={!inviteEmail.includes("@")}
                  leadingIcon={<Plus size={14} />}
                >
                  Add
                </Button>
              </form>
              <ul className="mt-4 flex max-h-[168px] flex-col gap-1.5 overflow-y-auto" aria-label="Invited teammates">
                {invitedList.map((email, idx) => (
                  <li
                    key={idx}
                    className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-line bg-panel pl-3 pr-1 text-[13px]"
                  >
                    <span className="truncate">{email}</span>
                    <IconButton label={`Remove ${email}`} variant="ghost" size="md" onClick={() => handleRemoveInvite(idx)}>
                      <X size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
              {invitedList.length === 0 && (
                <p className="mt-4 rounded-md border border-dashed border-line px-3 py-6 text-center text-[13px] text-fg-muted">
                  No one invited yet. You can invite people later from workspace settings.
                </p>
              )}
            </div>
          )}

          {step === 6 && (
            <div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
                <CheckCircle2 size={22} />
              </span>
              <h2 ref={headingRef} tabIndex={-1} className={cn(h2, "mt-4")}>You are all set</h2>
              <p className={lead}>
                {workspaceName} is ready. {invitedList.length > 0 ? "Invitations go out when you continue." : "You can invite people later."}
              </p>
              <dl className="mt-6 divide-y divide-line rounded-lg border border-line bg-panel text-[13px]">
                <div className="flex justify-between px-4 py-2.5">
                  <dt className="text-fg-muted">Theme</dt>
                  <dd className="font-medium capitalize">{onboardTheme}</dd>
                </div>
                <div className="flex justify-between gap-3 px-4 py-2.5">
                  <dt className="text-fg-muted">URL</dt>
                  <dd className="truncate font-mono font-medium">auranotes.io/{workspaceSubdomain}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center gap-2">
          {step > 1 && (
            <Button variant="secondary" size="lg" onClick={handlePrev} leadingIcon={<ArrowLeft size={14} />} className="max-sm:h-11">
              Back
            </Button>
          )}
          <Button variant="primary" size="lg" onClick={handleNext} trailingIcon={<ArrowRight size={14} />} className="flex-1 max-sm:h-11">
            {step === TOTAL_STEPS ? "Open my workspace" : "Continue"}
          </Button>
        </div>
        <p className="mt-3 hidden text-center text-[12px] text-fg-subtle sm:block">
          Press <Kbd>Enter</Kbd> to continue
        </p>
      </main>
    </div>
  );
}
