import React from "react";
import OnboardingFlow from "../components/OnboardingFlow";

interface OnboardingPageProps {
  theme: "light" | "dark";
  onSetTheme: (theme: "light" | "dark") => void;
  onOnboardingComplete: (data: {
    workspaceName: string;
    theme: "light" | "dark";
    invitedEmails: string[];
    importedNotesCount: number;
  }) => void;
}

export default function OnboardingPage({
  theme,
  onSetTheme,
  onOnboardingComplete,
}: OnboardingPageProps) {
  return (
    <OnboardingFlow
      theme={theme}
      onSetTheme={onSetTheme}
      onOnboardingComplete={onOnboardingComplete}
    />
  );
}
