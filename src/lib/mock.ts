// In-memory mock backend used only when running outside Tauri (browser preview).
// Mirrors the shape of the real Rust commands so the UI behaves identically.

import type { AnalysisResult, GitForensics, NewReport, ProgressPayload, ProjectRecord, ReportRecord, ReportSummary } from "./types";
import {
  NMSH_COMPLEX,
  NMSH_CYCLES,
  NMSH_DEPENDENCIES,
  NMSH_DUPLICATION,
  NMSH_FILES,
  NMSH_GIT,
  NMSH_LANGUAGES,
  NMSH_LONG_FUNCTIONS,
  NMSH_NOISE,
  NMSH_SECURITY_FINDINGS,
  NMSH_UNUSED_IMPORTS,
} from "./mock/data";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const settings = new Map<string, string>();
let reports: ReportRecord[] = [];
let projects: ProjectRecord[] = [];
let nextId = 1;
const savedKeys = new Map<string, string>(); // provider id -> key

function basename(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || "project";
}

export async function pickFolder(): Promise<string | null> {
  // Browser preview can't open a native dialog — return a representative path.
  return "/Users/mhmds/dev/nmsh-tv";
}

// Bumps on every mock scan: a re-scan of the same project "cleans up" a little,
// so the score-trend deltas (vs the previous report) are visible in the preview.
let scanSeq = 0;

// Fixed corpus totals — identical for every mock scan, independent of drift.
function mkTotals() {
  return {
    totalFiles: 541,
    scannedFiles: 213,
    skippedFiles: 328,
    analyzedFiles: 205,
    ignoredFiles: 8,
    ignoredLines: 31240,

    totalLines: 17304,
    codeLines: 12810,
    commentLines: 1902,
    blankLines: 2592,
    totalBytes: 624_113,

    totalFunctions: 412,
    avgFileLines: 81.2,
    maxFanIn: 23,
  } as const;
}

// Drift-sensitive counts: a re-scan "cleans up" a little (d climbs 0→3), which
// is what makes the score-trend deltas visible in the preview.
function mkCounts(d: number) {
  return {
    duplicateLineRatio: Math.max(0.064 - d * 0.009, 0),
    totalLongFunctions: Math.max(18 - d * 3, 0),
    totalUnusedImports: Math.max(12 - d * 4, 0),
    totalDuplicateBlocks: Math.max(27 - d * 4, 0),
    hugeFileCount: Math.max(6 - d, 0),
    securityHigh: 1,
    securityMedium: Math.max(3 - d, 0),
    securityLow: 0,
  } as const;
}

// v2 complexity + dependency-cycle summary (constant across scans).
function mkComplexity() {
  return {
    avgComplexity: 4.6,
    maxComplexity: 24,
    highComplexityFunctions: 9,
    complexFunctions: NMSH_COMPLEX,
    cycleCount: 2,
    cycles: NMSH_CYCLES,
  } as const;
}

// The detailed evidence collections (files, findings, dependencies).
function mkEvidence() {
  return {
    languages: NMSH_LANGUAGES,
    largestFiles: NMSH_FILES.slice(0, 6),
    ignoredLargest: NMSH_NOISE,
    allFiles: NMSH_FILES,
    longFunctions: NMSH_LONG_FUNCTIONS,
    duplication: NMSH_DUPLICATION,
    unusedImports: NMSH_UNUSED_IMPORTS,
    securityFindings: NMSH_SECURITY_FINDINGS,
    dependencies: NMSH_DEPENDENCIES,
  } as const;
}

export function sampleAnalysis(path: string, drift = 0): AnalysisResult {
  const d = Math.min(Math.max(drift, 0), 3);
  return {
    projectName: basename(path),
    projectPath: path,
    generatedAt: Math.floor(Date.now() / 1000),

    ...mkTotals(),
    ...mkCounts(d),
    ...mkComplexity(),

    verifyCommands: ["npm run typecheck", "npm run build"],

    ...mkEvidence(),
  };
}

export async function scanAndAnalyze(
  path: string,
  onProgress: (p: ProgressPayload) => void,
): Promise<AnalysisResult> {
  onProgress({ phase: "scanning", processed: 0, message: "Securing the perimeter…" });
  for (const n of [40, 120, 213]) {
    await sleep(420);
    onProgress({ phase: "scanning", processed: n, message: `Collecting evidence — ${n} files` });
  }
  await sleep(360);
  onProgress({ phase: "analyzing", processed: 213, message: "Dusting for fingerprints…" });
  await sleep(640);
  onProgress({ phase: "done", processed: 213, message: "Case file assembled." });
  return sampleAnalysis(path, scanSeq++);
}

export async function saveReport(report: NewReport): Promise<number> {
  const id = nextId++;
  reports.unshift({
    id,
    projectPath: report.projectPath,
    projectName: report.projectName,
    createdAt: Math.floor(Date.now() / 1000),
    overallScore: report.overallScore,
    grade: report.grade,
    scoresJson: report.scoresJson,
    analysisJson: report.analysisJson,
    aiJson: report.aiJson,
  });
  await touchProject(report.projectPath, report.projectName);
  return id;
}

export async function listReports(): Promise<ReportSummary[]> {
  return reports.map(toSummary);
}

export async function listReportsForProject(path: string): Promise<ReportSummary[]> {
  return reports.filter((r) => r.projectPath === path).map(toSummary);
}

function toSummary(r: ReportRecord): ReportSummary {
  return {
    id: r.id,
    projectPath: r.projectPath,
    projectName: r.projectName,
    createdAt: r.createdAt,
    overallScore: r.overallScore,
    grade: r.grade,
    hasAi: r.aiJson != null,
  };
}

export async function getReport(id: number): Promise<ReportRecord | null> {
  return reports.find((r) => r.id === id) ?? null;
}

export async function deleteReport(id: number): Promise<void> {
  reports = reports.filter((r) => r.id !== id);
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return [...projects].sort((a, b) => b.lastOpened - a.lastOpened);
}

export async function touchProject(path: string, name: string): Promise<number> {
  const existing = projects.find((p) => p.path === path);
  if (existing) {
    existing.lastOpened = Math.floor(Date.now() / 1000);
    existing.reportCount = reports.filter((r) => r.projectPath === path).length;
    return existing.id;
  }
  const id = nextId++;
  projects.push({
    id,
    path,
    name,
    lastOpened: Math.floor(Date.now() / 1000),
    reportCount: reports.filter((r) => r.projectPath === path).length,
  });
  return id;
}

export async function getSetting(key: string): Promise<string | null> {
  return settings.get(key) ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  settings.set(key, value);
}

const providerId = (provider?: string) => provider ?? "deepseek";

export async function keyExists(provider?: string): Promise<boolean> {
  return savedKeys.has(providerId(provider));
}

export async function saveApiKey(key: string, provider?: string): Promise<void> {
  savedKeys.set(providerId(provider), key);
}

export async function deleteApiKey(provider?: string): Promise<void> {
  savedKeys.delete(providerId(provider));
}

export async function verifyApiKey(
  key: string,
  provider?: string,
  _baseUrl?: string,
): Promise<void> {
  await sleep(700);
  // "custom" = local OpenAI-compatible server: only reachability matters, key optional.
  if (providerId(provider) === "custom") return;
  if (key.trim().length < 8) throw new Error("Invalid API key (unauthorized).");
}

export async function gitForensics(_path: string): Promise<GitForensics> {
  await sleep(320);
  return NMSH_GIT;
}

export async function analyzeWithAi(_summary: string, lang = "en"): Promise<string> {
  await sleep(1100);
  if (lang === "ar") {
    return [
      "## الحكم",
      "كود شغّال لكنه يتآكل من الداخل — الدَّين متركّز في كم ملف متضخّم.",
      "",
      "## المشتبه بهم",
      "- `src/store/rootReducer.ts` (942 سطر، ودالة `editorReducer` بطول 214 سطر) أكبر متّهم.",
      "- `src/features/editor/Canvas.tsx` يخلط حسابات المؤشّر مع الرسم في `handlePointerMove` (168 سطر).",
      "- كتلة جلب بيانات مكرّرة في `users.ts` و`teams.ts` و`projects.ts`.",
      "",
      "## أسلوب الجريمة",
      "المنطق تكدّس داخل الـ reducers ومعالجات الأحداث بدل دوال صغيرة نقيّة، والنسخ واللصق نشر نفس النمط في طبقة الـ API.",
      "",
      "## الحكم والعقوبة",
      "1. فكّك `editorReducer` لـ reducers فرعية حسب الـ slice.",
      "2. انقل هندسة المؤشّر من `Canvas.tsx` إلى hook باسم `usePointer`.",
      "3. وحّد الجلب في `fetchResource()` لقتل التكرار الثلاثي.",
      "4. دوّر المفتاح المكشوف في `scripts/deploy.ts` فورًا.",
      "5. نظّف الاستيرادات الـ12 غير المستخدمة بقاعدة lint في الـ CI.",
    ].join("\n");
  }
  return [
    "## Verdict",
    "A capable codebase carrying moderate technical debt — concentrated in a handful of oversized modules.",
    "",
    "## Key Suspects",
    "- `src/store/rootReducer.ts` (942 lines, `editorReducer` at 214 lines) is the prime offender.",
    "- `src/features/editor/Canvas.tsx` mixes pointer math with rendering in `handlePointerMove` (168 lines).",
    "- Repeated API-normalization block found across `users.ts`, `teams.ts`, `projects.ts`.",
    "",
    "## Modus Operandi",
    "Logic accreted into reducers and event handlers instead of small pure helpers. Copy-paste spread the same fetch/normalize pattern across the API layer.",
    "",
    "## Recommended Sentence",
    "1. Extract `editorReducer` sub-reducers by slice.",
    "2. Move pointer geometry out of `Canvas.tsx` into a `usePointer` hook.",
    "3. Introduce a shared `fetchResource()` to kill the 3× API duplication.",
    "4. Rotate the key flagged in `scripts/deploy.ts` immediately.",
    "5. Prune the 12 unused imports in CI with a lint rule.",
  ].join("\n");
}

