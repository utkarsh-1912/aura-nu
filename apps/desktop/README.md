# Aura Next Desktop (Tauri v2)

> STATUS: **UNBUILT / UNTESTED.** Everything under `src-tauri/` was written on a machine without Rust. The
> verified part is the pure-TS vault in `src/desktop/` (tests in `tests/desktop/`). See `docs/desktop.md`
> for the checklist to run on a machine with Rust.

## Prerequisites

| Platform | Needs |
|---|---|
| All | Rust >= 1.90 (`rustup`), Node 20+, repo deps installed (`npm ci`), Tauri CLI (`cargo install tauri-cli --version "^2"` or `npm i -D @tauri-apps/cli@2`) |
| Windows | MSVC Build Tools ("Desktop development with C++" workload), WebView2 runtime (preinstalled on Win 11; the installer bootstraps it otherwise) |
| macOS | Xcode Command Line Tools; notarization needs an Apple Developer ID |
| Linux | `webkit2gtk-4.1`, `libayatana-appindicator3` (tray), `librsvg2`, `libssl`, `libsecret-1` (keyring), build-essential. Global shortcuts are unreliable under Wayland |

Reference: https://v2.tauri.app/start/prerequisites/

## Commands (run from repo root unless noted)

```bash
npm run dev                      # terminal 1: web/API dev server on :3000 (devUrl in tauri.conf.json)
cd apps/desktop/src-tauri
cargo check                      # first: fix any compile drift
cargo tauri dev                  # terminal 2: desktop shell against the dev server
# release
npm run build                    # builds ../dist (frontendDist)
cargo tauri icon path/to/1024.png   # generates icons/ (not committed yet)
cargo tauri signer generate -w ~/.tauri/aura.key   # updater key; put PUBLIC key in tauri.conf.json
TAURI_SIGNING_PRIVATE_KEY_PATH=~/.tauri/aura.key cargo tauri build
```

## Caveats
- **Icons are missing**: `bundle.icon` points at files that do not exist until you run `cargo tauri icon`.
- **Updater**: `pubkey` and `endpoints` are placeholders; builds with `createUpdaterArtifacts` need the signing key.
- **llama-server** is not bundled: place it at `<app local data>/runtime/llama-server[.exe]`. Models come only from `resources/model-catalog.json` (currently empty: add entries with real SHA-256 values).
- **Windows**: code-sign (EV/OV cert) to avoid SmartScreen; installer is NSIS/MSI. File names ending in dot/space and reserved names (CON, NUL...) are rejected by the vault.
- **macOS**: case-insensitive FS by default; global shortcut may need Accessibility permission; sign + notarize.
- **Linux**: AppImage/deb; tray requires an appindicator-capable desktop; keyring needs a running Secret Service.
- The web UI must render a capture box when loaded with `?window=quicknote` (see `docs/handoff/desktop.md`).
