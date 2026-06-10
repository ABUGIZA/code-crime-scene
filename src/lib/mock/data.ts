import type {
  ComplexFunction,
  DependencyEdge,
  DuplicationBlock,
  FileInfo,
  GitForensics,
  LanguageStat,
  LongFunction,
  Responsibility,
  SecurityFinding,
  UnusedImport,
} from "../types";

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

// --- v2 mock evidence: cyclomatic complexity + git history -------------------

export const NMSH_COMPLEX: ComplexFunction[] = [
  { file: "src/store/rootReducer.ts", name: "editorReducer", startLine: 188, length: 214, complexity: 24, language: "TypeScript" },
  { file: "src/features/editor/Canvas.tsx", name: "handlePointerMove", startLine: 311, length: 168, complexity: 19, language: "TypeScript" },
  { file: "src/api/client.ts", name: "request", startLine: 96, length: 121, complexity: 14, language: "TypeScript" },
  { file: "src/features/auth/authSlice.ts", name: "refreshSession", startLine: 240, length: 98, complexity: 11, language: "TypeScript" },
  { file: "src/components/DataGrid.tsx", name: "computeLayout", startLine: 142, length: 87, complexity: 9, language: "TypeScript" },
  { file: "src/utils/format.ts", name: "formatRelative", startLine: 12, length: 64, complexity: 8, language: "TypeScript" },
  { file: "src/features/editor/Toolbar.tsx", name: "resolveShortcut", startLine: 74, length: 58, complexity: 8, language: "TypeScript" },
  { file: "src/features/viewer/Viewer.tsx", name: "syncViewport", startLine: 201, length: 71, complexity: 8, language: "TypeScript" },
];

export const NMSH_GIT: GitForensics = {
  available: true,
  reason: null,
  commitsAnalyzed: 482,
  authorsTotal: 5,
  files: [
    { path: "src/store/rootReducer.ts", commits: 64, additions: 3180, deletions: 1030, authors: 4, lastTouchedDays: 3 },
    { path: "src/features/editor/Canvas.tsx", commits: 47, additions: 2410, deletions: 880, authors: 3, lastTouchedDays: 6 },
    { path: "src/api/client.ts", commits: 33, additions: 1280, deletions: 410, authors: 2, lastTouchedDays: 12 },
    { path: "src/features/auth/authSlice.ts", commits: 21, additions: 760, deletions: 350, authors: 2, lastTouchedDays: 28 },
  ],
  hotspots: [
    { path: "src/store/rootReducer.ts", commits: 64, churn: 4210, score: 0.94 },
    { path: "src/features/editor/Canvas.tsx", commits: 47, churn: 3290, score: 0.78 },
    { path: "src/api/client.ts", commits: 33, churn: 1690, score: 0.52 },
    { path: "src/features/auth/authSlice.ts", commits: 21, churn: 1110, score: 0.34 },
    { path: "src/features/editor/Toolbar.tsx", commits: 18, churn: 760, score: 0.27 },
    { path: "src/components/DataGrid.tsx", commits: 14, churn: 620, score: 0.21 },
  ],
  coChanges: [
    { a: "src/features/editor/Canvas.tsx", b: "src/store/rootReducer.ts", count: 23 },
    { a: "src/api/client.ts", b: "src/features/auth/authSlice.ts", count: 11 },
    { a: "src/features/editor/Toolbar.tsx", b: "src/store/rootReducer.ts", count: 9 },
    { a: "src/api/users.ts", b: "src/api/teams.ts", count: 7 },
  ],
  busFactor: [
    { path: "src/store/rootReducer.ts", topAuthor: "m.alharbi", share: 0.81, commits: 64 },
    { path: "src/features/auth/authSlice.ts", topAuthor: "s.qassim", share: 0.71, commits: 21 },
    { path: "src/components/DataGrid.tsx", topAuthor: "m.alharbi", share: 0.57, commits: 14 },
  ],
};

// --- static building blocks for sampleAnalysis (mock.ts) ---------------------
// Drift-dependent counts stay in sampleAnalysis; these pieces never change.

export const NMSH_LANGUAGES: LanguageStat[] = [
  { language: "TypeScript", files: 168, lines: 12450 },
  { language: "CSS", files: 22, lines: 3210 },
  { language: "JSON", files: 14, lines: 842 },
  { language: "Markdown", files: 9, lines: 802 },
];

export const NMSH_CYCLES: string[][] = [
  ["src/features/editor/Canvas.tsx", "src/store/rootReducer.ts", "src/features/editor/Toolbar.tsx"],
  ["src/api/client.ts", "src/features/auth/authSlice.ts"],
];

export const NMSH_LONG_FUNCTIONS: LongFunction[] = [
  { file: "src/store/rootReducer.ts", name: "editorReducer", startLine: 188, length: 214, language: "TypeScript" },
  { file: "src/features/editor/Canvas.tsx", name: "handlePointerMove", startLine: 311, length: 168, language: "TypeScript" },
  { file: "src/api/client.ts", name: "request", startLine: 96, length: 121, language: "TypeScript" },
  { file: "src/features/auth/authSlice.ts", name: "refreshSession", startLine: 240, length: 98, language: "TypeScript" },
  { file: "src/components/DataGrid.tsx", name: "computeLayout", startLine: 142, length: 87, language: "TypeScript" },
  { file: "src/utils/format.ts", name: "formatRelative", startLine: 12, length: 64, language: "TypeScript" },
];

export const NMSH_DUPLICATION: DuplicationBlock[] = [
  {
    fingerprint: "9af31c20e7b6d041",
    lineCount: 6,
    occurrences: 4,
    files: ["src/features/editor/Toolbar.tsx", "src/features/viewer/Toolbar.tsx", "src/features/editor/Panel.tsx"],
    sample:
      "const handler = useCallback((e: Event) => {\nif (!ref.current) return;\nconst rect = ref.current.getBoundingClientRect();\nsetPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });\ndispatch(updatePointer(pos));\n}, [dispatch, pos]);",
  },
  {
    fingerprint: "1b7740a9c3e25fd8",
    lineCount: 6,
    occurrences: 3,
    files: ["src/api/users.ts", "src/api/teams.ts", "src/api/projects.ts"],
    sample:
      "const res = await client.get(`/v2/${resource}`);\nif (res.status !== 200) {\nthrow new ApiError(res.status, res.statusText);\n}\nreturn normalize(res.data);",
  },
];

export const NMSH_UNUSED_IMPORTS: UnusedImport[] = [
  { file: "src/features/editor/Canvas.tsx", name: "useMemo", source: "react", line: 3 },
  { file: "src/api/client.ts", name: "AxiosError", source: "axios", line: 2 },
  { file: "src/components/DataGrid.tsx", name: "clsx", source: "clsx", line: 8 },
  { file: "src/utils/format.ts", name: "isToday", source: "date-fns", line: 1 },
];

export const NMSH_SECURITY_FINDINGS: SecurityFinding[] = [
  { file: "src/config/firebase.ts", line: 14, kind: "Hardcoded secret", severity: "medium", snippet: 'apiKey: «redacted»,' },
  { file: ".env.example", line: 6, kind: "Hardcoded secret", severity: "medium", snippet: 'ACCESS_TOKEN=«redacted»' },
  { file: "scripts/deploy.ts", line: 30, kind: "Private key material", severity: "high", snippet: "-----BEGIN OPENSSH «redacted» KEY-----" },
  { file: "src/api/client.ts", line: 51, kind: "Hardcoded secret", severity: "medium", snippet: 'clientSecret: «redacted»' },
];

export const NMSH_DEPENDENCIES: DependencyEdge[] = [
  { from: "src/features/editor/Canvas.tsx", to: "src/store/rootReducer.ts" },
  { from: "src/features/editor/Toolbar.tsx", to: "src/store/rootReducer.ts" },
  { from: "src/features/viewer/Toolbar.tsx", to: "src/store/rootReducer.ts" },
  { from: "src/components/DataGrid.tsx", to: "src/api/client.ts" },
  { from: "src/features/auth/authSlice.ts", to: "src/api/client.ts" },
  { from: "src/api/users.ts", to: "src/api/client.ts" },
  { from: "src/api/teams.ts", to: "src/api/client.ts" },
];

