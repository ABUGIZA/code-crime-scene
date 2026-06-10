//! Duplication v2: stride-1 sliding windows of DUP_WINDOW normalized lines
//! with accurate accounting. Every duplicated position is counted once via a
//! per-file mask (the first project-wide occurrence stays "original"), and
//! display blocks merge runs of consecutive duplicated window starts.

use super::defs::DUP_WINDOW;
use super::lines::is_comment_start;
use crate::models::DuplicationBlock;
use crate::scanner::RawFile;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

struct DupFile {
    path: String,
    norms: Vec<String>,
}

pub(crate) struct DupIndex {
    files: Vec<DupFile>,
    /// fingerprint -> (file index, window start) in project scan order.
    map: HashMap<u64, Vec<(u32, u32)>>,
}

impl DupIndex {
    pub(crate) fn new() -> Self {
        DupIndex { files: Vec::new(), map: HashMap::new() }
    }

    pub(crate) fn add_file(&mut self, f: &RawFile) {
        let norms: Vec<String> = f
            .content
            .lines()
            .filter_map(|l| normalize_code_line(l, &f.language))
            .collect();
        let fid = self.files.len() as u32;
        if norms.len() >= DUP_WINDOW {
            for i in 0..=(norms.len() - DUP_WINDOW) {
                let fp = hash_window(&norms[i..i + DUP_WINDOW]);
                self.map.entry(fp).or_default().push((fid, i as u32));
            }
        }
        self.files.push(DupFile { path: f.rel_path.clone(), norms });
    }

    /// Returns (display blocks, total merged block count, duplicated-line ratio).
    pub(crate) fn finish(self, code_lines: usize) -> (Vec<DuplicationBlock>, usize, f64) {
        let (masks, canon) = self.build_masks();
        let duplicated: usize = masks.iter().map(|m| m.iter().filter(|b| **b).count()).sum();
        let ratio = if code_lines > 0 {
            (duplicated as f64 / code_lines as f64).min(1.0)
        } else {
            0.0
        };

        let mut blocks: Vec<DuplicationBlock> = Vec::new();
        for (fid, starts) in canon.into_iter().enumerate() {
            self.merge_runs(fid, starts, &mut blocks);
        }
        // A short repeat confined to a single file is below the actionable bar
        // (structs/builders legitimately rhyme). Surface same-file blocks only
        // when the run spans at least two windows' worth of lines; cross-file
        // duplication is always surfaced. The line RATIO keeps counting both.
        blocks.retain(|b| b.files.len() >= 2 || b.line_count >= DUP_WINDOW * 2);
        let total = blocks.len();
        blocks.sort_by(|a, b| (b.occurrences * b.line_count).cmp(&(a.occurrences * a.line_count)));
        blocks.truncate(20);
        (blocks, total, ratio)
    }

    /// Mark every non-canonical duplicated position per file, and collect each
    /// file's canonical (first project-wide) window starts of duplicated fps.
    fn build_masks(&self) -> (Vec<Vec<bool>>, Vec<Vec<(u32, u64)>>) {
        let mut masks: Vec<Vec<bool>> = self.files.iter().map(|f| vec![false; f.norms.len()]).collect();
        let mut canon: Vec<Vec<(u32, u64)>> = vec![Vec::new(); self.files.len()];
        for (fp, occ) in &self.map {
            if occ.len() < 2 {
                continue;
            }
            for &(fid, start) in &occ[1..] {
                let m = &mut masks[fid as usize];
                for k in start as usize..start as usize + DUP_WINDOW {
                    if k < m.len() {
                        m[k] = true;
                    }
                }
            }
            let (cf, cs) = occ[0];
            canon[cf as usize].push((cs, *fp));
        }
        (masks, canon)
    }

    /// Merge a file's canonical starts into display blocks over runs of
    /// consecutive window starts, appending each completed run to `blocks`.
    fn merge_runs(&self, fid: usize, mut starts: Vec<(u32, u64)>, blocks: &mut Vec<DuplicationBlock>) {
        if starts.is_empty() {
            return;
        }
        starts.sort_by_key(|(s, _)| *s);
        let mut run_start = starts[0].0;
        let mut prev = starts[0].0;
        let mut run_fps: Vec<u64> = vec![starts[0].1];
        for &(s, fp) in &starts[1..] {
            if s == prev + 1 {
                prev = s;
                run_fps.push(fp);
            } else {
                blocks.push(self.block_from(fid, run_start, prev, &run_fps));
                run_start = s;
                prev = s;
                run_fps = vec![fp];
            }
        }
        blocks.push(self.block_from(fid, run_start, prev, &run_fps));
    }

    /// Build a display block from a merged run of window starts in one file.
    fn block_from(&self, fid: usize, run_start: u32, run_end: u32, fps: &[u64]) -> DuplicationBlock {
        let mut occurrences = 0usize;
        let mut files: Vec<String> = Vec::new();
        for fp in fps {
            if let Some(occ) = self.map.get(fp) {
                occurrences = occurrences.max(occ.len());
                for &(ofid, _) in occ {
                    let p = &self.files[ofid as usize].path;
                    if !files.iter().any(|x| x == p) {
                        files.push(p.clone());
                    }
                }
            }
        }
        let norms = &self.files[fid].norms;
        let s = run_start as usize;
        let sample = norms[s..(s + DUP_WINDOW).min(norms.len())].join("\n");
        DuplicationBlock {
            fingerprint: format!("{:016x}", fps.first().copied().unwrap_or(0)),
            line_count: (run_end - run_start) as usize + DUP_WINDOW,
            occurrences,
            files,
            sample,
        }
    }
}

pub(crate) fn normalize_code_line(raw: &str, lang: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() || is_comment_start(t, lang) {
        return None;
    }
    let alnum = t.chars().filter(|c| c.is_alphanumeric()).count();
    if alnum < 3 {
        return None;
    }
    let collapsed = t.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.len() < 12 {
        return None;
    }
    Some(collapsed)
}

pub(crate) fn hash_window(window: &[String]) -> u64 {
    let mut h = DefaultHasher::new();
    for l in window {
        l.hash(&mut h);
        0xFFu8.hash(&mut h);
    }
    h.finish()
}
