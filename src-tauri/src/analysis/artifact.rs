//! Artifact typing: classify a file into a context-aware artifact type and
//! pick its primary exported symbol. Split out of `detect.rs`; callers keep
//! using these through `detect::*` re-exports.

use super::detect::{find_token, line_index};
use crate::models::Responsibility;

/// File-name tokens that mark a dialog-like component.
const DIALOG_NAME_TOKENS: &[&str] = &["dialog", "modal", "drawer", "sheet"];
/// Responsibilities that upgrade a plain component to a feature component.
const FEATURE_KINDS: &[&str] = &["admin", "data_fetching", "state_machine"];

/// Classify a file into a context-aware artifact type. Server-only artifacts
/// (node_server, route_handler) REQUIRE a server runtime — a client component
/// can never be labelled a server entrypoint.
pub(crate) fn detect_artifact_type(
    rel_path: &str,
    lang: &str,
    ext: &str,
    runtime: &str,
    resp: &[Responsibility],
    content: &str,
) -> String {
    let name = rel_path.rsplit('/').next().unwrap_or(rel_path);
    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);
    let lower_name = name.to_ascii_lowercase();
    let lower_stem = stem.to_ascii_lowercase();

    if !matches!(lang, "TypeScript" | "JavaScript") {
        return non_jsts_artifact(rel_path, lang, runtime, resp, content, &lower_name);
    }
    if let Some(t) = named_artifact(&lower_name, stem) {
        return t;
    }
    // Server-only artifacts — gated on server runtime (a client file can never be one).
    if runtime == "server" {
        if let Some(t) = server_artifact(resp, &lower_stem) {
            return t;
        }
    }
    tsx_artifact(ext, &lower_name, &lower_stem, resp, content)
}

/// Non-JS/TS files: Lua gets its own FiveM-aware typing; the rest is config/other.
fn non_jsts_artifact(
    rel_path: &str,
    lang: &str,
    runtime: &str,
    resp: &[Responsibility],
    content: &str,
    lower_name: &str,
) -> String {
    if lang == "Lua" {
        return super::lua::lua_artifact_type(rel_path, runtime, resp, content);
    }
    if lower_name.contains(".config.") {
        return "config".into();
    }
    "other".into()
}

/// Name-based JS/TS artifacts that need no content or runtime evidence:
/// type-only modules, config files and React hooks.
fn named_artifact(lower_name: &str, stem: &str) -> Option<String> {
    if lower_name.ends_with(".d.ts") || lower_name == "types.ts" || lower_name.ends_with(".types.ts") {
        return Some("types".into());
    }
    if lower_name.contains(".config.") {
        return Some("config".into());
    }
    // React hook — name-based, unambiguous.
    if stem.starts_with("use") && stem.len() > 3 && stem.as_bytes()[3].is_ascii_uppercase() {
        return Some("react_hook".into());
    }
    None
}

/// Server-runtime artifacts, in priority order: entrypoint servers, route
/// handlers, then service modules bundling >=2 direct responsibilities (a
/// real reason to split, instead of a generic "large file").
fn server_artifact(resp: &[Responsibility], lower_stem: &str) -> Option<String> {
    let has = |k: &str| resp.iter().any(|r| r.kind == k);
    let is_entry = matches!(lower_stem, "index" | "server" | "app" | "main");
    if has("http_server") && is_entry {
        return Some("node_server".into());
    }
    if has("routes") {
        return Some("route_handler".into());
    }
    if has("http_server") {
        return Some("node_server".into());
    }
    let direct_count = resp.iter().filter(|r| r.evidence == "direct").count();
    if direct_count >= 2 {
        return Some("node_service".into());
    }
    None
}

/// Component-flavored typing for tsx/jsx files (plain ts/js falls through to
/// "utility"). Name-based component types MUST precede the content-heuristic
/// icon check, so a dialog that merely renders inline SVG icons (and a
/// `switch`) is never mis-stolen by the icon branch.
fn tsx_artifact(
    ext: &str,
    lower_name: &str,
    lower_stem: &str,
    resp: &[Responsibility],
    content: &str,
) -> String {
    if ext != "tsx" && ext != "jsx" {
        return "utility".into();
    }
    if DIALOG_NAME_TOKENS.iter().any(|t| lower_name.contains(t)) {
        return "react_dialog".into();
    }
    if lower_name.contains("icon") {
        return "react_icon".into();
    }
    if matches!(lower_stem, "app" | "root" | "main") {
        return "react_root".into();
    }
    // Content-heuristic icon: a presentation-only SVG switch. Only when nothing
    // else claimed the file AND it carries NO responsibilities (no IO/state) —
    // an SVG-heavy component that fetches or opens sockets is not an icon file.
    let svg_count = content.matches("<svg").count() + content.matches("<path").count();
    if svg_count >= 6 && content.contains("switch") && resp.is_empty() {
        return "react_icon".into();
    }
    if FEATURE_KINDS.iter().any(|k| resp.iter().any(|r| r.kind == *k)) {
        return "react_feature".into();
    }
    "react_component".into()
}

/// The file's primary exported symbol: a hook/PascalCase component takes its name
/// from the file stem; otherwise fall back to the longest function's name.
pub(crate) fn primary_symbol(stem: &str, longest_name: &str) -> String {
    let b = stem.as_bytes();
    let is_hook = stem.len() > 3 && stem.starts_with("use") && b[3].is_ascii_uppercase();
    let is_pascal = b.first().map(|c| c.is_ascii_uppercase()).unwrap_or(false);
    if is_hook || is_pascal {
        stem.to_string()
    } else if !longest_name.is_empty() {
        longest_name.to_string()
    } else {
        stem.to_string()
    }
}

/// 1-based line where `name` is declared (function/const/let/var/class), or 0.
pub(crate) fn find_decl_line(content: &str, name: &str) -> usize {
    if name.is_empty() {
        return 0;
    }
    for kw in ["function ", "const ", "let ", "var ", "class "] {
        let needle = format!("{kw}{name}");
        if let Some(off) = find_token(content, &needle) {
            return line_index(content, off) + 1;
        }
    }
    0
}
