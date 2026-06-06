//! Tauri command surface — the only entry points the frontend can call.
//! Each command is a thin wrapper that delegates to a focused layer
//! (scanner / analysis / db / keychain / ai).

use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::models::*;
use crate::{ai, analysis, db, keychain, scanner, util};

/// Application state shared across commands: the open SQLite connection.
pub struct AppState {
    pub conn: Mutex<Connection>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    phase: String,
    processed: usize,
    message: String,
}

// --- scanning & analysis ----------------------------------------------------

#[tauri::command]
pub fn scan_and_analyze(app: AppHandle, path: String) -> Result<AnalysisResult, String> {
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    let project_name = root
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("project")
        .to_string();

    let _ = app.emit(
        "analysis://progress",
        ProgressPayload {
            phase: "scanning".into(),
            processed: 0,
            message: "Securing the perimeter…".into(),
        },
    );

    let app2 = app.clone();
    let scan = scanner::scan_dir(root, &mut |count| {
        let _ = app2.emit(
            "analysis://progress",
            ProgressPayload {
                phase: "scanning".into(),
                processed: count,
                message: format!("Collecting evidence — {count} files"),
            },
        );
    });

    let _ = app.emit(
        "analysis://progress",
        ProgressPayload {
            phase: "analyzing".into(),
            processed: scan.files.len(),
            message: "Dusting for fingerprints…".into(),
        },
    );

    let result = analysis::analyze(&project_name, &path, &scan, util::now_secs());

    let _ = app.emit(
        "analysis://progress",
        ProgressPayload {
            phase: "done".into(),
            processed: result.scanned_files,
            message: "Case file assembled.".into(),
        },
    );

    Ok(result)
}

// --- reports ----------------------------------------------------------------

#[tauri::command]
pub fn save_report(state: State<AppState>, report: NewReport) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::save_report(&conn, &report).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_reports(state: State<AppState>, limit: Option<i64>) -> Result<Vec<ReportSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::list_reports(&conn, limit.unwrap_or(100)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_reports_for_project(
    state: State<AppState>,
    path: String,
) -> Result<Vec<ReportSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::list_reports_for_project(&conn, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_report(state: State<AppState>, id: i64) -> Result<Option<ReportRecord>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_report(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_report(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_report(&conn, id).map_err(|e| e.to_string())
}

// --- projects ---------------------------------------------------------------

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<ProjectRecord>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn touch_project(state: State<AppState>, path: String, name: String) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::upsert_project(&conn, &path, &name).map_err(|e| e.to_string())
}

// --- settings ---------------------------------------------------------------

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_setting(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

// --- export -----------------------------------------------------------------

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

// --- API key (OS keychain) --------------------------------------------------

/// Clean a pasted API key: keep only visible ASCII characters. This strips not
/// just whitespace but also invisible bidirectional / zero-width control marks
/// (U+200E/U+200F/U+202x …) that a right-to-left UI can silently inject around a
/// pasted key — those would otherwise make a valid key fail with 401.
fn sanitize_key(key: &str) -> String {
    key.chars().filter(|c| c.is_ascii_graphic()).collect()
}

#[tauri::command]
pub fn key_exists() -> bool {
    keychain::has_key()
}

#[tauri::command]
pub fn save_api_key(key: String) -> Result<(), String> {
    let clean = sanitize_key(&key);
    if clean.is_empty() {
        return Err("API key is empty.".to_string());
    }
    keychain::save_key(&clean)
}

#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    keychain::delete_key()
}

#[tauri::command]
pub async fn verify_api_key(key: String) -> Result<(), String> {
    let clean = sanitize_key(&key);
    if clean.is_empty() {
        return Err("API key is empty.".to_string());
    }
    ai::verify_key(&clean).await
}

// --- AI analysis ------------------------------------------------------------

#[tauri::command]
pub async fn analyze_with_ai(
    state: State<'_, AppState>,
    summary: String,
    model: Option<String>,
    report_id: Option<i64>,
    lang: Option<String>,
) -> Result<String, String> {
    let key = keychain::get_key()?
        .ok_or_else(|| "No DeepSeek API key saved. Add one in Settings.".to_string())?;
    let model = model.unwrap_or_else(|| "deepseek-chat".to_string());
    let lang = lang.unwrap_or_else(|| "en".to_string());

    let text = ai::analyze(&key, &model, &summary, &lang).await?;

    if let Some(id) = report_id {
        let ai_json = serde_json::json!({
            "model": model,
            "generatedAt": util::now_secs(),
            "content": text,
        })
        .to_string();
        // Lock only after the await completed — never hold the guard across .await.
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let _ = db::update_report_ai(&conn, id, &ai_json);
    }

    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::sanitize_key;

    #[test]
    fn strips_bidi_and_whitespace_from_pasted_key() {
        // a valid key wrapped in RTL/LRM marks + spaces + newline (RTL-paste artifact)
        let dirty = "\u{200f} sk-ABC123_def \u{200e}\n";
        assert_eq!(sanitize_key(dirty), "sk-ABC123_def");
    }

    #[test]
    fn keeps_a_clean_key_unchanged() {
        assert_eq!(sanitize_key("sk-abcDEF123-_"), "sk-abcDEF123-_");
    }
}
