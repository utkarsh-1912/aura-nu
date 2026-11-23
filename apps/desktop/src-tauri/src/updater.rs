// UNBUILT / UNTESTED. Signed auto-update via tauri-plugin-updater.
// API per https://v2.tauri.app/plugin/updater/ . Signature (minisign) is verified by the plugin against
// plugins.updater.pubkey in tauri.conf.json; unsigned/mismatched artifacts are rejected.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState(Mutex<Option<Update>>);

#[derive(Serialize)]
pub struct UpdateInfo {
    available: bool,
    version: Option<String>,
    notes: Option<String>,
}

#[tauri::command]
pub async fn update_check(app: AppHandle, state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    let upd = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let info = UpdateInfo {
        available: upd.is_some(),
        version: upd.as_ref().map(|u| u.version.clone()),
        notes: upd.as_ref().and_then(|u| u.body.clone()),
    };
    *state.0.lock().unwrap() = upd;
    Ok(info)
}

#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    let upd = state.0.lock().unwrap().take().ok_or("no update checked")?;
    upd.download_and_install(|_chunk, _total| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart();
}
