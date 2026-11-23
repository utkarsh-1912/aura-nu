import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { UserTier, OrgRole, Organization, TierPermissions } from "../types";
import { getTierPermissions } from "../lib/tierPermissions";

interface UserProfile {
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

interface AppContextType {
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  userTier: UserTier;
  setUserTier: (tier: UserTier) => void;
  orgRole: OrgRole;
  setOrgRole: (role: OrgRole) => void;
  currentOrg: Organization | null;
  setCurrentOrg: (org: Organization | null) => void;
  permissions: TierPermissions;
  theme: "light" | "dark" | "system";
  activeTheme: "light" | "dark";
  setTheme: (theme: "light" | "dark" | "system") => void;
  isOnline: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("aura-user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return { email: "sandbox@aura.io", displayName: "Sandbox User" };
  });

  const [userTier, setUserTier] = useState<UserTier>("enterprise");
  const [orgRole, setOrgRole] = useState<OrgRole>("OrgOwner");
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [theme, setThemeState] = useState<"light" | "dark" | "system">(() => {
    const saved = localStorage.getItem("theme");
    return (saved as any) || "system";
  });
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  const activeTheme = useMemo<"light" | "dark">(() => {
    if (theme === "system") {
      if (typeof window !== "undefined" && window.matchMedia) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return "light";
    }
    return theme;
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const setTheme = (newTheme: "light" | "dark" | "system") => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  const permissions = useMemo(() => getTierPermissions(userTier), [userTier]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      userTier,
      setUserTier,
      orgRole,
      setOrgRole,
      currentOrg,
      setCurrentOrg,
      permissions,
      theme,
      activeTheme,
      setTheme,
      isOnline,
    }),
    [user, userTier, orgRole, currentOrg, permissions, theme, activeTheme, isOnline]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
