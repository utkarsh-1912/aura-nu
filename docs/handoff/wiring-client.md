# Wiring report: client app

Code lives in `src/features/**`; edits to shared files are small hooks into it. Tests: `npx vitest run tests/client` (19 tests, pure logic only).
NOTHING below was exercised in a real browser or in Tauri by the author: UI behaviour is type-checked and unit-tested at the logic level only.

## What is wired
| Area | Where | Notes |
|---|---|---|
| New editor flag | `features/flags.ts`, `features/editor/*`, `EditorArea.tsx`, Settings > Editor | localStorage `aura-flag-tiptap-editor`, default OFF. AuraEditor is lazy-loaded. `onChange` calls EditorArea's own `handleContentChange` (same autosave, versionHistory, updatedAt; wordCount via the existing effect). Locked/trashed notes are `readOnly`. Legacy toolbar is hidden only while the flag is on. Pending edits flush on note switch. |
| Wikilinks | `NoteBodyEditor.tsx`, `wikiSuggest.ts` | `[[` popup (keyboard + click); clicking a link opens the note via `LinkIndex.resolve`, or creates it (create-on-click). |
| Indexes | `features/indexes/*`, `WorkspacePage.tsx` | `NoteIndexer` owns LinkIndex + SearchIndex; diffs notes, drains in 8 ms idle slices (no Worker: the indexes are mutable objects). Active workspace only. Encrypted notes: title only. |
| Backlinks / mentions | `features/panels/BacklinksPanel.tsx` | Collapsible panel above the editor status bar. |
| Link rename | `useTitleRename.ts` | When the title settles (1.2 s, or on note switch) `LinkIndex.rename()` output is applied through `handleUpdateNotesAndSync`. |
| Search | `NotesList.tsx`, `CommandPalette.tsx` | SearchIndex with ranked results, `#tag` filter, highlighted snippets. Falls back to substring while the index is building (hint shown) and for "all workspaces" scope in the palette. |
| Smart folders | `features/smartFolders/*`, Sidebar | Stored in `aura-smart-folders-<email>`; active folder id `smart:<id>`; builder dialog + JSON tab. |
| Import | `features/import/*`, Settings > Import | Inline panel (not a nested Dialog): files / folder / drop, preview (counts, folder mapping), warnings, errors, then one batch create. Parsing is on the main thread. Apple Notes copy states only exported HTML/MD/TXT work. |
| Encrypt note | `features/encryption/*`, EditorArea menu | Opt-in, separate from the legacy Lock flag (which stays a plain read-only flag; wiring crypto into it would change its meaning for existing notes). Envelope JSON is the content; `isLocked` also set; version history wiped. Unlock = read-only in-memory view, "Remove encryption", "Change password". **No password recovery.** Excluded from search/link indexes; AI only ever sees ciphertext. |
| PWA | `main.tsx`, `features/pwa/*`, `App.tsx` | SW registered in PROD only (`swBoot.ts`); update toast; install banner (7-day dismiss); `clearUserCaches()` on sign-out and account switch; `?share=1`, `/share-target`, `?action=new-note|quick-note` captured at load into sessionStorage and run after hydration. |
| Desktop | `features/desktop/*`, Settings > Sync & storage, `main.tsx` | No-ops in the browser. Vault picker, `?window=quicknote` box, `quickNote.onSaved` -> note, debounced `reconcile()` with folder id <-> directory path mapping. |
| Phones | `EditorArea.tsx`, `NotesList.tsx` | Back button (handler from WorkspacePage), `/` focuses notes search, >=40px targets in the more-menu, its items and the image dialog at phone width. |

## Not done / limits
- Share: always creates a new note (`applyShare` supports append via `targetId`, no UI picks it). Only text and images under 1 MB (embedded as data URLs) are stored; other files are reported and dropped.
- Share target needs the host to let POST `/share-target` reach the service worker (see capture.md).
- Encrypted note editing: remove encryption, edit, re-encrypt. Metadata and length are not hidden.
- Search index covers the active workspace; it is not persisted (rebuilt per load, ~12 s of CPU for 5k notes, sliced).
- Legacy-editor features (slash menu, find bar) are not ported to the TipTap path.
- Desktop vault reconcile, quick-note window and vault picker: UNVERIFIED (no Tauri here).
- Service worker, install banner, share target, touch-target sizes: UNVERIFIED in a browser.
- Scoped tsc: new/edited files clean except pre-existing errors in files owned by others (`components/flow`, `features/flows`).
