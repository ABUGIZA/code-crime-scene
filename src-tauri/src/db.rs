//! Local storage layer — SQLite via rusqlite.
//! Holds app settings, opened projects, and saved reports.

use crate::models::*;
use crate::util::now_secs;
use rusqlite::{params, Connection};

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  path        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  last_opened INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER,
  project_path  TEXT NOT NULL,
  project_name  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  overall_score INTEGER NOT NULL,
  grade         TEXT NOT NULL,
  scores_json   TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  ai_json       TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_path);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
"#;

pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(SCHEMA)
}

// --- settings ---------------------------------------------------------------

pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query_map(params![key], |r| r.get::<_, String>(0))?;
    match rows.next() {
        Some(v) => Ok(Some(v?)),
        None => Ok(None),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    )?;
    Ok(())
}

// --- projects ---------------------------------------------------------------

pub fn upsert_project(conn: &Connection, path: &str, name: &str) -> rusqlite::Result<i64> {
    let now = now_secs();
    conn.execute(
        "INSERT INTO projects (path, name, last_opened, created_at) VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(path) DO UPDATE SET last_opened = ?3, name = ?2",
        params![path, name, now],
    )?;
    conn.query_row(
        "SELECT id FROM projects WHERE path = ?1",
        params![path],
        |r| r.get(0),
    )
}

pub fn list_projects(conn: &Connection) -> rusqlite::Result<Vec<ProjectRecord>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.path, p.name, p.last_opened,
                (SELECT COUNT(*) FROM reports r WHERE r.project_path = p.path) AS report_count
         FROM projects p
         ORDER BY p.last_opened DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ProjectRecord {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            last_opened: row.get(3)?,
            report_count: row.get(4)?,
        })
    })?;
    rows.collect()
}

// --- reports ----------------------------------------------------------------

pub fn save_report(conn: &Connection, r: &NewReport) -> rusqlite::Result<i64> {
    let now = now_secs();
    let project_id = upsert_project(conn, &r.project_path, &r.project_name)?;
    conn.execute(
        "INSERT INTO reports
            (project_id, project_path, project_name, created_at, overall_score, grade, scores_json, analysis_json, ai_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            project_id,
            r.project_path,
            r.project_name,
            now,
            r.overall_score,
            r.grade,
            r.scores_json,
            r.analysis_json,
            r.ai_json
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

fn map_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReportSummary> {
    Ok(ReportSummary {
        id: row.get(0)?,
        project_path: row.get(1)?,
        project_name: row.get(2)?,
        created_at: row.get(3)?,
        overall_score: row.get(4)?,
        grade: row.get(5)?,
        has_ai: row.get(6)?,
    })
}

pub fn list_reports(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<ReportSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_path, project_name, created_at, overall_score, grade, (ai_json IS NOT NULL)
         FROM reports ORDER BY created_at DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], map_summary)?;
    rows.collect()
}

pub fn list_reports_for_project(
    conn: &Connection,
    path: &str,
) -> rusqlite::Result<Vec<ReportSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_path, project_name, created_at, overall_score, grade, (ai_json IS NOT NULL)
         FROM reports WHERE project_path = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![path], map_summary)?;
    rows.collect()
}

pub fn get_report(conn: &Connection, id: i64) -> rusqlite::Result<Option<ReportRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_path, project_name, created_at, overall_score, grade, scores_json, analysis_json, ai_json
         FROM reports WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(ReportRecord {
            id: row.get(0)?,
            project_path: row.get(1)?,
            project_name: row.get(2)?,
            created_at: row.get(3)?,
            overall_score: row.get(4)?,
            grade: row.get(5)?,
            scores_json: row.get(6)?,
            analysis_json: row.get(7)?,
            ai_json: row.get(8)?,
        })
    })?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

pub fn delete_report(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM reports WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_report_ai(conn: &Connection, id: i64, ai_json: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE reports SET ai_json = ?2 WHERE id = ?1",
        params![id, ai_json],
    )?;
    Ok(())
}
