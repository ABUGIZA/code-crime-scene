# Contributing to Code Crime Scene

Thanks for your interest! Issues and pull requests are welcome — especially new
AI providers, more language heuristics for the analyzer, and design polish.

## Getting started

```bash
# prerequisites: Node 18+, Rust (stable), and the Tauri prerequisites for your OS
npm install
npm run tauri dev      # run in development
```

## Before you open a PR

- **Rust:** run `cargo test` inside `src-tauri/` — the static-analysis engine is
  guarded by fixtures, so behavior changes are easy to verify.
- **TypeScript:** `npm run build` should pass with no type errors.
- Keep every source file under ~400 lines — the codebase is intentionally modular.

## Adding an AI provider

The entire AI integration lives in one file: `src-tauri/src/ai.rs`, behind two
functions (`verify_key` and `analyze`). Point the request at your provider's
OpenAI-compatible endpoint and keep the system prompt. See the
[README](README.md#extending-to-another-ai-provider-open-source-) for details.

## Ground rules

- The scan stays **100% local** — never send source code anywhere by default.
- API keys belong in the **OS keychain**, never in files or the web layer.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
