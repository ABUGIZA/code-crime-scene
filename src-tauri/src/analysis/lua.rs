//! Lua / FiveM support: sanitizer, keyword-balance function measurement,
//! `require` resolution, runtime detection and artifact typing.

use super::defs::{ImportItem, Patterns};
use super::detect::{find_token, line_index};
use crate::models::Responsibility;
use std::collections::HashSet;

/// Blank Lua comments (`--`, `--[[ ]]`); when `blank_strings`, also blank the
/// interior of `'`/`"`/`[[ ]]` string literals. Newlines are preserved so line
/// numbers still align.
pub(crate) fn sanitize_lua(content: &str, blank_strings: bool) -> String {
    let b = content.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut st = LuaState::Code;
    let mut i = 0usize;
    while i < b.len() {
        i += sanitize_step(b, i, blank_strings, &mut st, &mut out);
    }
    String::from_utf8(out).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

/// Sanitizer state: outside any literal, in a `--` line comment, a `--[[ ]]`
/// block comment, a `[[ ]]` long string, or a `'`/`"` quoted string.
enum LuaState {
    Code,
    Line,
    Block,
    Long,
    Str(u8),
}

/// Process one position `i`, appending to `out`, possibly transitioning `st`.
/// Returns how many bytes were consumed.
fn sanitize_step(
    b: &[u8],
    i: usize,
    blank_strings: bool,
    st: &mut LuaState,
    out: &mut Vec<u8>,
) -> usize {
    let c = b[i];
    match st {
        LuaState::Code => sanitize_code_step(b, i, st, out),
        LuaState::Line => {
            out.push(if c == b'\n' { *st = LuaState::Code; b'\n' } else { b' ' });
            1
        }
        LuaState::Block | LuaState::Long => sanitize_block_step(b, i, blank_strings, st, out),
        LuaState::Str(q) => sanitize_str_step(b, i, *q, blank_strings, st, out),
    }
}

/// True when bytes at `i` and `i+1` are exactly `x` then `y`.
fn pair(b: &[u8], i: usize, x: u8, y: u8) -> bool {
    b[i] == x && i + 1 < b.len() && b[i + 1] == y
}

/// Handle one byte while in code: open comments, long/quoted strings, or copy.
fn sanitize_code_step(b: &[u8], i: usize, st: &mut LuaState, out: &mut Vec<u8>) -> usize {
    let c = b[i];
    if pair(b, i, b'-', b'-') {
        if i + 3 < b.len() && b[i + 2] == b'[' && b[i + 3] == b'[' {
            out.extend_from_slice(b"    ");
            *st = LuaState::Block;
            4
        } else {
            out.extend_from_slice(b"  ");
            *st = LuaState::Line;
            2
        }
    } else if pair(b, i, b'[', b'[') {
        out.extend_from_slice(b"[[");
        *st = LuaState::Long;
        2
    } else if c == b'\'' || c == b'"' {
        out.push(c);
        *st = LuaState::Str(c);
        1
    } else {
        out.push(c);
        1
    }
}

/// Handle one byte inside a `--[[ ]]` block comment or a `[[ ]]` long string.
fn sanitize_block_step(b: &[u8], i: usize, blank_strings: bool, st: &mut LuaState, out: &mut Vec<u8>) -> usize {
    let c = b[i];
    let is_comment = matches!(st, LuaState::Block);
    if pair(b, i, b']', b']') {
        out.extend_from_slice(if is_comment { b"  " } else { b"]]" });
        *st = LuaState::Code;
        2
    } else if c == b'\n' {
        out.push(b'\n');
        1
    } else {
        // Long strings keep content unless blanking; comments always blank.
        out.push(if is_comment || blank_strings { b' ' } else { c });
        1
    }
}

/// Handle one byte while inside a `'`/`"` quoted string.
fn sanitize_str_step(
    b: &[u8],
    i: usize,
    q: u8,
    blank_strings: bool,
    st: &mut LuaState,
    out: &mut Vec<u8>,
) -> usize {
    let c = b[i];
    if c == b'\\' {
        out.push(if blank_strings { b' ' } else { c });
        if i + 1 < b.len() && b[i + 1] != b'\n' {
            out.push(if blank_strings { b' ' } else { b[i + 1] });
            2
        } else {
            1
        }
    } else if c == q {
        out.push(c);
        *st = LuaState::Code;
        1
    } else if c == b'\n' {
        out.push(b'\n');
        *st = LuaState::Code; // unterminated single-line string: bail out
        1
    } else {
        out.push(if blank_strings { b' ' } else { c });
        1
    }
}

/// Function length via keyword balance over pre-sanitized lines. Openers:
/// `function`, `if`, `for`, `while`, `repeat`, standalone `do` (a `do` closing
/// a `for`/`while` header is NOT an opener). Closers: `end`, `until`.
pub(crate) fn measure_lua_block(lines: &[&str], start: usize) -> Option<usize> {
    let mut depth: i32 = 0;
    let mut seen = false;
    let mut pending_do = false;
    let mut i = start;
    while i < lines.len() {
        for tok in words(lines[i]) {
            match tok {
                "function" | "if" | "repeat" => {
                    depth += 1;
                    seen = true;
                }
                "for" | "while" => {
                    depth += 1;
                    seen = true;
                    pending_do = true;
                }
                "do" => {
                    if pending_do {
                        pending_do = false;
                    } else {
                        depth += 1;
                        seen = true;
                    }
                }
                "end" | "until" => {
                    depth -= 1;
                    if seen && depth <= 0 {
                        return Some(i - start + 1);
                    }
                }
                _ => {}
            }
        }
        if i - start > 3000 {
            break;
        }
        i += 1;
    }
    None
}

/// Iterate identifier-like words ([A-Za-z_][A-Za-z0-9_]*) of a line in order.
fn words(line: &str) -> impl Iterator<Item = &str> {
    line.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .filter(|w| !w.is_empty() && !w.as_bytes()[0].is_ascii_digit())
}

/// Parse `require("a.b")` / `require 'a.b'` / `require("a/b")` into import
/// items with a dotted source. Lua requires resolve from the project root.
pub(crate) fn parse_lua_requires(content: &str, pats: &Patterns) -> Vec<ImportItem> {
    let mut out = Vec::new();
    for caps in pats.lua_require.captures_iter(content) {
        let raw = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        if raw.is_empty() {
            continue;
        }
        let start = caps.get(0).unwrap().start();
        out.push(ImportItem {
            local_names: Vec::new(),
            source: raw.replace('/', "."),
            line: line_index(content, start) + 1,
            is_relative: true,
        });
    }
    out
}

/// Resolve a dotted Lua module to a project-root-relative file:
/// `a.b` -> `a/b.lua` or `a/b/init.lua`.
pub(crate) fn resolve_lua(source: &str, fileset: &HashSet<&str>) -> Option<String> {
    let base = source.replace('.', "/");
    for c in [format!("{base}.lua"), format!("{base}/init.lua")] {
        if fileset.contains(c.as_str()) {
            return Some(c);
        }
    }
    None
}

const FIVEM_SERVER_TOKENS: &[&str] = &["TriggerClientEvent(", "MySQL.", "oxmysql", "RegisterServerEvent"];
const FIVEM_CLIENT_TOKENS: &[&str] = &["PlayerPedId(", "SendNUIMessage(", "GetEntityCoords("];

fn has_any(code: &str, tokens: &[&str]) -> bool {
    tokens.iter().any(|t| find_token(code, t).is_some())
}

fn is_manifest_name(name: &str) -> bool {
    name == "fxmanifest.lua" || name == "__resource.lua"
}

/// Lua runtime: path wins (client/server/shared); FiveM natives break ties.
pub(crate) fn detect_lua_runtime(rel_path: &str, code: &str) -> String {
    let p = rel_path.to_ascii_lowercase();
    let name = p.rsplit('/').next().unwrap_or(&p);
    if is_manifest_name(name) {
        return "shared".into();
    }
    if p.contains("client") {
        return "client".into();
    }
    if p.contains("server") {
        return "server".into();
    }
    if p.contains("shared") {
        return "shared".into();
    }
    if has_any(code, FIVEM_SERVER_TOKENS) {
        return "server".into();
    }
    if has_any(code, FIVEM_CLIENT_TOKENS) {
        return "client".into();
    }
    "shared".into()
}

/// Artifact type for Lua files: FiveM manifest / client / server / shared
/// script when FiveM evidence is present, otherwise a plain Lua module.
pub(crate) fn lua_artifact_type(
    rel_path: &str,
    runtime: &str,
    resp: &[Responsibility],
    code: &str,
) -> String {
    let p = rel_path.to_ascii_lowercase();
    let name = p.rsplit('/').next().unwrap_or(&p);
    if is_manifest_name(name) {
        return "fivem_manifest".into();
    }
    let fivem = resp.iter().any(|r| r.kind.starts_with("fivem_"))
        || has_any(code, FIVEM_SERVER_TOKENS)
        || has_any(code, FIVEM_CLIENT_TOKENS);
    if fivem {
        return match runtime {
            "client" => "fivem_client_script".into(),
            "server" => "fivem_server_script".into(),
            _ => "fivem_shared_script".into(),
        };
    }
    "lua_module".into()
}
