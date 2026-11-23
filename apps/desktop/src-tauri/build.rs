// UNBUILT / UNTESTED.
// Restrict the webview to exactly these app commands (Tauri v2 AppManifest; see
// https://v2.tauri.app/security/capabilities/). Each command then needs a permission
// in capabilities/*.json; identifiers are generated (check gen/schemas after the first build).
const COMMANDS: &[&str] = &[
    "app_capabilities",
    "vault_pick", "vault_open", "vault_current", "vault_close", "vault_read", "vault_write",
    "vault_list", "vault_stat", "vault_rename", "vault_remove", "vault_watch_start",
    "quicknote_show", "quicknote_hide", "quicknote_set_shortcut", "quicknote_save",
    "sidecar_start", "sidecar_stop", "sidecar_status",
    "models_list", "models_download", "models_cancel", "models_verify", "models_remove",
    "models_disk_usage", "models_set_quota",
    "keychain_set", "keychain_get", "keychain_delete",
    "update_check", "update_install",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .unwrap();
}
