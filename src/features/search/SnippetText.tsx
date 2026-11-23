/** Renders a SearchIndex snippet with <mark> highlights (React text nodes only: no innerHTML). */
import React from "react";
import type { Snippet } from "../../core/search";

export default function SnippetText({ snippet, className }: { snippet: Snippet; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  snippet.ranges.forEach(([a, b], i) => {
    if (a > last) parts.push(snippet.text.slice(last, a));
    parts.push(<mark key={i} className="rounded-sm bg-warning-soft px-0.5 text-fg">{snippet.text.slice(a, b)}</mark>);
    last = b;
  });
  if (last < snippet.text.length) parts.push(snippet.text.slice(last));
  return <span className={className}>{parts}</span>;
}
