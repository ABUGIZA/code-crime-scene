use super::defs::*;
use super::detect::line_index;
use regex::Regex;

pub(crate) fn comment_tokens(lang: &str) -> CommentTokens {
    match lang {
        "Rust" | "TypeScript" | "JavaScript" | "Java" | "C" | "C++" | "C#" | "Go" | "Kotlin"
        | "Swift" | "PHP" | "Scala" | "Dart" | "Vue" | "Svelte" => CommentTokens {
            line: Some("//"),
            block_open: Some("/*"),
            block_close: Some("*/"),
        },
        "CSS" => CommentTokens {
            line: None,
            block_open: Some("/*"),
            block_close: Some("*/"),
        },
        "Python" | "Shell" | "YAML" | "TOML" => CommentTokens {
            line: Some("#"),
            block_open: None,
            block_close: None,
        },
        "Ruby" => CommentTokens {
            line: Some("#"),
            block_open: Some("=begin"),
            block_close: Some("=end"),
        },
        "Lua" => CommentTokens {
            line: Some("--"),
            block_open: Some("--[["),
            block_close: Some("]]"),
        },
        "SQL" => CommentTokens {
            line: Some("--"),
            block_open: Some("/*"),
            block_close: Some("*/"),
        },
        "HTML" | "Markdown" => CommentTokens {
            line: None,
            block_open: Some("<!--"),
            block_close: Some("-->"),
        },
        _ => CommentTokens {
            line: None,
            block_open: None,
            block_close: None,
        },
    }
}

/// Returns (total, blank, comment) line counts.
pub(crate) fn classify_lines(content: &str, lang: &str) -> (usize, usize, usize) {
    let cc = comment_tokens(lang);
    let mut total = 0usize;
    let mut blank = 0usize;
    let mut comment = 0usize;
    let mut in_block = false;

    for raw in content.lines() {
        total += 1;
        let t = raw.trim();
        if t.is_empty() {
            blank += 1;
            continue;
        }
        if in_block {
            comment += 1;
            if let Some(close) = cc.block_close {
                if t.contains(close) {
                    in_block = false;
                }
            }
            continue;
        }
        let mut is_comment = false;
        if let Some(line_tok) = cc.line {
            if t.starts_with(line_tok) {
                is_comment = true;
            }
        }
        if !is_comment {
            if let (Some(open), Some(close)) = (cc.block_open, cc.block_close) {
                if t.starts_with(open) {
                    is_comment = true;
                    let rest = &t[open.len().min(t.len())..];
                    if !rest.contains(close) {
                        in_block = true;
                    }
                }
            }
        }
        if is_comment {
            comment += 1;
        }
    }
    (total, blank, comment)
}

pub(crate) fn is_comment_start(t: &str, lang: &str) -> bool {
    let c = comment_tokens(lang);
    if let Some(l) = c.line {
        if t.starts_with(l) {
            return true;
        }
    }
    if let Some(o) = c.block_open {
        if t.starts_with(o) {
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Function detection & sizing
// ---------------------------------------------------------------------------

pub(crate) fn detect_functions(content: &str, lang: &str, pats: &Patterns) -> Vec<FuncHit> {
    let mut hits = Vec::new();
    match lang {
        "Rust" => collect_hits(&pats.rust_fn, content, &mut hits),
        "TypeScript" | "JavaScript" | "Vue" | "Svelte" => {
            collect_hits(&pats.ts_func_function, content, &mut hits);
            collect_hits(&pats.ts_func_arrow, content, &mut hits);
        }
        "Python" => collect_hits(&pats.py_def, content, &mut hits),
        "Go" => collect_hits(&pats.go_func, content, &mut hits),
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
// Responsibility & file-type detection (for mixed-responsibility findings)
// ---------------------------------------------------------------------------

/// Where the file runs: client / server / shared. Path wins; content is the
/// tie-breaker. This is what stops a client `App.tsx` being called a server.

pub(crate) fn measure_function(lines: &[&str], start: usize, lang: &str) -> usize {
    if lang == "Python" {
        measure_python_block(lines, start)
    } else {
        measure_brace_block(lines, start).unwrap_or(1)
    }
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

// ---------------------------------------------------------------------------
// Imports (unused + dependency graph)
// ---------------------------------------------------------------------------


