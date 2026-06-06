-- Code Crime Scene — SQLite schema (reference copy).
-- This is the canonical schema applied at runtime by `src-tauri/src/db.rs`.
-- The live database lives in the OS app-data directory as `code-crime-scene.db`.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Key/value app settings (e.g. "onboarded" flag, last project, chosen model).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Every project folder the user has investigated.
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  path        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  last_opened INTEGER NOT NULL,   -- unix seconds
  created_at  INTEGER NOT NULL
);

-- Saved reports. The full analysis and the computed scores are stored as JSON
-- blobs so a report can be reopened exactly as it was generated. `ai_json` is
-- NULL until the user runs an AI analysis.
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER,
  project_path  TEXT NOT NULL,
  project_name  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  overall_score INTEGER NOT NULL,
  grade         TEXT NOT NULL,
  scores_json   TEXT NOT NULL,    -- the 5 headline scores
  analysis_json TEXT NOT NULL,    -- the full AnalysisResult
  ai_json       TEXT,             -- { model, generatedAt, content } or NULL
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_path);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
