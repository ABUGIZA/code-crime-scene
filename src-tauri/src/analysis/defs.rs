use regex::Regex;

pub(crate) const LONG_FUNC_THRESHOLD: usize = 50;
pub(crate) const DUP_WINDOW: usize = 6;
/// Cyclomatic complexity above this is flagged as high.
pub(crate) const HIGH_CC_THRESHOLD: usize = 10;

pub(crate) struct FuncHit {
    pub(crate) name: String,
    pub(crate) start_line: usize, // 0-based
    /// For JS/TS arrow functions: (line, column) just AFTER the `=>` token,
    /// both 0-based. `None` for every other declaration form. This lets the
    /// measurer notice a brace-less (expression-body) arrow and stop at the
    /// end of its statement instead of latching onto a later function's braces.
    pub(crate) arrow: Option<(usize, usize)>,
}

pub(crate) struct ImportItem {
    pub(crate) local_names: Vec<String>,
    pub(crate) source: String,
    pub(crate) line: usize, // 1-based
    pub(crate) is_relative: bool,
}

pub(crate) struct CommentTokens {
    pub(crate) line: Option<&'static str>,
    pub(crate) block_open: Option<&'static str>,
    pub(crate) block_close: Option<&'static str>,
}

/// Compiled-once regexes reused across every file in one analysis run.
pub(crate) struct Patterns {
    pub(crate) ts_import: Regex,
    pub(crate) ts_func_function: Regex,
    pub(crate) ts_func_arrow: Regex,
    pub(crate) py_def: Regex,
    pub(crate) py_import: Regex,
    pub(crate) py_import_from: Regex,
    pub(crate) rust_fn: Regex,
    pub(crate) go_func: Regex,
    pub(crate) generic_method: Regex,
    pub(crate) lua_func_decl: Regex,
    pub(crate) lua_func_assign: Regex,
    pub(crate) lua_require: Regex,
    pub(crate) sec_private_key: Regex,
    pub(crate) sec_aws: Regex,
    pub(crate) sec_assign: Regex,
    // Secrets v2 — provider-specific token shapes (high severity).
    pub(crate) sec_github: Regex,
    pub(crate) sec_stripe: Regex,
    pub(crate) sec_aws_sts: Regex,
    pub(crate) sec_google: Regex,
    pub(crate) sec_slack_token: Regex,
    pub(crate) sec_anthropic: Regex,
    pub(crate) sec_npm: Regex,
    pub(crate) sec_sendgrid: Regex,
    pub(crate) sec_telegram: Regex,
    pub(crate) sec_generic_sk: Regex,
    // Secrets v2 — medium severity.
    pub(crate) sec_whsec: Regex,
    pub(crate) sec_slack_webhook: Regex,
    pub(crate) sec_twilio: Regex,
    pub(crate) sec_jwt: Regex,
    // FiveM server.cfg keys (high severity).
    pub(crate) sec_rcon: Regex,
    pub(crate) sec_fivem_license: Regex,
    pub(crate) sec_steam_key: Regex,
    /// Placeholder values that are never real secrets.
    pub(crate) sec_placeholder: Regex,
}
impl Patterns {
    pub(crate) fn new() -> Self {
        Patterns {
            ts_import: Regex::new(r#"import\s+(?:type\s+)?([\s\S]*?)\s+from\s*['"]([^'"]+)['"]"#).unwrap(),
            ts_func_function: Regex::new(r"function\s+([A-Za-z0-9_$]+)\s*\(").unwrap(),
            ts_func_arrow: Regex::new(r"(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>").unwrap(),
            py_def: Regex::new(r"(?m)^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(").unwrap(),
            py_import: Regex::new(r"(?m)^\s*import\s+(.+)$").unwrap(),
            py_import_from: Regex::new(r"(?m)^\s*from\s+(\S+)\s+import\s+(.+)$").unwrap(),
            rust_fn: Regex::new(r"\bfn\s+([A-Za-z_][A-Za-z0-9_]*)").unwrap(),
            go_func: Regex::new(r"func\s+(?:\([^)]*\)\s*)?([A-Za-z0-9_]+)\s*\(").unwrap(),
            generic_method: Regex::new(r"(?m)^[ \t]*[A-Za-z_][A-Za-z0-9_<>\[\].,&\*: \t]*?\b([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}\n]*\)\s*\{").unwrap(),
            lua_func_decl: Regex::new(r"(?m)^\s*(?:local\s+)?function\s+([A-Za-z_][A-Za-z0-9_.:]*)\s*\(").unwrap(),
            lua_func_assign: Regex::new(r"(?m)(?:^|\s)(?:local\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*function\s*\(").unwrap(),
            lua_require: Regex::new(r#"\brequire\s*\(?\s*['"]([A-Za-z0-9_./\-]+)['"]"#).unwrap(),
            sec_private_key: Regex::new(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----").unwrap(),
            sec_aws: Regex::new(r"AKIA[0-9A-Z]{16}").unwrap(),
            sec_assign: Regex::new(r#"(?i)\b(api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*['"]([^'"]{8,})['"]"#).unwrap(),
            sec_github: Regex::new(r"ghp_[A-Za-z0-9]{36}|gh[ours]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}").unwrap(),
            sec_stripe: Regex::new(r"(?:sk|rk)_live_[A-Za-z0-9]{16,}").unwrap(),
            sec_aws_sts: Regex::new(r"ASIA[0-9A-Z]{16}").unwrap(),
            sec_google: Regex::new(r"AIza[0-9A-Za-z_\-]{35}").unwrap(),
            sec_slack_token: Regex::new(r"xox[baprs]-[A-Za-z0-9-]{10,}").unwrap(),
            sec_anthropic: Regex::new(r"sk-ant-[A-Za-z0-9_\-]{24,}").unwrap(),
            sec_npm: Regex::new(r"npm_[A-Za-z0-9]{36}").unwrap(),
            sec_sendgrid: Regex::new(r"SG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}").unwrap(),
            sec_telegram: Regex::new(r"\b\d{8,10}:AA[A-Za-z0-9_\-]{33}\b").unwrap(),
            sec_generic_sk: Regex::new(r"\bsk-[A-Za-z0-9_\-]{38,}\b").unwrap(),
            sec_whsec: Regex::new(r"whsec_[A-Za-z0-9]{24,}").unwrap(),
            sec_slack_webhook: Regex::new(r"https://hooks\.slack\.com/services/T[A-Za-z0-9_/]+").unwrap(),
            sec_twilio: Regex::new(r"\bSK[0-9a-fA-F]{32}\b").unwrap(),
            sec_jwt: Regex::new(r"eyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}").unwrap(),
            sec_rcon: Regex::new(r"^\s*rcon_password\s+\S+").unwrap(),
            sec_fivem_license: Regex::new(r"^\s*sv_licenseKey\s+\S+").unwrap(),
            sec_steam_key: Regex::new(r"^\s*steam_webApiKey\s+\S+").unwrap(),
            sec_placeholder: Regex::new(r"(?i)your|example|placeholder|changeme|xxx|test|demo|sample|<|>|\$\{|process\.env|import\.meta").unwrap(),
        }
    }
}

/// Run the full static analysis over scanned files.

pub(crate) struct Tier {
    pub(crate) evidence: &'static str, // "direct" | "indirect" | "supporting"
    pub(crate) label: &'static str,    // refined sub-type shown to the user
    pub(crate) pats: &'static [&'static str],
}

pub(crate) const T_WEBSOCKET: &[Tier] = &[
    Tier { evidence: "direct", label: "ws_server", pats: &["new WebSocketServer", "WebSocketServer(", "WebSocket.Server("] },
    Tier { evidence: "direct", label: "ws_client", pats: &["new WebSocket"] },
    Tier { evidence: "direct", label: "ws_handler", pats: &["ws.on(", "wss.on(", "socket.on(", "io.on(", ".onmessage"] },
    Tier { evidence: "indirect", label: "ws_consumer", pats: &["wsReady", "useRoomManager", "useSignaling", "useSocket", "socketRef", "room.ws"] },
    Tier { evidence: "supporting", label: "ws_type", pats: &["WebSocketServer", "from \"ws\"", "from 'ws'", ": WebSocket"] },
];
// --- WebRTC ---
pub(crate) const T_WEBRTC: &[Tier] = &[
    Tier { evidence: "direct", label: "webrtc_conn", pats: &["new RTCPeerConnection", "RTCPeerConnection(", "createDataChannel(", "createOffer(", "createAnswer(", "setLocalDescription(", "setRemoteDescription(", "addIceCandidate(", "new RTCDataChannel"] },
    Tier { evidence: "indirect", label: "webrtc_media", pats: &["getUserMedia", "getDisplayMedia", "srcObject", "remoteStream", "localStream", "addTrack(", "ontrack", "MediaStream"] },
    Tier { evidence: "supporting", label: "webrtc_type", pats: &["RTCPeerConnection", "RTCDataChannel", "RTCSessionDescription", "RTCIceCandidate"] },
];
// --- HTTP server ---
pub(crate) const T_HTTP: &[Tier] = &[
    Tier { evidence: "direct", label: "http_listen", pats: &["http.createServer(", "https.createServer(", "createServer(", "express(", "fastify(", "app.listen(", "server.listen(", ".listen("] },
    Tier { evidence: "supporting", label: "http_type", pats: &["from \"http\"", "from 'http'", "require('http')", "from \"express\""] },
];
// --- Routes (always real handler calls) ---
pub(crate) const T_ROUTES: &[Tier] = &[
    Tier { evidence: "direct", label: "routes", pats: &["app.get(", "app.post(", "app.put(", "app.delete(", "app.patch(", "router.get(", "router.post(", "router.put(", "router.delete(", "router.patch(", ".route(", "fastify.get("] },
];
// --- Validation ---
pub(crate) const T_VALIDATION: &[Tier] = &[
    Tier { evidence: "direct", label: "validation", pats: &[".safeParse(", ".parse(", "z.object", "Joi.object", "joi.object", "yup.object", "schema.validate(", ".validateSync("] },
    Tier { evidence: "supporting", label: "validation_type", pats: &["import { z }", "import Joi", "import * as yup"] },
];
// --- Timers: semantic sub-types first, generic interval/timeout last. Retry
//     patterns are call forms so a stray word can't be mistaken for a timer. ---
pub(crate) const T_TIMERS: &[Tier] = &[
    Tier { evidence: "direct", label: "timer_heartbeat", pats: &["heartbeat", "sendPing(", "pingInterval", "keepAlive"] },
    Tier { evidence: "direct", label: "timer_retry", pats: &["scheduleReconnect(", "reconnect(", "requeue(", "backoff(", "scheduleRetry(", "reconnectTimer", "retryTimer"] },
    Tier { evidence: "direct", label: "timer_countdown", pats: &["countdown", "secondsLeft", "timeLeft", "remainingSeconds", "remainingTime"] },
    Tier { evidence: "direct", label: "timer_ui", pats: &["waitedSeconds", "elapsedSeconds", "setSeconds(", "useTimer(", "useInterval("] },
    Tier { evidence: "indirect", label: "timer_lifecycle", pats: &["setInterval(", "setTimeout("] },
];
// --- Chat: real send paths are direct; consumed state is indirect; a bare
//     ChatMessage type import is only supporting. ---
pub(crate) const T_CHAT: &[Tier] = &[
    Tier { evidence: "direct", label: "chat", pats: &["sendChat(", "dc.send(", "dataChannel.send(", "channel.send(", "publishChat(", "emitChat(", "chatChannel"] },
    Tier { evidence: "indirect", label: "chat_consumer", pats: &["chatMessages", "onChatMessage"] },
    Tier { evidence: "supporting", label: "chat_type", pats: &["ChatMessage"] },
];
// --- Firebase admin / auth service responsibilities (server) ---
pub(crate) const T_FIREBASE: &[Tier] = &[
    Tier { evidence: "direct", label: "firebase_admin", pats: &["admin.initializeApp(", "initializeApp(", "admin.auth(", "getAuth(", "applicationDefault(", "cert("] },
    Tier { evidence: "supporting", label: "firebase_type", pats: &["firebase-admin"] },
];
pub(crate) const T_TOKEN: &[Tier] = &[
    Tier { evidence: "direct", label: "token_verify", pats: &["verifyIdToken(", "verifySessionCookie(", "jwt.verify(", "verifyToken("] },
];
pub(crate) const T_CLAIMS: &[Tier] = &[
    Tier { evidence: "direct", label: "claims", pats: &["setCustomUserClaims(", "updateUser(", "createUser(", "listUsers(", "getUserByEmail(", "getUser("] },
];
// --- Data fetching ---
pub(crate) const T_DATA: &[Tier] = &[
    Tier { evidence: "direct", label: "data_fetching", pats: &["fetch(", "axios.", "axios(", "useQuery(", "useMutation(", "useSWR(", "$fetch("] },
    Tier { evidence: "supporting", label: "data_type", pats: &["from \"axios\"", "from 'axios'"] },
];
// --- State machine ---
pub(crate) const T_STATE: &[Tier] = &[
    Tier { evidence: "direct", label: "state_machine", pats: &["useReducer(", "createSlice(", "createMachine(", "switch (state", "switch(state"] },
    Tier { evidence: "indirect", label: "state_dispatch", pats: &["dispatch("] },
];
// --- Database ---
pub(crate) const T_DATABASE: &[Tier] = &[
    Tier { evidence: "direct", label: "database", pats: &["prisma.", "knex(", "mongoose.", "db.query(", "pool.query(", "createPool(", ".collection(", "drizzle("] },
];
// --- Admin ---
pub(crate) const T_ADMIN: &[Tier] = &[
    Tier { evidence: "direct", label: "admin", pats: &["requireAdmin", "isAdmin(", "/admin/"] },
    Tier { evidence: "indirect", label: "admin_consumer", pats: &["adminRoutes", "AdminPanel", "useAdmin("] },
];

// --- FiveM (Lua + JS runtimes share these natives) ---
pub(crate) const T_FIVEM_EVENTS: &[Tier] = &[
    Tier { evidence: "direct", label: "event_register", pats: &["RegisterNetEvent", "RegisterServerEvent", "AddEventHandler"] },
    Tier { evidence: "direct", label: "event_trigger", pats: &["TriggerEvent(", "TriggerServerEvent(", "TriggerClientEvent("] },
];
pub(crate) const T_FIVEM_NUI: &[Tier] = &[
    Tier { evidence: "direct", label: "nui", pats: &["RegisterNUICallback", "SendNUIMessage", "SetNuiFocus"] },
];
pub(crate) const T_FIVEM_THREADS: &[Tier] = &[
    Tier { evidence: "indirect", label: "thread", pats: &["CreateThread(", "Citizen.CreateThread(", "SetTimeout("] },
];
pub(crate) const T_FIVEM_COMMANDS: &[Tier] = &[
    Tier { evidence: "direct", label: "command", pats: &["RegisterCommand("] },
];
pub(crate) const T_FIVEM_DATABASE: &[Tier] = &[
    Tier { evidence: "direct", label: "db", pats: &["MySQL.", "oxmysql", "exports.oxmysql", "exports['oxmysql']"] },
];
pub(crate) const T_FIVEM_FRAMEWORK: &[Tier] = &[
    Tier { evidence: "direct", label: "framework", pats: &["QBCore.Functions", "ESX.", "exports['qb-core']", "exports['es_extended']", "lib.callback"] },
];

pub(crate) const RESP_DEFS: &[(&str, &[Tier])] = &[
    ("websocket", T_WEBSOCKET),
    ("webrtc", T_WEBRTC),
    ("http_server", T_HTTP),
    ("routes", T_ROUTES),
    ("validation", T_VALIDATION),
    ("timers", T_TIMERS),
    ("chat", T_CHAT),
    ("data_fetching", T_DATA),
    ("state_machine", T_STATE),
    ("database", T_DATABASE),
    ("admin", T_ADMIN),
    ("firebase_admin", T_FIREBASE),
    ("token_verify", T_TOKEN),
    ("claims", T_CLAIMS),
    ("fivem_events", T_FIVEM_EVENTS),
    ("fivem_nui", T_FIVEM_NUI),
    ("fivem_threads", T_FIVEM_THREADS),
    ("fivem_commands", T_FIVEM_COMMANDS),
    ("fivem_database", T_FIVEM_DATABASE),
    ("fivem_framework", T_FIVEM_FRAMEWORK),
];

