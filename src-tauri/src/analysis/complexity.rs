//! Cyclomatic complexity: CC = 1 + decision points inside a function span.
//! Counting runs on a comment- and string-free view so keywords inside
//! literals or comments never inflate the score.

use super::detect::{count_ident, sanitize, strip_c_like};

/// Language families with distinct decision-point token sets.
enum CcLang {
    CFamily, // TS/JS/Vue/Svelte/Java/C/C++/C#/Go/Kotlin/Swift/Dart/PHP/Scala
    Rust,
    Python,
    Lua,
    Unknown,
}

fn cc_lang(lang: &str) -> CcLang {
    match lang {
        "TypeScript" | "JavaScript" | "Vue" | "Svelte" | "Java" | "C" | "C++" | "C#" | "Go"
        | "Kotlin" | "Swift" | "Dart" | "PHP" | "Scala" => CcLang::CFamily,
        "Rust" => CcLang::Rust,
        "Python" => CcLang::Python,
        "Lua" => CcLang::Lua,
        _ => CcLang::Unknown,
    }
}

/// Comment- and string-free view for complexity counting. Newlines are
/// preserved so function line spans still align. Lua files are pre-sanitized
/// by `lua::sanitize_lua` and never reach this function.
pub(crate) fn strip_for_cc(content: &str, lang: &str) -> String {
    match cc_lang(lang) {
        CcLang::CFamily => sanitize(content, true),
        CcLang::Rust => strip_rust(content),
        CcLang::Python => strip_python(content),
        _ => content.to_string(),
    }
}

/// Rust view: `//` + `/* */` comments and `"` strings blanked. Single quotes
/// are NOT treated as string openers (char literals / lifetimes).
fn strip_rust(content: &str) -> String {
    strip_c_like(content, &['"'], true)
}

/// Python view: `#` comments and string literals (incl. triple-quoted) blanked.
fn strip_python(content: &str) -> String {
    let b = content.as_bytes();
    let mut out = String::with_capacity(b.len());
    let mut i = 0usize;
    // (quote byte, is_triple) when inside a string.
    let mut in_str: Option<(u8, bool)> = None;
    let mut in_comment = false;
    while i < b.len() {
        let c = b[i];
        if in_comment {
            if c == b'\n' { out.push('\n'); in_comment = false; } else { out.push(' '); }
            i += 1;
            continue;
        }
        if let Some((q, triple)) = in_str {
            if c == b'\\' && !triple {
                out.push(' ');
                if i + 1 < b.len() && b[i + 1] != b'\n' { out.push(' '); i += 2; } else { i += 1; }
            } else if c == q && (!triple || (i + 2 < b.len() && b[i + 1] == q && b[i + 2] == q)) {
                if triple { out.push_str("   "); i += 3; } else { out.push(c as char); i += 1; }
                in_str = None;
            } else {
                out.push(if c == b'\n' { '\n' } else { ' ' });
                i += 1;
            }
            continue;
        }
        if c == b'#' {
            out.push(' ');
            in_comment = true;
            i += 1;
        } else if c == b'\'' || c == b'"' {
            if i + 2 < b.len() && b[i + 1] == c && b[i + 2] == c {
                out.push_str("   ");
                in_str = Some((c, true));
                i += 3;
            } else {
                out.push(c as char);
                in_str = Some((c, false));
                i += 1;
            }
        } else {
            // Copy raw bytes (UTF-8 sequences pass through untouched).
            let ch_len = utf8_len(c);
            out.push_str(std::str::from_utf8(&b[i..i + ch_len]).unwrap_or(" "));
            i += ch_len;
        }
    }
    out
}

fn utf8_len(first: u8) -> usize {
    match first {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        _ => 4,
    }
}

/// CC of the function spanning `length` lines from `start` (0-based) in the
/// pre-sanitized `lines` view.
pub(crate) fn complexity_of(lines: &[&str], start: usize, length: usize, lang: &str) -> usize {
    let kind = cc_lang(lang);
    if matches!(kind, CcLang::Unknown) || start >= lines.len() {
        return 1;
    }
    let end = (start + length).min(lines.len());
    let mut points = 0usize;
    for line in &lines[start..end] {
        points += decision_points(line, &kind);
    }
    1 + points
}

fn decision_points(line: &str, kind: &CcLang) -> usize {
    let (kws, symbols, ternary): (&[&str], bool, bool) = match kind {
        CcLang::CFamily => (&["if", "for", "while", "case", "catch"], true, true),
        CcLang::Rust => (&["if", "for", "while", "loop", "match"], true, false),
        CcLang::Python => (&["if", "elif", "for", "while", "and", "or", "except"], false, false),
        CcLang::Lua => (&["if", "elseif", "for", "while", "repeat", "and", "or"], false, false),
        CcLang::Unknown => return 0,
    };
    let mut n = 0usize;
    for kw in kws {
        n += count_ident(line, kw);
    }
    if symbols {
        n += line.matches("&&").count() + line.matches("||").count();
    }
    if ternary {
        n += count_ternary(line);
    }
    n
}

/// Count ternary `?` — never `?.`, `??`, or `?:` (TS optional members/params).
fn count_ternary(line: &str) -> usize {
    let b = line.as_bytes();
    let mut n = 0usize;
    for i in 0..b.len() {
        if b[i] != b'?' {
            continue;
        }
        let next = b.get(i + 1).copied();
        if matches!(next, Some(b'.') | Some(b'?') | Some(b':')) {
            continue;
        }
        if i > 0 && b[i - 1] == b'?' {
            continue;
        }
        n += 1;
    }
    n
}
