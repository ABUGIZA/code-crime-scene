// API layer — the single boundary between the React UI and the Rust backend.
// When running outside Tauri (e.g. a plain browser preview) it transparently
// falls back to in-memory mock data so the UI can be developed and reviewed.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as tauriOpen, save as tauriSave } from "@tauri-apps/plugin-dialog";
import * as mock from "./mock";
import type { AnalysisResult, GitForensics, NewReport, ProgressPayload, ProjectRecord, ReportRecord, ReportSummary } from "./types";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Normalize an error (Tauri rejects with a plain string) into readable text. */
export function errText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

let mockProgressCb: ((p: ProgressPayload) => void) | null = null;

// --- folder picker ----------------------------------------------------------

export async function pickFolder(): Promise<string | null> {
  if (isTauri) {
    const res = await tauriOpen({
      directory: true,
      multiple: false,
      title: "Select a project to investigate",
    });
    return typeof res === "string" ? res : null;
  }
  return mock.pickFolder();
}

// --- analysis ---------------------------------------------------------------

export async function onAnalysisProgress(
  cb: (p: ProgressPayload) => void,
): Promise<UnlistenFn> {
  if (isTauri) {
    return tauriListen<ProgressPayload>("analysis://progress", (e) =>
      cb(e.payload),
    );
  }
  mockProgressCb = cb;
  return () => {
    mockProgressCb = null;
  };
}

export async function scanAndAnalyze(path: string): Promise<AnalysisResult> {
  if (isTauri) return tauriInvoke<AnalysisResult>("scan_and_analyze", { path });
  return mock.scanAndAnalyze(path, (p) => mockProgressCb?.(p));
}

// --- git forensics ------------------------------------------------------------

export async function gitForensics(path: string): Promise<GitForensics> {
  if (isTauri) return tauriInvoke<GitForensics>("git_forensics", { path });
  return mock.gitForensics(path);
}

// --- reports ----------------------------------------------------------------

export async function saveReport(report: NewReport): Promise<number> {
  if (isTauri) return tauriInvoke<number>("save_report", { report });
  return mock.saveReport(report);
}

export async function listReports(limit?: number): Promise<ReportSummary[]> {
  if (isTauri) return tauriInvoke<ReportSummary[]>("list_reports", { limit });
  return mock.listReports();
}

export async function listReportsForProject(
  path: string,
): Promise<ReportSummary[]> {
  if (isTauri)
    return tauriInvoke<ReportSummary[]>("list_reports_for_project", { path });
  return mock.listReportsForProject(path);
}

export async function getReport(id: number): Promise<ReportRecord | null> {
  if (isTauri) return tauriInvoke<ReportRecord | null>("get_report", { id });
  return mock.getReport(id);
}

export async function deleteReport(id: number): Promise<void> {
  if (isTauri) return tauriInvoke("delete_report", { id });
  return mock.deleteReport(id);
}

// --- projects ---------------------------------------------------------------

export async function listProjects(): Promise<ProjectRecord[]> {
  if (isTauri) return tauriInvoke<ProjectRecord[]>("list_projects");
  return mock.listProjects();
}

export async function touchProject(
  path: string,
  name: string,
): Promise<number> {
  if (isTauri) return tauriInvoke<number>("touch_project", { path, name });
  return mock.touchProject(path, name);
}

// --- settings ---------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  if (isTauri) return tauriInvoke<string | null>("get_setting", { key });
  return mock.getSetting(key);
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (isTauri) return tauriInvoke("set_setting", { key, value });
  return mock.setSetting(key, value);
}

// --- API key (OS keychain) --------------------------------------------------
// All key commands take an optional provider id ("deepseek" | "openai" |
// "anthropic" | "custom"); omitting it keeps the legacy DeepSeek behavior.

export async function keyExists(provider?: string): Promise<boolean> {
  if (isTauri) return tauriInvoke<boolean>("key_exists", { provider });
  return mock.keyExists(provider);
}

export async function saveApiKey(key: string, provider?: string): Promise<void> {
  if (isTauri) return tauriInvoke("save_api_key", { key, provider });
  return mock.saveApiKey(key, provider);
}

export async function deleteApiKey(provider?: string): Promise<void> {
  if (isTauri) return tauriInvoke("delete_api_key", { provider });
  return mock.deleteApiKey(provider);
}

export async function verifyApiKey(
  key: string,
  provider?: string,
  baseUrl?: string,
): Promise<void> {
  if (isTauri) return tauriInvoke("verify_api_key", { key, provider, baseUrl });
  return mock.verifyApiKey(key, provider, baseUrl);
}

/** Whether the provider is usable: a key sits in the keychain, or — for
 * "custom" (local server, key optional) — it was linked without one. */
export async function providerLinked(provider?: string): Promise<boolean> {
  if (await keyExists(provider)) return true;
  if (provider === "custom") return (await getSetting("customLinked")) === "true";
  return false;
}

// --- AI ---------------------------------------------------------------------

export interface AiCallOptions {
  model?: string;
  provider?: string;
  baseUrl?: string;
}

export async function analyzeWithAi(
  summary: string,
  reportId: number | null,
  lang: string = "en",
  opts: AiCallOptions = {},
): Promise<string> {
  if (isTauri) {
    const { model, provider, baseUrl } = opts;
    return tauriInvoke<string>("analyze_with_ai", {
      summary,
      model,
      reportId,
      lang,
      provider,
      baseUrl,
    });
  }
  return mock.analyzeWithAi(summary, lang);
}

/** Save text to a file the user chooses (Tauri), or download it (browser). */
export async function saveTextFile(
  suggestedName: string,
  content: string,
): Promise<string | null> {
  if (isTauri) {
    const path = await tauriSave({
      defaultPath: suggestedName,
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (!path) return null;
    await tauriInvoke("write_text_file", { path, content });
    return path;
  }
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return suggestedName;
}
