// Phase helpers for buildFindings — each function covers one phase of the
// orchestration, in the order findings.ts applies them. Detection /
// classification / refactor / verification still live in their own modules.

import type { AnalysisResult, FileInfo, Finding, Priority, RiskRationale } from "../types";
import { type T, SCORE_FLOOR, threshold, directResp, indirectResp, evidenceFor } from "./shared";
import { classify } from "./classify";
import { refactorFor, prSlicesFor } from "./refactor";
import { verifyFinding } from "./verify";

function rat(score: number, opts: Partial<RiskRationale> = {}): RiskRationale {
  return {
    score,
    blastRadius: opts.blastRadius ?? "low",
    directIO: opts.directIO ?? false,
    stateMachine: opts.stateMachine ?? false,
    confidence: opts.confidence ?? "high",
  };
}

function fileFinding(t: T, fi: FileInfo): Finding {
  const c = classify(fi, t);
  const file = fi.componentLine > 0 ? `${fi.path}:${fi.componentLine}` : fi.path;
  const f: Finding = {
    id: `${c.kind}:${fi.path}`,
    priority: c.priority,
    confidence: c.confidence,
    category: "actionable",
    kind: c.kind,
    title: t(`ftitle.${c.kind}`),
    file,
    line: fi.componentLine,
    symbol: fi.componentName,
    runtime: fi.runtime,
    evidence: evidenceFor(fi, t),
    why: c.why,
    nextStep: c.next,
    refactor: refactorFor(t, fi),
    rationale: c.rationale,
    prSlices: prSlicesFor(t, fi, c.kind),
    verifyNotes: [],
  };
  verifyFinding(f, fi, t);
  // A genuinely low-risk file is an observation, not an action item (req #4).
  if (f.category === "actionable" && f.rationale.score < SCORE_FLOOR) {
    f.category = "informational";
  }
  return f;
}

function isCandidate(fi: FileInfo): boolean {
  if (fi.noise) return false;
  const th = threshold(fi.fileType);
  return (
    fi.lines > th ||
    directResp(fi).length >= 2 ||
    fi.longestFunction > 130 ||
    (["react_root", "react_feature", "react_dialog", "react_icon"].includes(fi.fileType) && fi.lines > th - 50)
  );
}

function severity(fi: FileInfo): number {
  return (
    fi.lines +
    fi.longestFunction * 2 +
    directResp(fi).length * 200 +
    indirectResp(fi).length * 40 +
    (fi.fanIn ?? 0) * 10
  );
}

export function collectFileFindings(out: Finding[], a: AnalysisResult, t: T): void {
  const candidates = (a.allFiles || []).filter(isCandidate).sort((x, y) => severity(y) - severity(x));
  for (const fi of candidates.slice(0, 14)) out.push(fileFinding(t, fi));
}

export function securityFindings(out: Finding[], a: AnalysisResult, t: T): void {
  for (const sct of a.securityFindings.slice(0, 8)) {
    const priority: Priority = sct.severity === "high" ? "P0" : sct.severity === "medium" ? "P1" : "P2";
    const score = sct.severity === "high" ? 90 : sct.severity === "medium" ? 60 : 40;
    out.push({
      id: `security:${sct.file}:${sct.line}`,
      priority,
      confidence: "high",
      category: "actionable",
      kind: "security",
      title: t("ftitle.security"),
      file: `${sct.file}:${sct.line}`,
      line: sct.line,
      symbol: "",
      runtime: "shared",
      evidence: [sct.kind, sct.snippet],
      why: t("why.security"),
      nextStep: t("next.rotate"),
      refactor: [],
      rationale: rat(score, { confidence: "high" }),
      prSlices: [],
      verifyNotes: [],
    });
  }
}

export function duplicationFindings(out: Finding[], a: AnalysisResult, t: T): void {
  // Collapse duplicate blocks that span the SAME set of files into one finding —
  // otherwise two generated schemas sharing N windows show up as N identical rows.
  const seenDupSets = new Set<string>();
  for (const d of a.duplication) {
    const key = [...d.files].sort().join("|");
    if (seenDupSets.has(key)) continue;
    seenDupSets.add(key);
    out.push({
      id: `dup:${d.fingerprint}`,
      priority: "P2",
      confidence: "high",
      category: "actionable",
      kind: "duplication",
      title: t("ftitle.duplication"),
      file: d.files[0] ?? "",
      line: 0,
      symbol: "",
      runtime: "shared",
      evidence: [`${d.occurrences}× · ${d.lineCount} ${t("th.lines")}`, d.files.join(", ")],
      why: t("why.duplication", { n: d.files.length }),
      nextStep: t("next.dedupe"),
      refactor: [],
      rationale: rat(50, { blastRadius: d.files.length >= 3 ? "medium" : "low" }),
      prSlices: [],
      verifyNotes: [],
    });
    if (seenDupSets.size >= 4) break;
  }
}

export function unusedImportsFinding(out: Finding[], a: AnalysisResult, t: T): void {
  if (a.totalUnusedImports <= 0) return;
  out.push({
    id: "unused:all",
    priority: "P3",
    confidence: "high",
    category: "actionable",
    kind: "unused",
    title: t("ftitle.unused"),
    file: a.unusedImports[0]?.file ?? "",
    line: a.unusedImports[0]?.line ?? 0,
    symbol: "",
    runtime: "shared",
    evidence: [t("sec.ghosts.count", { n: a.totalUnusedImports })],
    why: t("why.unused"),
    nextStep: t("next.lint"),
    refactor: [],
    rationale: rat(20),
    prSlices: [],
    verifyNotes: [],
  });
}

export function appendVerifyCommands(out: Finding[], a: AnalysisResult, t: T): void {
  // Attach the project's verification commands to every PR plan (req #3).
  const verify = a.verifyCommands && a.verifyCommands.length ? t("pr.verify", { cmds: a.verifyCommands.join(" && ") }) : "";
  if (verify) for (const f of out) if (f.prSlices.length) f.prSlices.push(verify);
}

export function applyP1Caps(out: Finding[]): void {
  // A P1 must be backed by high confidence (direct evidence). Security keeps its band.
  for (const f of out) {
    if (f.priority === "P1" && f.confidence !== "high" && f.kind !== "security") f.priority = "P2";
  }
  const actionable = out.filter((f) => f.category === "actionable");
  const p1 = actionable.filter((f) => f.priority === "P1" && f.kind !== "security");
  const allowed = Math.max(2, Math.ceil(actionable.length * 0.3));
  if (p1.length <= allowed) return;
  p1.sort((x, y) => (x.confidence === "high" ? 0 : 1) - (y.confidence === "high" ? 0 : 1));
  for (let i = allowed; i < p1.length; i++) p1[i].priority = "P2";
}

export function noiseFindings(out: Finding[], a: AnalysisResult, t: T): void {
  for (const fi of a.ignoredLargest || []) {
    out.push({
      id: `noise:${fi.path}`,
      priority: "P3",
      confidence: "high",
      category: "noise",
      kind: "noise",
      title: t("ftitle.noise"),
      file: fi.path,
      line: 0,
      symbol: "",
      runtime: "shared",
      evidence: [`${fi.lines} ${t("th.lines")}`, fi.noiseReason ?? "noise"],
      why: t("find.noiseNote"),
      nextStep: "",
      refactor: [],
      rationale: rat(0),
      prSlices: [],
      verifyNotes: [],
    });
  }
}
