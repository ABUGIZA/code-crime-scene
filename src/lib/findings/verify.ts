import type { Finding, FileInfo } from "../types";
import { type T, SERVER_ONLY, SCORE_FLOOR } from "./shared";

// --- Evidence verifier (req #3) ---------------------------------------------
// Last line of defense: re-check each finding's internal consistency. Anything
// inconsistent is demoted to "needs manual verification" with low confidence,
// instead of being presented as a confident actionable result.

export const isHookPath = (p: string) => /(^|\/)use[A-Z][A-Za-z0-9]*\.ts$/.test(p);

export function verifyFinding(f: Finding, fi: FileInfo | null, t: T): void {
  const notes: string[] = [];

  // server-only kind must run on the server
  if ((f.kind === "god_server" || f.kind === "route_handler") && f.runtime !== "server") {
    notes.push(t("vrf.runtime"));
  }
  // icon kind must come from an icon artifact
  if (f.kind === "icon_file" && fi && fi.fileType !== "react_icon") {
    notes.push(t("vrf.iconType"));
  }
  if (fi) {
    // every 'direct' responsibility must carry a real token, and its line must
    // fall inside the file
    for (const r of fi.responsibilities) {
      if (r.evidence === "direct" && (!r.token || (r.line > 0 && r.line > fi.lines + 1))) {
        notes.push(t("vrf.token", { kind: t(`resp.${r.kind}`) }));
        break;
      }
    }
    // line count sanity for the headline location
    if (f.line > 0 && f.line > fi.lines + 1) notes.push(t("vrf.line"));
  }
  // suggestions must suit the runtime (no server modules inside a client file)
  if (f.runtime === "client" && f.refactor.some((sct) => SERVER_ONLY.some((n) => sct.path.includes(n)))) {
    notes.push(t("vrf.clientServer"));
  }
  // an icon file must never be handed hook suggestions
  if (f.kind === "icon_file" && f.refactor.some((sct) => isHookPath(sct.path))) {
    notes.push(t("vrf.iconHook"));
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

// Final launch quality gate (req #8). Enforces the invariants and returns any
// violation it had to repair — in a correct build this comes back empty.
export function qualityGate(findings: Finding[]): string[] {
  const violations: string[] = [];
  for (const f of findings) {
    if (f.category !== "actionable") continue;
    // no actionable file finding below the risk floor → it's an observation
    if (!STRUCTURAL_KINDS.includes(f.kind) && f.rationale.score < SCORE_FLOOR) {
      violations.push(`below-floor:${f.kind}:${f.file}:${f.rationale.score}`);
      f.category = "informational";
    }
    // no P1 server/hook entrypoint with low blast radius
    if (f.priority === "P1" && (f.kind === "god_server" || f.kind === "god_hook") && f.rationale.blastRadius === "low") {
      violations.push(`p1-low-blast:${f.kind}:${f.file}`);
      f.rationale.blastRadius = "high";
    }
    // no high confidence on a behavioral claim without direct evidence
    if (f.confidence === "high" && (f.kind === "god_server" || f.kind === "feature_component") && !f.rationale.directIO) {
      violations.push(`weak-high-conf:${f.kind}:${f.file}`);
      f.confidence = "medium";
    }
    // no server-only module suggested inside a client file
    if (f.runtime === "client" && f.refactor.some((s) => SERVER_ONLY.some((n) => s.path.includes(n)))) {
      violations.push(`client-server-suggestion:${f.file}`);
      f.refactor = f.refactor.filter((s) => !SERVER_ONLY.some((n) => s.path.includes(n)));
    }
    // no hook suggestion for an icon registry
    if (f.kind === "icon_file" && f.refactor.some((s) => isHookSuggestion(s.path))) {
      violations.push(`icon-hook:${f.file}`);
      f.refactor = f.refactor.filter((s) => !isHookSuggestion(s.path));
    }
    // a generic "large file" is never a P1/P2 reason on its own
    if (f.kind === "huge_file" && (f.priority === "P1" || f.priority === "P2")) {
      violations.push(`large-file-priority:${f.file}`);
      f.priority = "P3";
      f.rationale.score = Math.min(f.rationale.score, 44); // keep score consistent with P3 band
    }
    // every PR plan must carry a verification command (req #4)
    if (f.prSlices.length && !f.prSlices.some((p) => /npm run|tsc\b|pnpm|yarn/i.test(p))) {
      violations.push(`pr-no-verify:${f.file}`);
    }
  }
  return violations;
}

