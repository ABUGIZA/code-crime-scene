//! Pure parser for `git log --pretty=format:%H%x09%an%x09%at --numstat`
//! output. Kept free of process/filesystem access so it is unit-testable
//! without a git installation; aggregation lives in the parent module.

/// One `--numstat` line: additions/deletions for a single path in a commit.
pub struct FileChange {
    pub path: String,
    pub additions: usize,
    pub deletions: usize,
}

/// One commit header plus its parsed numstat lines.
pub struct LogCommit {
    pub author: String,
    pub timestamp: i64, // unix seconds (author date)
    pub files: Vec<FileChange>,
}

/// The whole parsed log, in git's output order (newest first).
pub struct ParsedLog {
    pub commits: Vec<LogCommit>,
}

/// Parse raw `git log` text: header lines `hash\tauthor\tunix_ts` interleaved
/// with numstat lines `additions\tdeletions\tpath`. Tolerates \r\n endings,
/// blank lines and unrecognized lines; never panics on malformed input.
pub fn parse_log(text: &str) -> ParsedLog {
    let mut commits: Vec<LogCommit> = Vec::new();

    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();

        // Commit header: hex hash, author (may itself contain tabs), unix ts.
        if parts.len() >= 3 && looks_like_hash(parts[0]) {
            if let Ok(ts) = parts[parts.len() - 1].trim().parse::<i64>() {
                commits.push(LogCommit {
                    author: parts[1..parts.len() - 1].join("\t"),
                    timestamp: ts,
                    files: Vec::new(),
                });
                continue;
            }
        }

        // Numstat line. `-` additions/deletions mark binary files: skip those.
        if parts.len() == 3 {
            if parts[0] == "-" || parts[1] == "-" {
                continue;
            }
            let (additions, deletions) = match (parts[0].parse(), parts[1].parse()) {
                (Ok(a), Ok(d)) => (a, d),
                _ => continue,
            };
            let path = normalize_path(parts[2]);
            if path.is_empty() {
                continue;
            }
            // Numstat lines before the first header have no home; drop them.
            if let Some(commit) = commits.last_mut() {
                commit.files.push(FileChange {
                    path,
                    additions,
                    deletions,
                });
            }
        }
    }

    ParsedLog { commits }
}

/// A commit hash: a long run of hex digits (full SHA-1 is 40, SHA-256 is 64).
/// Numstat counts are short, so length disambiguates the two line kinds.
fn looks_like_hash(s: &str) -> bool {
    s.len() >= 20 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Clean a numstat path: strip git's optional quoting, resolve rename arrows
/// to the NEW name, and normalize backslashes to forward slashes.
fn normalize_path(raw: &str) -> String {
    let mut path = raw.trim();
    if path.len() >= 2 && path.starts_with('"') && path.ends_with('"') {
        path = &path[1..path.len() - 1];
    }
    resolve_rename(path).replace('\\', "/")
}

/// Renames appear as `old => new` or `prefix/{old => new}/suffix`; keep the
/// new path. Empty sides (`{old => }`, `{ => new}`) collapse to a single `/`.
fn resolve_rename(path: &str) -> String {
    if let (Some(open), Some(close)) = (path.find('{'), path.find('}')) {
        if open < close {
            let inner = &path[open + 1..close];
            if let Some(arrow) = inner.find(" => ") {
                let combined = format!(
                    "{}{}{}",
                    &path[..open],
                    &inner[arrow + 4..],
                    &path[close + 1..]
                );
                return combined.replace("//", "/");
            }
        }
    }
    if let Some(arrow) = path.find(" => ") {
        return path[arrow + 4..].to_string();
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_rename_forms() {
        assert_eq!(resolve_rename("old.ts => new.ts"), "new.ts");
        assert_eq!(resolve_rename("src/{a => b}/mod.rs"), "src/b/mod.rs");
        assert_eq!(resolve_rename("a/{x => y}.ts"), "a/y.ts");
        assert_eq!(resolve_rename("a/{x => }/f.rs"), "a/f.rs");
        assert_eq!(resolve_rename("{ => sub}/f.rs"), "sub/f.rs");
        assert_eq!(resolve_rename("plain/path.rs"), "plain/path.rs");
    }

    #[test]
    fn skips_binary_and_garbage_lines_and_normalizes_backslashes() {
        let text = "1111111111111111111111111111111111111111\tAlice\t1700000000\n\
-\t-\timg/logo.png\n\
not a numstat line\n\
3\t1\tsrc\\win\\path.rs\n";
        let parsed = parse_log(text);
        assert_eq!(parsed.commits.len(), 1);
        let files = &parsed.commits[0].files;
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/win/path.rs");
        assert_eq!(files[0].additions, 3);
        assert_eq!(files[0].deletions, 1);
    }

    #[test]
    fn parses_crlf_headers() {
        let text =
            "2222222222222222222222222222222222222222\tBob\t1700000000\r\n\r\n1\t2\ta.rs\r\n";
        let parsed = parse_log(text);
        assert_eq!(parsed.commits.len(), 1);
        assert_eq!(parsed.commits[0].author, "Bob");
        assert_eq!(parsed.commits[0].timestamp, 1_700_000_000);
        assert_eq!(parsed.commits[0].files.len(), 1);
        assert_eq!(parsed.commits[0].files[0].path, "a.rs");
    }
}
