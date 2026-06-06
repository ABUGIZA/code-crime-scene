//! Static analysis layer — orchestration. Submodules: defs (types/patterns),
//! metrics (lines/functions), detect (runtime/artifact/responsibilities),
//! parse (imports/duplication/secrets).

use crate::models::*;
use crate::scanner::{RawFile, ScanOutput};
use std::collections::{HashMap, HashSet};

mod defs;
mod detect;
mod metrics;
mod parse;
#[cfg(test)]
mod tests;

use defs::*;
use detect::*;
use metrics::*;
use parse::*;

pub fn analyze(
    project_name: &str,
    project_path: &str,
    scan: &ScanOutput,
    generated_at: i64,
) -> AnalysisResult {
    let pats = Patterns::new();
    let files = &scan.files;
    let fileset: HashSet<&str> = files.iter().map(|f| f.rel_path.as_str()).collect();

    let mut file_infos: Vec<FileInfo> = Vec::with_capacity(files.len());
    let mut noise_infos: Vec<FileInfo> = Vec::new();
    let mut all_long: Vec<LongFunction> = Vec::new();
    let mut all_unused: Vec<UnusedImport> = Vec::new();
    let mut all_security: Vec<SecurityFinding> = Vec::new();
    let mut edges: Vec<DependencyEdge> = Vec::new();
    let mut lang_map: HashMap<String, (usize, usize)> = HashMap::new();
    let mut dup_map: HashMap<u64, DupAcc> = HashMap::new();
    let (mut total_lines, mut code_lines, mut comment_lines, mut blank_lines) = (0usize, 0usize, 0usize, 0usize);
    let (mut total_bytes, mut total_functions) = (0u64, 0usize);
    let (mut ignored_files, mut ignored_lines) = (0usize, 0usize);

    for f in files {
        let (lt, lb, lc) = classify_lines(&f.content, &f.language);
        let lcode = lt.saturating_sub(lb + lc);
        total_bytes += f.size_bytes;
        if let Some(reason) = &f.noise_reason {
            ignored_files += 1;
            ignored_lines += lt;
            noise_infos.push(noise_info(f, lt, lb, lc, lcode, reason));
            continue;
        }
        total_lines += lt;
        blank_lines += lb;
        comment_lines += lc;
        code_lines += lcode;
        let e = lang_map.entry(f.language.clone()).or_insert((0, 0));
        e.0 += 1;
        e.1 += lt;
        accumulate_duplication(f, &mut dup_map);
        let out = analyze_file(f, &pats, &fileset, lt, lb, lc, lcode);
        total_functions += out.info.functions;
        all_long.extend(out.long);
        all_unused.extend(out.unused);
        all_security.extend(out.security);
        edges.extend(out.edges);
        file_infos.push(out.info);
    }

    let max_fan_in = assign_fan_in(&mut file_infos, &edges);

    let huge_file_count = file_infos.iter().filter(|f| f.lines > 400).count();
    let analyzed_files = file_infos.len();
    let mut largest = file_infos.clone();
    largest.sort_by(|a, b| b.lines.cmp(&a.lines));
    largest.truncate(15);

    let mut ignored_largest = noise_infos.clone();
    ignored_largest.sort_by(|a, b| b.lines.cmp(&a.lines));
    ignored_largest.truncate(8);

    let mut all_files = file_infos.clone();
    all_files.sort_by(|a, b| b.lines.cmp(&a.lines));
    all_files.truncate(120);

    let total_long_functions = all_long.len();
    all_long.sort_by(|a, b| b.length.cmp(&a.length));
    all_long.truncate(30);

    let total_unused_imports = all_unused.len();
    all_unused.truncate(60);

    let security_high = all_security.iter().filter(|s| s.severity == "high").count();
    let security_medium = all_security.iter().filter(|s| s.severity == "medium").count();
    let security_low = all_security.iter().filter(|s| s.severity == "low").count();
    all_security.sort_by_key(|s| severity_rank(&s.severity));
    all_security.truncate(100);

    edges.truncate(600);

    let (dup_blocks, total_duplicate_blocks, duplicate_line_ratio) = dup_blocks_from(&dup_map, code_lines);
    let languages = languages_from(lang_map);

    let scanned = files.len();
    let avg_file_lines = if analyzed_files > 0 {
        total_lines as f64 / analyzed_files as f64
    } else {
        0.0
    };

    AnalysisResult {
        project_name: project_name.to_string(),
        project_path: project_path.to_string(),
        generated_at,
        total_files: scan.total_seen,
        scanned_files: scanned,
        skipped_files: scan.skipped,
        analyzed_files,
        ignored_files,
        ignored_lines,
        total_lines,
        code_lines,
        comment_lines,
        blank_lines,
        total_bytes,
        total_functions,
        avg_file_lines,
        max_fan_in,
        duplicate_line_ratio,
        total_long_functions,
        total_unused_imports,
        total_duplicate_blocks,
        huge_file_count,
        security_high,
        security_medium,
        security_low,
        verify_commands: extract_verify_commands(files),
        languages,
        largest_files: largest,
        ignored_largest,
        all_files,
        long_functions: all_long,
        duplication: dup_blocks,
        unused_imports: all_unused,
        security_findings: all_security,
        dependencies: edges,
    }
}

/// Per-file outcome accumulated by `analyze`.
struct Analyzed {
    info: FileInfo,
    long: Vec<LongFunction>,
    unused: Vec<UnusedImport>,
    security: Vec<SecurityFinding>,
    edges: Vec<DependencyEdge>,
}

/// Build the FileInfo for a noise file (counted in totals, excluded from metrics).
fn noise_info(f: &RawFile, lt: usize, lb: usize, lc: usize, lcode: usize, reason: &str) -> FileInfo {
    FileInfo {
        path: f.rel_path.clone(),
        language: f.language.clone(),
        ext: f.ext.clone(),
        lines: lt,
        code_lines: lcode,
        comment_lines: lc,
        blank_lines: lb,
        size_bytes: f.size_bytes,
        functions: 0,
        long_functions: 0,
        noise: true,
        noise_reason: Some(reason.to_string()),
        runtime: "shared".into(),
        file_type: reason.to_string(),
        responsibilities: Vec::new(),
        longest_function: 0,
        longest_function_name: String::new(),
        longest_function_line: 0,
        component_name: String::new(),
        component_line: 0,
        fan_in: 0,
    }
}

/// Run the full per-file analysis (functions, responsibilities, imports, secrets).
fn analyze_file(
    f: &RawFile,
    pats: &Patterns,
    fileset: &HashSet<&str>,
    lt: usize,
    lb: usize,
    lc: usize,
    lcode: usize,
) -> Analyzed {
    let lines_vec: Vec<&str> = f.content.lines().collect();

    // functions & long functions
    let hits = detect_functions(&f.content, &f.language, pats);
    let mut long: Vec<LongFunction> = Vec::new();
    let mut long_count = 0usize;
    let mut longest_len = 0usize;
    let mut longest_name = String::new();
    let mut longest_line = 0usize;
    for h in &hits {
        let length = measure_function(&lines_vec, h.start_line, &f.language);
        if length > longest_len {
            longest_len = length;
            longest_name = h.name.clone();
            longest_line = h.start_line + 1;
        }
        if length > LONG_FUNC_THRESHOLD {
            long_count += 1;
            long.push(LongFunction {
                file: f.rel_path.clone(),
                name: h.name.clone(),
                start_line: h.start_line + 1,
                length,
                language: f.language.clone(),
            });
        }
    }

    // responsibilities / runtime / artifact type — matched on sanitized views.
    let code = code_view(&f.content, &f.language);
    let resp_code = code_for_resp(&f.content, &f.language);
    let responsibilities = detect_responsibilities(&resp_code, &f.language);
    let runtime = if is_jsts(&f.language) {
        detect_runtime(&f.rel_path, &code)
    } else {
        "shared".to_string()
    };
    let file_type =
        detect_artifact_type(&f.rel_path, &f.language, &f.ext, &runtime, &responsibilities, &code);

    let fname = f.rel_path.rsplit('/').next().unwrap_or(&f.rel_path);
    let stem = fname.rsplit_once('.').map(|(s, _)| s).unwrap_or(fname);
    let component_name = primary_symbol(stem, &longest_name);
    let decl_line = find_decl_line(&code, &component_name);
    let component_line = if decl_line > 0 { decl_line } else { longest_line };

    // imports: unused + dependency edges
    let mut unused: Vec<UnusedImport> = Vec::new();
    let mut edges: Vec<DependencyEdge> = Vec::new();
    let imports = parse_imports(&f.content, &f.language, pats);
    for imp in &imports {
        if matches!(
            f.language.as_str(),
            "TypeScript" | "JavaScript" | "Vue" | "Svelte" | "Python"
        ) {
            for name in &imp.local_names {
                if count_ident(&f.content, name) <= 1 {
                    unused.push(UnusedImport {
                        file: f.rel_path.clone(),
                        name: name.clone(),
                        source: imp.source.clone(),
                        line: imp.line,
                    });
                }
            }
        }
        if imp.is_relative {
            if let Some(target) = resolve_relative(&f.rel_path, &imp.source, fileset) {
                edges.push(DependencyEdge {
                    from: f.rel_path.clone(),
                    to: target,
                });
            }
        }
    }

    // secrets
    let mut security: Vec<SecurityFinding> = Vec::new();
    scan_security(&f.rel_path, &f.content, pats, &mut security);

    let info = FileInfo {
        path: f.rel_path.clone(),
        language: f.language.clone(),
        ext: f.ext.clone(),
        lines: lt,
        code_lines: lcode,
        comment_lines: lc,
        blank_lines: lb,
        size_bytes: f.size_bytes,
        functions: hits.len(),
        long_functions: long_count,
        noise: false,
        noise_reason: None,
        runtime,
        file_type,
        responsibilities,
        longest_function: longest_len,
        longest_function_name: longest_name,
        longest_function_line: longest_line,
        component_name,
        component_line,
        fan_in: 0,
    };
    Analyzed { info, long, unused, security, edges }
}

/// Assign per-file fan-in from the dependency edges; return the max fan-in.
fn assign_fan_in(file_infos: &mut [FileInfo], edges: &[DependencyEdge]) -> usize {
    let mut fan_in_map: HashMap<&str, usize> = HashMap::new();
    for e in edges {
        *fan_in_map.entry(e.to.as_str()).or_insert(0) += 1;
    }
    let max_fan_in = fan_in_map.values().cloned().max().unwrap_or(0);
    for fi in file_infos.iter_mut() {
        fi.fan_in = fan_in_map.get(fi.path.as_str()).copied().unwrap_or(0);
    }
    max_fan_in
}

/// Collapse the duplication map into sorted blocks; return (blocks, total, ratio).
fn dup_blocks_from(dup_map: &HashMap<u64, DupAcc>, code_lines: usize) -> (Vec<DuplicationBlock>, usize, f64) {
    let mut dup_blocks: Vec<DuplicationBlock> = Vec::new();
    let mut duplicated_lines = 0usize;
    for (fp, acc) in dup_map {
        if acc.occurrences >= 2 {
            duplicated_lines += (acc.occurrences - 1) * acc.line_count;
            dup_blocks.push(DuplicationBlock {
                fingerprint: format!("{:016x}", fp),
                line_count: acc.line_count,
                occurrences: acc.occurrences,
                files: acc.files.clone(),
                sample: acc.sample.clone(),
            });
        }
    }
    let total = dup_blocks.len();
    dup_blocks.sort_by(|a, b| (b.occurrences * b.line_count).cmp(&(a.occurrences * a.line_count)));
    dup_blocks.truncate(20);
    let ratio = if code_lines > 0 {
        (duplicated_lines as f64 / code_lines as f64).min(1.0)
    } else {
        0.0
    };
    (dup_blocks, total, ratio)
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

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------


