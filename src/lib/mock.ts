// In-memory mock backend used only when running outside Tauri (browser preview).
// Mirrors the shape of the real Rust commands so the UI behaves identically.

import type {
  AnalysisResult,
  NewReport,
  ProgressPayload,
  ProjectRecord,
  ReportRecord,
  ReportSummary,
} from "./types";
import { NMSH_FILES, NMSH_NOISE } from "./mock/data";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const settings = new Map<string, string>();
let reports: ReportRecord[] = [];
let projects: ProjectRecord[] = [];
let nextId = 1;
let savedKey: string | null = null;

function basename(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || "project";
}

export async function pickFolder(): Promise<string | null> {
  // Browser preview can't open a native dialog — return a representative path.
  return "/Users/mhmds/dev/nmsh-tv";
}

export function sampleAnalysis(path: string): AnalysisResult {
  const name = basename(path);
  return {
    projectName: name,
    projectPath: path,
    generatedAt: Math.floor(Date.now() / 1000),

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
    duplicateLineRatio: 0.064,

    totalLongFunctions: 18,
    totalUnusedImports: 12,
    totalDuplicateBlocks: 27,
    hugeFileCount: 6,
    securityHigh: 1,
    securityMedium: 3,
    securityLow: 0,

    verifyCommands: ["npm run typecheck", "npm run build"],

    languages: [
      { language: "TypeScript", files: 168, lines: 12450 },
      { language: "CSS", files: 22, lines: 3210 },
      { language: "JSON", files: 14, lines: 842 },
      { language: "Markdown", files: 9, lines: 802 },
    ],

    largestFiles: NMSH_FILES.slice(0, 6),
    ignoredLargest: NMSH_NOISE,
    allFiles: NMSH_FILES,

    longFunctions: [
      { file: "src/store/rootReducer.ts", name: "editorReducer", startLine: 188, length: 214, language: "TypeScript" },
      { file: "src/features/editor/Canvas.tsx", name: "handlePointerMove", startLine: 311, length: 168, language: "TypeScript" },
      { file: "src/api/client.ts", name: "request", startLine: 96, length: 121, language: "TypeScript" },
      { file: "src/features/auth/authSlice.ts", name: "refreshSession", startLine: 240, length: 98, language: "TypeScript" },
      { file: "src/components/DataGrid.tsx", name: "computeLayout", startLine: 142, length: 87, language: "TypeScript" },
      { file: "src/utils/format.ts", name: "formatRelative", startLine: 12, length: 64, language: "TypeScript" },
    ],

    duplication: [
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
    ],

    unusedImports: [
      { file: "src/features/editor/Canvas.tsx", name: "useMemo", source: "react", line: 3 },
      { file: "src/api/client.ts", name: "AxiosError", source: "axios", line: 2 },
      { file: "src/components/DataGrid.tsx", name: "clsx", source: "clsx", line: 8 },
      { file: "src/utils/format.ts", name: "isToday", source: "date-fns", line: 1 },
    ],

    securityFindings: [
      { file: "src/config/firebase.ts", line: 14, kind: "Hardcoded secret", severity: "medium", snippet: 'apiKey: «redacted»,' },
      { file: ".env.example", line: 6, kind: "Hardcoded secret", severity: "medium", snippet: 'ACCESS_TOKEN=«redacted»' },
      { file: "scripts/deploy.ts", line: 30, kind: "Private key material", severity: "high", snippet: "-----BEGIN OPENSSH «redacted» KEY-----" },
      { file: "src/api/client.ts", line: 51, kind: "Hardcoded secret", severity: "medium", snippet: 'clientSecret: «redacted»' },
    ],

    dependencies: [
      { from: "src/features/editor/Canvas.tsx", to: "src/store/rootReducer.ts" },
      { from: "src/features/editor/Toolbar.tsx", to: "src/store/rootReducer.ts" },
      { from: "src/features/viewer/Toolbar.tsx", to: "src/store/rootReducer.ts" },
      { from: "src/components/DataGrid.tsx", to: "src/api/client.ts" },
      { from: "src/features/auth/authSlice.ts", to: "src/api/client.ts" },
      { from: "src/api/users.ts", to: "src/api/client.ts" },
      { from: "src/api/teams.ts", to: "src/api/client.ts" },
    ],
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
  return sampleAnalysis(path);
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

export async function keyExists(): Promise<boolean> {
  return savedKey != null;
}

export async function saveApiKey(key: string): Promise<void> {
  savedKey = key;
}

export async function deleteApiKey(): Promise<void> {
  savedKey = null;
}

export async function verifyApiKey(key: string): Promise<void> {
  await sleep(700);
  if (key.trim().length < 8) throw new Error("Invalid API key (unauthorized).");
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

