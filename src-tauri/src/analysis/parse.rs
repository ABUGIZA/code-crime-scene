use super::defs::*;
use super::detect::*;
use super::lua::parse_lua_requires;
use crate::scanner::RawFile;
use std::collections::HashSet;

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
        "Lua" => parse_lua_requires(content, pats),
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


