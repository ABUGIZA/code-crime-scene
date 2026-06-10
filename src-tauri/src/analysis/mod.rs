//! Static analysis layer — orchestration. Submodules: defs (types/patterns),
//! lines (line classification), metrics (function detection/sizing),
//! complexity (cyclomatic complexity), detect (runtime/responsibilities),
//! artifact (artifact typing), pass (the per-file pass), parse (imports),
//! dup (duplication), secrets, graph (cycles), lua (Lua/FiveM support).

use crate::models::*;
use crate::scanner::ScanOutput;
use std::collections::{HashMap, HashSet};

mod artifact;
mod complexity;
mod defs;
mod detect;
mod dup;
mod graph;
mod lines;
mod lua;
mod metrics;
mod parse;
mod pass;
mod secrets;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_v2;
#[cfg(test)]
mod tests_v3;

use defs::*;
use dup::DupIndex;
use graph::find_cycles;
use lines::*;
use parse::*;
use pass::{analyze_file, noise_info};
use secrets::*;

/// Accumulators filled by the per-file pass, consumed during aggregation.
#[derive(Default)]
struct Pass {
    file_infos: Vec<FileInfo>,
    noise_infos: Vec<FileInfo>,
    all_long: Vec<LongFunction>,
    all_unused: Vec<UnusedImport>,
    all_security: Vec<SecurityFinding>,
    all_complex: Vec<ComplexFunction>,
    edges: Vec<DependencyEdge>,
    lang_map: HashMap<String, (usize, usize)>,
    total_lines: usize,
    code_lines: usize,
    comment_lines: usize,
    blank_lines: usize,
    total_bytes: u64,
    total_functions: usize,
    ignored_files: usize,
    ignored_lines: usize,
    cc_sum: usize,
    cc_count: usize,
    max_complexity: usize,
    high_cc: usize,
}

pub fn analyze(
    project_name: &str,
    project_path: &str,
    scan: &ScanOutput,
    generated_at: i64,
) -> AnalysisResult {
    let pats = Patterns::new();
    let files = &scan.files;
    let fileset: HashSet<&str> = files.iter().map(|f| f.rel_path.as_str()).collect();

    let mut dup_index = DupIndex::new();
    let mut pass = run_pass(files, &pats, &fileset, &mut dup_index);

    let max_fan_in = assign_fan_in(&mut pass.file_infos, &pass.edges);
    let analyzed_files = pass.file_infos.len();
    let (dup_blocks, total_duplicate_blocks, duplicate_line_ratio) = dup_index.finish(pass.code_lines);
    let files_view = build_files_view(&pass.file_infos, &pass.noise_infos);
    let findings = build_findings(&mut pass);

    let meta = Meta { project_name, project_path, generated_at, scan, files };
    let dup = (dup_blocks, total_duplicate_blocks, duplicate_line_ratio);
    assemble_result(meta, pass, files_view, findings, dup, max_fan_in, analyzed_files)
}

/// Identity / source inputs threaded into the final result, distinct from the
/// computed `Pass` / `Findings` aggregates.
struct Meta<'a> {
    project_name: &'a str,
    project_path: &'a str,
    generated_at: i64,
    scan: &'a ScanOutput,
    files: &'a [crate::scanner::RawFile],
}

/// Compose the final `AnalysisResult` from the aggregated pieces. Pure assembly
/// — the only derived values are the two guarded averages.
fn assemble_result(
    meta: Meta,
    pass: Pass,
    files_view: FilesView,
    findings: Findings,
    dup: (Vec<DuplicationBlock>, usize, f64),
    max_fan_in: usize,
    analyzed_files: usize,
) -> AnalysisResult {
    let (duplication, total_duplicate_blocks, duplicate_line_ratio) = dup;
    let avg_file_lines = if analyzed_files > 0 {
        pass.total_lines as f64 / analyzed_files as f64
    } else {
        0.0
    };
    let avg_complexity = if pass.cc_count > 0 {
        pass.cc_sum as f64 / pass.cc_count as f64
    } else {
        0.0
    };
    AnalysisResult {
        project_name: meta.project_name.to_string(),
        project_path: meta.project_path.to_string(),
        generated_at: meta.generated_at,
        total_files: meta.scan.total_seen,
        scanned_files: meta.files.len(),
        skipped_files: meta.scan.skipped,
        analyzed_files,
        ignored_files: pass.ignored_files,
        ignored_lines: pass.ignored_lines,
        total_lines: pass.total_lines,
        code_lines: pass.code_lines,
        comment_lines: pass.comment_lines,
        blank_lines: pass.blank_lines,
        total_bytes: pass.total_bytes,
        total_functions: pass.total_functions,
        avg_file_lines,
        max_fan_in,
        duplicate_line_ratio,
        total_long_functions: findings.total_long_functions,
        total_unused_imports: findings.total_unused_imports,
        total_duplicate_blocks,
        huge_file_count: files_view.huge_file_count,
        security_high: findings.security_high,
        security_medium: findings.security_medium,
        security_low: findings.security_low,
        avg_complexity,
        max_complexity: pass.max_complexity,
        high_complexity_functions: pass.high_cc,
        cycle_count: findings.cycle_count,
        verify_commands: extract_verify_commands(meta.files),
        languages: languages_from(pass.lang_map),
        largest_files: files_view.largest,
        ignored_largest: files_view.ignored_largest,
        all_files: files_view.all_files,
        long_functions: findings.long_functions,
        duplication,
        unused_imports: findings.unused_imports,
        security_findings: findings.security_findings,
        dependencies: findings.dependencies,
        complex_functions: findings.complex_functions,
        cycles: findings.cycles,
    }
}

/// Run the per-file analysis pass over every scanned file, folding results into
/// a `Pass` accumulator (noise files are counted in totals but skip metrics).
fn run_pass(
    files: &[crate::scanner::RawFile],
    pats: &Patterns,
    fileset: &HashSet<&str>,
    dup_index: &mut DupIndex,
) -> Pass {
    let mut pass = Pass::default();
    for f in files {
        let (lt, lb, lc) = classify_lines(&f.content, &f.language);
        let lcode = lt.saturating_sub(lb + lc);
        pass.total_bytes += f.size_bytes;
        if let Some(reason) = &f.noise_reason {
            pass.ignored_files += 1;
            pass.ignored_lines += lt;
            pass.noise_infos.push(noise_info(f, lt, lb, lc, lcode, reason));
            continue;
        }
        pass.total_lines += lt;
        pass.blank_lines += lb;
        pass.comment_lines += lc;
        pass.code_lines += lcode;
        let e = pass.lang_map.entry(f.language.clone()).or_insert((0, 0));
        e.0 += 1;
        e.1 += lt;
        dup_index.add_file(f);
        let out = analyze_file(f, pats, fileset, lt, lb, lc, lcode);
        pass.total_functions += out.info.functions;
        for &cc in &out.cc_all {
            pass.cc_sum += cc;
            pass.cc_count += 1;
            pass.max_complexity = pass.max_complexity.max(cc);
            if cc > HIGH_CC_THRESHOLD {
                pass.high_cc += 1;
            }
        }
        pass.all_complex.extend(out.complex);
        pass.all_long.extend(out.long);
        pass.all_unused.extend(out.unused);
        pass.all_security.extend(out.security);
        pass.edges.extend(out.edges);
        pass.file_infos.push(out.info);
    }
    pass
}

/// Size-sorted file lists for the report (largest analyzed, largest ignored,
/// the capped full listing) plus the >400-line "huge file" count.
struct FilesView {
    huge_file_count: usize,
    largest: Vec<FileInfo>,
    ignored_largest: Vec<FileInfo>,
    all_files: Vec<FileInfo>,
}

fn build_files_view(file_infos: &[FileInfo], noise_infos: &[FileInfo]) -> FilesView {
    let huge_file_count = file_infos.iter().filter(|f| f.lines > 400).count();

    let mut largest = file_infos.to_vec();
    largest.sort_by(|a, b| b.lines.cmp(&a.lines));
    largest.truncate(15);

    let mut ignored_largest = noise_infos.to_vec();
    ignored_largest.sort_by(|a, b| b.lines.cmp(&a.lines));
    ignored_largest.truncate(8);

    let mut all_files = file_infos.to_vec();
    all_files.sort_by(|a, b| b.lines.cmp(&a.lines));
    all_files.truncate(120);

    FilesView { huge_file_count, largest, ignored_largest, all_files }
}

/// Sorted, truncated finding lists plus their pre-truncation totals and the
/// severity / cycle counts derived from the full sets.
struct Findings {
    total_long_functions: usize,
    total_unused_imports: usize,
    security_high: usize,
    security_medium: usize,
    security_low: usize,
    cycle_count: usize,
    long_functions: Vec<LongFunction>,
    unused_imports: Vec<UnusedImport>,
    security_findings: Vec<SecurityFinding>,
    complex_functions: Vec<ComplexFunction>,
    dependencies: Vec<DependencyEdge>,
    cycles: Vec<Vec<String>>,
}

fn build_findings(pass: &mut Pass) -> Findings {
    let total_long_functions = pass.all_long.len();
    let mut long_functions = std::mem::take(&mut pass.all_long);
    long_functions.sort_by(|a, b| b.length.cmp(&a.length));
    long_functions.truncate(30);

    let total_unused_imports = pass.all_unused.len();
    let mut unused_imports = std::mem::take(&mut pass.all_unused);
    unused_imports.truncate(60);

    let mut security_findings = std::mem::take(&mut pass.all_security);
    let security_high = security_findings.iter().filter(|s| s.severity == "high").count();
    let security_medium = security_findings.iter().filter(|s| s.severity == "medium").count();
    let security_low = security_findings.iter().filter(|s| s.severity == "low").count();
    security_findings.sort_by_key(|s| severity_rank(&s.severity));
    security_findings.truncate(100);

    let (cycle_count, cycles) = find_cycles(&pass.edges);
    let mut dependencies = std::mem::take(&mut pass.edges);
    dependencies.truncate(600);

    let mut complex_functions = std::mem::take(&mut pass.all_complex);
    complex_functions.sort_by(|a, b| b.complexity.cmp(&a.complexity));
    complex_functions.truncate(30);

    Findings {
        total_long_functions,
        total_unused_imports,
        security_high,
        security_medium,
        security_low,
        cycle_count,
        long_functions,
        unused_imports,
        security_findings,
        complex_functions,
        dependencies,
        cycles,
    }
}

/// Assign per-file fan-in from the dependency edges; return the `max_fan_in`
/// scoring input.
///
/// The returned max deliberately EXCLUDES files typed "types": a pure
/// type/interface module imported by many files is a stable shared vocabulary,
/// not a coupling risk — punishing it would only push users to duplicate type
/// definitions. The per-file `fan_in` is still assigned to every file
/// (including type modules) so the displayed numbers stay honest.
fn assign_fan_in(file_infos: &mut [FileInfo], edges: &[DependencyEdge]) -> usize {
    let mut fan_in_map: HashMap<&str, usize> = HashMap::new();
    for e in edges {
        *fan_in_map.entry(e.to.as_str()).or_insert(0) += 1;
    }
    for fi in file_infos.iter_mut() {
        fi.fan_in = fan_in_map.get(fi.path.as_str()).copied().unwrap_or(0);
    }
    file_infos
        .iter()
        .filter(|f| f.file_type != "types")
        .map(|f| f.fan_in)
        .max()
        .unwrap_or(0)
}

/// Turn the language accumulator map into a sorted list of language stats.
fn languages_from(lang_map: HashMap<String, (usize, usize)>) -> Vec<LanguageStat> {
    let mut languages: Vec<LanguageStat> = lang_map
        .into_iter()
        .map(|(language, (files_n, lines_n))| LanguageStat {
            language,
            files: files_n,
            lines: lines_n,
        })
        .collect();
    languages.sort_by(|a, b| b.lines.cmp(&a.lines));
    languages
}
