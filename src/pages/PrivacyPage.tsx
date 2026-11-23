import React from "react";
import LegalLayout from "./LegalLayout";

interface PrivacyPageProps {
  theme: "light" | "dark";
}

const strong = "font-medium text-fg";

const SECTIONS = [
  {
    id: "collect",
    title: "1. What information we collect",
    body: (
      <>
        <p>Aura Next operates primarily as a client-side replicated database. We collect:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><span className={strong}>Authentication data:</span> user email, display name, and authentication tokens via Firebase.</li>
          <li><span className={strong}>Workspace content:</span> user-composed note markdown and directory folders.</li>
          <li><span className={strong}>Local settings:</span> layout, theme choices, and active selection states.</li>
        </ul>
      </>
    ),
  },
  {
    id: "security",
    title: "2. Data protection and security",
    body: (
      <p>
        Your content is stored in secure database instances. Access to your notes is isolated strictly to your
        authenticated email session. Offline drafts are cached securely inside your browser's private storage, isolated
        from external client scripts.
      </p>
    ),
  },
  {
    id: "sync",
    title: "3. Synchronization and offline redundancy",
    body: (
      <p>
        To provide seamless performance in planes or offline subways, Aura persists any document changes locally. When
        connection resumes, the app securely reconciles data with our backend using isolated WebSocket/HTTPS streams.
      </p>
    ),
  },
  {
    id: "ai",
    title: "4. AI processing policy (Gemini API)",
    body: (
      <p>
        Our built-in Gemini Assistant processes your context-aware prompts statelessly. We route your queries through
        secure proxy parameters. Your API keys are never exposed directly to external client scripts, and your note
        content is never utilized to train foundation AI models.
      </p>
    ),
  },
  {
    id: "contact",
    title: "5. Contact us",
    body: (
      <p>
        For security reports or data disclosure requests, contact our systems administration team at{" "}
        <a href="mailto:security@aura.io" className="text-accent hover:underline">security@aura.io</a>.
      </p>
    ),
  },
];

export default function PrivacyPage(_props: PrivacyPageProps) {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="July 6, 2026"
      intro={
        <p>
          At Aura Next, we value your privacy above all. Aura is built with a{" "}
          <span className={strong}>zero-compromise encryption architecture</span>, meaning your files, schemas, and
          workspace structures remain securely under your control.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
