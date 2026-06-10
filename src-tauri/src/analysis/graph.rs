//! Dependency cycles: iterative Tarjan SCC over the file import graph.

use crate::models::DependencyEdge;
use std::collections::{HashMap, HashSet};

/// Returns (count of SCCs with >= 2 files, up to 20 cycles largest-first,
/// each capped at 12 paths, paths sorted for stable output).
pub(crate) fn find_cycles(edges: &[DependencyEdge]) -> (usize, Vec<Vec<String>>) {
    let (names, adj) = build_graph(edges);
    let mut tarjan = Tarjan::new(names.len());
    for root in 0..names.len() {
        tarjan.strongconnect(root, &adj);
    }
    collect_cycles(tarjan.sccs, &names)
}

/// Number the distinct file paths and build the deduplicated adjacency list
/// (no self-loops, no parallel edges).
fn build_graph(edges: &[DependencyEdge]) -> (Vec<&str>, Vec<Vec<usize>>) {
    let mut idx: HashMap<&str, usize> = HashMap::new();
    let mut names: Vec<&str> = Vec::new();
    for e in edges {
        for s in [e.from.as_str(), e.to.as_str()] {
            if !idx.contains_key(s) {
                idx.insert(s, names.len());
                names.push(s);
            }
        }
    }
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); names.len()];
    let mut seen: HashSet<(usize, usize)> = HashSet::new();
    for e in edges {
        let (a, b) = (idx[e.from.as_str()], idx[e.to.as_str()]);
        if a != b && seen.insert((a, b)) {
            adj[a].push(b);
        }
    }
    (names, adj)
}

/// Iterative Tarjan SCC state. `strongconnect` drives one DFS root; SCCs with
/// >= 2 nodes accumulate in `sccs`.
struct Tarjan {
    index: Vec<usize>,
    low: Vec<usize>,
    on_stack: Vec<bool>,
    stack: Vec<usize>,
    counter: usize,
    sccs: Vec<Vec<usize>>,
}

impl Tarjan {
    fn new(n: usize) -> Self {
        Tarjan {
            index: vec![usize::MAX; n],
            low: vec![0usize; n],
            on_stack: vec![false; n],
            stack: Vec::new(),
            counter: 0,
            sccs: Vec::new(),
        }
    }

    /// Iterative strongconnect from `root` (no-op if already visited). Uses an
    /// explicit call stack of (node, next child position) frames.
    fn strongconnect(&mut self, root: usize, adj: &[Vec<usize>]) {
        if self.index[root] != usize::MAX {
            return;
        }
        let mut call: Vec<(usize, usize)> = vec![(root, 0)];
        while let Some(frame) = call.last_mut() {
            let v = frame.0;
            if frame.1 == 0 {
                self.index[v] = self.counter;
                self.low[v] = self.counter;
                self.counter += 1;
                self.stack.push(v);
                self.on_stack[v] = true;
            }
            if frame.1 < adj[v].len() {
                let w = adj[v][frame.1];
                frame.1 += 1;
                if self.index[w] == usize::MAX {
                    call.push((w, 0));
                } else if self.on_stack[w] {
                    self.low[v] = self.low[v].min(self.index[w]);
                }
            } else {
                call.pop();
                if let Some(parent) = call.last() {
                    let p = parent.0;
                    self.low[p] = self.low[p].min(self.low[v]);
                }
                self.close_scc(v);
            }
        }
    }

    /// When `v` is an SCC root, pop its component off the stack and record it
    /// if it spans at least two nodes.
    fn close_scc(&mut self, v: usize) {
        if self.low[v] != self.index[v] {
            return;
        }
        let mut comp: Vec<usize> = Vec::new();
        loop {
            let w = self.stack.pop().unwrap();
            self.on_stack[w] = false;
            comp.push(w);
            if w == v {
                break;
            }
        }
        if comp.len() >= 2 {
            self.sccs.push(comp);
        }
    }
}

/// Sort SCCs largest-first, then map node indices back to sorted, capped paths.
fn collect_cycles(mut sccs: Vec<Vec<usize>>, names: &[&str]) -> (usize, Vec<Vec<String>>) {
    sccs.sort_by(|a, b| b.len().cmp(&a.len()));
    let cycle_count = sccs.len();
    let cycles: Vec<Vec<String>> = sccs
        .into_iter()
        .take(20)
        .map(|c| {
            let mut paths: Vec<String> = c.into_iter().map(|i| names[i].to_string()).collect();
            paths.sort();
            paths.truncate(12);
            paths
        })
        .collect();
    (cycle_count, cycles)
}
