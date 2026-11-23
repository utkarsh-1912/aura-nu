// UNBUILT / UNTESTED: written without a Rust toolchain. Expect small compile fixes on first `cargo check`.
// Command names MUST match src/desktop/bridge.ts and build.rs COMMANDS.
mod keychain;
mod models;
mod quicknote;
mod sidecar;
mod updater;
mod vault;

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Capabilities {
    vault: bool,
    quick_note: bool,
    global_shortcut: bool,
    sidecar: bool,
    models: bool,
    keychain: bool,
    updater: bool,
    platform: &'static str,
    app_version: String,
}

#[tauri::command]
fn app_capabilities(app: tauri::AppHandle) -> Capabilities {
    Capabilities {
        vault: true,
        quick_note: true,
        global_shortcut: true,
        sidecar: true,
        models: true,
        keychain: true,
        updater: true,
        platform: if cfg!(windows) {
            "windows"
        } else if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(target_os = "linux") {
            "linux"
        } else {
            "unknown"
        },
        app_version: app.package_info().version.to_string(),
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(quicknote::shortcut_plugin())
        .manage(vault::VaultState::default())
        .manage(sidecar::SidecarState::default())
        .manage(models::ModelsState::default())
        .manage(updater::UpdateState::default())
        .setup(|app| {
            quicknote::setup_tray(app)?;
            // Default accelerator; failure (taken by another app) is non-fatal.
            if let Err(e) = quicknote::register_default(app.handle()) {
                eprintln!("global shortcut not registered: {e}");
            }
            // Close-to-tray for the main window.
            if let Some(w) = app.get_webview_window("main") {
                let w2 = w.clone();
                w.on_window_event(move |ev| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = ev {
                        api.prevent_close();
                        let _ = w2.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_capabilities,
            vault::vault_pick,
            vault::vault_open,
            vault::vault_current,
            vault::vault_close,
            vault::vault_read,
            vault::vault_write,
            vault::vault_list,
            vault::vault_stat,
            vault::vault_rename,
            vault::vault_remove,
            vault::vault_watch_start,
            quicknote::quicknote_show,
            quicknote::quicknote_hide,
            quicknote::quicknote_set_shortcut,
            quicknote::quicknote_save,
            sidecar::sidecar_start,
            sidecar::sidecar_stop,
            sidecar::sidecar_status,
            models::models_list,
            models::models_download,
            models::models_cancel,
            models::models_verify,
            models::models_remove,
            models::models_disk_usage,
            models::models_set_quota,
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
            updater::update_check,
            updater::update_install,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Aura desktop");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            sidecar::kill_on_exit(handle);
        }
    });
}
