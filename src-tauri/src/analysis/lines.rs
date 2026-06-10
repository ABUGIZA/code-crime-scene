//! Line classification: total / blank / comment counts per language, plus the
//! comment-token table shared with duplication filtering.

use super::defs::CommentTokens;

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
