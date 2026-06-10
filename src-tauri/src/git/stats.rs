//! Aggregation of a parsed git log into the forensics report: per-file stats,
//! hotspots (commits x churn), co-change pairs and bus-factor risk. Pure —
//! the disk filter is injected as `keep` and "now" is a parameter, so tests
//! drive everything directly without a git installation.

use std::collections::{BTreeMap, HashMap, HashSet};

use super::parse::{LogCommit, ParsedLog};
use super::{BusFactor, CoChange, GitFileStat, GitForensics, Hotspot};

const MAX_FILES: usize = 100;
const MAX_HOTSPOTS: usize = 20;
const MAX_CO_CHANGES: usize = 20;
const MAX_BUS_FACTOR: usize = 10;
/// A file pair must co-occur in at least this many commits to be reported.
const CO_CHANGE_MIN_COUNT: usize = 3;
/// Commits touching more files than this are bulk moves/reformats: no pairs.
const CO_CHANGE_MAX_FILES: usize = 30;
/// Bus factor needs a minimal history per file to be meaningful.
const BUS_FACTOR_MIN_COMMITS: usize = 5;
/// Report single-owner risk when one author holds at least this commit share.
const BUS_FACTOR_MIN_SHARE: f64 = 0.75;

/// Paths we never report on: dependency/build output, minified files, lockfiles.
pub(super) fn is_noise_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    for dir in ["node_modules", "dist", "build", "target"] {
        if lower.starts_with(&format!("{dir}/")) || lower.contains(&format!("/{dir}/")) {
            return true;
        }
    }
    if lower.contains(".min.") {
        return true;
    }
    let name = lower.rsplit('/').next().unwrap_or(lower.as_str());
    matches!(
        name,
        "package-lock.json" | "yarn.lock" | "cargo.lock" | "pnpm-lock.yaml"
    )
}

/// Per-file aggregate accumulated across all parsed commits.
#[derive(Default)]
struct FileAgg {
    commits: usize,
    additions: usize,
    deletions: usize,
    /// author name -> number of commits by that author touching this file.
    authors: HashMap<String, usize>,
    last_ts: i64,
}

/// A commit's changes after the keep-filter, collapsed per path so each file
/// counts once per commit. BTreeMap keeps paths sorted, which hands co-change
/// pairs their `a < b` ordering for free.
fn surviving<'a>(
    commit: &'a LogCommit,
    keep: &dyn Fn(&str) -> bool,
) -> BTreeMap<&'a str, (usize, usize)> {
    let mut per: BTreeMap<&str, (usize, usize)> = BTreeMap::new();
    for change in &commit.files {
        if !keep(&change.path) {
            continue;
        }
        let entry = per.entry(change.path.as_str()).or_insert((0, 0));
        entry.0 += change.additions;
        entry.1 += change.deletions;
    }
    per
}

/// Count unordered co-change pairs over commits touching 2..=30 surviving files.
fn co_change_counts(
    parsed: &ParsedLog,
    keep: &dyn Fn(&str) -> bool,
) -> HashMap<(String, String), usize> {
    let mut counts: HashMap<(String, String), usize> = HashMap::new();
    for commit in &parsed.commits {
        let per = surviving(commit, keep);
        if per.len() < 2 || per.len() > CO_CHANGE_MAX_FILES {
            continue;
        }
        let paths: Vec<&str> = per.keys().copied().collect();
        for i in 0..paths.len() {
            for j in (i + 1)..paths.len() {
                *counts
                    .entry((paths[i].to_string(), paths[j].to_string()))
                    .or_insert(0) += 1;
            }
        }
    }
    counts
}

/// Aggregate a parsed log into the final report.
pub(super) fn build(parsed: &ParsedLog, keep: &dyn Fn(&str) -> bool, now_secs: i64) -> GitForensics {
    let (agg, all_authors) = aggregate_files(parsed, keep);

    let files = build_files(&agg, now_secs);
    let hotspots = build_hotspots(&agg);
    let bus_factor = build_bus_factor(&agg);
    let co_changes = build_co_changes(parsed, keep);

    GitForensics {
        available: true,
        reason: None,
        commits_analyzed: parsed.commits.len(),
        authors_total: all_authors.len(),
        files,
        hotspots,
        co_changes,
        bus_factor,
    }
}

/// Fold the surviving per-commit changes into per-file aggregates and collect
/// the distinct author set.
fn aggregate_files<'a>(
    parsed: &'a ParsedLog,
    keep: &dyn Fn(&str) -> bool,
) -> (BTreeMap<String, FileAgg>, HashSet<&'a str>) {
    let mut agg: BTreeMap<String, FileAgg> = BTreeMap::new();
    let mut all_authors: HashSet<&str> = HashSet::new();
    for commit in &parsed.commits {
        all_authors.insert(commit.author.as_str());
        for (path, (additions, deletions)) in surviving(commit, keep) {
            let file = agg.entry(path.to_string()).or_default();
            file.commits += 1;
            file.additions += additions;
            file.deletions += deletions;
            *file.authors.entry(commit.author.clone()).or_insert(0) += 1;
            file.last_ts = file.last_ts.max(commit.timestamp);
        }
    }
    (agg, all_authors)
}

/// Per-file stats, busiest first (ties by path), capped at MAX_FILES.
fn build_files(agg: &BTreeMap<String, FileAgg>, now_secs: i64) -> Vec<GitFileStat> {
    let mut files: Vec<GitFileStat> = agg
        .iter()
        .map(|(path, file)| GitFileStat {
            path: path.clone(),
            commits: file.commits,
            additions: file.additions,
            deletions: file.deletions,
            authors: file.authors.len(),
            last_touched_days: ((now_secs - file.last_ts) / 86_400).max(0),
        })
        .collect();
    files.sort_by(|a, b| b.commits.cmp(&a.commits).then_with(|| a.path.cmp(&b.path)));
    files.truncate(MAX_FILES);
    files
}

/// Hotspots scored by commits x log-churn, highest first, capped at MAX_HOTSPOTS.
fn build_hotspots(agg: &BTreeMap<String, FileAgg>) -> Vec<Hotspot> {
    let mut hotspots: Vec<Hotspot> = agg
        .iter()
        .map(|(path, file)| {
            let churn = file.additions + file.deletions;
            Hotspot {
                path: path.clone(),
                commits: file.commits,
                churn,
                score: file.commits as f64 * (1.0 + churn as f64).ln(),
            }
        })
        .collect();
    hotspots.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.path.cmp(&b.path)));
    hotspots.truncate(MAX_HOTSPOTS);
    hotspots
}

/// Single-owner risk: files with enough history where one author holds at least
/// BUS_FACTOR_MIN_SHARE of commits, riskiest first, capped at MAX_BUS_FACTOR.
fn build_bus_factor(agg: &BTreeMap<String, FileAgg>) -> Vec<BusFactor> {
    let mut bus_factor: Vec<BusFactor> = Vec::new();
    for (path, file) in agg {
        if file.commits < BUS_FACTOR_MIN_COMMITS {
            continue;
        }
        // Dominant author; ties go to the lexicographically first name so
        // output is stable across HashMap iteration orders.
        let top = file
            .authors
            .iter()
            .max_by(|a, b| a.1.cmp(b.1).then_with(|| b.0.cmp(a.0)));
        if let Some((author, count)) = top {
            let share = *count as f64 / file.commits as f64;
            if share >= BUS_FACTOR_MIN_SHARE {
                bus_factor.push(BusFactor {
                    path: path.clone(),
                    top_author: author.clone(),
                    share,
                    commits: file.commits,
                });
            }
        }
    }
    bus_factor.sort_by(|a, b| {
        b.share
            .total_cmp(&a.share)
            .then_with(|| b.commits.cmp(&a.commits))
            .then_with(|| a.path.cmp(&b.path))
    });
    bus_factor.truncate(MAX_BUS_FACTOR);
    bus_factor
}

/// Co-change pairs above the count threshold, most frequent first, capped.
fn build_co_changes(parsed: &ParsedLog, keep: &dyn Fn(&str) -> bool) -> Vec<CoChange> {
    let mut co_changes: Vec<CoChange> = co_change_counts(parsed, keep)
        .into_iter()
        .filter(|(_, count)| *count >= CO_CHANGE_MIN_COUNT)
        .map(|((a, b), count)| CoChange { a, b, count })
        .collect();
    co_changes.sort_by(|x, y| {
        y.count
            .cmp(&x.count)
            .then_with(|| x.a.cmp(&y.a))
            .then_with(|| x.b.cmp(&y.b))
    });
    co_changes.truncate(MAX_CO_CHANGES);
    co_changes
}

#[cfg(test)]
mod tests {
    use super::super::parse::{parse_log, FileChange};
    use super::*;

    const NOW: i64 = 1_700_259_200; // fixture's newest commit + 1 day

    /// 3 commits, 2 authors, overlapping files, one binary line, one brace
    /// rename, CRLF endings throughout — shaped like real `git log` output.
    fn fixture() -> String {
        [
            "1111111111111111111111111111111111111111\tAlice\t1700000000",
            "",
            "10\t2\tsrc/app.ts",
            "5\t1\tsrc/util.ts",
            "-\t-\tassets/logo.png",
            "",
            "2222222222222222222222222222222222222222\tBob\t1700086400",
            "",
            "3\t3\tsrc/app.ts",
            "1\t0\ta/{x => y}.ts",
            "",
            "3333333333333333333333333333333333333333\tAlice\t1700172800",
            "",
            "7\t0\tsrc/app.ts",
            "2\t2\tsrc/util.ts",
        ]
        .join("\r\n")
    }

    fn commit(author: &str, ts: i64, files: &[(&str, usize, usize)]) -> LogCommit {
        LogCommit {
            author: author.to_string(),
            timestamp: ts,
            files: files
                .iter()
                .map(|(path, additions, deletions)| FileChange {
                    path: (*path).to_string(),
                    additions: *additions,
                    deletions: *deletions,
                })
                .collect(),
        }
    }

    #[test]
    fn aggregates_multi_commit_fixture() {
        let parsed = parse_log(&fixture());
        let report = build(&parsed, &|_| true, NOW);
        assert_eq!(report.commits_analyzed, 3);
        assert_eq!(report.authors_total, 2);

        let app = report.files.iter().find(|f| f.path == "src/app.ts").unwrap();
        assert_eq!((app.commits, app.additions, app.deletions, app.authors), (3, 20, 5, 2));
        assert_eq!(app.last_touched_days, 1);

        let util = report.files.iter().find(|f| f.path == "src/util.ts").unwrap();
        assert_eq!((util.commits, util.additions, util.deletions, util.authors), (2, 7, 3, 1));

        // Rename `a/{x => y}.ts` lands under the NEW path.
        let renamed = report.files.iter().find(|f| f.path == "a/y.ts").unwrap();
        assert_eq!((renamed.commits, renamed.additions, renamed.authors), (1, 1, 1));
        assert_eq!(renamed.last_touched_days, 2);

        // The binary `-` line is skipped entirely.
        assert!(report.files.iter().all(|f| f.path != "assets/logo.png"));

        // Co-change pair counts: app+util together in commits 1 and 3.
        let counts = co_change_counts(&parsed, &|_| true);
        let key = ("src/app.ts".to_string(), "src/util.ts".to_string());
        assert_eq!(counts.get(&key), Some(&2));
        let key = ("a/y.ts".to_string(), "src/app.ts".to_string());
        assert_eq!(counts.get(&key), Some(&1));
    }

    #[test]
    fn hotspot_score_ordering() {
        // big.rs: 2 commits but churn 1000 -> 2 * ln(1001) ~ 13.8.
        // small.rs: 3 commits, churn 3 -> 3 * ln(4) ~ 4.16. Score wins.
        let commits = vec![
            commit("A", 1, &[("big.rs", 400, 100)]),
            commit("B", 2, &[("big.rs", 300, 200)]),
            commit("A", 1, &[("small.rs", 1, 0)]),
            commit("B", 2, &[("small.rs", 1, 0)]),
            commit("A", 3, &[("small.rs", 1, 0)]),
        ];
        let report = build(&ParsedLog { commits }, &|_| true, 4);
        assert_eq!(report.hotspots[0].path, "big.rs");
        assert_eq!(report.hotspots[1].path, "small.rs");
        let expected = 2.0 * (1.0f64 + 1000.0).ln();
        assert!((report.hotspots[0].score - expected).abs() < 1e-9);
        // The plain files list is still ordered by raw commit count.
        assert_eq!(report.files[0].path, "small.rs");
    }

    #[test]
    fn bus_factor_share_computation() {
        let mut commits = Vec::new();
        // owned.rs: 5 commits, 4 by Alice -> share 0.8, reported.
        for author in ["Alice", "Alice", "Alice", "Alice", "Bob"] {
            commits.push(commit(author, 1, &[("owned.rs", 1, 0)]));
        }
        // shared.rs: 3/2 split -> share 0.6, below the 0.75 floor.
        for author in ["Alice", "Alice", "Alice", "Bob", "Bob"] {
            commits.push(commit(author, 1, &[("shared.rs", 1, 0)]));
        }
        // rare.rs: single-owner but only 4 commits, below the 5-commit floor.
        for _ in 0..4 {
            commits.push(commit("Alice", 1, &[("rare.rs", 1, 0)]));
        }
        let report = build(&ParsedLog { commits }, &|_| true, 2);
        assert_eq!(report.bus_factor.len(), 1);
        let owned = &report.bus_factor[0];
        assert_eq!(owned.path, "owned.rs");
        assert_eq!(owned.top_author, "Alice");
        assert_eq!(owned.commits, 5);
        assert!((owned.share - 0.8).abs() < 1e-9);
    }

    #[test]
    fn co_change_threshold_and_ordering() {
        let mut commits = Vec::new();
        for _ in 0..3 {
            commits.push(commit("A", 1, &[("a.rs", 1, 0), ("b.rs", 1, 0)]));
        }
        for _ in 0..4 {
            commits.push(commit("A", 1, &[("a.rs", 1, 0), ("c.rs", 1, 0)]));
        }
        commits.push(commit("A", 1, &[("a.rs", 1, 0), ("d.rs", 1, 0)])); // count 1 < 3
        let report = build(&ParsedLog { commits }, &|_| true, 2);
        assert_eq!(report.co_changes.len(), 2);
        assert_eq!(report.co_changes[0].a, "a.rs");
        assert_eq!(report.co_changes[0].b, "c.rs");
        assert_eq!(report.co_changes[0].count, 4);
        assert_eq!(report.co_changes[1].count, 3);
        assert!(report.co_changes.iter().all(|p| p.a < p.b));
    }

    #[test]
    fn serializes_camel_case() {
        let report = build(&parse_log(&fixture()), &|_| true, NOW);
        let json = serde_json::to_string(&report).unwrap();
        assert!(json.contains("\"commitsAnalyzed\":3"));
        assert!(json.contains("\"authorsTotal\":2"));
        assert!(json.contains("\"lastTouchedDays\""));
        assert!(json.contains("\"coChanges\""));
        assert!(json.contains("\"busFactor\""));
    }

    #[test]
    fn noise_paths_filtered() {
        assert!(is_noise_path("node_modules/x/index.js"));
        assert!(is_noise_path("client/dist/app.min.js"));
        assert!(is_noise_path("package-lock.json"));
        assert!(!is_noise_path("src/app.ts"));
    }
}
