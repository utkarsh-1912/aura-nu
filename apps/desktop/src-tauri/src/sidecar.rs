// UNBUILT / UNTESTED. llama.cpp `llama-server` sidecar manager.
// Isolation: binds 127.0.0.1 only, random free port, per-start random bearer token (passed via env, not argv,
// so it is not visible in the process list), no window, killed on app exit (kill_on_drop + RunEvent::Exit).
// The binary is NOT downloaded by this code: it must be provisioned at <app_local_data>/runtime/llama-server(.exe)
// (installer step or manual). VERIFY on a real machine: `llama-server --help` flags (--host/--port/-m/-c/-ngl) and that
// the LLAMA_API_KEY env var is honored (otherwise switch to --api-key and accept argv exposure); unauthenticated
// requests must return 401 (see docs/desktop.md checklist).
use crate::models;
use serde::Serialize;
use std::net::TcpListener;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{process::{Child, Command}, sync::Mutex};

#[derive(Default)]
pub struct SidecarState {
    child: Mutex<Option<Child>>,
    status: Mutex<Status>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    state: String, // stopped | starting | ready | error
    base_url: Option<String>,
    token: Option<String>,
    model_id: Option<String>,
    error: Option<String>,
}

fn stopped() -> Status {
    Status { state: "stopped".into(), ..Default::default() }
}

async fn set(app: &AppHandle, st: &State<'_, SidecarState>, s: Status) {
    *st.status.lock().await = s.clone();
    let _ = app.emit("sidecar://status", s);
}

fn free_port() -> Result<u16, String> {
    let l = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    Ok(l.local_addr().map_err(|e| e.to_string())?.port())
}

fn random_token() -> Result<String, String> {
    let mut b = [0u8; 32];
    getrandom::getrandom(&mut b).map_err(|e| e.to_string())?;
    Ok(hex::encode(b))
}

#[tauri::command]
pub async fn sidecar_start(
    app: AppHandle,
    st: State<'_, SidecarState>,
    model_id: String,
    context_size: Option<u32>,
    gpu_layers: Option<u32>,
) -> Result<Status, String> {
    sidecar_stop(app.clone(), st.clone()).await?;
    let model = models::installed(&app)?.into_iter().find(|m| m.id == model_id).ok_or("model not installed")?;
    let model_path = models::models_dir(&app)?.join(&model.file);
    let bin_name = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };
    let bin = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("runtime").join(bin_name);
    if !bin.exists() {
        return Err(format!("llama-server not found at {}", bin.display()));
    }
    let port = free_port()?;
    let token = random_token()?;
    let mut cmd = Command::new(bin);
    cmd.arg("--host").arg("127.0.0.1")
        .arg("--port").arg(port.to_string())
        .arg("-m").arg(model_path)
        .arg("-c").arg(context_size.unwrap_or(4096).clamp(512, 131072).to_string())
        .arg("-ngl").arg(gpu_layers.unwrap_or(0).min(999).to_string())
        .env("LLAMA_API_KEY", &token)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    *st.child.lock().await = Some(child);

    let base = format!("http://127.0.0.1:{port}/v1");
    let starting = Status { state: "starting".into(), base_url: Some(base.clone()), token: Some(token.clone()), model_id: Some(model_id.clone()), error: None };
    set(&app, &st, starting.clone()).await;

    // Poll /health (up to ~120 s) in the background and flip to ready/error.
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let st = app2.state::<SidecarState>();
        let url = format!("http://127.0.0.1:{port}/health");
        for _ in 0..240 {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if let Some(c) = st.child.lock().await.as_mut() {
                if let Ok(Some(code)) = c.try_wait() {
                    set(&app2, &st, Status { state: "error".into(), error: Some(format!("exited: {code}")), ..Default::default() }).await;
                    return;
                }
            } else {
                return; // stopped meanwhile
            }
            if let Ok(r) = reqwest::get(&url).await {
                if r.status().is_success() {
                    let mut ready = starting.clone();
                    ready.state = "ready".into();
                    set(&app2, &st, ready).await;
                    return;
                }
            }
        }
        set(&app2, &st, Status { state: "error".into(), error: Some("timed out waiting for model load".into()), ..Default::default() }).await;
    });
    Ok(starting)
}

#[tauri::command]
pub async fn sidecar_stop(app: AppHandle, st: State<'_, SidecarState>) -> Result<(), String> {
    if let Some(mut c) = st.child.lock().await.take() {
        let _ = c.kill().await;
    }
    set(&app, &st, stopped()).await;
    Ok(())
}

#[tauri::command]
pub async fn sidecar_status(st: State<'_, SidecarState>) -> Result<Status, String> {
    let s = st.status.lock().await.clone();
    Ok(if s.state.is_empty() { stopped() } else { s })
}

pub fn kill_on_exit(app: &AppHandle) {
    let st = app.state::<SidecarState>();
    if let Ok(mut g) = st.child.try_lock() {
        if let Some(c) = g.as_mut() {
            let _ = c.start_kill();
        }
    }
}
