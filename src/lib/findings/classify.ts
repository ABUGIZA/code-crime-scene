import type { Confidence, FileInfo, Priority, RiskRationale } from "../types";
import { type T, threshold, clamp, directResp, indirectResp, respList, weightyDirect, hasResp, hasDirectHeavyIO, hasDirectIO, hasDirectStateMachine, blastRadiusOf } from "./shared";

// --- Artifact kind → labels (no priority here) ------------------------------

export interface KindInfo {
  kind: string;
  confidence: Confidence;
  why: string;
  next: string;
}

export function artifactKind(fi: FileInfo, t: T): KindInfo {
  const direct = directResp(fi);
  const dKinds = direct.map((r) => r.kind);
  const respDirect = respList(t, direct);
  const respAll = respList(t, fi.responsibilities);

  switch (fi.fileType) {
    case "node_server":
      return {
        kind: "god_server",
        confidence: direct.length >= 2 ? "high" : "medium",
        why: t("why.node_server", { resp: respDirect || respAll }),
        next: t("next.split"),
      };
    case "node_service":
      return {
        kind: "service_module",
        confidence: weightyDirect(fi).length >= 2 ? "high" : "medium",
        why: t("why.service_module", { resp: respList(t, directResp(fi)) }),
        next: t("next.split"),
      };
    case "route_handler":
      return { kind: "route_handler", confidence: "high", why: t("why.route_handler"), next: t("next.split") };
    case "react_hook": {
      const directProto = dKinds.some((k) => ["websocket", "webrtc"].includes(k));
      if (directProto) {
        return { kind: "god_hook", confidence: "high", why: t("why.react_hook_direct", { resp: respDirect }), next: t("next.split") };
      }
      return { kind: "big_hook", confidence: direct.length ? "high" : "medium", why: t("why.react_hook_indirect"), next: t("next.split") };
    }
    case "react_root":
      return { kind: "root_coordinator", confidence: "medium", why: t("why.react_root"), next: t("next.split") };
    case "react_feature":
      return { kind: "feature_component", confidence: "high", why: t("why.react_feature"), next: t("next.split") };
    case "react_dialog":
      return { kind: "dialog", confidence: "high", why: t("why.react_dialog"), next: t("next.split") };
    case "react_icon":
      return { kind: "icon_file", confidence: "high", why: t("why.icon", { lines: fi.lines }), next: t("next.icon") };
    case "react_component":
      return { kind: "long_component", confidence: "high", why: t("why.long_component", { lines: fi.lines }), next: t("next.split") };
    default:
      if (fi.longestFunction > 150) {
        return { kind: "long_function", confidence: "high", why: t("why.long_function", { len: fi.longestFunction }), next: t("next.extractFn") };
      }
      return { kind: "huge_file", confidence: "high", why: t("why.huge_file", { lines: fi.lines }), next: t("next.split") };
  }
}

// --- Numeric risk score (req #6) --------------------------------------------

export function computeRisk(fi: FileInfo, confidence: Confidence): RiskRationale {
  const heavyIO = hasDirectHeavyIO(fi);
  const anyIO = hasDirectIO(fi);
  const sm = hasDirectStateMachine(fi);
  const th = threshold(fi.fileType);
  const blast = blastRadiusOf(fi);
  const weighty = weightyDirect(fi).length;

  let score = 0;
  score += blast === "high" ? 30 : blast === "medium" ? 17 : Math.min(fi.fanIn ?? 0, 6) * 1.2; // blast radius
  score += heavyIO ? 26 : anyIO ? 12 : 0; // direct I/O (real network/socket/db work)
  score += sm ? 10 : 0; // state-machine complexity
  score += clamp((fi.longestFunction - 50) / 10, 0, 18); // function length
  score += clamp((fi.lines - th) / 20, 0, 20); // file length over its category threshold
  score += Math.min(weighty, 4) * 7; // weighty direct responsibilities (UI timers excluded)
  score += Math.min(indirectResp(fi).length, 4) * 4; // coordination breadth
  if (heavyIO && fi.lines > th) score += 8; // testability penalty
  if (fi.longFunctions >= 4) score += 5; // sprawl impact
  if (fi.noise) score = 0; // generated noise is never actionable

  return {
    score: Math.round(clamp(score, 0, 100)),
    blastRadius: blast,
    directIO: anyIO,
    stateMachine: sm,
    confidence,
  };
}

export function bandFromScore(score: number): Priority {
  return score >= 70 ? "P1" : score >= 45 ? "P2" : "P3";
}

// Keep the displayed score honest with the final badge so the two never disagree.
export function reconcileScore(score: number, p: Priority): number {
  if (p === "P0") return Math.max(score, 85);
  if (p === "P1") return Math.max(score, 70);
  if (p === "P2") return clamp(score, 45, 69);
  return Math.min(score, 44);
}

// --- Category rules: thresholds, caps, floors, "do-not-suggest" (req #7,#8) --

export function applyCategoryRules(fi: FileInfo, p: Priority): Priority {
  const ft = fi.fileType;
  const heavyIO = hasDirectHeavyIO(fi);
  const sm = hasDirectStateMachine(fi);

  // Icon registries are cleanup-only unless genuinely enormous.
  if (ft === "react_icon") return fi.lines > 700 ? "P2" : "P3";

  // Presentation-only artifacts can never be P0/P1 without real I/O or a state machine.
  const presentation = ["react_dialog", "react_root", "react_component"].includes(ft);
  if (presentation && !heavyIO && !sm && (p === "P0" || p === "P1")) p = "P2";

  // P1 is reserved for a server/hook "god" file with direct heavy I/O.
  if (p === "P1" && !((ft === "node_server" || ft === "react_hook") && heavyIO)) p = "P2";

  // Category floors: a large file in these categories is at least P2.
  if (p === "P3") {
    if (ft === "node_server") p = "P2";
    else if (ft === "node_service" && weightyDirect(fi).length >= 2) p = "P2";
    else if (ft === "react_root" && fi.lines > threshold("react_root") && fi.responsibilities.length >= 3) p = "P2";
    else if (ft === "react_feature" && fi.lines > threshold("react_feature")) p = "P2";
    else if (ft === "react_dialog" && fi.lines > threshold("react_dialog") && (hasResp(fi, "validation") || hasResp(fi, "data_fetching"))) p = "P2";
  }
  return p;
}

export interface Classification extends KindInfo {
  priority: Priority;
  rationale: RiskRationale;
}

export function classify(fi: FileInfo, t: T): Classification {
  const info = artifactKind(fi, t);
  // No high confidence when a behavioral claim rests on weak (non-direct) evidence.
  const claimsBehavior = ["god_server", "god_hook", "feature_component", "route_handler"].includes(info.kind);
  const confidence: Confidence = claimsBehavior && weightyDirect(fi).length === 0 ? "medium" : info.confidence;
  const rationale = computeRisk(fi, confidence);
  let priority = bandFromScore(rationale.score);
  priority = applyCategoryRules(fi, priority);
  rationale.score = reconcileScore(rationale.score, priority);
  return { ...info, confidence, priority, rationale };
}

