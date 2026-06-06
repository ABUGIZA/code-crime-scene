use super::*;
use super::detect::*;
use super::parse::*;
use crate::models::*;

    use super::*;

    fn resp_of<'a>(resp: &'a [Responsibility], kind: &str) -> Option<&'a Responsibility> {
        resp.iter().find(|r| r.kind == kind)
    }

    // Fixture A — a client App that only USES useRoomManager.
    #[test]
    fn fixture_a_client_app_is_root_not_server() {
        let content = "import { useRoomManager } from './hooks/useRoomManager';\n\
            export default function App() {\n  const room = useRoomManager();\n  return <div>{room.wsReady}</div>;\n}";
        let path = "client/src/App.tsx";
        let rt = detect_runtime(path, content);
        assert_eq!(rt, "client");
        let resp = detect_responsibilities(content, "TypeScript");
        let at = detect_artifact_type(path, "TypeScript", "tsx", &rt, &resp, content);
        assert_eq!(at, "react_root");
        assert_ne!(at, "node_server");
        assert_eq!(resp_of(&resp, "websocket").unwrap().evidence, "indirect");
    }

    // Fixture B — a real Node server entrypoint.
    #[test]
    fn fixture_b_server_entrypoint() {
        let content = "import http from 'http';\nconst server = http.createServer(app);\n\
            const wss = new WebSocketServer({ server });\napp.get('/health', () => {});\nserver.listen(3000);";
        let path = "server/src/index.ts";
        let rt = detect_runtime(path, content);
        assert_eq!(rt, "server");
        let resp = detect_responsibilities(content, "TypeScript");
        let at = detect_artifact_type(path, "TypeScript", "ts", &rt, &resp, content);
        assert_eq!(at, "node_server");
        assert_eq!(resp_of(&resp, "websocket").unwrap().evidence, "direct");
        assert_eq!(resp_of(&resp, "http_server").unwrap().evidence, "direct");
    }

    // Fixture C — an Icon component (long SVG switch).
    #[test]
    fn fixture_c_icon_component() {
        let content = "export function Icon({ name }: { name: string }) {\n  switch (name) {\n\
            case 'a': return <svg><path d='M0'/></svg>;\n  case 'b': return <svg><path d='M1'/></svg>;\n\
            case 'c': return <svg><path d='M2'/></svg>;\n  default: return null;\n }\n}";
        let path = "client/src/components/Icon.tsx";
        let rt = detect_runtime(path, content);
        let resp = detect_responsibilities(content, "TypeScript");
        let at = detect_artifact_type(path, "TypeScript", "tsx", &rt, &resp, content);
        assert_eq!(at, "react_icon");
    }

    // Fixture D — a dialog that only DISPLAYS a MediaStream (no WebRTC control).
    #[test]
    fn fixture_d_dialog_media_is_indirect() {
        let content = "export function ReportDialog({ stream }: { stream: MediaStream }) {\n\
            return <video srcObject={stream} />;\n}";
        let path = "client/src/components/ReportDialog.tsx";
        let rt = detect_runtime(path, content);
        let resp = detect_responsibilities(content, "TypeScript");
        let at = detect_artifact_type(path, "TypeScript", "tsx", &rt, &resp, content);
        assert_eq!(at, "react_dialog");
        assert_eq!(resp_of(&resp, "webrtc").unwrap().evidence, "indirect");
    }

    // Fixture E — lockfiles / generated are noise.
    #[test]
    fn fixture_e_noise_classification() {
        assert_eq!(crate::scanner::noise_reason("package-lock.json"), Some("lockfile"));
        assert_eq!(crate::scanner::noise_reason("client/public/app.min.js"), Some("generated"));
        assert_eq!(crate::scanner::noise_reason("client/src/App.tsx"), None);
    }

    // Fixture F — a DIALOG that happens to render inline SVG icons and uses a
    // `switch`. It must classify as react_dialog, NOT react_icon. (Regression for
    // the bug where AuthDialog.tsx was reported as a "long icon component".)
    #[test]
    fn fixture_f_dialog_with_icons_is_not_icon() {
        let content = "import { useState } from 'react';\n\
            export function AuthDialog() {\n\
            const icon = (n: string) => { switch (n) {\n\
            case 'a': return <svg><path d='M0'/></svg>;\n\
            case 'b': return <svg><path d='M1'/></svg>;\n\
            case 'c': return <svg><path d='M2'/></svg>;\n\
            default: return <svg><path d='M3'/></svg>; } };\n\
            const r = await fetch('/api/login');\n\
            return <div>{icon('a')}</div>;\n}";
        let path = "client/src/components/AuthDialog.tsx";
        let rt = detect_runtime(path, content);
        let resp = detect_responsibilities(content, "TypeScript");
        let at = detect_artifact_type(path, "TypeScript", "tsx", &rt, &resp, content);
        assert_eq!(at, "react_dialog", "a dialog with inline icons must stay a dialog");
        assert_ne!(at, "react_icon");
    }

    // Fixture G — a server that imports AND instantiates WebSocketServer must
    // report the INSTANTIATION (`new WebSocketServer`) on its real line, never the
    // import on line 1.
    #[test]
    fn fixture_g_server_ws_token_is_instantiation_not_import() {
        let content = "import { WebSocketServer, WebSocket } from \"ws\";\n\
            import http from 'http';\n\
            const server = http.createServer(app);\n\
            const wss = new WebSocketServer({ server });\nserver.listen(3000);";
        let resp = detect_responsibilities(content, "TypeScript");
        let ws = resp_of(&resp, "websocket").expect("websocket detected");
        assert_eq!(ws.evidence, "direct");
        assert_eq!(ws.label, "ws_server");
        assert_eq!(ws.token, "new WebSocketServer");
        assert_eq!(ws.line, 4, "must point at the instantiation, not the import on line 1");
    }

    // Fixture J — WebRTC: a `pc: RTCPeerConnection` type annotation must NOT be the
    // direct evidence; the `new RTCPeerConnection(...)` instantiation must win.
    #[test]
    fn fixture_j_webrtc_prefers_instantiation_over_type() {
        let content = "interface Peer { pc: RTCPeerConnection; }\n\
            function connect() {\n  const pc = new RTCPeerConnection(cfg);\n  return pc;\n}";
        let resp = detect_responsibilities(content, "TypeScript");
        let rtc = resp_of(&resp, "webrtc").expect("webrtc detected");
        assert_eq!(rtc.evidence, "direct");
        assert_eq!(rtc.label, "webrtc_conn");
        assert_eq!(rtc.token, "new RTCPeerConnection");
        assert_eq!(rtc.line, 3, "instantiation line, not the type on line 1");
    }

    // Fixture K — a file that only imports/types a symbol is SUPPORTING evidence,
    // never direct.
    #[test]
    fn fixture_k_import_only_is_supporting() {
        let content = "import { WebSocketServer } from \"ws\";\n\
            let server: WebSocketServer | null = null;\nexport { server };";
        let resp = detect_responsibilities(content, "TypeScript");
        let ws = resp_of(&resp, "websocket").expect("websocket detected");
        assert_eq!(ws.evidence, "supporting");
        assert_eq!(ws.label, "ws_type");
        assert_ne!(ws.evidence, "direct");
    }

    // Fixture L — timers are sub-typed: a UI countdown is not a retry timer, and a
    // generic interval is lifecycle (indirect), not a network concern.
    #[test]
    fn fixture_l_timer_subtypes() {
        let ui = "const [secondsLeft, setSecondsLeft] = useState(30);\n\
            useEffect(() => { const id = setInterval(() => setSecondsLeft(s => s - 1), 1000); }, []);";
        let t1 = resp_of(&detect_responsibilities(ui, "TypeScript"), "timers").cloned().expect("timers");
        assert_eq!(t1.label, "timer_countdown");
        assert_eq!(t1.evidence, "direct");

        let hb = "function ping() {}\nconst heartbeat = setInterval(ping, 15000);";
        let t2 = resp_of(&detect_responsibilities(hb, "TypeScript"), "timers").cloned().expect("timers");
        assert_eq!(t2.label, "timer_heartbeat");

        let lc = "const id = setInterval(() => poll(), 5000);";
        let t3 = resp_of(&detect_responsibilities(lc, "TypeScript"), "timers").cloned().expect("timers");
        assert_eq!(t3.label, "timer_lifecycle");
        assert_eq!(t3.evidence, "indirect");
    }

    // Fixture H — a client hook that really does `new WebSocket(url)` keeps the
    // literal "new WebSocket" token (boundary match must still accept it).
    #[test]
    fn fixture_h_client_ws_token_is_literal() {
        let content = "export function useSocket(url: string) {\n\
            const ws = new WebSocket(url.toString());\n  return ws;\n}";
        let resp = detect_responsibilities(content, "TypeScript");
        let ws = resp_of(&resp, "websocket").expect("websocket detected");
        assert_eq!(ws.evidence, "direct");
        assert_eq!(ws.token, "new WebSocket");
    }

    // Fixture I — every direct evidence token must actually be present in the file.
    #[test]
    fn fixture_i_direct_tokens_present_in_source() {
        let content = "import http from 'http';\nconst server = http.createServer(app);\n\
            const wss = new WebSocketServer({ server });\napp.get('/health', () => {});\nserver.listen(3000);";
        let resp = detect_responsibilities(content, "TypeScript");
        for r in &resp {
            if r.evidence == "direct" {
                assert!(content.contains(&r.token), "direct token {:?} must be in source", r.token);
            }
        }
    }

    // Fixture M — a keyword inside a comment is NEVER evidence; only real code counts.
    #[test]
    fn fixture_m_comments_are_never_evidence() {
        let content = "// handles reconnect and backoff for the socket\n\
            /* lazily creates a new RTCPeerConnection here */\n\
            const id = setInterval(() => poll(), 5000);\n\
            const v = data; // remoteStream preview\n";
        let code = code_view(content, "TypeScript");
        let resp = detect_responsibilities(&code, "TypeScript");
        let timer = resp_of(&resp, "timers").expect("timers");
        assert_eq!(timer.label, "timer_lifecycle", "retry words were only in a comment");
        assert!(resp_of(&resp, "webrtc").is_none(), "RTCPeerConnection/remoteStream were only in comments");
    }

    // Fixture N — a server module bundling firebase admin + token verify + claims is
    // a service module with real responsibilities, not a generic 'large file'.
    #[test]
    fn fixture_n_server_service_module() {
        let content = "import admin from 'firebase-admin';\n\
            admin.initializeApp({ credential: applicationDefault() });\n\
            export async function verify(t: string) { return admin.auth().verifyIdToken(t); }\n\
            export async function grant(uid: string) { await admin.auth().setCustomUserClaims(uid, { admin: true }); }\n";
        let path = "server/src/auth.ts";
        let code = code_view(content, "TypeScript");
        let rt = detect_runtime(path, &code);
        assert_eq!(rt, "server");
        let resp = detect_responsibilities(&code, "TypeScript");
        let at = detect_artifact_type(path, "TypeScript", "ts", &rt, &resp, &code);
        assert_eq!(at, "node_service");
        assert_eq!(resp_of(&resp, "firebase_admin").unwrap().evidence, "direct");
        assert_eq!(resp_of(&resp, "token_verify").unwrap().evidence, "direct");
        assert_eq!(resp_of(&resp, "claims").unwrap().evidence, "direct");
    }

    // Fixture O — verification commands are read from package.json scripts.
    #[test]
    fn fixture_o_verify_commands_from_package_json() {
        let pkg = crate::scanner::RawFile {
            rel_path: "package.json".into(),
            language: "JSON".into(),
            ext: "json".into(),
            size_bytes: 0,
            content: "{\"scripts\":{\"dev\":\"vite\",\"typecheck\":\"tsc --noEmit\",\"build\":\"tsc && vite build\"}}".into(),
            noise_reason: None,
        };
        let cmds = extract_verify_commands(&[pkg]);
        assert!(cmds.contains(&"npm run typecheck".to_string()));
        assert!(cmds.contains(&"npm run build".to_string()));
    }

    // Fixture P — a non-JS/TS file (e.g. the analyzer's own Rust source, which
    // DEFINES the patterns as strings) must yield NO JS responsibilities.
    #[test]
    fn fixture_p_non_jsts_has_no_responsibilities() {
        let rust = "// new WebSocketServer in a doc comment\n\
            const PATS: &[&str] = &[\"new WebSocketServer\", \"new RTCPeerConnection\", \"admin.initializeApp(\"];";
        assert!(detect_responsibilities(rust, "Rust").is_empty());
        let json = "{ \"snippet\": \"new WebSocketServer({ server })\" }";
        assert!(detect_responsibilities(json, "JSON").is_empty());
    }

    // Fixture Q — a JS/TS string literal that merely CONTAINS a pattern is not
    // evidence; only real code is. (Fixes mock.ts / findings.ts / i18n.tsx self-flag.)
    #[test]
    fn fixture_q_string_literals_are_not_evidence() {
        let as_string = "const label = \"new WebSocketServer\";\nconst note = 'RTCPeerConnection setup';";
        let resp = detect_responsibilities(&code_for_resp(as_string, "TypeScript"), "TypeScript");
        assert!(resp_of(&resp, "websocket").is_none(), "string literal is not a usage");
        assert!(resp_of(&resp, "webrtc").is_none());

        let as_code = "const wss = new WebSocketServer({ server });";
        let resp2 = detect_responsibilities(&code_for_resp(as_code, "TypeScript"), "TypeScript");
        assert_eq!(resp_of(&resp2, "websocket").unwrap().evidence, "direct");
    }

    // Fixture R — Tauri's generated schemas under gen/ are noise.
    #[test]
    fn fixture_r_gen_schemas_are_noise() {
        assert_eq!(crate::scanner::noise_reason("src-tauri/gen/schemas/desktop-schema.json"), Some("generated"));
        assert_eq!(crate::scanner::noise_reason("src-tauri/gen/schemas/windows-schema.json"), Some("generated"));
        assert_eq!(crate::scanner::noise_reason("src/lib/findings.ts"), None);
    }

