import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from "@sentry/react";
import App from './App.tsx';
import './index.css';
import { initSentry } from './sentry';

// Initialize Sentry before rendering the app
initSentry();

const container = document.getElementById('root')!;

// Wrap the root with Sentry's error boundary so crashes are captured automatically
const SentryApp = Sentry.withErrorBoundary(App, {
  fallback: ({ error }) => (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      background: '#09090b',
      color: '#f4f4f5',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: '#a1a1aa', fontSize: 14, maxWidth: 400, marginBottom: 24 }}>
        An unexpected error occurred. Our team has been notified automatically.
        Please refresh the page to continue.
      </p>
      <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#71717a', marginBottom: 24 }}>
        {String(error)}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#3b82f6', color: '#fff', border: 'none',
          padding: '10px 24px', borderRadius: 8, cursor: 'pointer',
          fontWeight: 600, fontSize: 14,
        }}>
        Reload Application
      </button>
    </div>
  ),
});

createRoot(container).render(
  <StrictMode>
    <SentryApp />
  </StrictMode>,
);
