use super::defs::*;
use super::metrics::*;
use super::detect::*;
use crate::models::{SecurityFinding, UnusedImport};
use crate::scanner::RawFile;
use std::collections::{HashMap, HashSet};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use regex::Regex;

pub(crate) fn extract_verify_commands(files: &[RawFile]) -> Vec<String> {
    let pkg = files
        .iter()
        .filter(|f| f.rel_path == "package.json" || f.rel_path.ends_with("/package.json"))
        .min_by_key(|f| f.rel_path.matches('/').count());
    let mut out: Vec<String> = Vec::new();
    if let Some(f) = pkg {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&f.content) {
            if let Some(scripts) = v.get("scripts").and_then(|s| s.as_object()) {
                if let Some(n) = ["typecheck", "type-check", "tsc"].iter().find(|n| scripts.contains_key(**n)) {
                    out.push(format!("npm run {n}"));
                }
                if scripts.contains_key("build") {
                    out.push("npm run build".to_string());
                }
                if out.is_empty() {
                    for n in ["lint", "test"] {
                        if scripts.contains_key(n) {
                            out.push(format!("npm run {n}"));
                        }
                    }
                }
            }
        }
    }
    if out.is_empty() {
        out.push("npm run build".to_string());
    }
    out
}

/// Find `needle` in `content` respecting identifier boundaries, so the needle
/// `new WebSocket` does NOT match inside `new WebSocketServer`. Returns the byte
/// offset of a real match. Needles that begin/end with a non-identifier char
/// (e.g. `.onmessage`, `app.get(`) skip the boundary check on that side.

pub(crate) fn parse_imports(content: &str, lang: &str, pats: &Patterns) -> Vec<ImportItem> {
    match lang {
        "TypeScript" | "JavaScript" | "Vue" | "Svelte" => parse_ts_imports(content, pats),
        "Python" => parse_py_imports(content, pats),
        _ => Vec::new(),
    }
}

pub(crate) fn parse_ts_imports(content: &str, pats: &Patterns) -> Vec<ImportItem> {
    let mut out = Vec::new();
    for caps in pats.ts_import.captures_iter(content) {
        let bindings = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let source = caps.get(2).map(|m| m.as_str()).unwrap_or("").to_string();
        let start = caps.get(0).unwrap().start();
        let line = line_index(content, start) + 1;
        let names = parse_ts_bindings(bindings);
        let is_relative = source.starts_with('.');
        out.push(ImportItem {
            local_names: names,
            source,
            line,
            is_relative,
        });
    }
    out
}

pub(crate) fn parse_ts_bindings(s: &str) -> Vec<String> {
    let s = s.trim();
    let mut names: Vec<String> = Vec::new();

    if let (Some(open), Some(close)) = (s.find('{'), s.find('}')) {
        if close > open {
            let named = &s[open + 1..close];
            for part in named.split(',') {
                let p = part.trim();
                if p.is_empty() {
                    continue;
                }
                // "a as b" -> local b; "a" -> a
                let local = p.split_whitespace().last().unwrap_or(p);
                let id = clean_ident(local);
                if !id.is_empty() {
                    names.push(id);
                }
            }
        }
        let before = s[..open].trim().trim_end_matches(',').trim();
        if !before.is_empty() {
            let d = before.split(',').next().unwrap_or("").trim();
            if d.starts_with('*') {
                if let Some(ns) = d.split_whitespace().last() {
                    let id = clean_ident(ns);
                    if !id.is_empty() {
                        names.push(id);
                    }
                }
            } else {
                let id = clean_ident(d);
                if !id.is_empty() {
                    names.push(id);
                }
            }
        }
    } else if s.starts_with('*') {
        if let Some(ns) = s.split_whitespace().last() {
            let id = clean_ident(ns);
            if !id.is_empty() {
                names.push(id);
            }
        }
    } else if !s.is_empty() {
        let d = s.split(',').next().unwrap_or("").trim();
        let id = clean_ident(d);
        if !id.is_empty() {
            names.push(id);
        }
    }
    names
}

pub(crate) fn parse_py_imports(content: &str, pats: &Patterns) -> Vec<ImportItem> {
    let mut out = Vec::new();
    for caps in pats.py_import_from.captures_iter(content) {
        let module = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let names_str = caps.get(2).map(|m| m.as_str()).unwrap_or("");
        if names_str.trim() == "*" {
            continue;
        }
        let start = caps.get(0).unwrap().start();
        let line = line_index(content, start) + 1;
        out.push(ImportItem {
            local_names: parse_py_names(names_str),
            source: module.to_string(),
            line,
            is_relative: module.starts_with('.'),
        });
    }
    for caps in pats.py_import.captures_iter(content) {
        let mods = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let start = caps.get(0).unwrap().start();
        let line = line_index(content, start) + 1;
        for part in mods.split(',') {
            let p = part.trim();
            if p.is_empty() {
                continue;
            }
            let local = if let Some(pos) = p.find(" as ") {
                p[pos + 4..].trim().to_string()
            } else {
                p.split('.').next().unwrap_or(p).trim().to_string()
            };
            let id = clean_ident(&local);
            if !id.is_empty() {
                out.push(ImportItem {
                    local_names: vec![id],
                    source: p.to_string(),
                    line,
                    is_relative: false,
                });
            }
        }
    }
    out
}

pub(crate) fn parse_py_names(s: &str) -> Vec<String> {
    let cleaned = s.replace(['(', ')', '\\'], " ");
    let mut names = Vec::new();
    for part in cleaned.split(',') {
        let p = part.trim();
        if p.is_empty() {
            continue;
        }
        let local = if let Some(pos) = p.find(" as ") {
            &p[pos + 4..]
        } else {
            p
        };
        let id = clean_ident(local.trim());
        if !id.is_empty() {
            names.push(id);
        }
    }
    names
}

pub(crate) fn resolve_relative(importer: &str, source: &str, fileset: &HashSet<&str>) -> Option<String> {
    let mut parts: Vec<String> = importer.split('/').map(|s| s.to_string()).collect();
    parts.pop(); // drop the importing file's name
    for seg in source.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other.to_string()),
        }
    }
    let joined = parts.join("/");
    let candidates = [
        joined.clone(),
        format!("{joined}.ts"),
        format!("{joined}.tsx"),
        format!("{joined}.js"),
        format!("{joined}.jsx"),
        format!("{joined}.mjs"),
        format!("{joined}.vue"),
        format!("{joined}.svelte"),
        format!("{joined}/index.ts"),
        format!("{joined}/index.tsx"),
        format!("{joined}/index.js"),
        format!("{joined}/index.jsx"),
    ];
    for c in candidates.iter() {
        if fileset.contains(c.as_str()) {
            return Some(c.clone());
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Duplication
// ---------------------------------------------------------------------------

pub(crate) fn accumulate_duplication(f: &RawFile, map: &mut HashMap<u64, DupAcc>) {
    let norm: Vec<String> = f
        .content
        .lines()
        .filter_map(|l| normalize_code_line(l, &f.language))
        .collect();
    if norm.len() < DUP_WINDOW {
        return;
    }
    let mut i = 0;
    while i + DUP_WINDOW <= norm.len() {
        let window = &norm[i..i + DUP_WINDOW];
        let fp = hash_window(window);
        let acc = map.entry(fp).or_insert_with(|| DupAcc {
            line_count: DUP_WINDOW,
            occurrences: 0,
            files: Vec::new(),
            sample: window.join("\n"),
        });
        acc.occurrences += 1;
        if !acc.files.iter().any(|x| x == &f.rel_path) {
            acc.files.push(f.rel_path.clone());
        }
        i += DUP_WINDOW; // non-overlapping windows
    }
}

pub(crate) fn normalize_code_line(raw: &str, lang: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() || is_comment_start(t, lang) {
        return None;
    }
    let alnum = t.chars().filter(|c| c.is_alphanumeric()).count();
    if alnum < 3 {
        return None;
    }
    let collapsed = t.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.len() < 12 {
        return None;
    }
    Some(collapsed)
}

pub(crate) fn hash_window(window: &[String]) -> u64 {
    let mut h = DefaultHasher::new();
    for l in window {
        l.hash(&mut h);
        0xFFu8.hash(&mut h);
    }
    h.finish()
}

// ---------------------------------------------------------------------------
// Secret detection
// ---------------------------------------------------------------------------

pub(crate) fn scan_security(path: &str, content: &str, pats: &Patterns, out: &mut Vec<SecurityFinding>) {
    for (idx, line) in content.lines().enumerate() {
        if line.len() > 400 {
            continue; // skip minified / data lines
        }
        if pats.sec_private_key.is_match(line) {
            out.push(make_finding(path, idx, "Private key material", "high", line, ""));
        } else if let Some(m) = pats.sec_aws.find(line) {
            out.push(make_finding(
                path,
                idx,
                "AWS access key",
                "high",
                line,
                m.as_str(),
            ));
        } else if let Some(caps) = pats.sec_assign.captures(line) {
            let val = caps.get(2).map(|x| x.as_str()).unwrap_or("");
            out.push(make_finding(path, idx, "Hardcoded secret", "medium", line, val));
        }
    }
}

pub(crate) fn make_finding(
    path: &str,
    idx: usize,
    kind: &str,
    severity: &str,
    line: &str,
    secret: &str,
) -> SecurityFinding {
    let masked = if secret.is_empty() {
        line.trim().to_string()
    } else {
        line.trim().replace(secret, "«redacted»")
    };
    SecurityFinding {
        file: path.to_string(),
        line: idx + 1,
        kind: kind.to_string(),
        severity: severity.to_string(),
        snippet: truncate(&masked, 160),
    }
}

pub(crate) fn severity_rank(s: &str) -> u8 {
    match s {
        "high" => 0,
        "medium" => 1,
        "low" => 2,
        _ => 3,
    }
}

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------


