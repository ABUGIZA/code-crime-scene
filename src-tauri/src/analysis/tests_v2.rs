//! Engine v2 fixtures: cyclomatic complexity, Lua/FiveM support, secrets v2,
//! duplication v2 (sliding windows), and dependency cycles.

use super::complexity::{complexity_of, strip_for_cc};
use super::detect::detect_responsibilities;
use super::lua::{resolve_lua, sanitize_lua};
use super::metrics::{detect_functions, measure_function};
use super::*;

fn resp_of<'a>(resp: &'a [Responsibility], kind: &str) -> Option<&'a Responsibility> {
    resp.iter().find(|r| r.kind == kind)
}

// Fixture S — exact cyclomatic complexity for a TypeScript function:
// if + && + for + while + ternary + 2x case + catch + || = 9 points; ?. and
// ?? must NOT count.
#[test]
fn fixture_s_cc_typescript_exact() {
    let content = "function judge(a: number, b: number) {\n\
        \x20 if (a > 0 && b > 0) {\n\
        \x20   for (let i = 0; i < a; i++) {\n\
        \x20     while (b > 0) { b = b - 1; }\n\
        \x20   }\n\
        \x20 }\n\
        \x20 const x = a > b ? a : b;\n\
        \x20 const y = a ?? b;\n\
        \x20 const z = y?.toString();\n\
        \x20 switch (x) {\n\
        \x20   case 1: return 1;\n\
        \x20   case 2: return 2;\n\
        \x20 }\n\
        \x20 try { run(); } catch (e) { return x || 0; }\n\
        \x20 return x;\n\
        }";
    let pats = Patterns::new();
    let hits = detect_functions(content, "TypeScript", &pats);
    assert_eq!(hits.len(), 1);
    let lines: Vec<&str> = content.lines().collect();
    let length = measure_function(&lines, &hits[0], "TypeScript");
    assert_eq!(length, 16);
    let stripped = strip_for_cc(content, "TypeScript");
    let cc_lines: Vec<&str> = stripped.lines().collect();
    assert_eq!(complexity_of(&cc_lines, hits[0].start_line, length, "TypeScript"), 10);
}

// Fixture T — exact CC for Python: if+and, elif+or, for, while, except = 7.
#[test]
fn fixture_t_cc_python_exact() {
    let content = "def judge(a, b):\n\
        \x20   if a > 0 and b > 0:\n\
        \x20       return 1\n\
        \x20   elif a < 0 or b < 0:\n\
        \x20       return 2\n\
        \x20   for i in range(a):\n\
        \x20       while b:\n\
        \x20           b -= 1\n\
        \x20   try:\n\
        \x20       run()\n\
        \x20   except ValueError:\n\
        \x20       pass\n\
        \x20   return 0\n";
    let pats = Patterns::new();
    let hits = detect_functions(content, "Python", &pats);
    assert_eq!(hits.len(), 1);
    let lines: Vec<&str> = content.lines().collect();
    let length = measure_function(&lines, &hits[0], "Python");
    let stripped = strip_for_cc(content, "Python");
    let cc_lines: Vec<&str> = stripped.lines().collect();
    assert_eq!(complexity_of(&cc_lines, hits[0].start_line, length, "Python"), 8);
}

// Fixture U — Lua function detection and keyword-balance length: nested
// anonymous function, one-line `if x then y end`, and `do` on a for/while
// line never double-counts.
#[test]
fn fixture_u_lua_functions_and_length() {
    let content = "local M = {}\n\
        function M.outer(a)\n\
        \x20 local inner = function(x)\n\
        \x20   if x > 0 then return x end\n\
        \x20   return 0\n\
        \x20 end\n\
        \x20 if a then\n\
        \x20   return inner(a)\n\
        \x20 end\n\
        \x20 return 0\n\
        end\n\
        function quick() return 1 end\n\
        function loopy()\n\
        \x20 for i = 1, 10 do print(i) end\n\
        \x20 while true do break end\n\
        \x20 do local x = 1 end\n\
        end\n";
    let pats = Patterns::new();
    let clean = sanitize_lua(content, true);
    let hits = detect_functions(&clean, "Lua", &pats);
    let names: Vec<&str> = hits.iter().map(|h| h.name.as_str()).collect();
    assert!(names.contains(&"M.outer"));
    assert!(names.contains(&"inner"));
    assert!(names.contains(&"quick"));
    assert!(names.contains(&"loopy"));
    let lines: Vec<&str> = clean.lines().collect();
    let outer = hits.iter().find(|h| h.name == "M.outer").unwrap();
    assert_eq!(measure_function(&lines, outer, "Lua"), 10);
    let inner = hits.iter().find(|h| h.name == "inner").unwrap();
    assert_eq!(measure_function(&lines, inner, "Lua"), 4);
    let quick = hits.iter().find(|h| h.name == "quick").unwrap();
    assert_eq!(measure_function(&lines, quick, "Lua"), 1);
    let loopy = hits.iter().find(|h| h.name == "loopy").unwrap();
    assert_eq!(measure_function(&lines, loopy, "Lua"), 5);
    // CC for M.outer: two `if` decision points -> 3.
    assert_eq!(complexity_of(&lines, outer.start_line, 10, "Lua"), 3);
}

// Fixture V — Lua requires become root-relative dependency edges.
#[test]
fn fixture_v_lua_require_edges() {
    let pats = Patterns::new();
    let content = "local cfg = require('shared/config')\n\
        local util = require \"modules.util\"\n\
        local ox = require('ox_lib')\n";
    let imports = parse_imports(content, "Lua", &pats);
    assert_eq!(imports.len(), 3);
    assert_eq!(imports[0].source, "shared.config");
    assert!(imports[0].is_relative);
    assert_eq!(imports[0].line, 1);
    assert_eq!(imports[1].source, "modules.util");
    let mut fs: HashSet<&str> = HashSet::new();
    fs.insert("shared/config.lua");
    fs.insert("modules/util/init.lua");
    assert_eq!(resolve_lua("shared.config", &fs).as_deref(), Some("shared/config.lua"));
    assert_eq!(resolve_lua("modules.util", &fs).as_deref(), Some("modules/util/init.lua"));
    assert_eq!(resolve_lua("ox_lib", &fs), None);
}

// Fixture W — FiveM responsibilities fire for Lua; JS/TS tiers do not.
// Runtime and artifact typing follow path + native evidence.
#[test]
fn fixture_w_fivem_responsibilities_runtime_artifact() {
    let content = "RegisterNetEvent('shop:buy')\n\
        AddEventHandler('shop:buy', function(item)\n\
        \x20 TriggerClientEvent('shop:done', source)\n\
        end)\n";
    let resp = detect_responsibilities(content, "Lua");
    let ev = resp_of(&resp, "fivem_events").expect("fivem_events detected");
    assert_eq!(ev.evidence, "direct");
    assert_eq!(ev.label, "event_register");
    assert!(resp_of(&resp, "timers").is_none(), "JS tiers must not run for Lua");

    assert_eq!(lua::detect_lua_runtime("resources/shop/client/main.lua", ""), "client");
    assert_eq!(lua::detect_lua_runtime("resources/shop/sv_main.lua", "MySQL.Async.fetchAll(q)"), "server");
    assert_eq!(lua::detect_lua_runtime("resources/shop/fxmanifest.lua", ""), "shared");
    assert_eq!(lua::lua_artifact_type("resources/shop/fxmanifest.lua", "shared", &[], ""), "fivem_manifest");
    assert_eq!(lua::lua_artifact_type("resources/shop/cl_shop.lua", "client", &resp, content), "fivem_client_script");
    assert_eq!(lua::lua_artifact_type("lib/json.lua", "shared", &[], "local x = 1"), "lua_module");
}

fn scan(path: &str, lang: &str, content: &str) -> Vec<SecurityFinding> {
    let pats = Patterns::new();
    let mut out = Vec::new();
    scan_security(path, lang, content, &pats, &mut out);
    out
}

// Fixture X — secrets v2: provider tokens, placeholder skip, entropy gate,
// JWT, server.cfg keys, and test-path dampening.
#[test]
fn fixture_x_secrets_v2() {
    // Fixture tokens are assembled at runtime so this source file itself never
    // contains a matchable secret (the engine scans its own repo on self-scans).
    let gh = scan("src/config.ts", "TypeScript",
        &format!("const t = \"{}AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\";", "ghp_"));
    assert_eq!(gh.len(), 1);
    assert_eq!((gh[0].kind.as_str(), gh[0].severity.as_str()), ("GitHub token", "high"));
    assert!(gh[0].snippet.contains("«redacted»"));
    assert!(!gh[0].snippet.contains("ghp_"));

    let ph = scan("src/config.ts", "TypeScript", "const apiKey = \"your-api-key-here\";");
    assert!(ph.is_empty(), "placeholder values are skipped");

    let hi = scan("src/config.ts", "TypeScript", "const secret = \"aB3dE5gH7jK9mN1pQrStUvWx\";");
    assert_eq!((hi[0].kind.as_str(), hi[0].severity.as_str()), ("High-entropy secret", "high"));

    let lo = scan("src/config.ts", "TypeScript", "const password = \"aaaabbbbcccc\";");
    assert_eq!((lo[0].kind.as_str(), lo[0].severity.as_str()), ("Hardcoded secret", "medium"));

    let jwt = scan("src/auth.ts", "TypeScript",
        &format!("const auth = \"{a}hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{a}zdWIiOiIxMjM0NTY3ODkwIn0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ\";", a = "eyJ"));
    assert_eq!((jwt[0].kind.as_str(), jwt[0].severity.as_str()), ("JWT committed to source", "medium"));

    let rc = scan("server.cfg", "Config",
        "rcon_password supersecret123\nsv_licenseKey cfxk_abc123_def456\nsteam_webApiKey ABCDEF1234567890");
    assert_eq!(rc.len(), 3);
    assert!(rc.iter().all(|f| f.severity == "high"));
    assert_eq!(rc[0].kind, "RCON password in server.cfg");
    assert_eq!(rc[1].kind, "FiveM license key");
    assert_eq!(rc[2].kind, "Steam Web API key");
    assert!(rc[0].snippet.contains("«redacted»"));

    let damp = scan("tests/fixtures/keys.ts", "TypeScript",
        &format!("const t = \"{}AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\";", "ghp_"));
    assert_eq!(damp[0].severity, "low", "test paths are dampened");
}

fn raw(path: &str, content: &str) -> crate::scanner::RawFile {
    crate::scanner::RawFile {
        rel_path: path.into(),
        language: "TypeScript".into(),
        ext: "ts".into(),
        size_bytes: 0,
        content: content.into(),
        noise_reason: None,
    }
}

// Fixture Y — duplication v2: two files sharing an 8-line block produce a
// single merged display block of 8 lines and a non-zero ratio.
#[test]
fn fixture_y_duplication_sliding_windows() {
    let block = "const alphaValue = computeAlpha(input);\n\
        const betaValue = computeBeta(alphaValue);\n\
        const gammaValue = computeGamma(betaValue);\n\
        const deltaValue = computeDelta(gammaValue);\n\
        const epsilonValue = computeEpsilon(deltaValue);\n\
        const zetaValue = computeZeta(epsilonValue);\n\
        const etaValue = computeEta(zetaValue);\n\
        const thetaValue = computeTheta(etaValue);\n";
    let a = raw("src/a.ts", block);
    let b_content = format!("import {{ x }} from './x';\nexport function wrap() {{ return 1; }}\n{block}");
    let b = raw("src/b.ts", &b_content);
    let mut idx = DupIndex::new();
    idx.add_file(&a);
    idx.add_file(&b);
    let (blocks, total, ratio) = idx.finish(50);
    assert!(ratio > 0.0);
    // 8 duplicated normalized lines in b, counted once each: 8 / 50.
    assert!((ratio - 0.16).abs() < 1e-9);
    assert_eq!(total, 1, "consecutive window starts merge into one block");
    assert_eq!(blocks[0].line_count, 8);
    assert_eq!(blocks[0].occurrences, 2);
    assert_eq!(blocks[0].files, vec!["src/a.ts".to_string(), "src/b.ts".to_string()]);
}

// Fixture Y2 — a short repeat confined to ONE file still counts toward the
// ratio but is not surfaced as a display block (below the actionable bar).
#[test]
fn fixture_y2_same_file_short_repeat_not_surfaced() {
    let block = "const alphaValue = computeAlpha(input);\n\
        const betaValue = computeBeta(alphaValue);\n\
        const gammaValue = computeGamma(betaValue);\n\
        const deltaValue = computeDelta(gammaValue);\n\
        const epsilonValue = computeEpsilon(deltaValue);\n\
        const zetaValue = computeZeta(epsilonValue);\n";
    let content = format!("{block}export function spacer() {{ return 42; }}\n{block}");
    let f = raw("src/solo.ts", &content);
    let mut idx = DupIndex::new();
    idx.add_file(&f);
    let (blocks, total, ratio) = idx.finish(50);
    assert!(ratio > 0.0, "ratio still counts the repeated lines");
    assert_eq!(total, 0, "a 6-line same-file repeat is not an actionable block");
    assert!(blocks.is_empty());
}

// Fixture Z — a → b → a is one dependency cycle.
#[test]
fn fixture_z_dependency_cycle() {
    let edges = vec![
        DependencyEdge { from: "src/a.ts".into(), to: "src/b.ts".into() },
        DependencyEdge { from: "src/b.ts".into(), to: "src/a.ts".into() },
        DependencyEdge { from: "src/b.ts".into(), to: "src/c.ts".into() },
    ];
    let (count, cycles) = find_cycles(&edges);
    assert_eq!(count, 1);
    assert_eq!(cycles, vec![vec!["src/a.ts".to_string(), "src/b.ts".to_string()]]);
}

// Fixture AA — end-to-end analyze(): cycle detected through real import
// resolution, and the serialized JSON exposes the exact camelCase field
// names the shipped frontend contract expects.
#[test]
fn fixture_aa_analysis_result_contract() {
    let files = vec![
        raw("src/a.ts", "import { b } from './b';\nexport const a = () => b();\n"),
        raw("src/b.ts", "import { a } from './a';\nexport const b = () => a();\n"),
    ];
    let scan = crate::scanner::ScanOutput { files, total_seen: 2, skipped: 0 };
    let res = analyze("p", "/p", &scan, 0);
    assert_eq!(res.cycle_count, 1);
    assert_eq!(res.cycles[0], vec!["src/a.ts".to_string(), "src/b.ts".to_string()]);
    let json = serde_json::to_string(&res).unwrap();
    for key in [
        "\"avgComplexity\"",
        "\"maxComplexity\"",
        "\"highComplexityFunctions\"",
        "\"complexFunctions\"",
        "\"cycleCount\"",
        "\"cycles\"",
    ] {
        assert!(json.contains(key), "serialized contract field missing: {key}");
    }
}
