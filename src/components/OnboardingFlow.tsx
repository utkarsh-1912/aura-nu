import React, { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Layers,
  Palette,
  Import,
  Users,
  CheckCircle2,
  Trash2,
  Plus,
  Moon,
  Sun,
  Laptop,
  Check
} from "lucide-react";

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

export default function OnboardingFlow({
  theme,
  onSetTheme,
  onOnboardingComplete,
}: OnboardingFlowProps) {
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
    if (step < 6) {
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

  return (
    <div
      id="onboarding-viewport"
      className="min-h-screen flex flex-col items-center justify-center p-6 transition-colors duration-200 bg-bg-primary text-text-primary"
    >
      {/* Top Wizard Steps Tracker */}
      <div className="w-full max-w-lg mb-8 flex items-center justify-between px-2 select-none">
        {[1, 2, 3, 4, 5, 6].map((idx) => (
          <React.Fragment key={idx}>
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step >= idx
                  ? "bg-blue-500 text-white font-semibold"
                  : theme === "dark"
                  ? "bg-zinc-800 text-zinc-500"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {idx}
            </div>
            {idx < 6 && (
              <div
                className={`flex-grow h-0.5 mx-1.5 transition-all ${
                  step > idx ? "bg-blue-500" : theme === "dark" ? "bg-zinc-800" : "bg-slate-200"
                }`}
              ></div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Main Multi-step Card container */}
      <div
        className="w-full max-w-lg p-8 rounded-3xl border border-border-primary flex flex-col min-h-[440px] justify-between relative transition-all bg-bg-secondary text-text-primary shadow-xl dark:shadow-2xl dark:shadow-black/40"
      >
        {/* STEP 1: Welcome & Onboarding Intention */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/10 mb-2">
                <Sparkles size={18} />
              </div>
              <h1 className="font-display font-extrabold text-[24px] tracking-tight leading-snug">
                Congratulations on configuring your credentials!
              </h1>
              <p className="text-xs text-slate-400 dark:text-zinc-500 leading-relaxed">
                Welcome to Aura Next. Before unlocking your redundant document pipeline and Gemini-driven assistants, let's configure your strategic defaults in under 30 seconds.
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/40 flex flex-col gap-3">
              <h3 className="font-semibold text-xs text-slate-800 dark:text-zinc-200">What's in your Sandbox Package:</h3>
              <ul className="flex flex-col gap-2.5 text-[11px] leading-tight text-slate-500 dark:text-zinc-400">
                <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-500" /> Standard 3.5 Gemini contextual model triggers</li>
                <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-500" /> Offline local backup duplication engine</li>
                <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-500" /> Full spotlight searching palette (⌘K)</li>
              </ul>
            </div>
          </div>
        )}

        {/* STEP 2: Workspace Customization */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-blue-500 uppercase tracking-widest">Workspace Core</span>
              <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">Designate your primary brain</h2>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">Isolate private notes lists, strategy folders, and document groups within your personal tenant.</p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Workspace name</label>
                <div className="relative flex items-center">
                  <Layers size={13} className="absolute left-3.5 text-slate-400 dark:text-zinc-500" />
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    required
                    className={`w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border outline-none ${
                      theme === "dark"
                        ? "bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-700"
                        : "bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:border-blue-400"
                    }`}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Custom URL Prefix</label>
                <div className="flex items-center">
                  <span className={`px-3 py-2.5 text-xs border border-r-0 rounded-l-xl font-mono ${
                    theme === "dark" ? "bg-zinc-900 border-zinc-800 text-zinc-500" : "bg-slate-100 border-slate-200 text-slate-500"
                  }`}>
                    auranotes.io/
                  </span>
                  <input
                    type="text"
                    value={workspaceSubdomain}
                    onChange={(e) => setWorkspaceSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                    required
                    className={`text-xs px-3 py-2.5 rounded-r-xl border border-l-0 outline-none flex-grow ${
                      theme === "dark"
                        ? "bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-700"
                        : "bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:border-blue-400"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Choose Theme Mode */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-blue-500 uppercase tracking-widest">Interface Skin</span>
              <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">Choose your ambient mode</h2>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">Configure eye-safe shades for optimal tactical writing focus.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => selectThemeMode("light")}
                className={`p-5 rounded-2xl border flex flex-col items-center gap-3 transition-all relative ${
                  onboardTheme === "light"
                    ? "border-blue-500 bg-blue-500/[0.02] text-blue-500"
                    : "border-slate-200 hover:border-slate-300 dark:border-zinc-800 text-slate-500"
                } cursor-pointer`}
              >
                <div className={`w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 ${
                  onboardTheme === "light" ? "scale-105" : ""
                }`}>
                  <Sun size={18} />
                </div>
                <span className="font-semibold text-xs">Light Palette</span>
                {onboardTheme === "light" && <Check size={12} className="absolute top-3 right-3 stroke-[3]" />}
              </button>

              <button
                onClick={() => selectThemeMode("dark")}
                className={`p-5 rounded-2xl border flex flex-col items-center gap-3 transition-all relative ${
                  onboardTheme === "dark"
                    ? "border-blue-500 bg-blue-500/[0.02] text-indigo-400"
                    : "border-slate-200 hover:border-slate-300 dark:border-zinc-800 text-slate-500"
                } cursor-pointer`}
              >
                <div className={`w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 ${
                  onboardTheme === "dark" ? "scale-105" : ""
                }`}>
                  <Moon size={18} />
                </div>
                <span className="font-semibold text-xs">Dark Palette</span>
                {onboardTheme === "dark" && <Check size={12} className="absolute top-3 right-3 stroke-[3]" />}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Import mock templates */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-blue-500 uppercase tracking-widest">Document seeding</span>
              <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">Import startup blueprints</h2>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">Accelerate strategy setup with preset notes. Check files to load.</p>
            </div>

            <div className="flex flex-col gap-2.5">
              {[
                { key: "guides", title: "Aura Markdown onboarding manual", count: "2 files • Recommended", icon: Import },
                { key: "checklists", title: "Standard Sprint action-items lists", count: "1 file • Templates", icon: Import },
                { key: "examples", title: "Dummy strategy drafts & OKRs", count: "3 files • Playbook examples", icon: Import },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setImportSelected({ ...importSelected, [item.key]: !importSelected[item.key] })}
                  className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-colors ${
                    importSelected[item.key]
                      ? "border-blue-500 bg-blue-500/[0.02] text-blue-500"
                      : "border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400"
                  } cursor-pointer`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon size={13} className="text-blue-500" />
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-900 dark:text-zinc-200">{item.title}</span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono mt-0.5">{item.count}</span>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                    importSelected[item.key] ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300 dark:border-zinc-700"
                  }`}>
                    {importSelected[item.key] && <Check size={10} className="stroke-[3]" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5: Invite team members */}
        {step === 5 && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-blue-500 uppercase tracking-widest">Collaborators</span>
              <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">Invite core strategy team</h2>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">Onboard developers, copywriters, or directors to review synced drafts.</p>
            </div>

            <div className="flex flex-col gap-4">
              <form onSubmit={handleAddInvite} className="flex gap-1.5">
                <input
                  type="email"
                  placeholder="collaborator@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className={`flex-grow text-xs px-3 py-2 rounded-xl border outline-none ${
                    theme === "dark"
                      ? "bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-700"
                      : "bg-slate-50 border-slate-200 text-slate-700 focus:bg-white focus:border-blue-400"
                  }`}
                />
                <button
                  type="submit"
                  disabled={!inviteEmail.includes("@")}
                  className={`px-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm ${
                    !inviteEmail.includes("@") ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  }`}
                >
                  <Plus size={13} />
                  Add
                </button>
              </form>

              {/* Scrollable Emails Container */}
              <div className="flex-grow max-h-[140px] overflow-y-auto flex flex-col gap-1.5 pr-1">
                {invitedList.map((email, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between font-mono ${
                      theme === "dark" ? "bg-zinc-950 border-zinc-850" : "bg-slate-50 border-slate-100"
                    }`}
                  >
                    <span>{email}</span>
                    <button
                      onClick={() => handleRemoveInvite(idx)}
                      className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}

                {invitedList.length === 0 && (
                  <div className="text-center text-[11px] text-slate-400 py-6 italic">No emails added yet. Invite teams for Pro sync!</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: Finished checks */}
        {step === 6 && (
          <div className="flex flex-col gap-5 text-center items-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center animate-bounce mb-2">
              <CheckCircle2 size={28} />
            </div>

            <h2 className="font-display font-bold text-xl text-slate-900 dark:text-white">Workspace is ready to launch!</h2>
            <p className="text-[11.5px] leading-relaxed text-slate-400 dark:text-zinc-500 max-w-sm">
              We completed isolation of **{workspaceName}** on our safe cloud volume container. Your template blueprints are seeded, and invited teammates will receive access dispatches immediately.
            </p>

            <div className={`p-4 rounded-xl border w-full text-left text-[11px] font-mono leading-relaxed ${
              theme === "dark" ? "bg-zinc-900 border-zinc-800" : "bg-slate-50 border-slate-200"
            }`}>
              <div className="flex justify-between border-b border-slate-200/50 dark:border-zinc-800 pb-1.5 mb-1.5">
                <span>Theme Preset:</span>
                <span className="text-blue-500 capitalize">{onboardTheme} Mode</span>
              </div>
              <div className="flex justify-between">
                <span>URL Domain:</span>
                <span className="text-purple-500">auranotes.io/{workspaceSubdomain}</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Panel: Back & Next Button */}
        <div className="flex gap-3 mt-8 pt-4 border-t border-slate-100 dark:border-zinc-800">
          {step > 1 && (
            <button
              onClick={handlePrev}
              className={`px-5 py-2.5 border text-xs font-semibold rounded-xl transition-all active:scale-[0.98] ${
                theme === "dark"
                  ? "border-zinc-800 hover:bg-zinc-900"
                  : "border-slate-200 hover:bg-slate-50"
              } cursor-pointer`}
            >
              Previous
            </button>
          )}

          <button
            onClick={handleNext}
            className="flex-grow py-2.5 bg-blue-500 hover:bg-blue-600 active:scale-[0.98] text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
          >
            <span>{step === 6 ? "Activate My Space" : "Continue"}</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
