use super::defs::*;
use crate::models::Responsibility;

pub(crate) fn detect_runtime(rel_path: &str, content: &str) -> String {
    let p = rel_path.to_ascii_lowercase();
    let path_server = p.contains("server/") || p.contains("backend/") || p.starts_with("api/") || p.contains("/functions/");
    let path_client = p.contains("client/")
        || p.contains("frontend/")
        || p.contains("/web/")
        || p.contains("src/components/")
        || p.contains("src/hooks/")
        || p.contains("src/pages/")
        || p.contains("src/app");
    let node_server = content.contains("http.createServer")
        || content.contains("createServer(")
        || content.contains("express(")
        || content.contains("WebSocketServer")
        || content.contains("app.listen")
        || content.contains("require('http')")
        || content.contains("from \"http\"");
    let reactish = content.contains("from \"react\"")
        || content.contains("from 'react'")
        || content.contains("react-dom")
        || content.contains("useState(")
        || content.contains("useEffect(")
        || content.contains("/>");
    if path_server || (node_server && !reactish) {
        return "server".into();
    }
    if path_client || reactish {
        return "client".into();
    }
    "shared".into()
}

pub(crate) fn is_jsts(lang: &str) -> bool {
    matches!(lang, "TypeScript" | "JavaScript" | "Vue" | "Svelte")
}

/// Blank comment regions to spaces; if `blank_strings`, also blank the INTERIOR of
/// string/template literals (keeping the quotes). Newlines are preserved so line
/// numbers still line up. This is what stops the analyzer matching keywords that
/// only appear inside comments (`// reconnect`) or string literals (a pattern
/// table like `pats: &["new WebSocketServer"]`, or a translation value).
pub(crate) fn sanitize(content: &str, blank_strings: bool) -> String {
    enum S {
        Code,
        Line,
        Block,
        Str(char),
    }
    let mut out = String::with_capacity(content.len());
    let mut st = S::Code;
    let mut esc = false;
    let mut chars = content.chars().peekable();
    while let Some(c) = chars.next() {
        match st {
            S::Code => {
                if c == '/' && chars.peek() == Some(&'/') {
                    out.push(' ');
                    out.push(' ');
                    chars.next();
                    st = S::Line;
                } else if c == '/' && chars.peek() == Some(&'*') {
                    out.push(' ');
                    out.push(' ');
                    chars.next();
                    st = S::Block;
                } else if c == '\'' || c == '"' || c == '`' {
                    out.push(c);
                    esc = false;
                    st = S::Str(c);
                } else {
                    out.push(c);
                }
            }
            S::Line => {
                if c == '\n' {
                    out.push('\n');
                    st = S::Code;
                } else {
                    out.push(' ');
                }
            }
            S::Block => {
                if c == '*' && chars.peek() == Some(&'/') {
                    out.push(' ');
                    out.push(' ');
                    chars.next();
                    st = S::Code;
                } else if c == '\n' {
                    out.push('\n');
                } else {
                    out.push(' ');
                }
            }
            S::Str(q) => {
                let keep = !blank_strings || c == '\n';
                if esc {
                    esc = false;
                    out.push(if keep { c } else { ' ' });
                } else if c == '\\' {
                    esc = true;
                    out.push(if keep { c } else { ' ' });
                } else if c == q {
                    st = S::Code;
                    out.push(c);
                } else {
                    out.push(if keep { c } else { ' ' });
                }
            }
        }
    }
    out
}

/// Comment-free view (strings kept) — for runtime/artifact/declaration detection,
/// which legitimately reads import strings like `from "react"`.
pub(crate) fn code_view(content: &str, lang: &str) -> String {
    if is_jsts(lang) {
        sanitize(content, false)
    } else {
        content.to_string()
    }
}

/// Comment- AND string-free view — for responsibility matching, where a real API
/// usage is always code, never a string literal or a translation value.
pub(crate) fn code_for_resp(content: &str, lang: &str) -> String {
    if is_jsts(lang) {
        sanitize(content, true)
    } else {
        content.to_string()
    }
}

/// Pull verification commands from the project's root `package.json` scripts so
/// every PR suggestion can say exactly how to check the change (req #3).

pub(crate) fn find_token(content: &str, needle: &str) -> Option<usize> {
    let nb = needle.as_bytes();
    if nb.is_empty() {
        return None;
    }
    let bytes = content.as_bytes();
    let check_lead = is_ident_byte(nb[0]);
    let check_trail = is_ident_byte(nb[nb.len() - 1]);
    let mut from = 0usize;
    while let Some(rel) = content[from..].find(needle) {
        let pos = from + rel;
        let lead_ok = !check_lead || pos == 0 || !is_ident_byte(bytes[pos - 1]);
        let after = pos + needle.len();
        let trail_ok = !check_trail || after >= bytes.len() || !is_ident_byte(bytes[after]);
        if lead_ok && trail_ok {
            return Some(pos);
        }
        from = pos + needle.len();
    }
    None
}

/// The single trimmed source line that contains byte offset `off`, truncated.
pub(crate) fn snippet_at(content: &str, off: usize) -> String {
    let off = off.min(content.len());
    let start = content[..off].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let end = content[off..].find('\n').map(|i| off + i).unwrap_or(content.len());
    truncate(content[start..end].trim(), 100)
}

/// One strength tier of evidence for a responsibility. Tiers are ordered
/// strongest → weakest; the first tier with any match wins, so a real
/// instantiation/call always beats a bare import or type annotation.

pub(crate) fn detect_one(content: &str, kind: &str, tiers: &[Tier]) -> Option<Responsibility> {
    for tier in tiers {
        for &p in tier.pats {
            if let Some(off) = find_token(content, p) {
                return Some(Responsibility {
                    kind: kind.into(),
                    label: tier.label.into(),
                    evidence: tier.evidence.into(),
                    token: p.into(),
                    line: line_index(content, off) + 1,
                    snippet: snippet_at(content, off),
                });
            }
        }
    }
    None
}

/// Detect responsibilities with ranked evidence. `direct` means the file itself
/// drives the concern via a real usage/instantiation/call; `indirect` means it
/// consumes another module's state; `supporting` means only an import or type
/// reference was found (never enough on its own to claim the file owns the work).
pub(crate) fn detect_responsibilities(content: &str, lang: &str) -> Vec<Responsibility> {
    // The responsibility patterns are JS/TS idioms. Running them on Rust/JSON/etc.
    // only ever produces false positives (a Rust file that *defines* the patterns
    // as string literals is not a WebSocket server).
    if !is_jsts(lang) {
        return Vec::new();
    }
    let mut out: Vec<Responsibility> = Vec::new();
    for (kind, tiers) in RESP_DEFS {
        if let Some(r) = detect_one(content, kind, tiers) {
            out.push(r);
        }
    }
    out
}

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
    let is_ts_js = matches!(lang, "TypeScript" | "JavaScript");
    let is_tsx = ext == "tsx" || ext == "jsx";
    let has = |k: &str| resp.iter().any(|r| r.kind == k);

    if !is_ts_js {
        if lower_name.contains(".config.") {
            return "config".into();
        }
        return "other".into();
    }
    if lower_name.ends_with(".d.ts") || lower_name == "types.ts" || lower_name.ends_with(".types.ts") {
        return "types".into();
    }
    if lower_name.contains(".config.") {
        return "config".into();
    }
    // React hook — name-based, unambiguous.
    if stem.starts_with("use") && stem.len() > 3 && stem.as_bytes()[3].is_ascii_uppercase() {
        return "react_hook".into();
    }
    // Server-only artifacts — gated on server runtime (a client file can never be one).
    if runtime == "server" {
        let is_entry = matches!(lower_stem.as_str(), "index" | "server" | "app" | "main");
        if has("http_server") && is_entry {
            return "node_server".into();
        }
        if has("routes") {
            return "route_handler".into();
        }
        if has("http_server") {
            return "node_server".into();
        }
        // A server module (not an entrypoint) that bundles >=2 direct
        // responsibilities is a service module worth splitting — give it a real
        // reason instead of "large file".
        let direct_count = resp.iter().filter(|r| r.evidence == "direct").count();
        if direct_count >= 2 {
            return "node_service".into();
        }
    }
    // Name-based component types. These MUST precede the content-heuristic icon
    // check below, so a dialog that merely renders inline SVG icons (and a
    // `switch`) is never mis-stolen by the icon branch.
    if is_tsx
        && (lower_name.contains("dialog")
            || lower_name.contains("modal")
            || lower_name.contains("drawer")
            || lower_name.contains("sheet"))
    {
        return "react_dialog".into();
    }
    if is_tsx && lower_name.contains("icon") {
        return "react_icon".into();
    }
    if is_tsx && matches!(lower_stem.as_str(), "app" | "root" | "main") {
        return "react_root".into();
    }
    // Content-heuristic icon: a presentation-only SVG switch. Only when nothing
    // else claimed the file AND it carries NO responsibilities (no IO/state) —
    // an SVG-heavy component that fetches or opens sockets is not an icon file.
    let svg_count = content.matches("<svg").count() + content.matches("<path").count();
    if is_tsx && svg_count >= 6 && content.contains("switch") && resp.is_empty() {
        return "react_icon".into();
    }
    if is_tsx && (has("admin") || has("data_fetching") || has("state_machine")) {
        return "react_feature".into();
    }
    if is_tsx {
        return "react_component".into();
    }
    "utility".into()
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


pub(crate) fn clean_ident(s: &str) -> String {
    s.trim()
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '$')
        .collect()
}

pub(crate) fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

/// Count whole-identifier occurrences of `ident` in `content`.
pub(crate) fn count_ident(content: &str, ident: &str) -> usize {
    if ident.is_empty() {
        return 0;
    }
    let bytes = content.as_bytes();
    let ilen = ident.len();
    let mut count = 0usize;
    let mut from = 0usize;
    while let Some(rel) = content[from..].find(ident) {
        let pos = from + rel;
        let before_ok = pos == 0 || !is_ident_byte(bytes[pos - 1]);
        let after = pos + ilen;
        let after_ok = after >= bytes.len() || !is_ident_byte(bytes[after]);
        if before_ok && after_ok {
            count += 1;
        }
        from = pos + ilen;
    }
    count
}

pub(crate) fn line_index(content: &str, byte_off: usize) -> usize {
    let end = byte_off.min(content.len());
    content[..end].bytes().filter(|b| *b == b'\n').count()
}

pub(crate) fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(n).collect();
        out.push('…');
        out
    }
}

// ---------------------------------------------------------------------------
// Classification fixtures — guardrails against the false positives we fixed.
// ---------------------------------------------------------------------------

