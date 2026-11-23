import React from "react";
import LegalLayout from "./LegalLayout";

interface TermsPageProps {
  theme: "light" | "dark";
}

const SECTIONS = [
  {
    id: "usage",
    title: "1. Usage rights and workspace boundaries",
    body: (
      <p>
        We grant you a personal, non-exclusive, non-transferable license to access Aura Next. Each tenant is allocated
        private storage limits (e.g. 5MB quota) to index metadata and files. Attempting to bypass storage quotas or
        interfere with other tenant isolation nodes is strictly prohibited.
      </p>
    ),
  },
  {
    id: "obligations",
    title: "2. User obligations and security",
    body: (
      <p>
        You are solely responsible for maintaining the confidentiality of your credentials (either Firebase password
        logs or passkey hashes). Any activities originating from your authenticated profile will be deemed your legal
        responsibility.
      </p>
    ),
  },
  {
    id: "warranty",
    title: "3. Disclaimer of warranties",
    body: (
      <p>
        Aura Next is provided "as is" and "as available". We do not guarantee uninterrupted, secure, or bug-free
        operations. In no event shall Aura Inc. be liable for any data loss, server downtime, or loss of proprietary
        metadata.
      </p>
    ),
  },
  {
    id: "changes",
    title: "4. Service adjustments",
    body: (
      <p>
        We reserve the right to refine workspace parameters, modify pricing models, or deprecate free features at our
        sole discretion. Continued usage following update announcements confirms your acceptance of new changes.
      </p>
    ),
  },
];

export default function TermsPage(_props: TermsPageProps) {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="July 6, 2026"
      intro={
        <p>
          Welcome to Aura Next. By accessing our services, creating workspaces, or utilizing our Generative Assistant
          nodes, you agree to comply with the terms detailed herein.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
