// UNBUILT / UNTESTED. Global quick-note shortcut, quick-note window and tray.
// Plugin usage per https://v2.tauri.app/plugin/global-shortcut/ . Tray: tauri "tray-icon" feature.
// The quicknote window loads the SAME web bundle with ?window=quicknote (the web UI must render a capture box there).
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const DEFAULT_ACCEL: &str = "CommandOrControl+Shift+N";

/// One handler for the (single) registered shortcut: pressing it opens the quick-note window.
pub fn shortcut_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = show(app);
            }
        })
        .build()
}

pub fn register_default(app: &AppHandle) -> Result<(), String> {
    app.global_shortcut().register(DEFAULT_ACCEL).map_err(|e| e.to_string())
}

fn show(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("quicknote") {
        w.show().map_err(|e| e.to_string())?;
        return w.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(app, "quicknote", WebviewUrl::App("index.html?window=quicknote".into()))
        .title("Quick Note")
        .inner_size(480.0, 260.0)
        .always_on_top(true)
        .decorations(false)
        .center()
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quicknote_show(app: AppHandle) -> Result<(), String> {
    show(&app)
}

#[tauri::command]
pub fn quicknote_hide(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("quicknote") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Re-register the single global accelerator. Errors if the OS/another app already owns it.
#[tauri::command]
pub fn quicknote_set_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    if accelerator.len() > 64 {
        return Err("accelerator too long".into());
    }
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    if let Err(e) = gs.register(accelerator.as_str()) {
        let _ = gs.register(DEFAULT_ACCEL); // restore a working shortcut
        return Err(e.to_string());
    }
    Ok(())
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Saved {
    text: String,
    created_at: String,
}

/// Called by the quicknote window; forwards to the main window (which owns note storage) and hides itself.
#[tauri::command]
pub fn quicknote_save(app: AppHandle, text: String) -> Result<(), String> {
    if text.len() > 200_000 {
        return Err("too large".into());
    }
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_default(); // epoch millis as string; web side converts to ISO
    app.emit_to("main", "quicknote://saved", Saved { text, created_at }).map_err(|e| e.to_string())?;
    quicknote_hide(app)
}

pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let quick = MenuItem::with_id(app, "quick", "New quick note", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Show Aura", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quick, &open, &quit])?;
    let mut b = TrayIconBuilder::new().menu(&menu).on_menu_event(|app, ev| match ev.id.as_ref() {
        "quick" => {
            let _ = show(app);
        }
        "open" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        "quit" => app.exit(0),
        _ => {}
    });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.build(app)?;
    Ok(())
}
