import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";

interface TermsPageProps {
  theme: "light" | "dark";
}

export default function TermsPage({ theme }: TermsPageProps) {
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
            Aura Service Agreement
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl tracking-tight">Terms of Service</h1>
            <p className={`text-[10px] font-mono mt-0.5 ${theme === "dark" ? "text-zinc-500" : "text-slate-400"}`}>
              Last Updated: July 6, 2026
            </p>
          </div>
        </div>

        <div className={`prose max-w-none text-xs leading-relaxed space-y-6 ${
          theme === "dark" ? "text-zinc-300" : "text-slate-700"
        }`}>
          <p className="text-sm">
            Welcome to Aura Notes. By accessing our services, creating workspaces, or utilizing our Generative 
            Assistant nodes, you agree to comply with the terms detailed herein.
          </p>

          <hr className={theme === "dark" ? "border-zinc-800" : "border-slate-200"} />

          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" />
              1. Usage Rights & Workspace Boundaries
            </h2>
            <p>
              We grant you a personal, non-exclusive, non-transferable license to access Aura Notes. 
              Each tenant is allocated private storage limits (e.g. 5MB quota) to index metadata and files. 
              Attempting to bypass storage quotas or interfere with other tenant isolation nodes is strictly prohibited.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <ShieldCheck size={14} className="text-blue-500" />
              2. User Obligations & Security
            </h2>
            <p>
              You are solely responsible for maintaining the confidentiality of your credentials (either Firebase password logs or passkey hashes). 
              Any activities originating from your authenticated profile will be deemed your legal responsibility.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" />
              3. Disclaimer of Warranties
            </h2>
            <p>
              Aura Notes is provided "as is" and "as available". We do not guarantee uninterrupted, secure, or bug-free operations. 
              In no event shall Aura Inc. be liable for any data loss, server downtime, or loss of proprietary metadata.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-slate-800 dark:text-zinc-100">
              4. Service Adjustments
            </h2>
            <p>
              We reserve the right to refine workspace parameters, modify pricing models, or deprecate free features at our sole discretion. 
              Continued usage following update announcements confirms your acceptance of new changes.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
