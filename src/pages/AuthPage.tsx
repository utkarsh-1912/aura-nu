import React from "react";
import AuthFlow from "../components/AuthFlow";

interface AuthPageProps {
  theme: "light" | "dark";
  onAuthSuccess: (email: string, isNewUser: boolean) => void;
  onBackToLanding: () => void;
  initialFlow?: "login" | "register";
}

export default function AuthPage({
  theme,
  onAuthSuccess,
  onBackToLanding,
  initialFlow,
}: AuthPageProps) {
  return (
    <AuthFlow
      theme={theme}
      initialFlow={initialFlow}
      onBackToLanding={onBackToLanding}
      onAuthSuccess={onAuthSuccess}
    />
  );
}
