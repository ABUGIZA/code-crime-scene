//! Git history forensics: shells out to the `git` CLI (when available) and
//! mines up to the last 1000 commits for change hotspots, files that always
//! change together (co-change) and single-owner risk (bus factor).
//!
//! Best-effort by design: if git is missing, `root` is not a work tree, or
//! the log output is unparsable, `collect` returns `available: false` plus a
//! short reason instead of erroring — the rest of the analysis is unaffected.
//!
//! This module owns the public types and the `git` CLI plumbing; the
//! aggregation lives in `stats.rs` and the log parser in `parse.rs`.

mod parse;
mod stats;

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use parse::parse_log;
use stats::{build, is_noise_path};

/// How many commits we mine at most (keeps `git log` fast on huge repos).
const MAX_COMMITS: &str = "1000";

/// Everything the frontend needs to render the history-forensics panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitForensics {
    /// False when git is missing or this is not a repo; `reason` says why.
    pub available: bool,
    pub reason: Option<String>,
    pub commits_analyzed: usize,
    pub authors_total: usize,
    /// Per-file stats, top 100 by commit count.
    pub files: Vec<GitFileStat>,
    /// Most volatile files (commits x churn), top 20 by score.
    pub hotspots: Vec<Hotspot>,
    /// File pairs that keep changing in the same commit. Top 20, count >= 3.
    pub co_changes: Vec<CoChange>,
    /// Files dominated by a single author. Top 10 by share.
    pub bus_factor: Vec<BusFactor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStat {
    pub path: String, // forward slashes, repo-relative
    pub commits: usize,
    pub additions: usize,
    pub deletions: usize,
    pub authors: usize,
    pub last_touched_days: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hotspot {
    pub path: String,
    pub commits: usize,
    pub churn: usize, // additions + deletions
    pub score: f64,   // commits * ln(1 + churn)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoChange {
    pub a: String, // a < b lexicographically for stable output
    pub b: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusFactor {
    pub path: String,
    pub top_author: String,
    pub share: f64, // top author's commit share on this file, 0..1
    pub commits: usize,
}

impl GitForensics {
    fn unavailable(reason: &str) -> Self {
        GitForensics {
            available: false,
            reason: Some(reason.to_string()),
            commits_analyzed: 0,
            authors_total: 0,
            files: Vec::new(),
            hotspots: Vec::new(),
            co_changes: Vec::new(),
            bus_factor: Vec::new(),
        }
    }
}

/// Why a git invocation produced no usable output.
enum GitError {
    /// The `git` executable could not be spawned (not installed / not on PATH).
    Missing,
    /// git ran but exited with a non-zero status.
    Failed,
}

/// Run `git -C <root> <args...>` and return lossy stdout on success.
fn run_git(root: &Path, args: &[&str]) -> Result<String, GitError> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(root).args(args);
    // Keep the spawned console hidden when running inside the GUI app.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output().map_err(|_| GitError::Missing)?;
    if !output.status.success() {
        return Err(GitError::Failed);
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Mine git history for `root`. Never panics; on any failure returns an
/// `available: false` result with a short reason.
pub fn collect(root: &Path) -> GitForensics {
    match run_git(root, &["rev-parse", "--is-inside-work-tree"]) {
        Ok(out) if out.trim() == "true" => {}
        Ok(_) | Err(GitError::Failed) => return GitForensics::unavailable("not a git work tree"),
        Err(GitError::Missing) => {
            return GitForensics::unavailable("git is not installed or not on PATH")
        }
    }

    let log_args = [
        "log",
        "--no-merges",
        "--pretty=format:%H%x09%an%x09%at",
        "--numstat",
        "-n",
        MAX_COMMITS,
        "--",
        ".",
    ];
    let log = match run_git(root, &log_args) {
        Ok(out) => out,
        Err(_) => return GitForensics::unavailable("git log failed"),
    };
    if log.trim().is_empty() {
        return GitForensics::unavailable("no commits found");
    }

    let parsed = parse_log(&log);
    if parsed.commits.is_empty() {
        return GitForensics::unavailable("could not parse git log output");
    }

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Keep only files that still exist on disk and are not obvious noise.
    // Existence checks hit the filesystem, so memoize per distinct path.
    let cache: RefCell<HashMap<String, bool>> = RefCell::new(HashMap::new());
    let keep = |path: &str| -> bool {
        if let Some(known) = cache.borrow().get(path) {
            return *known;
        }
        let verdict = !is_noise_path(path) && root.join(path).exists();
        cache.borrow_mut().insert(path.to_string(), verdict);
        verdict
    };

    build(&parsed, &keep, now_secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_collect_on_project_repo() {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = manifest.parent().unwrap_or(manifest);
        let report = collect(root);
        if !report.available {
            return; // git may be absent in constrained environments — fine.
        }
        assert!(report.commits_analyzed > 0);
    }
}
