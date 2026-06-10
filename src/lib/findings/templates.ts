// Declarative refactor/PR-plan templates (Task: kill the if/else chains in
// refactor.ts). Each table row is one suggested step; `requires` lists
// responsibility kinds of which AT LEAST ONE must be present on the file
// (mirrors the old `has(a) || has(b)` guards). Row order is the emit order.

import type { FileInfo } from "../types";
import { baseOf, cap, dirOf, featureDir, hasResp, hookDomain } from "./shared";

// --- predicate -----------------------------------------------------------

/** A step applies when it has no requirement, or the file has ANY of them. */
export function stepApplies(requires: string[] | undefined, fi: FileInfo): boolean {
  return !requires || requires.some((k) => hasResp(fi, k));
}

// --- refactor-module templates (refactorFor) ------------------------------

export interface RefactorTemplate {
  /** Suggested module path with {dir} {base} {Base} {fdir} {hdir} tokens. */
  path: string;
  /** i18n key (rstep.*) describing what moves there. */
  key: string;
  /** Responsibility kinds — any one present enables the step. */
  requires?: string[];
}

/** Expand the path-template tokens for a concrete file. */
export function expandPath(template: string, fi: FileInfo): string {
  const dir = dirOf(fi.path);
  const base = baseOf(fi.path);
  return template
    .replace(/\{fdir\}/g, `${dir}/${featureDir(base)}`)
    .replace(/\{hdir\}/g, `${dir}/${hookDomain(base)}`)
    .replace(/\{dir\}/g, dir)
    .replace(/\{Base\}/g, cap(base))
    .replace(/\{base\}/g, base);
}

export const REFACTOR_TEMPLATES: Record<string, RefactorTemplate[]> = {
  react_root: [
    { path: "{dir}/app/AppGates.tsx", key: "rstep.gates" },
    { path: "{dir}/app/MainCallScreen.tsx", key: "rstep.mainscreen", requires: ["webrtc", "websocket"] },
    { path: "{dir}/app/useLegalPage.ts", key: "rstep.legal" },
    { path: "{dir}/app/useChatUnread.ts", key: "rstep.unread", requires: ["chat"] },
    { path: "{dir}/app/usePeerModeration.ts", key: "rstep.moderation", requires: ["admin", "webrtc"] },
  ],
  react_feature: [
    { path: "{fdir}/{Base}.tsx", key: "rstep.feature" },
    { path: "{fdir}/use{Base}Api.ts", key: "rstep.featureApi", requires: ["data_fetching"] },
    { path: "{fdir}/use{Base}Data.ts", key: "rstep.featureData" },
    { path: "{fdir}/{Base}AccessDenied.tsx", key: "rstep.accessDenied", requires: ["admin"] },
    { path: "{fdir}/{Base}List.tsx", key: "rstep.list" },
    { path: "{fdir}/{Base}Card.tsx", key: "rstep.card" },
  ],
  react_dialog: [
    { path: "{dir}/use{Base}Form.ts", key: "rstep.form" },
    { path: "{dir}/{Base}Fields.tsx", key: "rstep.fields" },
    { path: "{dir}/{Base}Actions.tsx", key: "rstep.actions" },
    { path: "{dir}/{Base}Errors.ts", key: "rstep.errorMap" },
    { path: "{dir}/{Base}Preview.tsx", key: "rstep.preview", requires: ["webrtc"] },
  ],
  react_icon: [
    { path: "lucide-react", key: "rstep.lucide" },
    { path: "{dir}/iconMap.ts", key: "rstep.iconMap" },
    { path: "{dir}/icons/*.tsx", key: "rstep.iconSplit" },
  ],
  react_hook: [
    { path: "{hdir}/useSignalingSocket.ts", key: "rstep.signaling", requires: ["websocket"] },
    { path: "{hdir}/peerConnection.ts", key: "rstep.peer", requires: ["webrtc"] },
    { path: "{hdir}/chatChannel.ts", key: "rstep.chat", requires: ["chat"] },
    { path: "{hdir}/useRequeue.ts", key: "rstep.requeue", requires: ["timers"] },
    { path: "{hdir}/{base}Machine.ts", key: "rstep.machine", requires: ["state_machine"] },
    { path: "{hdir}/types.ts", key: "rstep.roomTypes" },
  ],
  node_server: [
    { path: "{dir}/config.ts", key: "rstep.config" },
    { path: "{dir}/adminRoutes.ts", key: "rstep.adminRoutes", requires: ["admin"] },
    { path: "{dir}/routes.ts", key: "rstep.routes", requires: ["routes"] },
    { path: "{dir}/wsServer.ts", key: "rstep.wsServer", requires: ["websocket"] },
    { path: "{dir}/messageValidation.ts", key: "rstep.validation", requires: ["validation"] },
    { path: "{dir}/signalingHandlers.ts", key: "rstep.signalHandlers", requires: ["websocket", "webrtc"] },
    { path: "{dir}/presence.ts", key: "rstep.presence", requires: ["timers"] },
    { path: "{dir}/healthRoutes.ts", key: "rstep.healthRoutes" },
  ],
  node_service: [
    { path: "{dir}/firebaseAdmin.ts", key: "rstep.firebaseAdmin", requires: ["firebase_admin"] },
    { path: "{dir}/tokenVerify.ts", key: "rstep.tokenVerify", requires: ["token_verify"] },
    { path: "{dir}/adminClaims.ts", key: "rstep.adminClaims", requires: ["claims", "admin"] },
    { path: "{dir}/dataStore.ts", key: "rstep.dataStore", requires: ["database"] },
    { path: "{dir}/{base}.validation.ts", key: "rstep.validation", requires: ["validation"] },
    { path: "{dir}/{base}.types.ts", key: "rstep.roomTypes" },
  ],
  route_handler: [
    { path: "{dir}/{base}.routes.ts", key: "rstep.routes" },
    { path: "{dir}/{base}.validation.ts", key: "rstep.validation" },
  ],
  react_component: [
    { path: "{dir}/{base}.view.tsx", key: "rstep.screen" },
    { path: "{dir}/use{Base}.ts", key: "rstep.hooks" },
  ],
};

/** Fallback when the fileType has no dedicated template. */
export const REFACTOR_DEFAULT: RefactorTemplate[] = [
  { path: "{dir}/{base}.core.ts", key: "rstep.stateLogic" },
];

// --- PR-slice templates (prSlicesFor) --------------------------------------

export interface PrTemplate {
  /** i18n key (pr.*) for the slice. */
  key: string;
  /** Responsibility kinds — any one present enables the slice. */
  requires?: string[];
}

const PR_HOOK: PrTemplate[] = [
  { key: "pr.types" },
  { key: "pr.wsSignaling", requires: ["websocket"] },
  { key: "pr.peer", requires: ["webrtc"] },
  { key: "pr.chat", requires: ["chat"] },
  { key: "pr.machine", requires: ["state_machine"] },
  { key: "pr.tests" },
];

const PR_SERVER: PrTemplate[] = [
  { key: "pr.config" },
  { key: "pr.routes", requires: ["routes"] },
  { key: "pr.wsServer", requires: ["websocket"] },
  { key: "pr.validation", requires: ["validation"] },
  { key: "pr.admin", requires: ["admin"] },
  { key: "pr.tests" },
];

export const PR_TEMPLATES: Record<string, PrTemplate[]> = {
  god_hook: PR_HOOK,
  big_hook: PR_HOOK,
  god_server: PR_SERVER,
  route_handler: PR_SERVER,
  service_module: [
    { key: "pr.firebase", requires: ["firebase_admin"] },
    { key: "pr.token", requires: ["token_verify"] },
    { key: "pr.claims", requires: ["claims", "admin"] },
    { key: "pr.store", requires: ["database"] },
    { key: "pr.tests" },
  ],
  root_coordinator: [
    { key: "pr.gates" },
    { key: "pr.mainscreen", requires: ["webrtc", "websocket"] },
    { key: "pr.moderation", requires: ["admin", "webrtc"] },
    { key: "pr.tests" },
  ],
  feature_component: [
    { key: "pr.types" },
    { key: "pr.featureData", requires: ["data_fetching"] },
    { key: "pr.subviews" },
    { key: "pr.tests" },
  ],
  dialog: [
    { key: "pr.form" },
    { key: "pr.fields" },
    { key: "pr.validation", requires: ["validation"] },
    { key: "pr.tests" },
  ],
  icon_file: [{ key: "pr.iconMap" }, { key: "pr.iconSplit" }],
};

/** Fallback when the finding kind has no dedicated plan. */
export const PR_DEFAULT: PrTemplate[] = [
  { key: "pr.types" },
  { key: "pr.split" },
  { key: "pr.tests" },
];
