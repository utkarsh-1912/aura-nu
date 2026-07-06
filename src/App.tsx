import React, { useState, useEffect, useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import WorkspacePage from "./pages/WorkspacePage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import { Note } from "./types";

function AppContent() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email: string; displayName?: string } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [loading, setLoading] = useState(true);

  const activeTheme = useMemo<"light" | "dark">(() => {
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    }
    return theme;
  }, [theme]);

  // Sync theme setting with localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
      setTheme(savedTheme);
    }
  }, []);

  // Update theme setting state and persist to localStorage
  const handleSetTheme = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  useEffect(() => {
    const root = window.document.documentElement;
    if (activeTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [activeTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const root = window.document.documentElement;
      if (mediaQuery.matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  // Firebase Auth State Observer & Persistent Mock Auth Initialization
  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser && firebaseUser.email) {
          setUser({
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || undefined,
          });
          const path = window.location.pathname;
          if (path === "/" || path === "/login" || path === "/register") {
            navigate("/w/ws-aura-core/dashboard");
          }
        } else {
          setUser(null);
          const path = window.location.pathname;
          if (path.startsWith("/w/") || path === "/onboarding") {
            navigate("/");
          }
        }
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      // In simulated auth mode, read from localStorage to support persist-on-refresh
      const savedUser = localStorage.getItem("aura-user");
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {
          console.error("Failed to parse saved user", e);
        }
      }
      setLoading(false);
    }
  }, [navigate]);

  const handleAuthSuccess = (email: string, isNewUser: boolean) => {
    const newUser = { email };
    setUser(newUser);
    if (!isFirebaseConfigured || !auth) {
      localStorage.setItem("aura-user", JSON.stringify(newUser));
    }
    if (isNewUser) {
      navigate("/onboarding");
    } else {
      navigate("/w/ws-aura-core/dashboard");
    }
  };

  const handleSignOut = async () => {
    if (isFirebaseConfigured && auth) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error("Firebase SignOut error:", err);
      }
    }
    setUser(null);
    localStorage.removeItem("aura-user");
    navigate("/");
  };

  const handleOnboardingComplete = (data: {
    workspaceName: string;
    theme: "light" | "dark";
    invitedEmails: string[];
    importedNotesCount: number;
  }) => {
    const userEmail = user?.email || "mockuser@aura.io";
    const seededNotes: Note[] = [
      {
        id: "note-seeded-1",
        workspaceId: "ws-aura-core",
        title: "📖 Aura Markdown Quick Guide",
        content: `# Aura Markdown Quick Guide\n\nWelcome to your brand new private space: **${data.workspaceName}**!\n\nHere is how to structure strategy specs:\n\n- Bullet items\n- [ ] Interactive task checklists\n\nTry highlighting this text to improve style or execute executive summaries using our smart Gemini shortcuts.`,
        tags: ["Guides"],
        isPinned: true,
        isShared: false,
        isFavorite: false,
        folder: "f-general",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wordCount: 54,
        readingTime: 1,
      }
    ];

    localStorage.setItem(`aura-notes-backup-${userEmail}`, JSON.stringify(seededNotes));
    navigate("/w/ws-aura-core/dashboard");
  };

  if (loading) {
    const isDark = activeTheme === "dark";
    return (
      <div className={`w-screen h-screen flex flex-col items-center justify-center font-sans ${
        isDark ? "bg-[#09090b] text-zinc-100" : "bg-[#FAFAFC] text-slate-900"
      }`}>
        <div className={`w-10 h-10 rounded-full border-2 border-t-blue-500 animate-spin mb-4 ${
          isDark ? "border-zinc-800" : "border-slate-200"
        }`}></div>
        <span className={`text-[10px] font-mono tracking-widest uppercase animate-pulse ${
          isDark ? "text-zinc-500" : "text-slate-400"
        }`}>
          Aura Initializing...
        </span>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LandingPage
            theme={activeTheme}
            onSetTheme={handleSetTheme}
            onNavigateToAuth={(flow) => navigate(`/${flow}`)}
            onEnterDemo={() => {
              const demoUser = { email: "sandbox@aura.io", displayName: "Sandbox User" };
              setUser(demoUser);
              localStorage.setItem("aura-user", JSON.stringify(demoUser));
              navigate("/w/ws-aura-core/dashboard");
            }}
          />
        }
      />
      <Route
        path="/login"
        element={
          <AuthPage
            theme={activeTheme}
            initialFlow="login"
            onBackToLanding={() => navigate("/")}
            onAuthSuccess={handleAuthSuccess}
          />
        }
      />
      <Route
        path="/register"
        element={
          <AuthPage
            theme={activeTheme}
            initialFlow="register"
            onBackToLanding={() => navigate("/")}
            onAuthSuccess={handleAuthSuccess}
          />
        }
      />
      <Route
        path="/onboarding"
        element={
          <OnboardingPage
            theme={activeTheme}
            onSetTheme={handleSetTheme}
            onOnboardingComplete={handleOnboardingComplete}
          />
        }
      />
      <Route
        path="/w/:wsId/*"
        element={
          <WorkspacePage
            userEmail={user?.email || "sandbox@aura.io"}
            theme={theme}
            setTheme={handleSetTheme}
            activeTheme={activeTheme}
            onSignOut={handleSignOut}
          />
        }
      />
      <Route
        path="/privacy"
        element={<PrivacyPage theme={activeTheme} />}
      />
      <Route
        path="/terms"
        element={<TermsPage theme={activeTheme} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
