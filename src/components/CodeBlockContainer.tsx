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

  void theme; // tokens switch with the .dark class
  return (
    <div
      id={blockId}
      className="my-6 flex select-text flex-col overflow-hidden rounded-lg border border-line bg-sidebar font-mono text-xs text-fg"
    >
      {/* Code Header Bar */}
      <div className="flex select-none items-center justify-between border-b border-line bg-panel px-3 py-1.5">
        {/* Language select */}
        <div className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={showLangMenu}
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span>{displayLabel}</span>
            <ChevronDown size={12} className={`transition-transform duration-150 ${showLangMenu ? "rotate-180" : ""}`} />
          </button>

          {showLangMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowLangMenu(false)} />
              <div
                role="listbox"
                className="absolute left-0 z-40 mt-1 flex max-h-60 w-44 flex-col overflow-y-auto rounded-lg border border-line bg-raised p-1 shadow-pop"
              >
                <div className="mb-1 select-none px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                  Language
                </div>
                {languageOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={activeLang === opt.value}
                    onClick={() => {
                      setLanguage(opt.value);
                      setShowLangMenu(false);
                    }}
                    className={`min-h-8 w-full cursor-pointer rounded-md px-2 text-left text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                      activeLang === opt.value ? "bg-accent-soft font-medium text-accent" : "text-fg hover:bg-hover"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleWordWrap}
            aria-pressed={wordWrap}
            aria-label={wordWrap ? "Disable word wrap" : "Enable word wrap"}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
            className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              wordWrap ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-hover hover:text-fg"
            }`}
          >
            <WrapText size={14} />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy code"
            className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              copied ? "bg-success-soft text-success" : "text-fg-muted hover:bg-hover hover:text-fg"
            }`}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* Code + line numbers */}
      <div className="relative flex min-h-0 flex-grow overflow-x-auto">
        <div className="w-11 shrink-0 select-none border-r border-line py-4 pl-4 pr-3 text-right font-mono text-[11px] leading-relaxed text-fg-subtle">
          {lines.map((_, index) => (
            <div key={index} className="h-[21px]">
              {index + 1}
            </div>
          ))}
        </div>

        <pre
          className={`m-0 flex-grow overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-fg focus:outline-none ${
            wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"
          }`}
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
