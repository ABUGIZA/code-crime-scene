import type { Finding, FileInfo } from "../types";
import { type T, SERVER_ONLY, SCORE_FLOOR } from "./shared";

// --- Evidence verifier (req #3) ---------------------------------------------
// Last line of defense: re-check each finding's internal consistency. Anything
// inconsistent is demoted to "needs manual verification" with low confidence,
// instead of being presented as a confident actionable result.

export const isHookPath = (p: string) => /(^|\/)use[A-Z][A-Za-z0-9]*\.ts$/.test(p);

// Each check returns a verify-note (when the finding is inconsistent) or null.
// Order matches the original cascade; the notes list is built in that order.
type VerifyCheck = (f: Finding, fi: FileInfo | null, t: T) => string | null;

// server-only kind must run on the server
const serverOnlyOnClient: VerifyCheck = (f, _fi, t) =>
  (f.kind === "god_server" || f.kind === "route_handler") && f.runtime !== "server" ? t("vrf.runtime") : null;

// icon kind must come from an icon artifact
const iconTypeMismatch: VerifyCheck = (f, fi, t) =>
  f.kind === "icon_file" && fi && fi.fileType !== "react_icon" ? t("vrf.iconType") : null;

// every 'direct' responsibility must carry a real token, and its line must fall inside the file
const tokenMissing: VerifyCheck = (_f, fi, t) => {
  if (!fi) return null;
  for (const r of fi.responsibilities) {
    if (r.evidence === "direct" && (!r.token || (r.line > 0 && r.line > fi.lines + 1))) {
      return t("vrf.token", { kind: t(`resp.${r.kind}`) });
    }
  }
  return null;
};

// line count sanity for the headline location
const lineOverflow: VerifyCheck = (f, fi, t) => (fi && f.line > 0 && f.line > fi.lines + 1 ? t("vrf.line") : null);

// suggestions must suit the runtime (no server modules inside a client file)
const clientServerSuggestion: VerifyCheck = (f, _fi, t) =>
  f.runtime === "client" && f.refactor.some((sct) => SERVER_ONLY.some((n) => sct.path.includes(n))) ? t("vrf.clientServer") : null;

// an icon file must never be handed hook suggestions
const iconHookSuggestion: VerifyCheck = (f, _fi, t) =>
  f.kind === "icon_file" && f.refactor.some((sct) => isHookPath(sct.path)) ? t("vrf.iconHook") : null;

const VERIFY_CHECKS: VerifyCheck[] = [
  serverOnlyOnClient,
  iconTypeMismatch,
  tokenMissing,
  lineOverflow,
  clientServerSuggestion,
  iconHookSuggestion,
];

export function verifyFinding(f: Finding, fi: FileInfo | null, t: T): void {
  const notes: string[] = [];
  for (const check of VERIFY_CHECKS) {
    const note = check(f, fi, t);
    if (note) notes.push(note);
  }

  if (notes.length) {
    f.verifyNotes = notes;
    f.confidence = "low";
    f.category = "needs-verification";
    if (f.priority === "P0" || f.priority === "P1") f.priority = "P2";
  }
}

export const STRUCTURAL_KINDS = ["security", "duplication", "unused", "noise"];
export const isHookSuggestion = (p: string) => /\/use[A-Z]/.test(p);

// One invariant repair: returns a violation string (after applying its fix to
// the finding in place) or null when the invariant already holds. Order is the
// emit order of the original cascade.
type GateRepair = (f: Finding) => string | null;

// no actionable file finding below the risk floor → it's an observation
const belowFloor: GateRepair = (f) => {
  if (STRUCTURAL_KINDS.includes(f.kind) || f.rationale.score >= SCORE_FLOOR) return null;
  f.category = "informational";
  return `below-floor:${f.kind}:${f.file}:${f.rationale.score}`;
};

// no P1 server/hook entrypoint with low blast radius
const p1LowBlast: GateRepair = (f) => {
  if (!(f.priority === "P1" && (f.kind === "god_server" || f.kind === "god_hook") && f.rationale.blastRadius === "low")) return null;
  f.rationale.blastRadius = "high";
  return `p1-low-blast:${f.kind}:${f.file}`;
};

// no high confidence on a behavioral claim without direct evidence
const weakHighConf: GateRepair = (f) => {
  if (!(f.confidence === "high" && (f.kind === "god_server" || f.kind === "feature_component") && !f.rationale.directIO)) return null;
  f.confidence = "medium";
  return `weak-high-conf:${f.kind}:${f.file}`;
};

// no server-only module suggested inside a client file
const clientServerModule: GateRepair = (f) => {
  if (!(f.runtime === "client" && f.refactor.some((s) => SERVER_ONLY.some((n) => s.path.includes(n))))) return null;
  f.refactor = f.refactor.filter((s) => !SERVER_ONLY.some((n) => s.path.includes(n)));
  return `client-server-suggestion:${f.file}`;
};

// no hook suggestion for an icon registry
const iconHookModule: GateRepair = (f) => {
  if (!(f.kind === "icon_file" && f.refactor.some((s) => isHookSuggestion(s.path)))) return null;
  f.refactor = f.refactor.filter((s) => !isHookSuggestion(s.path));
  return `icon-hook:${f.file}`;
};

// a generic "large file" is never a P1/P2 reason on its own
const largeFilePriority: GateRepair = (f) => {
  if (!(f.kind === "huge_file" && (f.priority === "P1" || f.priority === "P2"))) return null;
  f.priority = "P3";
  f.rationale.score = Math.min(f.rationale.score, 44); // keep score consistent with P3 band
  return `large-file-priority:${f.file}`;
};

// every PR plan must carry a verification command (req #4)
const prNoVerify: GateRepair = (f) =>
  f.prSlices.length && !f.prSlices.some((p) => /npm run|tsc\b|pnpm|yarn/i.test(p)) ? `pr-no-verify:${f.file}` : null;

const GATE_REPAIRS: GateRepair[] = [belowFloor, p1LowBlast, weakHighConf, clientServerModule, iconHookModule, largeFilePriority, prNoVerify];

// Final launch quality gate (req #8). Enforces the invariants and returns any
// violation it had to repair — in a correct build this comes back empty.
export function qualityGate(findings: Finding[]): string[] {
  const violations: string[] = [];
  for (const f of findings) {
    if (f.category !== "actionable") continue;
    for (const repair of GATE_REPAIRS) {
      const v = repair(f);
      if (v) violations.push(v);
    }
  }
  return violations;
}

