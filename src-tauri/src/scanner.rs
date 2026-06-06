//! File scanning layer: walk the project tree, ignore noise directories,
//! and read recognized source/text files into memory for analysis.

use std::path::Path;
use walkdir::{DirEntry, WalkDir};

/// A single text file that survived scanning, with its content loaded.
pub struct RawFile {
    pub rel_path: String,
    pub language: String,
    pub ext: String,
    pub size_bytes: u64,
    pub content: String,
    /// Some(reason) if this file is "noise" (lockfile, generated, minified):
    /// it is counted in project totals but excluded from quality metrics.
    pub noise_reason: Option<String>,
}

/// Classify a file as noise (still counted, but excluded from huge-file /
/// duplication / scoring) by its name and path.
pub fn noise_reason(rel_path: &str) -> Option<&'static str> {
    let name = rel_path.rsplit('/').next().unwrap_or(rel_path).to_ascii_lowercase();
    match name.as_str() {
        "package-lock.json" | "yarn.lock" | "pnpm-lock.yaml" | "npm-shrinkwrap.json"
        | "composer.lock" | "cargo.lock" | "poetry.lock" | "gemfile.lock" | "go.sum"
        | "bun.lockb" | "deno.lock" => return Some("lockfile"),
        _ => {}
    }
    if name.ends_with(".min.js")
        || name.ends_with(".min.css")
        || name.ends_with(".map")
        || name.ends_with(".bundle.js")
        || name.ends_with(".d.ts")
        || name.ends_with("-schema.json")
    {
        return Some("generated");
    }
    let p = rel_path.to_ascii_lowercase();
    if p.contains("/generated/")
        || p.starts_with("generated/")
        || p.contains("/__generated__/")
        || p.contains("/gen/") // tauri & codegen output (e.g. src-tauri/gen/schemas)
        || p.starts_with("gen/")
        || p.contains("/.vercel/")
        || p.contains("/.turbo/")
    {
        return Some("generated");
    }
    None
}

pub struct ScanOutput {
    pub files: Vec<RawFile>,
    pub total_seen: usize,
    pub skipped: usize,
}

/// Directories we never descend into — build output, dependencies, VCS, caches.
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "vendor",
    "venv",
    "__pycache__",
    "coverage",
    "bin",
    "obj",
    "Pods",
    "bower_components",
    "DerivedData",
];

/// Skip files bigger than this (lockfiles, generated bundles, data dumps).
const MAX_FILE_BYTES: u64 = 2_000_000;

/// Map a file extension to a human language name, or `None` if we don't analyze it.
pub fn language_for_ext(ext: &str) -> Option<&'static str> {
    let lang = match ext.to_ascii_lowercase().as_str() {
        "rs" => "Rust",
        "ts" | "mts" | "cts" => "TypeScript",
        "tsx" => "TypeScript",
        "js" | "mjs" | "cjs" => "JavaScript",
        "jsx" => "JavaScript",
        "py" => "Python",
        "go" => "Go",
        "java" => "Java",
        "kt" | "kts" => "Kotlin",
        "swift" => "Swift",
        "c" | "h" => "C",
        "cpp" | "cc" | "cxx" | "hpp" | "hh" => "C++",
        "cs" => "C#",
        "rb" => "Ruby",
        "php" => "PHP",
        "lua" => "Lua",
        "dart" => "Dart",
        "scala" => "Scala",
        "vue" => "Vue",
        "svelte" => "Svelte",
        "css" | "scss" | "sass" | "less" => "CSS",
        "html" | "htm" => "HTML",
        "json" => "JSON",
        "yml" | "yaml" => "YAML",
        "toml" => "TOML",
        "md" | "mdx" => "Markdown",
        "sh" | "bash" | "zsh" => "Shell",
        "sql" => "SQL",
        _ => return None,
    };
    Some(lang)
}

fn is_ignored_dir(entry: &DirEntry) -> bool {
    // Never prune the root the user explicitly chose.
    if entry.depth() == 0 {
        return false;
    }
    if entry.file_type().is_dir() {
        if let Some(name) = entry.file_name().to_str() {
            if IGNORED_DIRS.contains(&name) {
                return true;
            }
            // Skip hidden tooling dirs (.git, .next, .idea, .vscode, ...).
            if name.starts_with('.') {
                return true;
            }
        }
    }
    false
}

/// Walk `root`, returning all recognized text files with content loaded.
/// `on_progress` is invoked periodically with the running count of read files.
pub fn scan_dir(root: &Path, on_progress: &mut dyn FnMut(usize)) -> ScanOutput {
    let mut files: Vec<RawFile> = Vec::new();
    let mut total_seen = 0usize;
    let mut skipped = 0usize;

    let walker = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_ignored_dir(e));

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        total_seen += 1;

        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        let language = match language_for_ext(&ext) {
            Some(l) => l.to_string(),
            None => {
                skipped += 1;
                continue;
            }
        };

        let size_bytes = match entry.metadata() {
            Ok(m) => m.len(),
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        if size_bytes > MAX_FILE_BYTES {
            skipped += 1;
            continue;
        }

        // Non-UTF8 / binary content fails here and is simply skipped.
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };

        let rel_path = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        let noise = noise_reason(&rel_path).map(|s| s.to_string());

        files.push(RawFile {
            rel_path,
            language,
            ext: ext.to_ascii_lowercase(),
            size_bytes,
            content,
            noise_reason: noise,
        });

        if files.len() % 40 == 0 {
            on_progress(files.len());
        }
    }

    on_progress(files.len());
    ScanOutput {
        files,
        total_seen,
        skipped,
    }
}
