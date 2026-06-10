//! Engine v3 fixtures: statement-bounded measurement for brace-less (expression
//! body) arrow functions, and fan-in fairness for type-only modules.

use super::complexity::{complexity_of, strip_for_cc};
use super::metrics::{detect_functions, measure_function};
use super::*;

// Fixture AB — brace-less (expression-body) arrow functions end at their own
// statement; they must never swallow a later function's braces. Regression
// for the phantom CC 22-24 / 17-24-line spans reported on consecutive
// one-liner arrows in src/lib/findings/shared.ts.
#[test]
fn fixture_ab_braceless_arrows_end_at_statement() {
    let mut content = String::from(
        "export const directResp = (fi: FileInfo) =>\n\
        \x20 fi.responsibilities.filter((r) => r.evidence === \"direct\");\n\
        export const weightyDirect = (fi: FileInfo) =>\n\
        \x20 directResp(fi).filter((r) => kindWeight(r.kind) >= 2);\n\
        export const directKinds = (fi: FileInfo) => weightyDirect(fi).map((r) => r.kind);\n\
        export const hasDirectIO = (fi: FileInfo) => directKinds(fi).includes(\"websocket\");\n\
        export const directCount = (fi: FileInfo) => directKinds(fi).length;\n\
        function blastRadiusOf(files: FileInfo[]) {\n\
        \x20 let n = 0;\n",
    );
    for i in 0..19 {
        content.push_str(&format!("  if (files.length > {i}) {{ n += {i}; }}\n"));
    }
    content.push_str("  return n;\n}\n");

    let pats = Patterns::new();
    let hits = detect_functions(&content, "TypeScript", &pats);
    assert_eq!(hits.len(), 6, "5 arrows + 1 braced function");
    let lines: Vec<&str> = content.lines().collect();
    let stripped = strip_for_cc(&content, "TypeScript");
    let cc_lines: Vec<&str> = stripped.lines().collect();
    for h in &hits {
        let length = measure_function(&lines, h, "TypeScript");
        let cc = complexity_of(&cc_lines, h.start_line, length, "TypeScript");
        if h.name == "blastRadiusOf" {
            assert_eq!(length, 23, "braced function keeps its true span");
            assert_eq!(cc, 20, "braced function keeps its true complexity");
        } else {
            assert!(length <= 3, "{} measured {} lines (must be <= 3)", h.name, length);
            assert!(cc <= 3, "{} got CC {} (must be <= 3)", h.name, cc);
        }
    }
}

// Fixture AC — a brace-less arrow whose expression spans 3 lines via a
// method chain is measured as exactly those 3 lines; the next braced
// function is unaffected.
#[test]
fn fixture_ac_multiline_braceless_arrow() {
    let content = "const chained = (xs: number[]) =>\n\
        \x20 xs.filter((x) => x > 0)\n\
        \x20   .map((x) => x * 2);\n\
        function after(cond: boolean) {\n\
        \x20 if (cond) { return 1; }\n\
        \x20 return 0;\n\
        }\n";
    let pats = Patterns::new();
    let hits = detect_functions(content, "TypeScript", &pats);
    assert_eq!(hits.len(), 2);
    let lines: Vec<&str> = content.lines().collect();
    let chained = hits.iter().find(|h| h.name == "chained").unwrap();
    assert_eq!(measure_function(&lines, chained, "TypeScript"), 3);
    let after = hits.iter().find(|h| h.name == "after").unwrap();
    assert_eq!(measure_function(&lines, after, "TypeScript"), 4);
}

fn plain_info(path: &str, file_type: &str) -> FileInfo {
    FileInfo {
        path: path.into(),
        language: "TypeScript".into(),
        ext: "ts".into(),
        lines: 10,
        code_lines: 8,
        comment_lines: 1,
        blank_lines: 1,
        size_bytes: 0,
        functions: 0,
        long_functions: 0,
        noise: false,
        noise_reason: None,
        runtime: "shared".into(),
        file_type: file_type.into(),
        responsibilities: Vec::new(),
        longest_function: 0,
        longest_function_name: String::new(),
        longest_function_line: 0,
        component_name: String::new(),
        component_line: 0,
        fan_in: 0,
    }
}

// Fixture AD — the `max_fan_in` scoring input ignores pure type modules
// (stable shared vocabulary, not coupling risk); the per-file fan_in display
// value is still assigned to them.
#[test]
fn fixture_ad_max_fan_in_excludes_type_modules() {
    let mut infos = vec![
        plain_info("src/lib/types.ts", "types"),
        plain_info("src/components/App.tsx", "react_component"),
    ];
    let mut edges: Vec<DependencyEdge> = Vec::new();
    for i in 0..20 {
        edges.push(DependencyEdge { from: format!("src/a{i}.ts"), to: "src/lib/types.ts".into() });
    }
    for i in 0..9 {
        edges.push(DependencyEdge { from: format!("src/b{i}.ts"), to: "src/components/App.tsx".into() });
    }
    let max = assign_fan_in(&mut infos, &edges);
    assert_eq!(max, 9, "the types module must not drive the coupling score");
    assert_eq!(infos[0].fan_in, 20, "display fan_in for the types file is untouched");
    assert_eq!(infos[1].fan_in, 9);
}
