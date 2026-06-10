<p align="center">
  <img src="assets/hero.svg" alt="Code Crime Scene — offline-first forensic code analyzer" width="100%">
</p>

<h1 align="center">Code Crime Scene</h1>

<p align="center">
  <b>An offline-first desktop app that treats your codebase like a crime scene.</b><br>
  It scans a local project, dusts it for fingerprints, and hands you a forensic report —
  scores, suspects, and a prioritized list of fixes. Everything runs on your machine.
</p>

<p align="center">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows-0E0F11?style=flat-square">
  <img alt="built with" src="https://img.shields.io/badge/built%20with-Tauri%20·%20Rust%20·%20React-E0A33A?style=flat-square">
  <img alt="offline" src="https://img.shields.io/badge/privacy-offline--first-2ea043?style=flat-square">
  <img alt="ai" src="https://img.shields.io/badge/AI-DeepSeek%20%C2%B7%20OpenAI%20%C2%B7%20Claude%20%C2%B7%20Ollama%20(optional)-6e5494?style=flat-square">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square">
</p>

<p align="center"><a href="README.ar.md">🌍 اقرأ بالعربية</a></p>

---

## What it is

**Code Crime Scene** is a local, single-binary desktop tool for developers and teams who want an honest, fast read on the health of a codebase — without uploading a single line of source to the cloud.

You point it at a folder. A Rust engine walks the tree, runs static analysis entirely on your machine, and produces a **"Forensic Noir" report**: five headline scores, a graded verdict, and a list of **actionable findings** — each with evidence (file + line + a one-line snippet), a numeric risk rationale, and a safe, PR-by-PR refactor plan. The engine measures **cyclomatic complexity per function**, detects **dependency cycles**, mines your **git history** for hotspots and bus-factor risk, and scans for **16+ kinds of leaked secrets** with entropy analysis.

A second, **optional** opinion is available: send a compact, **code-free** summary to the AI provider of your choice — **DeepSeek, OpenAI, Claude (Anthropic), or a local model (Ollama / LM Studio)** — for a written "Detective's Report." Your source code never leaves the machine — only aggregate metrics and file paths are transmitted, and only when you explicitly ask.

> **Offline by default. AI by choice.** The scan is 100% local. No AI is contacted until you press **"Analyze with AI."**

---

## Highlights

| | |
|---|---|
| 🔒 **Offline-first** | No backend, no login, no telemetry. Static analysis runs locally in Rust. |
| 🧮 **Real complexity** | Cyclomatic complexity for every function — the riskiest land in the report's *Interrogation Room*. |
| 🕰️ **Git forensics** | Change hotspots, files that always change together, and single-owner (bus-factor) risk — mined locally from your repo's history (*The Rap Sheet*). |
| 🎮 **Lua & FiveM aware** | Full Lua support including FiveM resources: events, NUI, threads, commands, QBCore/ESX/ox patterns, client/server detection — even `server.cfg` secrets. |
| 🧠 **Optional AI — your pick** | DeepSeek, OpenAI, Claude (Anthropic), or a local Ollama/LM Studio model — on request, with a code-free summary. |
| 🎯 **Evidence-ranked findings** | Real usage beats imports/types/comments. Every finding cites file, line, and a snippet. |
| 📊 **Five scores + verdict** | Project Score, Technical Debt, Architecture, Security Risk, Maintainability — with ▲▼ trends vs your previous scan. |
| 🧩 **Context-aware** | Knows a hook from a server entrypoint from an icon file; suggests fixes that fit the file. |
| 🛡️ **Secrets v2** | 16+ token patterns (GitHub, Stripe, AWS, Google, Slack, Telegram, JWT, FiveM rcon…) + Shannon-entropy detection, always redacted. |
| 🩹 **Safe refactor plans** | Each finding ships a PR-by-PR slicing plan + the exact `npm run` verify commands. |
| 🌍 **Bilingual** | Full English / Arabic UI (RTL), and the AI replies in your chosen language. |
| 🔑 **Keys in the OS keychain** | API keys live in Windows Credential Manager (one slot per provider) — never in a file, never in the webview. |
| 🗄️ **Local history** | Every report is saved to a local SQLite database you can reopen anytime. |

---

## A look inside

<p align="center">
  <img src="assets/screenshots/report.png" alt="The forensic report — five scores, a graded verdict, and prioritized findings" width="92%">
</p>
<p align="center"><sub><i>The case file: five scores, a graded verdict, and a prioritized list of findings — each with evidence.</i></sub></p>

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="assets/screenshots/home.png" alt="Open a case"><br>
      <b>Open a case</b><br>
      <sub>Point at any local folder — recent scenes are one click away.</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="assets/screenshots/cases.png" alt="Case files"><br>
      <b>Case files</b><br>
      <sub>Every investigation, saved locally in SQLite.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="assets/screenshots/ai-report.png" alt="Detective's Report"><br>
      <b>Detective's Report — optional AI</b><br>
      <sub>A written verdict from the provider of your choice, on request, code-free.</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="assets/screenshots/settings.png" alt="Settings"><br>
      <b>Settings</b><br>
      <sub>Language, key-in-keychain, storage &amp; privacy.</sub>
    </td>
  </tr>
</table>

---

## 🔁 Tested on itself — we fixed the tool *with the tool*

Most quality tools are never pointed at their own source. We pointed Code Crime Scene at **its own codebase** — and it indicted us.

The first self-scan was brutal: **51 / 100 · Grade F · "Homicide."** And it was *right*. It named real debt:

- **12.1% duplicated code** across the project
- **Monolith files** far over 400 lines — the analysis engine alone was **1,718** lines, the findings engine **770**, the i18n layer **889**, one stylesheet **922**
- A **duplicated API-key flow** copy-pasted between two screens
- A few of the engine's *own* findings that needed sharper evidence

So we did the honest thing. We clicked the report's **"Copy as prompt"** button, handed the tool's own forensic write-up to an AI pair-programmer, and fixed precisely what it named — splitting every monolith into focused modules under 400 lines, extracting the shared flows, and tightening the engine. Then we **re-scanned with the same tool**:

<p align="center"><b>51 → 87 &nbsp;·&nbsp; Grade F → B &nbsp;·&nbsp; "Homicide" → "Minor violations"</b></p>

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="assets/screenshots/selfscan-before.png" alt="Self-scan before — 51, Grade F"><br>
      <sub><b>Before</b> — caught by its own scan</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="assets/screenshots/selfscan-after.png" alt="Self-scan after — 87, Grade B"><br>
      <sub><b>After</b> — same tool, re-scanned</sub>
    </td>
  </tr>
</table>

| Score | Before | After | |
|---|:--:|:--:|:--|
| **Project Score** | 51 · F | **87 · B** | ▲ 36 |
| **Maintainability** | 37 | **85** | ▲ 48 |
| **Technical Debt** | 47 | **86** | ▲ 39 |
| **Architecture** | 53 | **80** | ▲ 27 |
| **Security Risk** | 72 | **100** | ▲ 28 |
| **Duplication** | 12.1% | **0.0%** | ▼ all of it |

> If a code-quality tool can't survive its own audit, why trust its verdict on yours? Ours did — and the whole loop (scan → *Copy as prompt* → fix → re-scan) is exactly the workflow it's built to give you.

📊 **[See the measured engine benchmark →](https://ccs-benchmark.vercel.app)** — v1 vs v2 on 34 planted evidence items, both engines actually executed, fully reproducible.

---

## How it works

```
                ┌──────────────────────── your machine ────────────────────────┐
   pick a       │                                                              │
   folder  ──▶  │   Scanner (Rust) ──▶ Static Analysis (Rust) ──▶ Report (UI)  │
                │                                   │                          │
                │                                   ▼  (only on request,       │
                │                          compact, code-free summary)         │
                └───────────────────────────────────┼──────────────────────────┘
                                                     ▼
                              AI provider (optional) — DeepSeek / OpenAI /
                              Claude / local Ollama
```

1. **Scan** — the folder is walked; `node_modules`, build output, `.git`, lockfiles and generated files are ignored.
2. **Analyze** — file/line metrics, long functions, **cyclomatic complexity per function**, sliding-window duplication, unused imports, a dependency graph with **cycle detection**, and **16+ secret patterns with entropy analysis** — all in Rust, all local.
3. **Git forensics** — if the folder is a repo, the last 1000 commits are mined locally for hotspots, co-change pairs, and bus-factor risk. No repo? The report simply skips that panel.
4. **Report** — scores (with ▲▼ trends vs your previous scan), a graded verdict, and prioritized findings with evidence and refactor plans.
5. **(Optional) Analyze with AI** — a compact summary (numbers + file paths, **never source**) goes to your chosen provider for a written report.

---

## Install

### Download (Windows)
Grab **[Code-Crime-Scene.exe](https://github.com/ABUGIZA/code-crime-scene/raw/main/Code-Crime-Scene.exe)** (≈11 MB) straight from this repo and double-click — one self-contained binary, no installer, no dependencies.

> ⚠️ Not code-signed yet, so Windows SmartScreen may warn on first run — click **More info → Run anyway**.

### Build from source
```bash
# prerequisites: Node 18+, Rust (stable), and the Tauri prerequisites for your OS
git clone https://github.com/ABUGIZA/code-crime-scene.git
cd code-crime-scene
npm install

npm run tauri dev      # run in development
npm run tauri build    # produce a standalone binary
```

---

## Setting up the AI (optional)

AI is **optional** — the local report works fully without a key. Four providers are built in:

| Provider | Key from | Notes |
|---|---|---|
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) | default, cheapest |
| **OpenAI** | [platform.openai.com](https://platform.openai.com/) | |
| **Claude (Anthropic)** | [console.anthropic.com](https://console.anthropic.com/) | |
| **Local / Custom** | — no key needed | any OpenAI-compatible server: Ollama, LM Studio, vLLM… |

1. Open **Settings → AI detective** and pick your provider (or do it during onboarding).
2. Paste the key and click **Verify & save**. The app makes a tiny real request to confirm the key works, then stores it in your **OS keychain** (one slot per provider). For **Local/Custom**, just point it at your server's base URL (e.g. `http://localhost:11434/v1`) — no key required.
3. Optionally override the **model** per provider.
4. Open any report → scroll to **Detective's Report** → click **Analyze with AI**.

<p align="center">
  <img src="assets/screenshots/ai-contacting.png" alt="The optional Detective's Report panel — contacting DeepSeek" width="88%">
</p>

**Guarantees**
- The **"Analyze with AI"** button is hidden until a provider is linked — and the backend refuses to run without it. No key ⇒ no AI call, ever (local servers excepted, by your explicit choice).
- Your **source code is never sent**. Only aggregate metrics and file paths leave the machine, and only on that explicit click.
- Keys are read **only in Rust** when calling the provider; they never cross into the web layer.

---

## Extending to another AI provider (open source 💚)

The entire AI integration lives in **one file**: [`src-tauri/src/ai.rs`](src-tauri/src/ai.rs), already housing four providers behind two functions:

```rust
pub async fn verify_key(provider: &str, base_url: &str, key: &str) -> Result<(), String>;
pub async fn analyze(provider: &str, base_url: &str, key: &str,
                     model: &str, summary: &str, lang: &str) -> Result<String, String>;
```

Most OpenAI-compatible services already work today via **Local / Custom** (just a base URL). To add a first-class provider (Gemini, Mistral, …): add an arm to the provider match, keep the same **system prompt** (`SYSTEM_PROMPT` / `SYSTEM_PROMPT_AR`), map the response to Markdown, and register it in the `AI_PROVIDERS` list in [`src/lib/types.ts`](src/lib/types.ts). The UI, key storage, language handling, and report rendering all stay the same. PRs welcome.

---

## Privacy & security

- **No source code ever leaves your machine.** The optional AI call transmits only aggregate metrics and file paths.
- **No backend, no login, no analytics.** The app makes zero network calls unless you click "Analyze with AI."
- **API key in the OS keychain** (Windows Credential Manager) — never written to disk in plaintext, never exposed to the webview.
- **Reports stored locally** in SQLite under your app-data directory.
- Secret detection is a best-effort static pass — it is **not** a security audit.

---

## Architecture

A small, modular codebase (every source file is kept under ~400 lines).

```
src-tauri/src/
  analysis/        # static-analysis engine, split into focused modules
    mod.rs         #   orchestration (analyze)
    defs.rs        #   types, patterns, responsibility tiers (incl. FiveM)
    detect.rs      #   runtime / artifact-type / responsibility detection
    metrics.rs     #   line + function metrics
    complexity.rs  #   cyclomatic complexity per function
    lua.rs         #   Lua / FiveM: functions, requires, runtime, artifacts
    secrets.rs     #   16+ secret patterns + Shannon-entropy detection
    dup.rs         #   stride-1 sliding-window duplication index
    graph.rs       #   dependency cycles (iterative Tarjan SCC)
    parse.rs       #   imports (TS/JS/Python/Lua) + edge resolution
  git/             # git-history forensics: hotspots, co-change, bus factor
  scanner.rs       # file-tree walking + noise classification
  ai.rs            # multi-provider AI client (DeepSeek/OpenAI/Anthropic/custom)
  keychain.rs      # OS keychain access (one account per provider)
  db.rs            # SQLite persistence
  commands.rs      # Tauri command surface

src/
  lib/             # api, scoring, findings engine (classify/refactor/verify), i18n
  views/           # onboarding, home, report (parts/dashboard/sections/forensics),
                   # settings (provider panel), cases
  components/      # shared UI
  styles/          # the "Forensic Noir" design system
```

**Tech stack:** Tauri v2 · Rust · React 19 · TypeScript · Vite · SQLite (rusqlite, bundled).

---

## Roadmap

- [x] Provider selector in Settings (DeepSeek / OpenAI / Claude / local Ollama)
- [x] More languages for the analyzer's heuristics — **Lua + FiveM shipped**
- [x] Cyclomatic complexity, dependency cycles, git forensics, secrets v2, score trends
- [ ] macOS & Linux release binaries
- [ ] Dependency / coupling graph **visualization** (cycle + co-change detection already in)
- [ ] Per-rule configuration and thresholds

---

## Contributing

Issues and PRs are welcome — new AI providers, more language heuristics, and design polish especially. The static-analysis engine is guarded by Rust fixtures (`cargo test`), so behavior changes are easy to verify.

## License

[MIT](LICENSE) © mhmds — free to use, modify, and build upon.
