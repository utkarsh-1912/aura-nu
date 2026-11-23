import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo, cn } from "../ui";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/** Long-form reading layout shared by Privacy and Terms: 680px column, sticky contents on desktop. */
export default function LegalLayout({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [sections]);

  return (
    <div className="min-h-screen bg-surface text-fg">
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Aura home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Logo size={24} />
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-12 px-4 py-10 sm:px-6 sm:py-14">
        <main className="min-w-0 max-w-[680px] flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[12px] text-fg-subtle">Last updated {updated}</p>
          <div className="mt-6 text-[15px] leading-[1.7] text-fg-muted">{intro}</div>
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="mt-10 scroll-mt-20">
              <h2 className="text-[16px] font-semibold text-fg">{s.title}</h2>
              <div className="mt-2 space-y-3 text-[15px] leading-[1.7] text-fg-muted">{s.body}</div>
            </section>
          ))}
        </main>

        <aside className="hidden w-52 shrink-0 lg:block">
          <nav aria-label="On this page" className="sticky top-24">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">On this page</p>
            <ul className="space-y-0.5 border-l border-line">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={active === s.id ? "true" : undefined}
                    className={cn(
                      "-ml-px block border-l py-1.5 pl-3 text-[13px] focus-visible:outline-2 focus-visible:outline-accent",
                      active === s.id
                        ? "border-accent font-medium text-accent"
                        : "border-transparent text-fg-muted hover:text-fg",
                    )}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}
