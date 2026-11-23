import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Server-side identity.
 *
 * Production: identity comes ONLY from a verified Firebase ID token.
 * Development (no FIREBASE_PROJECT_ID, NODE_ENV !== production): the legacy
 * `x-user-email` header is accepted so simulated/guest auth keeps working locally.
 * The header is never trusted when a Firebase project is configured or in production.
 */

const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let defaultJwks: JWTVerifyGetKey | null = null;
function getDefaultJwks(): JWTVerifyGetKey {
  if (!defaultJwks) defaultJwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  return defaultJwks;
}

export interface AuthConfig {
  projectId?: string;
  production: boolean;
  /** Injectable for tests. */
  jwks?: JWTVerifyGetKey;
}

export function readAuthConfig(): AuthConfig {
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || undefined,
    production: process.env.NODE_ENV === "production",
  };
}

export type AuthResult =
  | { ok: true; email: string; mode: "firebase" | "dev-header" }
  | { ok: false; status: number; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function resolveIdentity(req: Request, cfg: AuthConfig): Promise<AuthResult> {
  const authz = req.headers.authorization;
  if (authz && /^Bearer\s+/i.test(authz)) {
    if (!cfg.projectId) {
      return { ok: false, status: 401, error: "Token auth is not configured on this server" };
    }
    try {
      const token = authz.replace(/^Bearer\s+/i, "").trim();
      const { payload } = await jwtVerify(token, cfg.jwks ?? getDefaultJwks(), {
        issuer: `https://securetoken.google.com/${cfg.projectId}`,
        audience: cfg.projectId,
        algorithms: ["RS256"],
      });
      const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
      if (!payload.sub || !EMAIL_RE.test(email)) {
        return { ok: false, status: 401, error: "Token has no usable identity" };
      }
      return { ok: true, email, mode: "firebase" };
    } catch {
      return { ok: false, status: 401, error: "Invalid or expired token" };
    }
  }

  // Dev-only fallback for simulated auth. Disabled in production or when Firebase is configured.
  if (!cfg.production && !cfg.projectId) {
    const raw = (req.headers["x-user-email"] as string | undefined)?.trim().toLowerCase();
    const email = raw && EMAIL_RE.test(raw) ? raw : "sandbox@aura.io";
    return { ok: true, email, mode: "dev-header" };
  }

  return { ok: false, status: 401, error: "Authentication required" };
}

export function requireAuth(cfgProvider: () => AuthConfig = readAuthConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await resolveIdentity(req, cfgProvider());
    if ("status" in result) {
      return res.status(result.status).json({ error: result.error });
    }
    (req as any).userEmail = result.email;
    next();
  };
}

export function getUserEmail(req: Request): string {
  return (req as any).userEmail as string;
}
