//! Shared data models exchanged between Rust and the TypeScript frontend.
//! All structs serialize to `camelCase` so they map cleanly onto TS types.

use serde::{Deserialize, Serialize};

/// A detected responsibility with the *kind* of evidence backing it. This is the
/// heart of avoiding false positives: we only claim a file "manages WebSocket"
/// when the evidence is `direct` (e.g. `new WebSocket`), not when it merely uses
/// a hook (`indirect`) or matched a loose keyword (`heuristic`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Responsibility {
    pub kind: String,     // websocket | webrtc | http_server | routes | timers | ...
    pub label: String,    // refined sub-type: ws_server | webrtc_conn | timer_heartbeat | ...
    pub evidence: String, // direct | indirect | supporting
    pub token: String,    // the actual token that matched (verbatim, present in file)
    pub line: usize,      // 1-based line where the token appears (0 = unknown)
    pub snippet: String,  // the single trimmed source line that contains the token
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub language: String,
    pub ext: String,
    pub lines: usize,
    pub code_lines: usize,
    pub comment_lines: usize,
    pub blank_lines: usize,
    pub size_bytes: u64,
    pub functions: usize,
    pub long_functions: usize,
    /// True if this file is noise (lockfile/generated): excluded from metrics.
    pub noise: bool,
    pub noise_reason: Option<String>,
    /// Where the file runs: "client" | "server" | "shared".
    pub runtime: String,
    /// Artifact category: react_root, react_component, react_feature, react_hook,
    /// react_dialog, react_icon, node_server, route_handler, utility, types,
    /// config, lockfile, generated, other.
    pub file_type: String,
    pub responsibilities: Vec<Responsibility>,
    pub longest_function: usize,
    pub longest_function_name: String,
    /// 1-based start line of the longest function (0 = none).
    pub longest_function_line: usize,
    /// The file's primary exported symbol (component/hook/function name).
    pub component_name: String,
    /// 1-based line where that primary symbol is declared (0 = unknown).
    pub component_line: usize,
    /// Blast radius: how many other analyzed files import this one.
    pub fan_in: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LongFunction {
    pub file: String,
    pub name: String,
    pub start_line: usize,
    pub length: usize,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicationBlock {
    pub fingerprint: String,
    pub line_count: usize,
    pub occurrences: usize,
    pub files: Vec<String>,
    pub sample: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnusedImport {
    pub file: String,
    pub name: String,
    pub source: String,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageStat {
    pub language: String,
    pub files: usize,
    pub lines: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityFinding {
    pub file: String,
    pub line: usize,
    pub kind: String,
    pub severity: String, // "high" | "medium" | "low"
    pub snippet: String,
}

/// The complete output of the local static-analysis engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub project_name: String,
    pub project_path: String,
    pub generated_at: i64, // unix seconds

    pub total_files: usize,
    pub scanned_files: usize,
    pub skipped_files: usize,
    pub analyzed_files: usize,
    pub ignored_files: usize,
    pub ignored_lines: usize,

    pub total_lines: usize,
    pub code_lines: usize,
    pub comment_lines: usize,
    pub blank_lines: usize,
    pub total_bytes: u64,

    pub total_functions: usize,
    pub avg_file_lines: f64,
    pub max_fan_in: usize,
    pub duplicate_line_ratio: f64,

    // True totals (the lists below are truncated for display; these are not).
    pub total_long_functions: usize,
    pub total_unused_imports: usize,
    pub total_duplicate_blocks: usize,
    pub huge_file_count: usize,
    pub security_high: usize,
    pub security_medium: usize,
    pub security_low: usize,

    /// Verification commands discovered in the project's package.json scripts
    /// (e.g. "npm run typecheck", "npm run build") — attached to PR suggestions.
    pub verify_commands: Vec<String>,

    pub languages: Vec<LanguageStat>,
    pub largest_files: Vec<FileInfo>,
    pub ignored_largest: Vec<FileInfo>,
    pub all_files: Vec<FileInfo>,
    pub long_functions: Vec<LongFunction>,
    pub duplication: Vec<DuplicationBlock>,
    pub unused_imports: Vec<UnusedImport>,
    pub security_findings: Vec<SecurityFinding>,
    pub dependencies: Vec<DependencyEdge>,
}

/// A persisted report row (analysis + frontend-computed scores + optional AI text).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportRecord {
    pub id: i64,
    pub project_path: String,
    pub project_name: String,
    pub created_at: i64,
    pub overall_score: i64,
    pub grade: String,
    pub scores_json: String,
    pub analysis_json: String,
    pub ai_json: Option<String>,
}

/// Lightweight row for history lists (no heavy JSON payloads).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportSummary {
    pub id: i64,
    pub project_path: String,
    pub project_name: String,
    pub created_at: i64,
    pub overall_score: i64,
    pub grade: String,
    pub has_ai: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub last_opened: i64,
    pub report_count: i64,
}

/// Payload the frontend hands to `save_report`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewReport {
    pub project_path: String,
    pub project_name: String,
    pub overall_score: i64,
    pub grade: String,
    pub scores_json: String,
    pub analysis_json: String,
    pub ai_json: Option<String>,
}
