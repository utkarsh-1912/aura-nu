// UNBUILT / UNTESTED. Model manager: catalog-driven download, SHA-256 verification, disk quota.
// Trust anchor: the catalog bundled in resources/model-catalog.json (signed with the app). The webview only
// sends a model id; url/sha256/size come from the catalog. Mirrors src/desktop/modelCatalog.ts validation.
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;

#[derive(Default)]
pub struct ModelsState {
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub id: String,
    pub file: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub verified_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatModel {
    id: String,
    url: String,
    sha256: String,
    size_bytes: u64,
    file: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    allowed_hosts: Vec<String>,
    models: Vec<CatModel>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    id: String,
    received_bytes: u64,
    total_bytes: u64,
    phase: &'static str,
    error: Option<String>,
}

pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("models");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}
fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join("index.json"))
}
pub fn installed(app: &AppHandle) -> Result<Vec<Installed>, String> {
    Ok(fs::read_to_string(index_path(app)?).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default())
}
fn save_installed(app: &AppHandle, v: &[Installed]) -> Result<(), String> {
    fs::write(index_path(app)?, serde_json::to_string_pretty(v).unwrap()).map_err(|e| e.to_string())
}
fn quota_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join("quota.json"))
}
fn quota(app: &AppHandle) -> u64 {
    quota_path(app).ok().and_then(|p| fs::read_to_string(p).ok()).and_then(|s| s.trim().parse().ok()).unwrap_or(20 * 1024 * 1024 * 1024)
}

fn load_catalog(app: &AppHandle) -> Result<Catalog, String> {
    let p = app.path().resolve("resources/model-catalog.json", BaseDirectory::Resource).map_err(|e| e.to_string())?;
    let c: Catalog = serde_json::from_str(&fs::read_to_string(p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    for m in &c.models {
        let u = url::Url::parse(&m.url).map_err(|e| e.to_string())?;
        let host_ok = u.host_str().map(|h| c.allowed_hosts.iter().any(|a| h == a || h.ends_with(&format!(".{a}")))).unwrap_or(false);
        let file_ok = m.file.ends_with(".gguf") && m.file.len() <= 128 && m.file.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-')) && !m.file.starts_with('.');
        let sha_ok = m.sha256.len() == 64 && m.sha256.chars().all(|ch| matches!(ch, '0'..='9' | 'a'..='f'));
        if u.scheme() != "https" || !host_ok || !file_ok || !sha_ok || m.size_bytes == 0 {
            return Err(format!("invalid catalog entry {}", m.id));
        }
    }
    Ok(c)
}

fn used_bytes(app: &AppHandle) -> u64 {
    installed(app).map(|v| v.iter().map(|m| m.size_bytes).sum()).unwrap_or(0)
}

fn free_bytes(dir: &PathBuf) -> u64 {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    disks.iter().filter(|d| dir.starts_with(d.mount_point())).max_by_key(|d| d.mount_point().as_os_str().len()).map(|d| d.available_space()).unwrap_or(0)
}

#[tauri::command]
pub fn models_list(app: AppHandle) -> Result<Vec<Installed>, String> {
    installed(&app)
}

#[tauri::command]
pub async fn models_download(app: AppHandle, state: State<'_, ModelsState>, id: String) -> Result<Installed, String> {
    let cat = load_catalog(&app)?;
    let m = cat.models.iter().find(|m| m.id == id).ok_or("unknown model id")?;
    let dir = models_dir(&app)?;
    if used_bytes(&app) + m.size_bytes > quota(&app) {
        return Err("disk quota exceeded".into());
    }
    if m.size_bytes + 1024 * 1024 * 1024 > free_bytes(&dir) {
        return Err("not enough free disk space".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    state.cancels.lock().unwrap().insert(id.clone(), cancel.clone());
    let part = dir.join(format!("{}.part", m.file));
    let result = download(&app, m, &part, &cancel).await;
    state.cancels.lock().unwrap().remove(&id);
    let emit = |phase, err: Option<String>, n: u64| {
        let _ = app.emit("models://progress", Progress { id: id.clone(), received_bytes: n, total_bytes: m.size_bytes, phase, error: err });
    };
    match result {
        Ok(hash) => {
            if hash != m.sha256 {
                let _ = fs::remove_file(&part);
                emit("error", Some("SHA-256 mismatch; file discarded".into()), m.size_bytes);
                return Err("SHA-256 mismatch".into());
            }
            fs::rename(&part, dir.join(&m.file)).map_err(|e| e.to_string())?;
            let rec = Installed { id: id.clone(), file: m.file.clone(), size_bytes: m.size_bytes, sha256: hash, verified_at: format!("{}", now_secs()) };
            let mut all = installed(&app)?;
            all.retain(|x| x.id != id);
            all.push(rec.clone());
            save_installed(&app, &all)?;
            emit("done", None, m.size_bytes);
            Ok(rec)
        }
        Err(e) => {
            let _ = fs::remove_file(&part);
            emit("error", Some(e.clone()), 0);
            Err(e)
        }
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

async fn download(app: &AppHandle, m: &CatModel, part: &PathBuf, cancel: &Arc<AtomicBool>) -> Result<String, String> {
    let policy_hosts: Vec<String> = load_catalog(app)?.allowed_hosts;
    // Redirects are only followed to https hosts in the allowlist (CDN hosts must be listed in the catalog).
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::custom(move |a| {
            let ok = a.url().scheme() == "https"
                && a.url().host_str().map(|h| policy_hosts.iter().any(|p| h == p || h.ends_with(&format!(".{p}")))).unwrap_or(false);
            if ok && a.previous().len() < 5 { a.follow() } else { a.stop() }
        }))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&m.url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }
    let mut file = tokio::fs::File::create(part).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut got: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Err("cancelled".into());
        }
        let c = chunk.map_err(|e| e.to_string())?;
        got += c.len() as u64;
        if got > m.size_bytes {
            return Err("download larger than catalog size".into());
        }
        hasher.update(&c);
        file.write_all(&c).await.map_err(|e| e.to_string())?;
        let _ = app.emit("models://progress", Progress { id: m.id.clone(), received_bytes: got, total_bytes: m.size_bytes, phase: "downloading", error: None });
    }
    file.flush().await.map_err(|e| e.to_string())?;
    let _ = app.emit("models://progress", Progress { id: m.id.clone(), received_bytes: got, total_bytes: m.size_bytes, phase: "verifying", error: None });
    Ok(hex::encode(hasher.finalize()))
}

#[tauri::command]
pub fn models_cancel(state: State<'_, ModelsState>, id: String) {
    if let Some(c) = state.cancels.lock().unwrap().get(&id) {
        c.store(true, Ordering::Relaxed);
    }
}

/// Re-hash the installed file (blocking IO; fine for an occasional user action).
#[tauri::command]
pub async fn models_verify(app: AppHandle, id: String) -> Result<bool, String> {
    let rec = installed(&app)?.into_iter().find(|m| m.id == id).ok_or("not installed")?;
    let path = models_dir(&app)?.join(&rec.file);
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let mut f = fs::File::open(path).map_err(|e| e.to_string())?;
        let mut h = Sha256::new();
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let n = f.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 { break; }
            h.update(&buf[..n]);
        }
        Ok::<bool, String>(hex::encode(h.finalize()) == rec.sha256)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn models_remove(app: AppHandle, id: String) -> Result<(), String> {
    let mut all = installed(&app)?;
    if let Some(rec) = all.iter().find(|m| m.id == id) {
        let _ = fs::remove_file(models_dir(&app)?.join(&rec.file));
    }
    all.retain(|m| m.id != id);
    save_installed(&app, &all)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    used_bytes: u64,
    quota_bytes: u64,
    free_bytes: u64,
}

#[tauri::command]
pub fn models_disk_usage(app: AppHandle) -> Result<Usage, String> {
    Ok(Usage { used_bytes: used_bytes(&app), quota_bytes: quota(&app), free_bytes: free_bytes(&models_dir(&app)?) })
}

#[tauri::command]
pub fn models_set_quota(app: AppHandle, quota_bytes: u64) -> Result<(), String> {
    fs::write(quota_path(&app)?, quota_bytes.to_string()).map_err(|e| e.to_string())
}
