// UNBUILT / UNTESTED. OS keychain (Windows Credential Manager / macOS Keychain / Secret Service) via the `keyring` crate v3.
use keyring::Entry;

const SERVICE: &str = "io.aura.next";

fn entry(name: &str) -> Result<Entry, String> {
    if name.is_empty() || name.len() > 64 || !name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')) {
        return Err("invalid key name".into());
    }
    Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_set(name: String, secret: String) -> Result<(), String> {
    entry(&name)?.set_password(&secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn keychain_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
