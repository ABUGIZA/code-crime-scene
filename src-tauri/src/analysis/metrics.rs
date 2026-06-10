//! Function detection and sizing: regex hits per language, brace/indent/keyword
//! block measurement, and statement-bounded measurement for JS/TS expression
//! arrows (line classification lives in `lines.rs`).

use super::defs::*;
use super::detect::line_index;
use regex::Regex;

// ---------------------------------------------------------------------------
// Function detection
// ---------------------------------------------------------------------------

pub(crate) fn detect_functions(content: &str, lang: &str, pats: &Patterns) -> Vec<FuncHit> {
    let mut hits = Vec::new();
    match lang {
        "Rust" => collect_hits(&pats.rust_fn, content, &mut hits),
        "TypeScript" | "JavaScript" | "Vue" | "Svelte" => {
            collect_hits(&pats.ts_func_function, content, &mut hits);
            collect_arrow_hits(&pats.ts_func_arrow, content, &mut hits);
        }
        "Python" => collect_hits(&pats.py_def, content, &mut hits),
        "Go" => collect_hits(&pats.go_func, content, &mut hits),
        // Lua content arrives pre-sanitized (comments/strings blanked).
        "Lua" => {
            collect_hits(&pats.lua_func_decl, content, &mut hits);
            collect_hits(&pats.lua_func_assign, content, &mut hits);
        }
        "Java" | "C" | "C++" | "C#" | "Kotlin" | "Swift" | "Scala" | "Dart" | "PHP" => {
            for caps in pats.generic_method.captures_iter(content) {
                if let Some(m) = caps.get(1) {
                    let name = m.as_str();
                    if is_control_keyword(name) {
                        continue;
                    }
                    let start = caps.get(0).unwrap().start();
                    hits.push(FuncHit {
                        name: name.to_string(),
                        start_line: line_index(content, start),
                        arrow: None,
                    });
                }
            }
        }
        _ => {}
    }
    hits
}

pub(crate) fn collect_hits(re: &Regex, content: &str, hits: &mut Vec<FuncHit>) {
    for caps in re.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            let start = caps.get(0).unwrap().start();
            hits.push(FuncHit {
                name: m.as_str().to_string(),
                start_line: line_index(content, start),
                arrow: None,
            });
        }
    }
}

/// Arrow-function hits also record where their `=>` ends (the arrow pattern
/// matches up to and including `=>`), so the measurer can tell expression
/// bodies from braced bodies.
pub(crate) fn collect_arrow_hits(re: &Regex, content: &str, hits: &mut Vec<FuncHit>) {
    for caps in re.captures_iter(content) {
        if let Some(m) = caps.get(1) {
            let all = caps.get(0).unwrap();
            let after = all.end(); // byte offset just past `=>`
            let line_start = content[..after].rfind('\n').map(|i| i + 1).unwrap_or(0);
            hits.push(FuncHit {
                name: m.as_str().to_string(),
                start_line: line_index(content, all.start()),
                arrow: Some((line_index(content, after), after - line_start)),
            });
        }
    }
}

pub(crate) fn is_control_keyword(name: &str) -> bool {
    matches!(
        name,
        "if" | "for"
            | "while"
            | "switch"
            | "catch"
            | "else"
            | "do"
            | "return"
            | "new"
            | "delete"
            | "sizeof"
            | "throw"
            | "with"
            | "case"
            | "using"
            | "lock"
            | "await"
            | "yield"
            | "match"
    )
}

// ---------------------------------------------------------------------------
// Function sizing
// ---------------------------------------------------------------------------

pub(crate) fn measure_function(lines: &[&str], hit: &FuncHit, lang: &str) -> usize {
    if lang == "Python" {
        return measure_python_block(lines, hit.start_line);
    }
    if lang == "Lua" {
        // Lua lines arrive pre-sanitized (see analyze_file).
        return super::lua::measure_lua_block(lines, hit.start_line).unwrap_or(1);
    }
    // JS/TS arrow with an expression body (no `{` after `=>`): brace counting
    // would latch onto a LATER function's braces and swallow its code, so the
    // function ends at its statement terminator instead.
    if let Some((al, ac)) = hit.arrow {
        if !arrow_body_is_braced(lines, al, ac) {
            let end = arrow_expr_end(lines, al, ac);
            return end.saturating_sub(hit.start_line) + 1;
        }
    }
    measure_brace_block(lines, hit.start_line).unwrap_or(1)
}

/// True when the arrow body starting at (line, col) — just after `=>` —
/// opens with `{` (a braced body). Skips whitespace, crossing line breaks.
fn arrow_body_is_braced(lines: &[&str], line: usize, col: usize) -> bool {
    let mut i = line;
    let mut c = col;
    while i < lines.len() && i <= line + 4 {
        let rest = lines[i].get(c..).unwrap_or("");
        for ch in rest.chars() {
            if ch.is_whitespace() {
                continue;
            }
            return ch == '{';
        }
        i += 1;
        c = 0;
    }
    false
}

/// 0-based line where a brace-less arrow body's statement ends. Tracks
/// (), [], {} nesting from just after the `=>` (string interiors ignored);
/// the expression is complete on the first line where nesting is back at
/// zero and nothing continues the statement (trailing `;`/`,`, or neither
/// side of the line break carries a continuation token).
fn arrow_expr_end(lines: &[&str], line: usize, col: usize) -> usize {
    let mut depth: i32 = 0;
    let mut in_str: Option<char> = None;
    let mut i = line;
    while i < lines.len() {
        let raw = if i == line { lines[i].get(col..).unwrap_or("") } else { lines[i] };
        let eff = scan_expr_line(raw, &mut depth, &mut in_str);
        if depth < 0 {
            return i; // the enclosing scope closed around us — stop here
        }
        if depth == 0 && in_str.is_none() && statement_ends(&eff, lines, i) {
            return i;
        }
        if i - line > 400 {
            return i; // runaway guard
        }
        i += 1;
    }
    lines.len().saturating_sub(1)
}

/// At bracket depth 0: is the statement complete at the end of this line?
/// A trailing `;`/`,` always ends it; otherwise the line must be non-empty
/// and neither side of the line break may carry a continuation token.
fn statement_ends(eff: &str, lines: &[&str], i: usize) -> bool {
    let t = eff.trim_end();
    if t.ends_with(';') || t.ends_with(',') {
        return true;
    }
    !t.is_empty() && !ends_with_continuation(t) && !next_line_continues(lines, i)
}

/// Scan one line of an arrow expression: update bracket `depth` and string
/// state, stop at a `//` comment, and return the effective text with string
/// interiors blanked (so a `;` inside a literal never ends the statement).
fn scan_expr_line(raw: &str, depth: &mut i32, in_str: &mut Option<char>) -> String {
    let mut eff = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    let mut esc = false;
    while let Some(c) = chars.next() {
        if let Some(q) = *in_str {
            if esc {
                esc = false;
                eff.push(' ');
            } else if c == '\\' {
                esc = true;
                eff.push(' ');
            } else if c == q {
                *in_str = None;
                eff.push(c);
            } else {
                eff.push(' ');
            }
            continue;
        }
        match c {
            '/' if chars.peek() == Some(&'/') => break, // line comment
            '\'' | '"' | '`' => {
                *in_str = Some(c);
                eff.push(c);
            }
            '(' | '[' | '{' => {
                *depth += 1;
                eff.push(c);
            }
            ')' | ']' | '}' => {
                *depth -= 1;
                eff.push(c);
            }
            _ => eff.push(c),
        }
    }
    // Plain quotes never span lines; only template literals do.
    if matches!(*in_str, Some('\'') | Some('"')) {
        *in_str = None;
    }
    eff
}

/// Trailing characters that always continue a JS/TS expression onto the next
/// line (operators, member dots, open brackets, `=>` via its `>`...).
fn ends_with_continuation(t: &str) -> bool {
    matches!(
        t.chars().last(),
        Some(
            '(' | '[' | '{' | '.' | '+' | '-' | '*' | '/' | '%' | '&' | '|' | '^' | '<' | '>'
                | '=' | '?' | ':' | '~' | '!'
        )
    )
}

/// Leading tokens that continue an expression from the previous line
/// (method chain, ternary branches, logical/arithmetic operators, template).
const CONTINUATION_PREFIXES: &[&str] = &[".", "?", ":", "&&", "||", "+", "-", "*", "`"];

/// True when the next non-blank line begins with a token that continues the
/// current expression.
fn next_line_continues(lines: &[&str], i: usize) -> bool {
    for l in lines.iter().skip(i + 1) {
        let t = l.trim_start();
        if t.is_empty() {
            continue;
        }
        return CONTINUATION_PREFIXES.iter().any(|p| t.starts_with(p));
    }
    false
}

pub(crate) fn measure_brace_block(lines: &[&str], start: usize) -> Option<usize> {
    let mut depth: i32 = 0;
    let mut seen_open = false;
    let mut i = start;
    while i < lines.len() {
        for ch in lines[i].chars() {
            if ch == '{' {
                depth += 1;
                seen_open = true;
            } else if ch == '}' {
                depth -= 1;
            }
        }
        if seen_open && depth <= 0 {
            return Some(i - start + 1);
        }
        if i - start > 3000 {
            break;
        }
        i += 1;
    }
    None
}

pub(crate) fn indent_of(line: &str) -> usize {
    let mut n = 0;
    for c in line.chars() {
        match c {
            ' ' => n += 1,
            '\t' => n += 4,
            _ => break,
        }
    }
    n
}

pub(crate) fn measure_python_block(lines: &[&str], start: usize) -> usize {
    if start >= lines.len() {
        return 1;
    }
    let def_indent = indent_of(lines[start]);
    let mut end = start;
    let mut i = start + 1;
    while i < lines.len() {
        let l = lines[i];
        if !l.trim().is_empty() {
            if indent_of(l) <= def_indent {
                break;
            }
            end = i;
        }
        i += 1;
    }
    end - start + 1
}
