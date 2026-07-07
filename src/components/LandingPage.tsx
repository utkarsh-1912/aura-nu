import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Shield,
  Zap,
  Globe,
  Database,
  CheckCircle2,
  ChevronDown,
  Star,
  Users,
  Moon,
  Sun,
  Maximize2,
  Lock,
  Cloud,
  FileText,
  MousePointerClick
} from "lucide-react";
import { motion } from "motion/react";

interface LandingPageProps {
  theme: "light" | "dark";
  onSetTheme: (theme: "light" | "dark") => void;
  onNavigateToAuth: (flow: "login" | "register") => void;
  onEnterDemo: () => void;
}

export default function LandingPage({
  theme,
  onSetTheme,
  onNavigateToAuth,
  onEnterDemo,
}: LandingPageProps) {
  const [faqOpen, setFaqOpen] = useState<Record<number, boolean>>({});

  const toggleFaq = (index: number) => {
    setFaqOpen((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const faqs = [
    {
      q: "Does Aura work offline without an active internet connection?",
      a: "Yes, absolutely. Aura utilizes a advanced offline-first client replication layer. Any modifications you compose are persisted immediately inside the safe localStorage cache. The second your device reconnects, they are gracefully synchronized back to your cloud volume with revision reconciliation.",
    },
    {
      q: "How secure is my proprietary data and notes content?",
      a: "Enterprise-grade encryption is built into our core pipeline. Your files are isolated and stored in secure server environments. Your OpenAI or Gemini APIs run via server proxy parameters, meaning your personal API keys are never exposed to clients, and your text data is never used for foundation model training.",
    },
    {
      q: "Can I self-host Aura or configure my own databases?",
      a: "Our Enterprise Tier supports custom database attachments including secure PostgreSQL blocks, Cloud SQL integration, and customized private-tenant VPC setups. Reach out to our systems team for private cluster arrangements.",
    },
    {
      q: "What AI models are available within the Smart Shortcuts system?",
      a: "By default, Aura uses Google's latest Gemini 3.5 Flash engines, but you can configure your own private keys to unlock Gemini 1.5 Pro, Claude 3.5 Sonnet, or custom fine-tuned company endpoints inside your Settings workspace.",
    },
  ];

  const features = [
    {
      icon: Sparkles,
      title: "Gemini Generative Assistant",
      desc: "Instantly draft project OKRs, outline strategic board notes, extract high-priority action checklists, or translate documents with in-context context awareness.",
      color: "from-blue-500/10 to-indigo-500/10 text-indigo-500",
    },
    {
      icon: Database,
      title: "Dual Client-Cloud Sync",
      desc: "Work on airplanes or offline subways. Aura logs updates to a local redundancy pipeline and synchronizes seamlessly back to the Express container database.",
      color: "from-purple-500/10 to-pink-500/10 text-purple-500",
    },
    {
      icon: Zap,
      title: "Lightning Spotlight Palette",
      desc: "Hit ⌘K at any millisecond to activate the instant navigation palette. Jump between notes, switch folders, delete files, or toggle dark modes instantly.",
      color: "from-amber-500/10 to-orange-500/10 text-amber-500",
    },
    {
      icon: Shield,
      title: "Enterprise Multi-Factor Access",
      desc: "Reinforce workspace storage utilizing modern Passkeys, hardware authentication keys, Magic Links, or Google / Apple / Microsoft social login flows.",
      color: "from-emerald-500/10 to-teal-500/10 text-emerald-500",
    },
    {
      icon: Globe,
      title: "Responsive Bottom Navigation",
      desc: "Fully responsive layouts from wide 4K screens to 320px mobile viewports, featuring mobile drawer menus, large tap actions, and swipe controls.",
      color: "from-rose-500/10 to-red-500/10 text-rose-500",
    },
    {
      icon: Users,
      title: "Interactive Onboarding",
      desc: "Launch custom workspaces, choose preset design themes, import external files, and onboard core collaborators in under 45 seconds.",
      color: "from-cyan-500/10 to-blue-500/10 text-cyan-500",
    },
  ];

  const plans = [
    {
      name: "Starter Sandbox",
      price: "$0",
      desc: "A powerful workspace for personal strategy & writing.",
      features: [
        "Up to 25 documents",
        "Standard Gemini 3.5 Flash completions",
        "Local-first cache persistence",
        "Basic 3 tag categories",
        "Standard Light/Dark themes",
      ],
      action: () => onNavigateToAuth("register"),
      btnText: "Start for Free",
      popular: false,
    },
    {
      name: "Aura Pro Suite",
      price: "$12",
      period: "/month",
      desc: "Enhanced AI context window & collaborative sharing.",
      features: [
        "Unlimited document workspace",
        "Higher rate limit Gemini 3.5 completions",
        "Resilient dual server database sync",
        "Full Command Palette (⌘K) features",
        "Smart folders & automated organization",
        "Premium support & version histories",
      ],
      action: () => onNavigateToAuth("register"),
      btnText: "Upgrade to Pro",
      popular: true,
    },
    {
      name: "Enterprise Core",
      price: "$49",
      period: "/seat/mo",
      desc: "Dedicated compliance, custom databases, & custom LLM keys.",
      features: [
        "Everything in Pro Suite",
        "Custom SQL database attachments",
        "BYOK (Bring Your Own Key) custom endpoints",
        "SAML SSO & active Directory Sync",
        "Custom security audit logging",
        "Dedicated VPC infrastructure hosting",
      ],
      action: () => onNavigateToAuth("register"),
      btnText: "Contact Enterprise",
      popular: false,
    },
  ];

  return (
    <div
      id="landing-page"
      className={`min-h-screen font-sans overflow-x-hidden ${
        theme === "dark" ? "bg-[#09090b] text-zinc-100" : "bg-[#fafafc] text-slate-800"
      }`}
    >
      {/* Sticky Header */}
      <header
        id="landing-nav"
        className={`sticky top-0 z-40 w-full backdrop-blur-md border-b ${
          theme === "dark"
            ? "bg-[#09090b]/85 border-zinc-800/80"
            : "bg-white/85 border-slate-200/60"
        } transition-colors`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sparkles size={16} className="animate-pulse" />
            </div>
            <span className="font-tomorrow font-bold text-base tracking-tight bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent uppercase">
              Aura Next
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-slate-500 dark:text-zinc-400">
            <a href="#features-section" className="hover:text-slate-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#testimonials-section" className="hover:text-slate-900 dark:hover:text-white transition-colors">Client Love</a>
            <a href="#pricing-section" className="hover:text-slate-900 dark:hover:text-white transition-colors">Pricing</a>
            <a href="#faq-section" className="hover:text-slate-900 dark:hover:text-white transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onSetTheme(theme === "light" ? "dark" : "light")}
              className={`p-2 rounded-xl border transition-colors ${
                theme === "dark"
                  ? "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:text-white"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"
              } cursor-pointer`}
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            <button
              id="landing-login-btn"
              onClick={() => onNavigateToAuth("login")}
              className="text-xs font-semibold px-4 py-2 text-slate-600 dark:text-zinc-300 hover:text-slate-950 dark:hover:text-white transition-colors cursor-pointer"
            >
              Login
            </button>

            <button
              id="landing-register-btn"
              onClick={() => onNavigateToAuth("register")}
              className="text-xs font-semibold px-4 py-2 bg-slate-950 text-white dark:bg-white dark:text-zinc-950 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[400px] bg-gradient-to-tr from-purple-500/10 via-blue-500/5 to-transparent blur-[120px] rounded-full pointer-events-none"></div>

        <div className="text-center max-w-3xl mx-auto flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider mb-6"
          >
            <Sparkles size={11} />
            Unleashing Gemini-Powered Intelligence
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display font-extrabold text-[40px] sm:text-[54px] tracking-tight leading-[1.08] text-slate-900 dark:text-white"
          >
            The Generative Workspace for <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-blue-500">Deep Thinkers</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-sm sm:text-base text-slate-500 dark:text-zinc-400 mt-6 max-w-xl leading-relaxed"
          >
            Fusing polished markdown mechanics with secure, proxy-safe Gemini model workflows. Fully offline-first with immediate client-server database redundancy.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto"
          >
            <button
              onClick={() => onNavigateToAuth("register")}
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-500 hover:bg-blue-600 active:scale-[0.98] text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
            >
              Get Started for Free
              <ArrowRight size={13} />
            </button>

            <button
              onClick={onEnterDemo}
              className={`flex items-center justify-center gap-2 px-6 py-3.5 border font-semibold text-xs rounded-xl transition-all active:scale-[0.98] ${
                theme === "dark"
                  ? "border-zinc-800 bg-zinc-900/40 text-zinc-200 hover:bg-zinc-850 hover:border-zinc-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:shadow-sm"
              } cursor-pointer`}
            >
              <MousePointerClick size={13} />
              Launch Live Sandbox Demo
            </button>
          </motion.div>
        </div>

        {/* Product Screenshot / Premium glassmorphism layout showcase */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 relative mx-auto max-w-5xl rounded-2xl border bg-slate-900/5 dark:bg-white/5 p-2 border-slate-200/60 dark:border-zinc-800/80 backdrop-blur-xs shadow-2xl"
        >
          <div className="rounded-xl overflow-hidden border border-slate-200/50 dark:border-zinc-800 shadow-inner relative bg-zinc-950">
            {/* Top Bar Decoration */}
            <div className="bg-zinc-900 px-4 py-2.5 flex items-center justify-between border-b border-zinc-800">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
              </div>
              <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-2">
                <Lock size={10} />
                app.auranext.io/w/strategy/min
              </div>
              <div className="w-12"></div>
            </div>

            {/* Simulated Desktop Preview */}
            <div className="grid grid-cols-12 h-[340px] text-xs font-sans text-zinc-400 bg-[#0c0c0e]">
              <div className="col-span-3 border-r border-zinc-800/80 p-3 flex flex-col gap-2 bg-[#09090b]">
                <div className="flex items-center gap-2 bg-zinc-800/50 p-2 rounded-lg text-zinc-200 font-medium">
                  <FileText size={12} className="text-blue-500" />
                  <span>Q3 Launch OKRs</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg text-zinc-500">
                  <FileText size={12} />
                  <span>Developer Retro minutes</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg text-zinc-500">
                  <FileText size={12} />
                  <span>Security compliance log</span>
                </div>
              </div>

              <div className="col-span-6 p-5 flex flex-col gap-3 overflow-hidden bg-[#0c0c0e]">
                <span className="text-[10px] font-mono text-zinc-500">FOLDER: STRATEGY</span>
                <h3 className="font-display font-semibold text-base text-zinc-100">🎯 Q3 Product OKRs & Marketing Targets</h3>
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  # Core Objectives for the Q3 Beta Release
                  <br /><br />
                  - **Objective 1**: Build client-side robust SQLite encryption pipelines.<br />
                  - **Objective 2**: Decrease standard bundle loadtimes from 2.5s down to 180ms using Vite splitting modules.
                </p>
              </div>

              <div className="col-span-3 border-l border-zinc-800/80 p-4 bg-[#0d0d10] flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-zinc-300 font-semibold text-[11px]">
                  <Sparkles size={11} className="text-purple-400 animate-pulse" />
                  <span>Aura AI Insight</span>
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl flex flex-col gap-2">
                  <span className="text-[10px] text-purple-400 font-mono uppercase tracking-wider">Suggested Actions</span>
                  <p className="text-[10px] leading-tight text-zinc-400">Construct detailed action-items for SQLite encryption pipelines draft.</p>
                  <button className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-[9px] font-medium mt-1 w-max">Apply Checklist</button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Trusted Companies */}
      <section className={`py-8 border-y ${theme === "dark" ? "border-zinc-800 bg-zinc-950/20" : "border-slate-100 bg-slate-50/50"}`}>
        <div className="max-w-7xl mx-auto px-4 text-center">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500 block mb-4">
            Adopted by Leaders at Modern Product Organizations
          </span>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-16 opacity-40 grayscale invert dark:invert-0 select-none">
            {["Vercel", "Stripe", "Linear", "Supabase", "Framer", "Datadog"].map((company) => (
              <span key={company} className="font-display font-bold text-sm sm:text-base tracking-tight text-zinc-500">
                {company}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Bento Features Grid */}
      <section id="features-section" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-slate-900 dark:text-white">
            Supercharged Productivity. No Friction.
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-2">
            Every pipeline designed for speed, flexibility, security, and inline generative intelligence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div
                key={idx}
                className={`p-6 rounded-2xl border transition-all hover:shadow-lg ${
                  theme === "dark"
                    ? "bg-[#101012] border-zinc-800/80 hover:border-zinc-700/80 hover:bg-zinc-900/20"
                    : "bg-white border-slate-200/60 hover:border-blue-100 hover:shadow-slate-100"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${feat.color} flex items-center justify-center mb-4 flex-shrink-0 shadow-sm`}>
                  <Icon size={18} />
                </div>
                <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white mb-2">
                  {feat.title}
                </h3>
                <p className="text-[11.5px] leading-relaxed text-slate-500 dark:text-zinc-400">
                  {feat.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive Testimonials Slider */}
      <section id="testimonials-section" className={`py-20 px-4 sm:px-6 lg:px-8 ${theme === "dark" ? "bg-zinc-950/20 border-y border-zinc-800" : "bg-slate-50 border-y border-slate-100"}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full">
              Customer Voices
            </span>
            <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-slate-900 dark:text-white mt-3">
              Faved by developers & strategy consultants
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`p-6 rounded-2xl border ${theme === "dark" ? "bg-[#18181b]/50 border-zinc-800/80" : "bg-white border-slate-200"} flex flex-col justify-between`}>
              <div>
                <div className="flex gap-0.5 text-amber-500 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} size={14} className="fill-amber-500" />)}
                </div>
                <p className="text-xs sm:text-sm italic leading-relaxed text-slate-600 dark:text-zinc-300">
                  "The offline-first synchronization on Aura is magic. I can write markdown specs during international flights, and the microsecond I land, they sync straight back to our local container systems. Aura AI's summary actions also extracted flawless action checklists for my product sprints!"
                </p>
              </div>
              <div className="flex items-center gap-3 mt-6">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center font-bold text-white text-xs shadow-inner">
                  SS
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">Sarah Sterling</span>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500">Principal Architect, Stripe</span>
                </div>
              </div>
            </div>

            <div className={`p-6 rounded-2xl border ${theme === "dark" ? "bg-[#18181b]/50 border-zinc-800/80" : "bg-white border-slate-200"} flex flex-col justify-between`}>
              <div>
                <div className="flex gap-0.5 text-amber-500 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} size={14} className="fill-amber-500" />)}
                </div>
                <p className="text-xs sm:text-sm italic leading-relaxed text-slate-600 dark:text-zinc-300">
                  "Command Palette shortcuts (⌘K) have transformed how I manage technical logs. Instant switching, tag generation via Gemini proxy, and custom folders allow me to maintain high-density information arrays without touching my trackpad once."
                </p>
              </div>
              <div className="flex items-center gap-3 mt-6">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-purple-500 flex items-center justify-center font-bold text-white text-xs shadow-inner">
                  MK
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">Marcus Vance</span>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500">Lead Systems Engineer, Linear</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modern Pricing Matrices */}
      <section id="pricing-section" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-purple-500 bg-purple-500/10 px-3 py-1 rounded-full">
            Pricing Plans
          </span>
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-slate-900 dark:text-white mt-3">
            Simple, Transparent Subscription
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-2">
            No credit card required for Starter Sandbox. Zero hidden fees, cancel at any millisecond.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`p-6 rounded-2xl border flex flex-col justify-between relative transition-all hover:-translate-y-1 ${
                plan.popular
                  ? "border-blue-500 bg-blue-500/[0.01] shadow-xl shadow-blue-500/5 ring-1 ring-blue-500"
                  : theme === "dark"
                  ? "bg-[#101012] border-zinc-800"
                  : "bg-white border-slate-200"
              }`}
            >
              {plan.popular && (
                <span className="absolute top-0 right-6 -translate-y-1/2 px-2.5 py-0.5 bg-blue-500 text-white font-mono font-bold text-[9px] uppercase tracking-wider rounded-full">
                  Highly Popular
                </span>
              )}

              <div>
                <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{plan.name}</span>
                <div className="flex items-baseline gap-1 mt-4">
                  <span className="font-display font-extrabold text-4xl text-slate-900 dark:text-white">{plan.price}</span>
                  {plan.period && <span className="text-xs text-slate-400 dark:text-zinc-500">{plan.period}</span>}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed">{plan.desc}</p>

                <div className="h-px bg-slate-100 dark:bg-zinc-800/80 my-5"></div>

                <ul className="flex flex-col gap-3">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[11px] leading-tight text-slate-600 dark:text-zinc-300">
                      <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={plan.action}
                className={`w-full py-2.5 mt-8 font-semibold text-xs rounded-xl transition-all cursor-pointer ${
                  plan.popular
                    ? "bg-blue-500 hover:bg-blue-600 text-white shadow-sm shadow-blue-500/10"
                    : theme === "dark"
                    ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                    : "bg-slate-950 hover:bg-slate-900 text-white"
                }`}
              >
                {plan.btnText}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Accordion FAQ Panel */}
      <section id="faq-section" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-100 dark:border-zinc-800/60">
        <div className="text-center mb-12">
          <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-slate-900 dark:text-white">
            Frequently Asked Queries
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Need additional technical coordinates? Read through the matrix.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {faqs.map((faq, idx) => {
            const isOpen = !!faqOpen[idx];
            return (
              <div
                key={idx}
                className={`border rounded-2xl overflow-hidden transition-all duration-150 ${
                  theme === "dark" ? "bg-[#101012] border-zinc-800" : "bg-white border-slate-200"
                }`}
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full p-4 flex justify-between items-center text-left text-xs sm:text-sm font-semibold text-slate-900 dark:text-zinc-100 cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown size={14} className={`text-slate-400 dark:text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className={`px-4 pb-4 text-[11.5px] leading-relaxed ${theme === "dark" ? "text-zinc-400" : "text-slate-600"}`}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Beautiful Footer */}
      <footer className={`border-t py-16 px-4 sm:px-6 lg:px-8 ${theme === "dark" ? "border-zinc-800 bg-[#070709]" : "border-slate-200 bg-slate-50"}`}>
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-white">
                <Sparkles size={14} />
              </div>
              <span className="font-tomorrow font-bold text-sm tracking-tight bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent uppercase">
                Aura Next
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-zinc-500 max-w-xs">
              Refined strategy workspaces integrating robust offline duplication state engines and proxy-safe Gemini completions.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-zinc-300 mb-4">Product</h4>
            <ul className="flex flex-col gap-2.5 text-[11px] text-slate-400 dark:text-zinc-500">
              <li><a href="#features-section" className="hover:text-blue-500 transition-colors">Features</a></li>
              <li><a href="#pricing-section" className="hover:text-blue-500 transition-colors">Pricing Matrix</a></li>
              <li><a href="#testimonials-section" className="hover:text-blue-500 transition-colors">Client Reviews</a></li>
              <li><button onClick={onEnterDemo} className="hover:text-blue-500 transition-colors cursor-pointer text-left">Live Sandbox</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-zinc-300 mb-4">Integrations</h4>
            <ul className="flex flex-col gap-2.5 text-[11px] text-slate-400 dark:text-zinc-500">
              <li><span>PostgreSQL DB</span></li>
              <li><span>Gemini Flash 3.5</span></li>
              <li><span>Cloud SQL Core</span></li>
              <li><span>Passkey Sign-in</span></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-zinc-300 mb-4">Newsletter</h4>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mb-3">Join our telemetry for major capabilities updates.</p>
            <form onSubmit={(e) => { e.preventDefault(); alert("Thanks for joining Aura Next list!"); }} className="flex gap-1.5">
              <input
                type="email"
                placeholder="developer@aura.io"
                required
                className={`text-[11px] px-3 py-2 rounded-lg border outline-none flex-grow ${
                  theme === "dark" ? "bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-zinc-700" : "bg-white border-slate-200 text-slate-700 focus:border-blue-400"
                }`}
              />
              <button type="submit" className="px-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center cursor-pointer">
                Join
              </button>
            </form>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-8 border-t border-slate-200/50 dark:border-zinc-800/60 flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
          <span>&copy; {new Date().getFullYear()} Aura Inc. All standard developer rights reserved.</span>
          <div className="flex gap-4 mt-4 sm:mt-0">
            <Link to="/terms" className="hover:text-blue-500 transition-colors cursor-pointer">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-blue-500 transition-colors cursor-pointer">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
