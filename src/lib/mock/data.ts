import type { FileInfo, Responsibility } from "../types";

const R = (
  kind: string,
  label: string,
  evidence: "direct" | "indirect" | "supporting",
  token: string,
  line = 0,
  snippet = "",
): Responsibility => ({ kind, label, evidence, token, line, snippet: snippet || token });

interface FileExtras {
  componentName?: string;
  componentLine?: number;
  longestFunctionLine?: number;
  fanIn?: number;
}

function mkFile(
  path: string,
  ext: string,
  runtime: string,
  fileType: string,
  lines: number,
  responsibilities: Responsibility[],
  longestFunctionName: string,
  longestFunction: number,
  functions: number,
  longFunctions: number,
  extra: FileExtras = {},
): FileInfo {
  const language =
    ext === "css" ? "CSS" : ext === "json" ? "JSON" : ext === "js" ? "JavaScript" : "TypeScript";
  return {
    path,
    language,
    ext,
    lines,
    codeLines: Math.round(lines * 0.82),
    commentLines: Math.round(lines * 0.05),
    blankLines: Math.round(lines * 0.13),
    sizeBytes: lines * 38,
    functions,
    longFunctions,
    noise: false,
    noiseReason: null,
    runtime,
    fileType,
    responsibilities,
    longestFunction,
    longestFunctionName,
    longestFunctionLine: extra.longestFunctionLine ?? 0,
    componentName: extra.componentName ?? longestFunctionName,
    componentLine: extra.componentLine ?? 0,
    fanIn: extra.fanIn ?? 0,
  };
}

export const NMSH_FILES: FileInfo[] = [
  mkFile("client/src/hooks/useRoomManager.ts", "ts", "client", "react_hook", 1007,
    [
      R("webrtc", "webrtc_conn", "direct", "new RTCPeerConnection", 286, "const pc = new RTCPeerConnection(iceConfig);"),
      R("websocket", "ws_client", "direct", "new WebSocket", 464, "const ws = new WebSocket(url.toString());"),
      R("state_machine", "state_machine", "direct", "useReducer(", 120, "const [state, dispatch] = useReducer(roomReducer, init);"),
      R("chat", "chat", "direct", "sendChat(", 540, "function sendChat(text: string) {"),
      R("timers", "timer_heartbeat", "direct", "heartbeat", 610, "const heartbeat = setInterval(ping, 15000);"),
    ],
    "connect", 192, 34, 6,
    { componentName: "useRoomManager", componentLine: 35, longestFunctionLine: 460, fanIn: 11 }),
  mkFile("server/src/index.ts", "ts", "server", "node_server", 792,
    [
      R("http_server", "http_listen", "direct", "http.createServer(", 30, "const server = http.createServer(app);"),
      R("websocket", "ws_server", "direct", "new WebSocketServer", 275, "const wss = new WebSocketServer({ server });"),
      R("routes", "routes", "direct", "app.get(", 60, "app.get('/health', (req, res) => res.send('ok'));"),
      R("validation", "validation", "direct", ".safeParse(", 90, "const msg = Schema.safeParse(raw);"),
      R("admin", "admin", "direct", "/admin/", 120, "app.use('/admin/', requireAdmin, adminRoutes);"),
      R("timers", "timer_heartbeat", "direct", "heartbeat", 150, "const heartbeat = setInterval(pingAll, 15000);"),
    ],
    "bootstrap", 140, 28, 5,
    { componentName: "bootstrap", componentLine: 24, longestFunctionLine: 24, fanIn: 0 }),
  mkFile("client/src/components/AdminPanel.tsx", "tsx", "client", "react_feature", 468,
    [
      R("admin", "admin", "direct", "requireAdmin", 24, "if (!requireAdmin(user)) return <AccessDenied/>;"),
      R("data_fetching", "data_fetching", "direct", "fetch(", 30, "const res = await fetch('/admin/users');"),
    ],
    "AdminPanel", 312, 12, 2,
    { componentName: "AdminPanel", componentLine: 14, longestFunctionLine: 40, fanIn: 3 }),
  mkFile("client/src/App.tsx", "tsx", "client", "react_root", 452,
    [
      R("websocket", "ws_consumer", "indirect", "useRoomManager", 40, "const room = useRoomManager();"),
      R("webrtc", "webrtc_media", "indirect", "remoteStream", 88, "<video srcObject={remoteStream} />"),
      R("state_machine", "state_dispatch", "indirect", "dispatch(", 60, "dispatch({ type: 'join', room });"),
    ],
    "App", 196, 11, 2,
    { componentName: "App", componentLine: 22, longestFunctionLine: 60, fanIn: 1 }),
  mkFile("client/src/components/Icon.tsx", "tsx", "client", "react_icon", 412, [], "Icon", 360, 1, 1,
    { componentName: "Icon", componentLine: 8, longestFunctionLine: 8, fanIn: 14 }),
  mkFile("client/src/components/AuthDialog.tsx", "tsx", "client", "react_dialog", 286,
    [
      R("validation", "validation", "direct", ".safeParse(", 96, "const parsed = schema.safeParse(form);"),
      R("data_fetching", "data_fetching", "direct", "fetch(", 110, "const res = await fetch('/api/login', opts);"),
      R("webrtc", "webrtc_media", "indirect", "MediaStream", 150, "videoEl.srcObject = stream as MediaStream;"),
    ],
    "AuthDialog", 150, 7, 1,
    { componentName: "AuthDialog", componentLine: 18, longestFunctionLine: 40, fanIn: 2 }),
  mkFile("client/src/components/ActionsRow.tsx", "tsx", "client", "react_component", 430,
    [
      R("timers", "timer_countdown", "direct", "secondsLeft", 40, "const id = setInterval(() => setSecondsLeft(s => s - 1), 1000);"),
    ],
    "ActionsRow", 96, 9, 1,
    { componentName: "ActionsRow", componentLine: 12, longestFunctionLine: 70, fanIn: 6 }),
  mkFile("server/src/auth.ts", "ts", "server", "node_service", 318,
    [
      R("firebase_admin", "firebase_admin", "direct", "admin.initializeApp(", 8, "admin.initializeApp({ credential: applicationDefault() });"),
      R("token_verify", "token_verify", "direct", "verifyIdToken(", 40, "const decoded = await admin.auth().verifyIdToken(token);"),
      R("claims", "claims", "direct", "setCustomUserClaims(", 96, "await admin.auth().setCustomUserClaims(uid, { admin });"),
      R("admin", "admin", "direct", "requireAdmin", 120, "if (!requireAdmin(decoded)) throw new ForbiddenError();"),
    ],
    "verifyToken", 58, 7, 1,
    { componentName: "verifyToken", componentLine: 21, longestFunctionLine: 40, fanIn: 4 }),
];

export const NMSH_NOISE: FileInfo[] = [
  { ...mkFile("package-lock.json", "json", "shared", "lockfile", 18432, [], "", 0, 0, 0), noise: true, noiseReason: "lockfile" },
  { ...mkFile("client/public/vendor.min.js", "js", "shared", "generated", 9210, [], "", 0, 0, 0), noise: true, noiseReason: "generated" },
];

