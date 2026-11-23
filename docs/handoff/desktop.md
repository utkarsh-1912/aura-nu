# Handoff: desktop (Phase 4)

Owned/created: `src/desktop/{bridge.ts,modelCatalog.ts,vault/*}`, `tests/desktop/*`, `apps/desktop/**`, `docs/desktop.md`.
Tested: `npx vitest run tests/desktop` (26 tests). Rust under `apps/desktop/src-tauri` is UNBUILT/UNTESTED.

## Wiring needed from the lead (shared files I did not touch)
1. **No new npm deps are required** for the bridge (uses `window.__TAURI__`). Optional: `@tauri-apps/cli@2` (devDependency) for `npm run tauri`, and `@tauri-apps/api@2` only if you prefer `setTauriRuntime({invoke, listen})`.
2. **package.json scripts** (optional): `"desktop:dev": "cd apps/desktop/src-tauri && cargo tauri dev"`, `"desktop:build": "npm run build && cd apps/desktop/src-tauri && cargo tauri build"`.
3. **Sync integration** (App/WorkspacePage): on desktop, `const fs = createTauriVaultFs()`, load index (`loadIndex`, else `rebuildIndex`), call `reconcile({fs, hasher: sha256Hasher, notes, index, workspaceId, newId, now})` after (debounced) `vault.onEvent` / app edits, apply `applyReconcile(notes, result)` and `saveIndex(fs, result.index)`. Feed resulting upserts/removals into the sync engine like any local edit.
4. **Quick-note window**: `index.html?window=quicknote` must render a minimal capture box that calls `invoke("quicknote_save", {text})` (via a `quickNote` helper if you want it added to the bridge). Main window should subscribe with `quickNote.onSaved` and create a note (`createdAt` arrives as epoch-millis string).
5. **Vite/server**: `devUrl` assumes http://localhost:3000 (`npm run dev` express+vite); `frontendDist` = `../../../dist`. Server `/api` calls from the desktop webview need an absolute base URL and CORS/CSP `connect-src` update in `tauri.conf.json`.
6. **Model catalog**: fill `apps/desktop/src-tauri/resources/model-catalog.json` with real entries (SHA-256 required); coordinate with the AI/model-catalog owner.
7. Run the checklist in `docs/desktop.md` on a machine with Rust; icons, updater key/endpoints and code-signing are placeholders.

## Not done / unverified
- All Rust compiles are unverified; Tauri v2 permission ids for app commands (`allow-<cmd>`) and `llama-server` flags/`LLAMA_API_KEY` env are assumptions to confirm.
- No OCR/dictation/deep links/system search indexing/multi-window beyond quick note.
- Bridge `quickNote.save` for the capture window is not exposed in TS (call `invoke` directly).
