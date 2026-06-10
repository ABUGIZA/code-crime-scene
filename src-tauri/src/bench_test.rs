//! Engine benchmark harness (v2). Ignored by normal test runs.
//! Run: `cargo test --lib bench_report -- --ignored --nocapture`
//! Prints one line starting with `BENCHJSON:` containing measured numbers for
//! the trap fixture at <repo>/bench/trap and the real frontend `src/` tree.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::time::Instant;

fn ms(d: std::time::Duration) -> f64 {
    (d.as_secs_f64() * 1_000_000.0).round() / 1000.0
}

#[test]
#[ignore]
fn bench_report() {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let root = manifest.parent().unwrap_or(manifest);
    let trap = root.join("bench").join("trap");
    assert!(trap.is_dir(), "trap fixture missing at {:?}", trap);

    let mut sink = |_n: usize| {};
    let scan = crate::scanner::scan_dir(&trap, &mut sink);

    // Two timed runs (cold/warm); report the better one as analyzeMs.
    let t = Instant::now();
    let r1 = crate::analysis::analyze("trap", &trap.to_string_lossy(), &scan, 0);
    let run1 = ms(t.elapsed());
    let t = Instant::now();
    let r = crate::analysis::analyze("trap", &trap.to_string_lossy(), &scan, 0);
    let run2 = ms(t.elapsed());

    // Determinism: the scalar metrics must be identical across runs.
    assert_eq!(r1.security_high, r.security_high);
    assert_eq!(r1.security_medium, r.security_medium);
    assert_eq!(r1.security_low, r.security_low);
    assert_eq!(r1.total_duplicate_blocks, r.total_duplicate_blocks);
    assert_eq!(r1.max_complexity, r.max_complexity);
    assert_eq!(r1.cycle_count, r.cycle_count);

    let lua_functions: usize = r
        .all_files
        .iter()
        .filter(|f| f.path.ends_with(".lua"))
        .map(|f| f.functions)
        .sum();
    let mut kinds: BTreeSet<String> = BTreeSet::new();
    let mut runtimes: BTreeMap<String, String> = BTreeMap::new();
    for f in r.all_files.iter().filter(|f| f.path.ends_with(".lua")) {
        for resp in &f.responsibilities {
            kinds.insert(resp.kind.clone());
        }
        if f.path == "client.lua" || f.path == "server.lua" {
            runtimes.insert(f.path.clone(), f.runtime.clone());
        }
    }

    // Honesty check: dump every security finding so missed plants are visible.
    for s in &r.security_findings {
        eprintln!("DEBUG-SEC: {}:{} [{}] {} | {}", s.file, s.line, s.severity, s.kind, s.snippet);
    }
    eprintln!("DEBUG-DUP: blocks={} ratio={}", r.total_duplicate_blocks, r.duplicate_line_ratio);
    for b in &r.duplication {
        eprintln!("DEBUG-DUPBLOCK: lines={} occ={} files={:?}", b.line_count, b.occurrences, b.files);
    }
    for c in &r.complex_functions {
        eprintln!("DEBUG-CC: {} {} cc={}", c.file, c.name, c.complexity);
    }
    eprintln!("DEBUG-CYCLES: {:?}", r.cycles);
    for f in &r.all_files {
        eprintln!(
            "DEBUG-FILE: {} lang={} fns={} longest={} ({}) lines={}",
            f.path, f.language, f.functions, f.longest_function, f.longest_function_name, f.lines
        );
    }
    eprintln!("DEBUG-AVGCC: avg={} max={} high={}", r.avg_complexity, r.max_complexity, r.high_complexity_functions);

    // Real project's frontend src tree, same two-run timing.
    let real_src = root.join("src");
    let mut sink2 = |_n: usize| {};
    let scan2 = crate::scanner::scan_dir(&real_src, &mut sink2);
    let t = Instant::now();
    let _rs1 = crate::analysis::analyze("src", &real_src.to_string_lossy(), &scan2, 0);
    let rs_run1 = ms(t.elapsed());
    let t = Instant::now();
    let rs = crate::analysis::analyze("src", &real_src.to_string_lossy(), &scan2, 0);
    let rs_run2 = ms(t.elapsed());

    // Git forensics over the real repo history.
    let g = crate::git::collect(root);

    let out = serde_json::json!({
        "version": "v2",
        "trap": {
            "securityHigh": r.security_high,
            "securityMedium": r.security_medium,
            "securityLow": r.security_low,
            "securityTotal": r.security_high + r.security_medium + r.security_low,
            "luaFunctions": lua_functions,
            "fivemRespKinds": kinds.iter().collect::<Vec<_>>(),
            "luaRuntimes": runtimes,
            "highCC": r.high_complexity_functions,
            "maxCC": r.max_complexity,
            "dupBlocks": r.total_duplicate_blocks,
            "dupRatio": r.duplicate_line_ratio,
            "cycles": r.cycle_count,
            "analyzeMs": run1.min(run2),
            "analyzeMsRuns": [run1, run2],
        },
        "realSrc": {
            "files": rs.analyzed_files,
            "analyzeMs": rs_run1.min(rs_run2),
            "analyzeMsRuns": [rs_run1, rs_run2],
        },
        "git": {
            "available": g.available,
            "commits": g.commits_analyzed,
            "hotspots": g.hotspots.len(),
            "coChanges": g.co_changes.len(),
            "busFactor": g.bus_factor.len(),
        },
    });
    println!("BENCHJSON:{}", out);
}

/// Dump the exact scoring inputs the self-scan feeds the TS scorer, so we can
/// see which metrics are costing points. Run:
/// cargo test --lib dump_real_scoring -- --ignored --nocapture
#[test]
#[ignore]
fn dump_real_scoring() {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let root = manifest.parent().unwrap_or(manifest);
    let mut sink = |_n: usize| {};
    let scan = crate::scanner::scan_dir(root, &mut sink);
    let r = crate::analysis::analyze("code-crime-scene", &root.to_string_lossy(), &scan, 0);
    let long_ratio = if r.total_functions > 0 { r.total_long_functions as f64 / r.total_functions as f64 } else { 0.0 };
    let high_share = if r.total_functions > 0 { r.high_complexity_functions as f64 / r.total_functions as f64 } else { 0.0 };
    let out = serde_json::json!({
        "analyzedFiles": r.analyzed_files,
        "codeLines": r.code_lines,
        "commentRatio": if r.code_lines > 0 { r.comment_lines as f64 / r.code_lines as f64 } else { 0.0 },
        "totalFunctions": r.total_functions,
        "totalLongFunctions": r.total_long_functions,
        "longRatio": long_ratio,
        "avgFileLines": r.avg_file_lines,
        "hugeFileCount": r.huge_file_count,
        "maxFanIn": r.max_fan_in,
        "duplicateLineRatio": r.duplicate_line_ratio,
        "avgComplexity": r.avg_complexity,
        "maxComplexity": r.max_complexity,
        "highComplexityFunctions": r.high_complexity_functions,
        "highShare": high_share,
        "cycleCount": r.cycle_count,
        "securityHigh": r.security_high,
        "securityMedium": r.security_medium,
    });
    println!("SCOREJSON:{}", out);
    // Top fan-in files (the coupling drivers).
    let mut files = r.all_files.clone();
    files.sort_by(|a, b| b.fan_in.cmp(&a.fan_in));
    for f in files.iter().take(8) {
        eprintln!("FANIN: {} <- {} importers (type={})", f.path, f.fan_in, f.file_type);
    }
    // Largest files (huge-file + avg drivers).
    let mut bylines = r.all_files.clone();
    bylines.sort_by(|a, b| b.lines.cmp(&a.lines));
    for f in bylines.iter().take(8) {
        eprintln!("LINES: {} = {} lines", f.path, f.lines);
    }
    // Every high-complexity function (CC > 10).
    for c in r.complex_functions.iter().filter(|c| c.complexity > 10) {
        eprintln!("HICC: {}:{} {} CC={} len={}", c.file, c.start_line, c.name, c.complexity, c.length);
    }
    // Every long function (> 50 lines), longest first.
    let mut longs = r.long_functions.clone();
    longs.sort_by(|a, b| b.length.cmp(&a.length));
    for f in &longs {
        eprintln!("LONGFN: {}:{} {} len={}", f.file, f.start_line, f.name, f.length);
    }
}
