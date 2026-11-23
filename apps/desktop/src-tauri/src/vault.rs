// UNBUILT / UNTESTED. Vault-on-disk commands.
// SECURITY: the webview never gets the fs plugin. Every path is vault-relative and re-validated here
// (no "..", no absolute/drive paths, no symlink escape, reserved Windows names rejected). The vault root
// can only be chosen via the native folder dialog (or re-opened from the persisted list of dialog-chosen roots).
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct VaultState {
    root: Mutex<Option<PathBuf>>, // canonical
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Serialize, Clone)]
pub struct VaultInfo {
    root: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStat {
    path: String,
    is_dir: bool,
    size: u64,
    mtime_ms: f64,
}

const RESERVED: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2",
    "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

fn bad_segment(seg: &str) -> bool {
    let stem = seg.split('.').next().unwrap_or("").to_lowercase();
    seg.chars()
        .any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '\0') || (c as u32) < 32)
        || seg.ends_with('.')
        || seg.ends_with(' ')
        || RESERVED.contains(&stem.as_str())
}

/// Turn a vault-relative string into a safe absolute path under `root` (canonical). "" = root itself.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.replace('\\', "/");
    if rel.starts_with('/') || rel.chars().nth(1) == Some(':') {
        return Err("absolute path rejected".into());
    }
    let mut out = root.to_path_buf();
    for seg in rel.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." || bad_segment(seg) {
            return Err(format!("illegal path segment: {seg}"));
        }
        out.push(seg);
    }
    // Symlink-escape defence: canonicalize the deepest existing ancestor and require it to stay under root.
    let mut probe = out.clone();
    while !probe.exists() {
        if !probe.pop() {
            return Err("no existing ancestor".into());
        }
    }
    let canon = probe.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(root) {
        return Err("path escapes vault".into());
    }
    Ok(out)
}

fn root_of(state: &State<'_, VaultState>) -> Result<PathBuf, String> {
    state.root.lock().unwrap().clone().ok_or_else(|| "no vault open".to_string())
}

fn recents_file(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.join("vaults.json"))
}

fn load_recents(app: &AppHandle) -> Vec<String> {
    recents_file(app)
        .ok()
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn remember(app: &AppHandle, root: &Path) -> Result<(), String> {
    let mut r = load_recents(app);
    let s = root.to_string_lossy().to_string();
    if !r.contains(&s) {
        r.push(s);
    }
    fs::write(recents_file(app)?, serde_json::to_string(&r).unwrap()).map_err(|e| e.to_string())
}

fn info_of(canon: &Path) -> VaultInfo {
    VaultInfo {
        root: canon.to_string_lossy().to_string(),
        name: canon.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
    }
}

fn activate(state: &State<'_, VaultState>, dir: PathBuf) -> Result<VaultInfo, String> {
    let canon = dir.canonicalize().map_err(|e| e.to_string())?;
    if !canon.is_dir() {
        return Err("not a directory".into());
    }
    fs::create_dir_all(canon.join(".aura")).map_err(|e| e.to_string())?;
    *state.watcher.lock().unwrap() = None;
    *state.root.lock().unwrap() = Some(canon.clone());
    Ok(info_of(&canon))
}

#[tauri::command]
pub async fn vault_pick(app: AppHandle, state: State<'_, VaultState>) -> Result<Option<VaultInfo>, String> {
    let Some(p) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = p.into_path().map_err(|e| e.to_string())?;
    let info = activate(&state, path)?;
    remember(&app, Path::new(&info.root))?;
    Ok(Some(info))
}

/// Re-open a vault previously chosen through the dialog. Arbitrary paths from the webview are refused.
#[tauri::command]
pub fn vault_open(app: AppHandle, state: State<'_, VaultState>, root: String) -> Result<VaultInfo, String> {
    let canon = Path::new(&root).canonicalize().map_err(|e| e.to_string())?;
    if !load_recents(&app).iter().any(|r| Path::new(r) == canon) {
        return Err("vault was not chosen via the folder dialog".into());
    }
    activate(&state, canon)
}

#[tauri::command]
pub fn vault_current(state: State<'_, VaultState>) -> Option<VaultInfo> {
    state.root.lock().unwrap().as_ref().map(|r| info_of(r))
}

#[tauri::command]
pub fn vault_close(state: State<'_, VaultState>) {
    *state.watcher.lock().unwrap() = None;
    *state.root.lock().unwrap() = None;
}

#[tauri::command]
pub fn vault_read(state: State<'_, VaultState>, path: String) -> Result<String, String> {
    let p = resolve(&root_of(&state)?, &path)?;
    let meta = fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > 20 * 1024 * 1024 {
        return Err("file too large".into());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

/// Atomic write: temp file in the same directory, then rename over the target.
#[tauri::command]
pub fn vault_write(state: State<'_, VaultState>, path: String, text: String) -> Result<(), String> {
    if text.len() > 20 * 1024 * 1024 {
        return Err("content too large".into());
    }
    let p = resolve(&root_of(&state)?, &path)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut tmp = p.clone().into_os_string();
    tmp.push(".aura-tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

fn mtime(m: &fs::Metadata) -> f64 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<VaultStat>) -> std::io::Result<()> {
    for e in fs::read_dir(dir)? {
        let e = e?;
        let ft = e.file_type()?;
        if ft.is_symlink() {
            continue; // never follow links out of the vault
        }
        if e.file_name().to_string_lossy().ends_with(".aura-tmp") {
            continue;
        }
        let m = e.metadata()?;
        let rel = e.path().strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
        out.push(VaultStat { path: rel, is_dir: ft.is_dir(), size: m.len(), mtime_ms: mtime(&m) });
        if ft.is_dir() {
            walk(root, &e.path(), out)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn vault_list(state: State<'_, VaultState>, dir: String) -> Result<Vec<VaultStat>, String> {
    let root = root_of(&state)?;
    let d = resolve(&root, &dir)?;
    let mut out = vec![];
    if d.exists() {
        walk(&root, &d, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

#[tauri::command]
pub fn vault_stat(state: State<'_, VaultState>, path: String) -> Result<Option<VaultStat>, String> {
    let root = root_of(&state)?;
    let p = resolve(&root, &path)?;
    match fs::metadata(&p) {
        Ok(m) => Ok(Some(VaultStat { path, is_dir: m.is_dir(), size: m.len(), mtime_ms: mtime(&m) })),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Refuses to overwrite an existing different file (case-only renames allowed).
#[tauri::command]
pub fn vault_rename(state: State<'_, VaultState>, from: String, to: String) -> Result<(), String> {
    let root = root_of(&state)?;
    let (a, b) = (resolve(&root, &from)?, resolve(&root, &to)?);
    if b.exists() && a.to_string_lossy().to_lowercase() != b.to_string_lossy().to_lowercase() {
        return Err("destination exists".into());
    }
    if let Some(parent) = b.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(a, b).map_err(|e| e.to_string())
}

/// Files only. (The app moves deleted notes into .aura/trash via rename.)
#[tauri::command]
pub fn vault_remove(state: State<'_, VaultState>, path: String) -> Result<(), String> {
    let p = resolve(&root_of(&state)?, &path)?;
    if p.is_dir() {
        return Err("refusing to remove a directory".into());
    }
    match fs::remove_file(p) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize, Clone)]
struct Ev {
    #[serde(rename = "type")]
    kind: &'static str,
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    from: Option<String>,
}

/// Start emitting "vault://event" (create/modify/delete/rename). Frontend should debounce, then reconcile.
#[tauri::command]
pub fn vault_watch_start(app: AppHandle, state: State<'_, VaultState>) -> Result<(), String> {
    let root = root_of(&state)?;
    let r2 = root.clone();
    let mut w = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(ev) = res else { return };
        let paths: Vec<String> = ev
            .paths
            .iter()
            .filter_map(|p| p.strip_prefix(&r2).ok().map(|x| x.to_string_lossy().replace('\\', "/")))
            .filter(|p| !p.split('/').any(|s| s.starts_with('.')) && !p.ends_with(".aura-tmp"))
            .collect();
        if paths.is_empty() {
            return;
        }
        let out = match ev.kind {
            EventKind::Create(_) => Ev { kind: "create", path: paths[0].clone(), from: None },
            EventKind::Remove(_) => Ev { kind: "delete", path: paths[0].clone(), from: None },
            EventKind::Modify(notify::event::ModifyKind::Name(_)) if paths.len() == 2 => {
                Ev { kind: "rename", from: Some(paths[0].clone()), path: paths[1].clone() }
            }
            EventKind::Modify(_) => Ev { kind: "modify", path: paths[0].clone(), from: None },
            _ => return,
        };
        let _ = app.emit("vault://event", out);
    })
    .map_err(|e| e.to_string())?;
    w.watch(&root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    *state.watcher.lock().unwrap() = Some(w);
    Ok(())
}
