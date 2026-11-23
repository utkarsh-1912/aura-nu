# Desktop app (Phase 4)

Status: TS vault core + bridge + model-catalog logic are **tested** (`npx vitest run tests/desktop`).
The Tauri/Rust shell in `apps/desktop/src-tauri` is **UNBUILT / UNTESTED** (no Rust toolchain was available).

## Architecture

```
React UI (same bundle as web)
   |  src/desktop/bridge.ts  (feature-detected; returns {ok:false, reason:"unavailable"} in a browser)
   |  window.__TAURI__.core.invoke  (app.withGlobalTauri=true; no npm package required)
Tauri v2 shell (Rust)  -- commands: vault_*, quicknote_*, sidecar_*, models_*, keychain_*, update_*
   |- vault.rs     scoped fs, notify watcher -> "vault://event"
   |- quicknote.rs global shortcut + tray + frameless always-on-top window
   |- sidecar.rs   llama-server on 127.0.0.1:<random>, bearer token
   |- models.rs    catalog-driven downloads, SHA-256, quota
   |- keychain.rs  keyring crate;  updater.rs  tauri-plugin-updater
```

### Vault (src/desktop/vault, pure TS)
- One note = one `.md` file; folder = directory. YAML-subset frontmatter (`id,title,tags,pinned,favorite,shared,archived,trashed,locked,status,workspace,department,project,folder,created,updated`); unknown keys are preserved verbatim.
- Filenames: derived from title, sanitized (illegal chars, trailing dot/space, reserved Windows names, hidden-dot, 100-char cap, NFC), collisions resolved case-insensitively with ` (2)` suffixes; existing names stay stable.
- `.aura/index.json` stores, per note id, last agreed path + SHA-256 of file text = the **three-way merge base**. `rebuildIndex` recreates it from disk.
- `reconcile()` (app list vs files vs index): app edit -> write; external edit -> import; both -> **conflict file** `name (conflict YYYY-MM-DD).md` as a new note, file version keeps the id; edit beats delete; deletes of files go to `.aura/trash/`; id-less or duplicated files get fresh ids written back; external renames/moves are followed by id (moving between dirs changes `folder`). Idempotent (randomized tests, 15 seeds x 12 rounds).
- Limits: `versionHistory`, `wordCount` are not file-backed (recomputed/app-only); a note absent from the supplied list counts as deleted, so never reconcile with a partially loaded list; imports normalize file formatting (CRLF, key order) once; no sub-second mtime precision assumptions beyond ISO strings; encrypted/locked note content is written as-is (do not enable vault sync for E2E notes).

## Security model
- **CSP** (tauri.conf.json): self-only scripts, `object-src 'none'`, connect-src limited to ipc, loopback sidecar and Google/Firebase auth hosts (adjust to real deployment). Review once the web build is final.
- **IPC allowlist**: `build.rs` `AppManifest::commands` + per-window capabilities. Main window has no fs/shell/http plugin permissions at all; vault IO exists only as Rust commands that re-validate every path (no `..`, absolute, drive, reserved names, symlink escape; symlinks never followed when listing). Quick-note window may only call `quicknote_save`/`quicknote_hide`. Permission ids (`allow-<command>`) are assumed; confirm in `gen/schemas` after first build.
- **Vault root** only via native folder dialog; `vault_open` accepts only previously dialog-chosen roots.
- **Sidecar isolation**: loopback only, random port, random per-start token passed through env, never persisted, killed on exit, no console window. Verify unauthenticated requests get 401.
- **Updates**: minisign-signed artifacts verified by the plugin against the embedded public key; TLS endpoints only; private key stays in CI secrets.
- **Secrets**: API keys in the OS keychain, never in localStorage/files. `withGlobalTauri` exposes `window.__TAURI__` to all page scripts, hence the strict CSP and no remote content in the main window.

## Model manager design
- Catalog (`resources/model-catalog.json`, bundled, validated in Rust and by `validateCatalog`): id, quant, https url on an allowed host, **mandatory lowercase SHA-256**, size, min memory, safe `.gguf` file name, license. Currently **empty** (no fabricated hashes).
- Webview sends only an id. Rust: quota check (`used+size <= quota`, default 20 GiB), 1 GiB free-disk headroom, stream to `*.part`, abort if larger than catalog size, hash while streaming, rename only on match, delete on mismatch/cancel. Redirects only to allowlisted https hosts (HF CDN hosts may need adding: verify).
- `models_verify` re-hashes on demand; `modelsThatFit`/`planDownload` (TS) drive the UI (quant picker by memory).

## Verification checklist (machine with Rust)
1. `cd apps/desktop/src-tauri && cargo check` then `cargo clippy`; fix API drift (expected: `State::clone`, `tauri_plugin_global_shortcut` register signature, tray builder, `ModifyKind::Name` path ordering).
2. `cargo tauri icon`, `cargo tauri dev`: window opens, `window.__TAURI__` present, `capabilities()` resolves in the devtools console.
3. Permissions: every bridge call works; a call to an unlisted command and any `fs:*` call fail. Check generated `allow-*` ids match `capabilities/*.json`.
4. Vault: pick folder; create/edit/rename notes in app and in an external editor; confirm watcher events, reconcile outcome, conflict file on simultaneous edit, `.aura/trash` on delete. Try `../x`, `C:\x`, `CON`, a symlink pointing outside the vault: all rejected.
5. Quick note: shortcut opens window from another app; save appears in main window; tray menu works; shortcut collision returns an error and keeps the old one.
6. Sidecar: with a real GGUF + llama-server, `sidecar_start` -> ready; curl without token = 401; with token works; port not reachable from another machine; process dies on app quit (also on crash).
7. Models: add a real catalog entry; download, tamper (flip a byte) -> `verify` false; wrong hash -> file deleted; quota/cancel behave.
8. Keychain: set/get/delete round-trip; value visible in OS credential UI.
9. Updater: sign a build, host a manifest, confirm update installs; confirm a wrongly-signed artifact is refused.
10. Packaging: NSIS/MSI, dmg, AppImage/deb; cold-start time (target < 1 s), idle RAM.
