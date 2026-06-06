import type { FileInfo, RefactorStep } from "../types";
import { type T, SERVER_ONLY, dirOf, baseOf, cap, featureDir, hookDomain, hasResp } from "./shared";

// --- Context-aware refactor templates (with client/server sanity, req #8) ----

export const JS_EXTS = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"];

export function refactorFor(t: T, fi: FileInfo): RefactorStep[] {
  // Template suggestions assume a JS/TS module shape — never emit `.ts` splits for
  // a Rust/JSON/CSS file (that's where "analysis.core.ts" nonsense came from).
  if (!JS_EXTS.includes(fi.ext)) return [];
  const dir = dirOf(fi.path);
  const base = baseOf(fi.path);
  const Base = cap(base);
  const has = (k: string) => hasResp(fi, k);
  const s: RefactorStep[] = [];
  const add = (path: string, key: string) => s.push({ path, note: t(key) });

  switch (fi.fileType) {
    case "react_root":
      add(`${dir}/app/AppGates.tsx`, "rstep.gates");
      if (has("webrtc") || has("websocket")) add(`${dir}/app/MainCallScreen.tsx`, "rstep.mainscreen");
      add(`${dir}/app/useLegalPage.ts`, "rstep.legal");
      if (has("chat")) add(`${dir}/app/useChatUnread.ts`, "rstep.unread");
      if (has("admin") || has("webrtc")) add(`${dir}/app/usePeerModeration.ts`, "rstep.moderation");
      break;
    case "react_feature": {
      const fdir = `${dir}/${featureDir(base)}`;
      add(`${fdir}/${Base}.tsx`, "rstep.feature");
      if (has("data_fetching")) add(`${fdir}/use${Base}Api.ts`, "rstep.featureApi");
      add(`${fdir}/use${Base}Data.ts`, "rstep.featureData");
      if (has("admin")) add(`${fdir}/${Base}AccessDenied.tsx`, "rstep.accessDenied");
      add(`${fdir}/${Base}List.tsx`, "rstep.list");
      add(`${fdir}/${Base}Card.tsx`, "rstep.card");
      break;
    }
    case "react_dialog":
      add(`${dir}/use${Base}Form.ts`, "rstep.form");
      add(`${dir}/${Base}Fields.tsx`, "rstep.fields");
      add(`${dir}/${Base}Actions.tsx`, "rstep.actions");
      add(`${dir}/${Base}Errors.ts`, "rstep.errorMap");
      if (has("webrtc")) add(`${dir}/${Base}Preview.tsx`, "rstep.preview");
      break;
    case "react_icon":
      add("lucide-react", "rstep.lucide");
      add(`${dir}/iconMap.ts`, "rstep.iconMap");
      add(`${dir}/icons/*.tsx`, "rstep.iconSplit");
      break;
    case "react_hook": {
      const hdir = `${dir}/${hookDomain(base)}`;
      if (has("websocket")) add(`${hdir}/useSignalingSocket.ts`, "rstep.signaling");
      if (has("webrtc")) add(`${hdir}/peerConnection.ts`, "rstep.peer");
      if (has("chat")) add(`${hdir}/chatChannel.ts`, "rstep.chat");
      if (has("timers")) add(`${hdir}/useRequeue.ts`, "rstep.requeue");
      if (has("state_machine")) add(`${hdir}/${base}Machine.ts`, "rstep.machine");
      add(`${hdir}/types.ts`, "rstep.roomTypes");
      break;
    }
    case "node_server":
      add(`${dir}/config.ts`, "rstep.config");
      if (has("admin")) add(`${dir}/adminRoutes.ts`, "rstep.adminRoutes");
      if (has("routes")) add(`${dir}/routes.ts`, "rstep.routes");
      if (has("websocket")) add(`${dir}/wsServer.ts`, "rstep.wsServer");
      if (has("validation")) add(`${dir}/messageValidation.ts`, "rstep.validation");
      if (has("websocket") || has("webrtc")) add(`${dir}/signalingHandlers.ts`, "rstep.signalHandlers");
      if (has("timers")) add(`${dir}/presence.ts`, "rstep.presence");
      add(`${dir}/healthRoutes.ts`, "rstep.healthRoutes");
      break;
    case "node_service":
      if (has("firebase_admin")) add(`${dir}/firebaseAdmin.ts`, "rstep.firebaseAdmin");
      if (has("token_verify")) add(`${dir}/tokenVerify.ts`, "rstep.tokenVerify");
      if (has("claims") || has("admin")) add(`${dir}/adminClaims.ts`, "rstep.adminClaims");
      if (has("database")) add(`${dir}/dataStore.ts`, "rstep.dataStore");
      if (has("validation")) add(`${dir}/${base}.validation.ts`, "rstep.validation");
      add(`${dir}/${base}.types.ts`, "rstep.roomTypes");
      break;
    case "route_handler":
      add(`${dir}/${base}.routes.ts`, "rstep.routes");
      add(`${dir}/${base}.validation.ts`, "rstep.validation");
      break;
    case "react_component":
      add(`${dir}/${base}.view.tsx`, "rstep.screen");
      add(`${dir}/use${Base}.ts`, "rstep.hooks");
      break;
    default:
      add(`${dir}/${base}.core.ts`, "rstep.stateLogic");
  }

  // SANITY: a client file must never receive server-only module suggestions.
  const filtered = fi.runtime === "client" ? s.filter((x) => !SERVER_ONLY.some((n) => x.path.includes(n))) : s;
  return filtered.slice(0, 6);
}

// --- Recommended PR slicing (req #9) ----------------------------------------

export function prSlicesFor(t: T, fi: FileInfo, kind: string): string[] {
  const has = (k: string) => hasResp(fi, k);
  const s: string[] = [];
  if (kind === "god_hook" || kind === "big_hook") {
    s.push(t("pr.types"));
    if (has("websocket")) s.push(t("pr.wsSignaling"));
    if (has("webrtc")) s.push(t("pr.peer"));
    if (has("chat")) s.push(t("pr.chat"));
    if (has("state_machine")) s.push(t("pr.machine"));
    s.push(t("pr.tests"));
  } else if (kind === "god_server" || kind === "route_handler") {
    s.push(t("pr.config"));
    if (has("routes")) s.push(t("pr.routes"));
    if (has("websocket")) s.push(t("pr.wsServer"));
    if (has("validation")) s.push(t("pr.validation"));
    if (has("admin")) s.push(t("pr.admin"));
    s.push(t("pr.tests"));
  } else if (kind === "service_module") {
    if (has("firebase_admin")) s.push(t("pr.firebase"));
    if (has("token_verify")) s.push(t("pr.token"));
    if (has("claims") || has("admin")) s.push(t("pr.claims"));
    if (has("database")) s.push(t("pr.store"));
    s.push(t("pr.tests"));
  } else if (kind === "root_coordinator") {
    s.push(t("pr.gates"));
    if (has("webrtc") || has("websocket")) s.push(t("pr.mainscreen"));
    if (has("admin") || has("webrtc")) s.push(t("pr.moderation"));
    s.push(t("pr.tests"));
  } else if (kind === "feature_component") {
    s.push(t("pr.types"));
    if (has("data_fetching")) s.push(t("pr.featureData"));
    s.push(t("pr.subviews"));
    s.push(t("pr.tests"));
  } else if (kind === "dialog") {
    s.push(t("pr.form"));
    s.push(t("pr.fields"));
    if (has("validation")) s.push(t("pr.validation"));
    s.push(t("pr.tests"));
  } else if (kind === "icon_file") {
    s.push(t("pr.iconMap"));
    s.push(t("pr.iconSplit"));
  } else {
    s.push(t("pr.types"));
    s.push(t("pr.split"));
    s.push(t("pr.tests"));
  }
  return s.slice(0, 6);
}

