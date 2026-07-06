import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Eye, Lock, RefreshCw, Key } from "lucide-react";

interface PrivacyPageProps {
  theme: "light" | "dark";
}

export default function PrivacyPage({ theme }: PrivacyPageProps) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${
      theme === "dark" ? "bg-[#09090b] text-zinc-100" : "bg-[#FAFAFC] text-slate-900"
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-md ${
        theme === "dark" ? "bg-[#09090b]/80 border-zinc-800" : "bg-[#FAFAFC]/80 border-slate-200"
      }`}>
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Home
          </Link>
          <span className="font-display font-black text-sm tracking-tight">
            Aura Privacy Protocol
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl tracking-tight">Privacy Policy</h1>
            <p className={`text-[10px] font-mono mt-0.5 ${theme === "dark" ? "text-zinc-500" : "text-slate-400"}`}>
              Last Updated: July 6, 2026
            </p>
          </div>
        </div>

        <div className={`prose max-w-none text-xs leading-relaxed space-y-6 ${
          theme === "dark" ? "text-zinc-300" : "text-slate-700"
        }`}>
          <p className="text-sm">
            At Aura Notes, we value your privacy above all. Aura is built with a 
            <strong> zero-compromise encryption architecture</strong>, meaning your files, schemas, and workspace structures 
            remain securely under your control.
          </p>

          <hr className={theme === "dark" ? "border-zinc-800" : "border-slate-200"} />

          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <Eye size={14} className="text-blue-500" />
              1. What Information We Collect
            </h2>
            <p>
              Aura Notes operates primarily as a client-side replicated database. We collect:
            </p>
            <ul className="list-disc list-inside pl-4 space-y-1.5">
              <li><strong>Authentication Data:</strong> User email, display name, and authentication tokens via Firebase.</li>
              <li><strong>Workspace Content:</strong> User-composed note markdown and directory folders.</li>
              <li><strong>Local Settings:</strong> Layout layouts, theme choices, and active selection states.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <Lock size={14} className="text-purple-500" />
              2. Data Protection & Security
            </h2>
            <p>
              Your content is stored in secure database instances. Access to your notes is isolated strictly to your authenticated email session.
              Offline drafts are cached securely inside your browser's private storage, isolated from external client scripts.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <RefreshCw size={14} className="text-emerald-500" />
              3. Synchronization & Offline Redundancy
            </h2>
            <p>
              To provide seamless performance in planes or offline subways, Aura persists any document changes locally. When connection 
              resumes, the app securely reconciles data with our backend using isolated WebSocket/HTTPS streams.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <Key size={14} className="text-amber-500" />
              4. AI Processing Policy (Gemini API)
            </h2>
            <p>
              Our built-in Gemini Assistant processes your context-aware prompts statelessly. We route your queries through secure proxy 
              parameters. Your API keys are never exposed directly to external client scripts, and your note content is never utilized to 
              train foundation AI models.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-slate-800 dark:text-zinc-100">
              5. Contact Us
            </h2>
            <p>
              For security reports or data disclosure requests, contact our systems administration team at 
              <span className="text-blue-500 ml-1">security@aura.io</span>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
