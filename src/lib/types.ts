// TypeScript mirror of the Rust models in `src-tauri/src/models.rs`.
// Field names match serde's camelCase output.

export type Evidence = "direct" | "indirect" | "supporting";

export interface Responsibility {
  kind: string;
  label: string; // refined sub-type: ws_server | webrtc_conn | timer_heartbeat | ...
  evidence: Evidence;
  token: string;
  line: number;
  snippet: string;
}

export interface FileInfo {
  path: string;
  language: string;
  ext: string;
  lines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  sizeBytes: number;
  functions: number;
  longFunctions: number;
  noise: boolean;
  noiseReason: string | null;
  runtime: string; // client | server | shared
  fileType: string;
  responsibilities: Responsibility[];
  longestFunction: number;
  longestFunctionName: string;
  longestFunctionLine: number;
  componentName: string;
  componentLine: number;
  fanIn: number;
}

export interface LongFunction {
  file: string;
  name: string;
  startLine: number;
  length: number;
  language: string;
}

export interface DuplicationBlock {
  fingerprint: string;
  lineCount: number;
  occurrences: number;
  files: string[];
  sample: string;
}

export interface UnusedImport {
  file: string;
  name: string;
  source: string;
  line: number;
}

export interface LanguageStat {
  language: string;
  files: number;
  lines: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
}

export type Severity = "high" | "medium" | "low";

export interface SecurityFinding {
  file: string;
  line: number;
  kind: string;
  severity: Severity;
  snippet: string;
}

export interface AnalysisResult {
  projectName: string;
  projectPath: string;
  generatedAt: number;

  totalFiles: number;
  scannedFiles: number;
  skippedFiles: number;
  analyzedFiles: number;
  ignoredFiles: number;
  ignoredLines: number;

  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
  totalBytes: number;

  totalFunctions: number;
  avgFileLines: number;
  maxFanIn: number;
  duplicateLineRatio: number;

  totalLongFunctions: number;
  totalUnusedImports: number;
  totalDuplicateBlocks: number;
  hugeFileCount: number;
  securityHigh: number;
  securityMedium: number;
  securityLow: number;

  verifyCommands: string[];

  languages: LanguageStat[];
  largestFiles: FileInfo[];
  ignoredLargest: FileInfo[];
  allFiles: FileInfo[];
  longFunctions: LongFunction[];
  duplication: DuplicationBlock[];
  unusedImports: UnusedImport[];
  securityFindings: SecurityFinding[];
  dependencies: DependencyEdge[];
}

// --- Scoring (computed in TS) ----------------------------------------------

export interface Scores {
  projectScore: number; // overall, 0-100
  technicalDebt: number; // 0-100 (higher = less debt = better)
  architectureHealth: number;
  securityRisk: number; // 0-100 (higher = safer)
  maintainability: number;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Verdict {
  grade: Grade;
  title: string;
  blurb: string;
}

// --- Persistence ------------------------------------------------------------

export interface NewReport {
  projectPath: string;
  projectName: string;
  overallScore: number;
  grade: string;
  scoresJson: string;
  analysisJson: string;
  aiJson: string | null;
}

export interface ReportRecord {
  id: number;
  projectPath: string;
  projectName: string;
  createdAt: number;
  overallScore: number;
  grade: string;
  scoresJson: string;
  analysisJson: string;
  aiJson: string | null;
}

export interface ReportSummary {
  id: number;
  projectPath: string;
  projectName: string;
  createdAt: number;
  overallScore: number;
  grade: string;
  hasAi: boolean;
}

export interface ProjectRecord {
  id: number;
  path: string;
  name: string;
  lastOpened: number;
  reportCount: number;
}

export interface AiResult {
  model: string;
  generatedAt: number;
  content: string;
}

// --- Findings (computed in TS from AnalysisResult) --------------------------

export type Priority = "P0" | "P1" | "P2" | "P3";
export type Confidence = "high" | "medium" | "low";
export type FindingCategory = "actionable" | "needs-verification" | "informational" | "noise";
export type Level = "high" | "medium" | "low";

export interface RefactorStep {
  path: string; // suggested module path
  note: string; // what moves there
}

// Numeric risk model behind the P0–P3 priority (req #6).
export interface RiskRationale {
  score: number; // 0–100
  blastRadius: Level;
  directIO: boolean;
  stateMachine: boolean;
  confidence: Confidence;
}

export interface Finding {
  id: string;
  priority: Priority;
  confidence: Confidence;
  category: FindingCategory;
  kind: string;
  title: string;
  file: string; // "path" or "path:line"
  line: number; // 1-based primary line (0 = unknown)
  symbol: string; // primary component/function name
  runtime: string;
  evidence: string[];
  why: string; // why this matters
  nextStep: string; // suggested next step
  refactor: RefactorStep[];
  rationale: RiskRationale; // priority rationale (req #6)
  prSlices: string[]; // safe PR-by-PR plan (req #9)
  verifyNotes: string[]; // why this needs manual verification (req #3)
}

export interface InspectionItem {
  file: string;
  reason: string;
  priority: Priority;
  confidence: Confidence;
}
export interface FalsePositive {
  file: string;
  why: string;
}
export interface PrSuggestion {
  scope: string;
  files: string[];
  why: string;
}
export interface AiReviewBrief {
  primaryRisk: string;
  inspectionOrder: InspectionItem[];
  falsePositives: FalsePositive[];
  ignoredNoise: string[];
  pr1: PrSuggestion | null;
  pr2: PrSuggestion | null;
}

export interface ProgressPayload {
  phase: "scanning" | "analyzing" | "done";
  processed: number;
  message: string;
}
