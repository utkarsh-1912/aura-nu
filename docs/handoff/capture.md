# Handoff: capture / mobile / PWA (Phase 7)

## Wiring needed from the lead (shared files I did not touch)
1. `index.html` head:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
   <link rel="manifest" href="/manifest.webmanifest" />
   <meta name="theme-color" content="#4f46e5" />
   <link rel="apple-touch-icon" href="/logo.png" />
   ```
2. `src/main.tsx` (production only):
   ```ts
   import { registerServiceWorker } from './mobile';
   if (import.meta.env.PROD) registerServiceWorker({ onUpdateReady: (h) => /* show toast */ h.applyUpdate() });
   ```
   Show an "Update available" toast and call `h.applyUpdate()` on click rather than immediately.
3. On logout / account switch call `clearUserCaches()` from `src/mobile`.
4. Route `/share-target`: the SW stores the payload in cache `aura-share` (`/__share/meta`, `/__share/file/<n>`) and redirects to `/?share=1`; the app must read and then delete it. Also handle `?action=new-note` and `?action=quick-note` (manifest shortcuts).
5. Vite dev server: `public/sw.js` is served as-is; no config change needed. Hosting must serve `/sw.js` with `Cache-Control: no-cache` and `/manifest.webmanifest` as `application/manifest+json`, and rewrite unknown paths to `index.html` (incl. `/share-target` POST must reach the static origin or be routed to the SW; a server that 404/405s a POST bypasses the SW only if the SW is not yet installed).
6. UI to use: `InkCanvas` (src/capture/ink), scan pipeline `runScan` (needs a camera/file capture UI that produces `ImageData`), `AudioRecorder` + `buildTranscriptNote`.
7. Optional deps (not installed, not added): `tesseract.js` or transformers.js (web OCR adapter), a whisper.cpp sidecar/server for transcription. Implement `OcrAdapter` / `TranscriptionAdapter`; defaults report "unavailable".
8. Maskable icons: `/logo.png` is reused for `any` and `maskable`; supply a padded 512px icon for proper maskable rendering.

## Verification state
- Tested (vitest, tests/capture): ink model/eraser/history/serialisation/SVG/palm logic, scan pipeline on synthetic images, recorder state machine with fakes, transcript formatting, SW decision logic (both swLogic.ts and the real sw.js), swipe, keyboard inset, install-prompt reducer.
- UNTESTED-IN-BROWSER: InkCanvas rendering and pointer events, getUserMedia/MediaRecorder, SW install/fetch/sync/share handlers, `visualViewport` hooks, safe-area probe, beforeinstallprompt.
- Not done: real OCR and transcription engines, scan camera UI, background-sync outbox, native wrappers/widgets (planned in docs/mobile.md), a rendered 375px audit (audit is static grep).
