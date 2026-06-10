//! The per-file analysis pass: functions, complexity, responsibilities,
//! runtime/artifact typing, imports and secrets for one scanned file.
//! `analysis::analyze` (mod.rs) orchestrates and aggregates these results.

use crate::models::*;
use crate::scanner::RawFile;
use std::collections::HashSet;

use super::complexity::{complexity_of, strip_for_cc};
use super::defs::{FuncHit, Patterns, LONG_FUNC_THRESHOLD};
use super::detect::{
    code_for_resp, code_view, count_ident, detect_artifact_type, detect_responsibilities,
    detect_runtime, find_decl_line, is_jsts, primary_symbol,
};
use super::lua::{self, resolve_lua, sanitize_lua};
use super::metrics::{detect_functions, measure_function};
use super::parse::{parse_imports, resolve_relative};
use super::secrets::scan_security;

/// Per-file outcome accumulated by `analyze`.
pub(crate) struct Analyzed {
    pub(crate) info: FileInfo,
    pub(crate) long: Vec<LongFunction>,
    pub(crate) unused: Vec<UnusedImport>,
    pub(crate) security: Vec<SecurityFinding>,
    pub(crate) edges: Vec<DependencyEdge>,
    /// Cyclomatic complexity of every detected function in the file.
    pub(crate) cc_all: Vec<usize>,
    /// Functions with CC >= 8 (candidates for the top list).
    pub(crate) complex: Vec<ComplexFunction>,
}

/// Build the FileInfo for a noise file (counted in totals, excluded from metrics).
pub(crate) fn noise_info(
    f: &RawFile,
    lt: usize,
    lb: usize,
    lc: usize,
    lcode: usize,
    reason: &str,
) -> FileInfo {
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

/// Functions, complexity and long-function findings collected for one file.
struct FuncScan {
    n_functions: usize,
    long_count: usize,
    long: Vec<LongFunction>,
    cc_all: Vec<usize>,
    complex: Vec<ComplexFunction>,
    longest_len: usize,
    longest_name: String,
    longest_line: usize,
}

/// Responsibilities, runtime, artifact type and component identity for a file.
struct Profile {
    responsibilities: Vec<Responsibility>,
    runtime: String,
    file_type: String,
    component_name: String,
    component_line: usize,
}

/// Run the full per-file analysis (functions, responsibilities, imports, secrets).
pub(crate) fn analyze_file(
    f: &RawFile,
    pats: &Patterns,
    fileset: &HashSet<&str>,
    lt: usize,
    lb: usize,
    lc: usize,
    lcode: usize,
) -> Analyzed {
    let scan = scan_functions(f, pats);
    let profile = build_profile(f, &scan);
    let (unused, edges) = scan_imports(f, pats, fileset);

    let mut security: Vec<SecurityFinding> = Vec::new();
    scan_security(&f.rel_path, &f.language, &f.content, pats, &mut security);

    let info = FileInfo {
        path: f.rel_path.clone(),
        language: f.language.clone(),
        ext: f.ext.clone(),
        lines: lt,
        code_lines: lcode,
        comment_lines: lc,
        blank_lines: lb,
        size_bytes: f.size_bytes,
        functions: scan.n_functions,
        long_functions: scan.long_count,
        noise: false,
        noise_reason: None,
        runtime: profile.runtime,
        file_type: profile.file_type,
        responsibilities: profile.responsibilities,
        longest_function: scan.longest_len,
        longest_function_name: scan.longest_name,
        longest_function_line: scan.longest_line,
        component_name: profile.component_name,
        component_line: profile.component_line,
        fan_in: 0,
    };
    Analyzed {
        info,
        long: scan.long,
        unused,
        security,
        edges,
        cc_all: scan.cc_all,
        complex: scan.complex,
    }
}

/// Detect functions and measure each one's length and cyclomatic complexity,
/// accumulating long-function, complex-function and longest-function findings.
fn scan_functions(f: &RawFile, pats: &Patterns) -> FuncScan {
    // Lua: detection/measure/complexity all run on a comment- and string-free
    // view (keyword balance counting would otherwise trip on literals).
    let lua_clean: Option<String> = if f.language == "Lua" {
        Some(sanitize_lua(&f.content, true))
    } else {
        None
    };
    let func_src: &str = lua_clean.as_deref().unwrap_or(&f.content);
    let lines_vec: Vec<&str> = func_src.lines().collect();
    let hits = detect_functions(func_src, &f.language, pats);
    let cc_src: Option<String> = if hits.is_empty() || lua_clean.is_some() {
        None // Lua already sanitized; no functions means nothing to count
    } else {
        Some(strip_for_cc(&f.content, &f.language))
    };
    let cc_lines: Vec<&str> = match &cc_src {
        Some(s) => s.lines().collect(),
        None => lines_vec.clone(),
    };

    let mut scan = FuncScan {
        n_functions: hits.len(),
        long_count: 0,
        long: Vec::new(),
        cc_all: Vec::with_capacity(hits.len()),
        complex: Vec::new(),
        longest_len: 0,
        longest_name: String::new(),
        longest_line: 0,
    };
    for h in &hits {
        let length = measure_function(&lines_vec, h, &f.language);
        let cc = complexity_of(&cc_lines, h.start_line, length, &f.language);
        record_hit(f, h, length, cc, &mut scan);
    }
    scan
}

/// Fold one measured function into the scan accumulator (cc, complex-function,
/// longest-function and long-function findings).
fn record_hit(f: &RawFile, h: &FuncHit, length: usize, cc: usize, scan: &mut FuncScan) {
    scan.cc_all.push(cc);
    if cc >= 8 {
        scan.complex.push(ComplexFunction {
            file: f.rel_path.clone(),
            name: h.name.clone(),
            start_line: h.start_line + 1,
            length,
            complexity: cc,
            language: f.language.clone(),
        });
    }
    if length > scan.longest_len {
        scan.longest_len = length;
        scan.longest_name = h.name.clone();
        scan.longest_line = h.start_line + 1;
    }
    if length > LONG_FUNC_THRESHOLD {
        scan.long_count += 1;
        scan.long.push(LongFunction {
            file: f.rel_path.clone(),
            name: h.name.clone(),
            start_line: h.start_line + 1,
            length,
            language: f.language.clone(),
        });
    }
}

/// Responsibilities, runtime, artifact type and the file's primary component
/// — all matched on sanitized code views.
fn build_profile(f: &RawFile, scan: &FuncScan) -> Profile {
    let code = code_view(&f.content, &f.language);
    let resp_code = code_for_resp(&f.content, &f.language);
    let responsibilities = detect_responsibilities(&resp_code, &f.language);
    let runtime = if is_jsts(&f.language) {
        detect_runtime(&f.rel_path, &code)
    } else if f.language == "Lua" {
        lua::detect_lua_runtime(&f.rel_path, &code)
    } else {
        "shared".to_string()
    };
    let file_type =
        detect_artifact_type(&f.rel_path, &f.language, &f.ext, &runtime, &responsibilities, &code);

    let fname = f.rel_path.rsplit('/').next().unwrap_or(&f.rel_path);
    let stem = fname.rsplit_once('.').map(|(s, _)| s).unwrap_or(fname);
    let component_name = primary_symbol(stem, &scan.longest_name);
    let decl_line = find_decl_line(&code, &component_name);
    let component_line = if decl_line > 0 { decl_line } else { scan.longest_line };

    Profile { responsibilities, runtime, file_type, component_name, component_line }
}

/// Parse imports into unused-import findings and resolved dependency edges.
fn scan_imports(
    f: &RawFile,
    pats: &Patterns,
    fileset: &HashSet<&str>,
) -> (Vec<UnusedImport>, Vec<DependencyEdge>) {
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
            // Lua requires resolve from the project root, not the importer dir.
            let target = if f.language == "Lua" {
                resolve_lua(&imp.source, fileset)
            } else {
                resolve_relative(&f.rel_path, &imp.source, fileset)
            };
            if let Some(target) = target {
                edges.push(DependencyEdge {
                    from: f.rel_path.clone(),
                    to: target,
                });
            }
        }
    }
    (unused, edges)
}
