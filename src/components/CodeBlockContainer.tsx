import React, { useState, useEffect, useMemo } from "react";
import Prism from "prismjs";
import { Copy, Check, WrapText, ChevronDown } from "lucide-react";

// Load Prism components
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-php";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-markdown";

// Map user inputs or aliases to Prism languages
const languageMap: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  cs: "csharp",
  csharp: "csharp",
  "c#": "csharp",
  go: "go",
  golang: "go",
  rust: "rust",
  rs: "rust",
  php: "php",
  html: "markup",
  markup: "markup",
  css: "css",
  scss: "scss",
  sql: "sql",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "markup",
  bash: "bash",
  sh: "bash",
  powershell: "powershell",
  ps1: "powershell",
  dockerfile: "docker",
  docker: "docker",
  md: "markdown",
  markdown: "markdown"
};

// Nice, human-readable display labels for language selector dropdown
const languageOptions = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "php", label: "PHP" },
  { value: "markup", label: "HTML/XML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "sql", label: "SQL" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "bash", label: "Bash" },
  { value: "powershell", label: "PowerShell" },
  { value: "docker", label: "Dockerfile" },
  { value: "markdown", label: "Markdown" }
];

interface CodeBlockContainerProps {
  key?: string;
  blockId: string;
  code: string;
  defaultLanguage: string;
  theme: "light" | "dark";
  wordWrap: boolean;
  toggleWordWrap: () => void;
  setLanguage: (lang: string) => void;
}

export default function CodeBlockContainer({
  blockId,
  code,
  defaultLanguage,
  theme,
  wordWrap,
  toggleWordWrap,
  setLanguage,
}: CodeBlockContainerProps) {
  const [copied, setCopied] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Normalize current language using map
  const activeLang = useMemo(() => {
    const norm = defaultLanguage.toLowerCase();
    return languageMap[norm] || "javascript";
  }, [defaultLanguage]);

  // Compute HTML string from Prism syntax highlighting
  const highlightedHtml = useMemo(() => {
    try {
      const prismLangObj = Prism.languages[activeLang] || Prism.languages.javascript;
      return Prism.highlight(code, prismLangObj, activeLang);
    } catch (e) {
      console.error("Prism highlighting error:", e);
      return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  }, [code, activeLang]);

  // Handle Clipboard copies
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  // Split lines for line numbers rendering
  const lines = useMemo(() => {
    const splitLines = code.split("\n");
    // If last line is empty due to a trailing newline, remove it to prevent extra empty line number
    if (splitLines.length > 1 && splitLines[splitLines.length - 1] === "") {
      return splitLines.slice(0, -1);
    }
    return splitLines;
  }, [code]);

  // Find human-readable label
  const displayLabel = useMemo(() => {
    const matched = languageOptions.find(opt => opt.value === activeLang);
    return matched ? matched.label : activeLang.toUpperCase();
  }, [activeLang]);

  return (
    <div
      id={blockId}
      className={`my-6 rounded-2xl border shadow-xs overflow-hidden flex flex-col transition-all text-xs font-mono select-text ${
        theme === "dark"
          ? "bg-[#0b0c0f] border-zinc-800/80 text-zinc-300"
          : "bg-slate-50/50 border-slate-200 text-slate-800"
      }`}
    >
      {/* Code Header Bar */}
      <div
        className={`px-4 py-2.5 flex items-center justify-between border-b select-none ${
          theme === "dark"
            ? "bg-[#101216] border-zinc-800/60"
            : "bg-slate-100/70 border-slate-200"
        }`}
      >
        {/* Language dropdown select */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
              theme === "dark"
                ? "border-zinc-800 hover:bg-zinc-800 text-zinc-300"
                : "border-slate-200 hover:bg-slate-200/50 text-slate-600"
            }`}
          >
            <span>{displayLabel}</span>
            <ChevronDown size={11} className={`transition-transform duration-150 ${showLangMenu ? "rotate-180" : ""}`} />
          </button>

          {showLangMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowLangMenu(false)} />
              <div
                className={`absolute left-0 mt-1.5 w-44 max-h-60 overflow-y-auto rounded-xl border p-1 z-40 shadow-xl flex flex-col ${
                  theme === "dark"
                    ? "bg-[#0e1014] border-zinc-800 text-zinc-300"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                <div className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 uppercase px-2 py-1 border-b border-slate-100 dark:border-zinc-800 mb-1 select-none">
                  Select Language
                </div>
                {languageOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setLanguage(opt.value);
                      setShowLangMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-colors cursor-pointer ${
                      activeLang === opt.value
                        ? "bg-blue-500 text-white font-semibold"
                        : theme === "dark"
                        ? "hover:bg-zinc-800 text-zinc-300"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Action Controls: Wrap Word, Copy Code */}
        <div className="flex items-center gap-2">
          {/* Word Wrap Toggle */}
          <button
            onClick={toggleWordWrap}
            title={wordWrap ? "Disable Word Wrap" : "Enable Word Wrap"}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              wordWrap
                ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                : theme === "dark"
                ? "border-zinc-850 hover:bg-zinc-800 text-zinc-400"
                : "border-slate-200 hover:bg-slate-200/50 text-slate-500"
            }`}
          >
            <WrapText size={13} />
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
              copied
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                : theme === "dark"
                ? "border-zinc-850 hover:bg-zinc-800 text-zinc-300"
                : "border-slate-200 hover:bg-slate-200/50 text-slate-600"
            }`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* Code Text Block & Optional Line Numbers */}
      <div className="flex-grow flex min-h-0 overflow-x-auto relative">
        {/* Line numbers column */}
        <div
          className={`py-4 select-none text-right pr-3 pl-4 border-r border-dashed font-mono text-[11px] leading-relaxed w-11 shrink-0 ${
            theme === "dark"
              ? "bg-[#090a0d] border-zinc-900 text-zinc-600"
              : "bg-slate-100/40 border-slate-200/60 text-slate-400"
          }`}
        >
          {lines.map((_, index) => (
            <div key={index} className="h-[21px]">
              {index + 1}
            </div>
          ))}
        </div>

        {/* Main code content */}
        <pre
          className={`flex-grow p-4 overflow-x-auto font-mono text-[11px] leading-relaxed m-0 focus:outline-none ${
            wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"
          } ${theme === "dark" ? "text-zinc-200" : "text-slate-800"}`}
        >
          <code
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            className={`language-${activeLang}`}
          />
        </pre>
      </div>
    </div>
  );
}
