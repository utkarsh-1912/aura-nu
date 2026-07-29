import * as Sentry from "@sentry/react";

const SENTRY_DSN = (import.meta as any).env.VITE_SENTRY_DSN || "";

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn("[Sentry] DSN not configured (VITE_SENTRY_DSN). Error reporting is disabled.");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: (import.meta as any).env.MODE || "development",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Capture 100% of transactions in dev, 10% in production
    tracesSampleRate: (import.meta as any).env.MODE === "production" ? 0.1 : 1.0,
    // Session Replay: 10% of all sessions, 100% of errored sessions
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export { Sentry };

/**
 * Capture an error to Sentry with extra context.
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(error);
  });
}

/**
 * Set the Sentry user identity (call after login).
 */
export function setSentryUser(email: string, tier?: string) {
  if (!SENTRY_DSN) return;
  Sentry.setUser({ email, tier } as any);
}

/**
 * Clear the Sentry user identity (call after logout).
 */
export function clearSentryUser() {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}
