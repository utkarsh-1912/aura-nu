# Mobile, PWA and capture (Phase 7)

Status: pure logic is unit-tested (`npx vitest run tests/capture`). Anything touching camera, MediaRecorder, pointer pressure, service worker lifecycle or `visualViewport` is **UNTESTED-IN-BROWSER**.

## Code map
- `src/capture/ink/` handwriting model, smoothing (One-Euro + Catmull-Rom), eraser, history, SVG export, compact JSON, palm rejection; `InkCanvas.tsx` (UNTESTED-IN-BROWSER).
- `src/capture/scan/` grayscale, Otsu/adaptive threshold, page quad detection, homography warp, deskew, `OcrAdapter` + `NoopOcr`, `runScan` pipeline.
- `src/capture/audio/` `AudioRecorder` (injected env, tested with fakes), `TranscriptionAdapter` + `NoopTranscription`, transcript-to-Markdown.
- `src/mobile/` `swLogic.ts` (mirrored in `public/sw.js`, drift is caught by `tests/capture/swLogic.test.ts`), safe-area, keyboard inset, swipe, install-prompt reducer, `swRegister.ts`, hooks.
- `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`.

## Service worker policy
- Shell precache (`/`, `/offline.html`, manifest, logo), versioned by `CACHE_VERSION` (bump per release). Hashed `/assets/*` are cached at runtime (stale-while-revalidate), so no build manifest is needed.
- Navigations: network-first, fall back to cached `/`, then `/offline.html`.
- `/server/auth*`: never cached. API writes: never cached (`queueOnFailure` flag for the future outbox).
- `/api/*` GET: network-first. Cached ONLY when an `Authorization` header is present, under a key scoped by a hash of that header, and never when the response is `no-store`/`private`/sets cookies or is not 200. Send `CLEAR_USER_DATA` on logout (`clearUserCaches()`).
- Caveat: header-scoped keys isolate users but cached data still sits on disk in the browser profile until logout/clear. Treat "Private" E2E vault payloads as non-cacheable at the API layer (`Cache-Control: private`).
- Updates: no automatic `skipWaiting`; page shows a prompt, then `applyUpdate()`.
- Background sync: stub only; the `sync` event pings clients with `SYNC_REQUESTED`. The real outbox belongs to the sync engine.
- Keeping `sw.js` in sync: edit the `<swlogic>` block and `src/mobile/swLogic.ts` together; the test loads the real `sw.js` and runs identical cases against both.

## 375px audit (static grep; not rendered)
Note: `WorkspacePage.tsx` already has a mobile layout (`#mobile-viewport` at :1641, drawer `w-72 max-w-[85%]` at :1692, bottom tab bar `pb-16`), so the main shell is the best-prepared screen.

| Sev | File:line | Problem at 375px |
|---|---|---|
| High | `src/components/NotesList.tsx:498` | `w-[360px]` default when no `width` prop: ~96% of viewport, leaves no room for the editor; must be `w-full` on mobile. |
| High | `src/pages/WorkspacePage.tsx:241,318,2023` | `notesListWidth` 360 and sidebar 64/256 assumptions in the drag-resize math; ensure the resizer is disabled and width ignored below `md`. |
| High | `src/components/EditorArea.tsx:2662` | Side panel `absolute ... w-80` (320px) covers 85% of the screen, no `max-w-full`/bottom-sheet variant. |
| Med | `src/components/Sidebar.tsx:825,1142` | Popovers `w-60` positioned `left-full` / `left-14`; will overflow the right edge when the sidebar is a drawer. |
| Med | `src/components/AuthFlow.tsx:206,209,262` | `w-screen`/`h-screen`: `100vh` includes the mobile URL bar (content cut off) and `w-screen` adds horizontal scroll with a scrollbar; use `min-h-dvh`/`w-full`. |
| Med | `src/pages/WorkspacePage.tsx:1616` | Same `w-screen h-screen` root; use `h-dvh w-full`. |
| Med | `src/components/EditorArea.tsx:1821` | Title input `min-w-[85px]` inside a crowded toolbar; toolbar likely wraps/overflows (verify). |
| Med | `src/components/AiPanel.tsx:899` | OK (`w-full md:w-[380px]`) but needs safe-area bottom padding for the composer and keyboard avoidance. |
| Low | `src/pages/OrgHubPage.tsx:208` | `min-w-[260px]` horizontal snap carousel: intended, check peek affordance. |
| Low | `src/components/Dashboard.tsx:811,814` | `grid-cols-7` calendar at 375px gives ~48px cells with `text-[11px]`; tap targets below 44px. |
| Low | `src/components/AuthFlow.tsx:610` | `w-[280px]` dialog: fits, but not responsive on 320px devices. |
| Low | `src/components/TableContainer.tsx:183` | `min-w-[100px]` columns: needs a horizontally scrollable wrapper. |
| Low | `src/pages/*` `min-h-screen` (AdminConsole:781, AgentStudio:316, NetworkStatus:179, OrgHub:121, Privacy:15, Terms:15) | `100vh` URL-bar issue; swap to `min-h-dvh`. |
| Info | `index.html` viewport meta | Lacks `viewport-fit=cover`, so `env(safe-area-inset-*)` is 0 on iOS notched devices. |

Responsive grids (`grid-cols-1 md:...`) in Landing, Dashboard, AdminConsole, NetworkStatus and AgentStudio collapse correctly.

## Prioritised fix list
1. Shell (lead-owned files): add `viewport-fit=cover` + manifest link + `theme-color`; replace `h-screen/w-screen` with `h-dvh/w-full`.
2. NotesList full-width on mobile; disable resizer < `md`.
3. EditorArea side panel as bottom sheet (`max-h-[80dvh] w-full`) on mobile.
4. Wire `useVirtualKeyboardInset` into the editor and AI composer; apply `--safe-bottom` to the bottom tab bar.
5. Sidebar popovers: clamp to viewport.
6. 44px minimum tap targets (calendar cells, toolbar icon buttons).
7. Register the service worker (`registerServiceWorker`) and the update toast; `useInstallPrompt` banner.
8. Edge-swipe from the left to open the drawer (`useSwipe` + `isEdgeStart`).

## Native wrappers
- **Tauri mobile (v2)**: recommended first. Reuses the React UI and the Tauri desktop code (vault, OCR/whisper plugins). Rust plugins give camera, share sheet, biometric lock, and system OCR (Vision/ML Kit). Risks: mobile plugin ecosystem is younger; WebView differences (iOS WKWebView has no Background Sync, limited MediaRecorder codecs: use `audio/mp4`).
- **React Native**: better native feel, ink via PencilKit/Skia, but the TipTap editor would need a WebView or a rewrite; only the `@aura/core` logic is shared. Choose only if native editing performance proves unacceptable in WebView.
- Decision gate: build a Tauri-mobile spike (editor + ink + scan) and measure keystroke latency and Pencil input latency on a mid-range Android and an iPhone before committing.

## Home-screen widgets
Widgets cannot run web code. They need native extensions: iOS WidgetKit + App Group shared storage, Android Glance/AppWidget. Plan: the app writes a small JSON snapshot (pinned notes, recent notes, quick-capture deep links `aura://new`, `aura://quick`) into the shared container on every sync; widgets render it and deep-link in. Tauri mobile can host the native extension targets alongside the shell. PWA fallback: manifest `shortcuts` (New note / Quick note) already cover long-press launcher actions. Nothing here is implemented.
