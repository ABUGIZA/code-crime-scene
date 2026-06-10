import type { Confidence, FileInfo, Priority, RiskRationale } from "../types";
import { type T, threshold, clamp, directResp, indirectResp, respList, weightyDirect, hasResp, hasDirectHeavyIO, hasDirectIO, hasDirectStateMachine, blastRadiusOf } from "./shared";

// --- Artifact kind → labels (no priority here) ------------------------------

export interface KindInfo {
  kind: string;
  confidence: Confidence;
  why: string;
  next: string;
}

interface KindCtx {
  fi: FileInfo;
  t: T;
  direct: ReturnType<typeof directResp>;
  respDirect: string;
  respAll: string;
}

// fileType → KindInfo builder. Conditional sub-cases (hook direct-protocol,
// default long-function gate) stay inside their own per-entry refinement fn.
const ARTIFACT_KINDS: Record<string, (c: KindCtx) => KindInfo> = {
  node_server: ({ t, direct, respDirect, respAll }) => ({
    kind: "god_server",
    confidence: direct.length >= 2 ? "high" : "medium",
    why: t("why.node_server", { resp: respDirect || respAll }),
    next: t("next.split"),
  }),
  node_service: ({ fi, t }) => ({
    kind: "service_module",
    confidence: weightyDirect(fi).length >= 2 ? "high" : "medium",
    why: t("why.service_module", { resp: respList(t, directResp(fi)) }),
    next: t("next.split"),
  }),
  route_handler: ({ t }) => ({ kind: "route_handler", confidence: "high", why: t("why.route_handler"), next: t("next.split") }),
  react_hook: ({ t, direct, respDirect }) => {
    const directProto = direct.map((r) => r.kind).some((k) => ["websocket", "webrtc"].includes(k));
    if (directProto) {
      return { kind: "god_hook", confidence: "high", why: t("why.react_hook_direct", { resp: respDirect }), next: t("next.split") };
    }
    return { kind: "big_hook", confidence: direct.length ? "high" : "medium", why: t("why.react_hook_indirect"), next: t("next.split") };
  },
  react_root: ({ t }) => ({ kind: "root_coordinator", confidence: "medium", why: t("why.react_root"), next: t("next.split") }),
  react_feature: ({ t }) => ({ kind: "feature_component", confidence: "high", why: t("why.react_feature"), next: t("next.split") }),
  react_dialog: ({ t }) => ({ kind: "dialog", confidence: "high", why: t("why.react_dialog"), next: t("next.split") }),
  react_icon: ({ fi, t }) => ({ kind: "icon_file", confidence: "high", why: t("why.icon", { lines: fi.lines }), next: t("next.icon") }),
  react_component: ({ fi, t }) => ({ kind: "long_component", confidence: "high", why: t("why.long_component", { lines: fi.lines }), next: t("next.split") }),
};

function defaultKind({ fi, t }: KindCtx): KindInfo {
  if (fi.longestFunction > 150) {
    return { kind: "long_function", confidence: "high", why: t("why.long_function", { len: fi.longestFunction }), next: t("next.extractFn") };
  }
  return { kind: "huge_file", confidence: "high", why: t("why.huge_file", { lines: fi.lines }), next: t("next.split") };
}

export function artifactKind(fi: FileInfo, t: T): KindInfo {
  const direct = directResp(fi);
  const ctx: KindCtx = { fi, t, direct, respDirect: respList(t, direct), respAll: respList(t, fi.responsibilities) };
  return (ARTIFACT_KINDS[fi.fileType] ?? defaultKind)(ctx);
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

// One demotion/promotion rule. `terminal` rules return a Priority when they
// match (short-circuiting the cascade, like the old `return`) or null to fall
// through; non-terminal rules always return the next priority (maybe unchanged).
interface CategoryRule {
  terminal?: boolean;
  apply(ctx: CategoryCtx): Priority | null;
}
interface CategoryCtx {
  fi: FileInfo;
  p: Priority;
  ft: string;
  heavyIO: boolean;
  sm: boolean;
}

// Category floor: a P3 in one of these categories is lifted to P2 when its guard
// holds. Each guard mirrors one branch of the old floor cascade.
const FLOOR_RULES: { ft: string; ok(fi: FileInfo): boolean }[] = [
  { ft: "node_server", ok: () => true },
  { ft: "node_service", ok: (fi) => weightyDirect(fi).length >= 2 },
  { ft: "react_root", ok: (fi) => fi.lines > threshold("react_root") && fi.responsibilities.length >= 3 },
  { ft: "react_feature", ok: (fi) => fi.lines > threshold("react_feature") },
  { ft: "react_dialog", ok: (fi) => fi.lines > threshold("react_dialog") && (hasResp(fi, "validation") || hasResp(fi, "data_fetching")) },
];

const CATEGORY_RULES: CategoryRule[] = [
  // Icon registries are cleanup-only unless genuinely enormous.
  { terminal: true, apply: ({ fi, ft }) => (ft === "react_icon" ? (fi.lines > 700 ? "P2" : "P3") : null) },
  // Presentation-only artifacts can never be P0/P1 without real I/O or a state machine.
  {
    apply: ({ p, ft, heavyIO, sm }) =>
      ["react_dialog", "react_root", "react_component"].includes(ft) && !heavyIO && !sm && (p === "P0" || p === "P1") ? "P2" : p,
  },
  // P1 is reserved for a server/hook "god" file with direct heavy I/O.
  {
    apply: ({ p, ft, heavyIO }) => (p === "P1" && !((ft === "node_server" || ft === "react_hook") && heavyIO) ? "P2" : p),
  },
  // Category floors: a large file in these categories is at least P2.
  {
    apply: ({ fi, p, ft }) => (p === "P3" && FLOOR_RULES.some((r) => r.ft === ft && r.ok(fi)) ? "P2" : p),
  },
];

export function applyCategoryRules(fi: FileInfo, p: Priority): Priority {
  const base = { fi, ft: fi.fileType, heavyIO: hasDirectHeavyIO(fi), sm: hasDirectStateMachine(fi) };
  for (const rule of CATEGORY_RULES) {
    const next = rule.apply({ ...base, p });
    if (rule.terminal) {
      if (next !== null) return next; // matched → short-circuit
    } else {
      p = next as Priority; // non-terminal rules never return null
    }
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

