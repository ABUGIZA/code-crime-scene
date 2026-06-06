import type { FileInfo, Level, Priority } from "../types";

export type T = (key: string, vars?: Record<string, string | number>) => string;

export const PRIO_ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

// Module names that only make sense on a server — never suggested inside client/.
export const SERVER_ONLY = [
  "wsServer",
  "adminRoutes",
  "signalingHandlers",
  "messageValidation",
  "presence",
  "healthRoutes",
];

// Responsibilities that count as real I/O (the kind that justifies a high priority).
export const HEAVY_IO = ["websocket", "webrtc", "http_server", "routes", "database"];

// Per-artifact line thresholds (req #7): not every file is judged by one number.
export const LINE_THRESHOLD: Record<string, number> = {
  react_hook: 300,
  react_root: 350,
  react_dialog: 250,
  react_icon: 250,
  node_server: 400,
  node_service: 250,
  route_handler: 300,
  react_feature: 350,
  react_component: 400,
  utility: 300,
  types: 600,
  config: 600,
  other: 600,
};
export function threshold(fileType: string): number {
  return LINE_THRESHOLD[fileType] ?? 400;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : ".";
}
export function baseOf(p: string): string {
  const name = p.slice(p.lastIndexOf("/") + 1);
  const dot = name.indexOf(".");
  return dot >= 0 ? name.slice(0, dot) : name;
}
export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Consistent folder names for suggestions (req #7): AdminPanel → admin/, not adminpanel/.
export const FEATURE_SUFFIXES = ["panel", "page", "view", "screen", "container", "section", "widget", "modal", "dialog", "component"];
export function featureDir(base: string): string {
  const n = base.toLowerCase();
  for (const suf of FEATURE_SUFFIXES) {
    if (n.endsWith(suf) && n.length > suf.length + 1) return n.slice(0, -suf.length);
  }
  return n;
}
// Group a hook's extracted modules under a domain folder: useRoomManager → room/.
export const HOOK_SUFFIXES = ["manager", "provider", "controller", "store", "context", "hook", "state"];
export function hookDomain(base: string): string {
  let n = base;
  if (/^use[A-Z]/.test(n)) n = n.slice(3);
  const low = n.toLowerCase();
  for (const suf of HOOK_SUFFIXES) {
    if (low.endsWith(suf) && low.length > suf.length + 1) return low.slice(0, -suf.length);
  }
  return low || base.toLowerCase();
}

// Timer labels that are pure presentation — they must NOT inflate risk/priority.
export const WEAK_TIMER_LABELS = ["timer_ui", "timer_countdown"];
// A file finding below this risk score is an observation, not an action (req #4).
export const SCORE_FLOOR = 20;

export const hasResp = (fi: FileInfo, kind: string) => fi.responsibilities.some((r) => r.kind === kind);
export const directResp = (fi: FileInfo) => fi.responsibilities.filter((r) => r.evidence === "direct");
export const indirectResp = (fi: FileInfo) => fi.responsibilities.filter((r) => r.evidence === "indirect");
export const respList = (t: T, rs: { label: string }[]) => rs.map((r) => t(`resp.${r.label}`)).join(", ");

// "Weighty" direct responsibilities exclude pure-UI timers, which are not real work.
export const weightyDirect = (fi: FileInfo) =>
  directResp(fi).filter((r) => !(r.kind === "timers" && WEAK_TIMER_LABELS.includes(r.label)));

export const directKinds = (fi: FileInfo) => weightyDirect(fi).map((r) => r.kind);
export const hasDirectHeavyIO = (fi: FileInfo) => directKinds(fi).some((k) => HEAVY_IO.includes(k));
export const hasDirectIO = (fi: FileInfo) => directKinds(fi).some((k) => HEAVY_IO.includes(k) || k === "data_fetching");
export const directHeavyCount = (fi: FileInfo) => weightyDirect(fi).filter((r) => HEAVY_IO.includes(r.kind)).length;
export const hasDirectStateMachine = (fi: FileInfo) =>
  fi.responsibilities.some((r) => r.kind === "state_machine" && r.evidence === "direct");

// Role-aware blast radius (req #2): a central hook driving WS/RTC/state or a
// server entrypoint juggling HTTP+WS is high-impact regardless of import fan-in;
// a presentation-only component is low; everything else falls back to fan-in.
export function blastRadiusOf(fi: FileInfo): Level {
  const ft = fi.fileType;
  const fanIn = fi.fanIn ?? 0;
  if (ft === "react_icon" || ft === "react_dialog") return fanIn >= 12 ? "medium" : "low";
  if (ft === "node_server" && directHeavyCount(fi) >= 2) return "high";
  if (ft === "node_service") return weightyDirect(fi).length >= 3 || fanIn >= 6 ? "high" : weightyDirect(fi).length >= 2 ? "medium" : "low";
  if (ft === "react_hook" && hasDirectHeavyIO(fi) && (hasDirectStateMachine(fi) || directHeavyCount(fi) >= 2)) return "high";
  if (ft === "react_root") return fi.responsibilities.length >= 3 ? "medium" : "low";
  if (ft === "react_feature") return fanIn >= 8 ? "high" : fanIn >= 3 ? "medium" : "low";
  return fanIn >= 10 ? "high" : fanIn >= 4 ? "medium" : "low";
}

// --- Evidence (with line numbers + one-line snippets, req #4 & #5) ----------

export function evidenceFor(fi: FileInfo, t: T): string[] {
  const ev: string[] = [`${fi.lines} ${t("th.lines")}`];
  if (fi.componentLine > 0 && fi.componentName) {
    ev.push(t("ev.startsAt", { name: fi.componentName, n: fi.componentLine }));
  }
  if (fi.longestFunction > 40 && fi.longestFunctionName) {
    const at = fi.longestFunctionLine > 0 ? `:${fi.longestFunctionLine}` : "";
    ev.push(`${fi.longestFunctionName}()${at} · ${fi.longestFunction} ${t("th.lines")}`);
  }
  for (const r of fi.responsibilities) {
    const loc = r.line > 0 ? `:${r.line}` : "";
    const snip = r.snippet ? ` — \`${r.snippet}\`` : "";
    ev.push(`${t(`resp.${r.label}`)}: ${t(`ev.${r.evidence}`)} (${r.token})${loc}${snip}`);
  }
  return ev;
}


