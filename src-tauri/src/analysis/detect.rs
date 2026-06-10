use super::defs::*;
use crate::models::Responsibility;

// Artifact typing lives in `artifact.rs`; re-exported so callers keep using
// `detect::*` unchanged.
pub(crate) use super::artifact::{detect_artifact_type, find_decl_line, primary_symbol};

/// Which runtime flag a matched rule raises (index into the flag array).
#[derive(Clone, Copy)]
enum Signal {
    PathServer = 0,
    PathClient = 1,
    NodeServer = 2,
    React = 3,
}

/// Where a runtime rule's token is matched.
#[derive(Clone, Copy)]
enum Probe {
    PathContains,
    PathStartsWith,
    ContentContains,
}

/// Ordered rule table for runtime detection: (probe, token) -> signal.
/// Path signals win over content; React evidence vetoes Node-server evidence
/// (see the decision at the end of `detect_runtime`).
const RUNTIME_RULES: &[(Probe, &str, Signal)] = &[
    (Probe::PathContains, "server/", Signal::PathServer),
    (Probe::PathContains, "backend/", Signal::PathServer),
    (Probe::PathStartsWith, "api/", Signal::PathServer),
    (Probe::PathContains, "/functions/", Signal::PathServer),
    (Probe::PathContains, "client/", Signal::PathClient),
    (Probe::PathContains, "frontend/", Signal::PathClient),
    (Probe::PathContains, "/web/", Signal::PathClient),
    (Probe::PathContains, "src/components/", Signal::PathClient),
    (Probe::PathContains, "src/hooks/", Signal::PathClient),
    (Probe::PathContains, "src/pages/", Signal::PathClient),
    (Probe::PathContains, "src/app", Signal::PathClient),
    (Probe::ContentContains, "http.createServer", Signal::NodeServer),
    (Probe::ContentContains, "createServer(", Signal::NodeServer),
    (Probe::ContentContains, "express(", Signal::NodeServer),
    (Probe::ContentContains, "WebSocketServer", Signal::NodeServer),
    (Probe::ContentContains, "app.listen", Signal::NodeServer),
    (Probe::ContentContains, "require('http')", Signal::NodeServer),
    (Probe::ContentContains, "from \"http\"", Signal::NodeServer),
    (Probe::ContentContains, "from \"react\"", Signal::React),
    (Probe::ContentContains, "from 'react'", Signal::React),
    (Probe::ContentContains, "react-dom", Signal::React),
    (Probe::ContentContains, "useState(", Signal::React),
    (Probe::ContentContains, "useEffect(", Signal::React),
    (Probe::ContentContains, "/>", Signal::React),
];

pub(crate) fn detect_runtime(rel_path: &str, content: &str) -> String {
    let p = rel_path.to_ascii_lowercase();
    let mut flags = [false; 4];
    for (probe, token, signal) in RUNTIME_RULES {
        let hit = match probe {
            Probe::PathContains => p.contains(token),
            Probe::PathStartsWith => p.starts_with(token),
            Probe::ContentContains => content.contains(token),
        };
        if hit {
            flags[*signal as usize] = true;
        }
    }
    let path_server = flags[Signal::PathServer as usize];
    let path_client = flags[Signal::PathClient as usize];
    let node_server = flags[Signal::NodeServer as usize];
    let reactish = flags[Signal::React as usize];
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
    strip_c_like(content, &['\'', '"', '`'], blank_strings)
}

/// Shared C-style stripping state machine: blank `//` and `/* */` comments;
/// any char in `quotes` opens a string literal. Newlines always survive so
/// line numbers stay aligned. Used by `sanitize` above (JS/TS quotes) and by
/// the Rust view in `analysis::complexity` (where `'` is NOT a string opener —
/// char literals and lifetimes).
pub(crate) fn strip_c_like(content: &str, quotes: &[char], blank_strings: bool) -> String {
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
                } else if quotes.contains(&c) {
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
    } else if lang == "Lua" {
        super::lua::sanitize_lua(content, false)
    } else {
        content.to_string()
    }
}

/// Comment- AND string-free view — for responsibility matching, where a real API
/// usage is always code, never a string literal or a translation value. Lua keeps
/// strings: FiveM evidence legitimately includes quoted export names like
/// `exports['oxmysql']`.
pub(crate) fn code_for_resp(content: &str, lang: &str) -> String {
    if is_jsts(lang) {
        sanitize(content, true)
    } else if lang == "Lua" {
        super::lua::sanitize_lua(content, false)
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
    // as string literals is not a WebSocket server). Lua files run only the
    // fivem_* tiers; JS/TS files run everything (FiveM also has a JS runtime).
    let is_lua = lang == "Lua";
    if !is_jsts(lang) && !is_lua {
        return Vec::new();
    }
    let mut out: Vec<Responsibility> = Vec::new();
    for (kind, tiers) in RESP_DEFS {
        if is_lua && !kind.starts_with("fivem_") {
            continue;
        }
        if let Some(r) = detect_one(content, kind, tiers) {
            out.push(r);
        }
    }
    out
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

