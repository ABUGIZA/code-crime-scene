// Scoring layer — turns raw analysis metrics into the five headline scores.
// All scores are 0-100 where HIGHER IS BETTER (including "technical debt" and
// "security risk", which are framed as health scores, not raw counts).

import type { AnalysisResult, Grade, Scores, Verdict } from "./types";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round = (x: number) => Math.round(x);

export function computeScores(a: AnalysisResult): Scores {
  const kloc = Math.max(a.codeLines / 1000, 1);
  const longRatio = a.totalFunctions > 0 ? a.totalLongFunctions / a.totalFunctions : 0;
  const dup = a.duplicateLineRatio;
  const unusedPerKloc = a.totalUnusedImports / kloc;
  const commentRatio = a.codeLines > 0 ? a.commentLines / a.codeLines : 0;
  const huge = a.hugeFileCount;
  const coupling = a.maxFanIn;
  const avg = a.avgFileLines;

  // Maintainability — how easy it is to read and safely change the code.
  let m = 100;
  m -= clamp(longRatio * 180, 0, 34);
  m -= clamp((avg - 180) / 8, 0, 22);
  m -= clamp(huge * 2.2, 0, 18);
  if (commentRatio < 0.04) m -= 8;
  m -= clamp(dup * 60, 0, 18);
  const maintainability = clamp(round(m), 0, 100);

  // Technical Debt — duplication, long functions, dead imports.
  let d = 100;
  d -= clamp(dup * 220, 0, 40);
  d -= clamp(longRatio * 160, 0, 30);
  d -= clamp(unusedPerKloc * 6, 0, 16);
  d -= clamp(huge * 1.5, 0, 14);
  const technicalDebt = clamp(round(d), 0, 100);

  // Architecture Health — coupling and module-size distribution.
  let ar = 100;
  ar -= clamp((coupling - 8) * 2.2, 0, 34);
  ar -= clamp(huge * 2.5, 0, 24);
  ar -= clamp((avg - 160) / 10, 0, 16);
  ar -= clamp(dup * 50, 0, 14);
  const architectureHealth = clamp(round(ar), 0, 100);

  // Security Risk — framed as safety: fewer secrets => higher score.
  let s = 100;
  s -= a.securityHigh * 28;
  s -= a.securityMedium * 10;
  s -= a.securityLow * 3;
  const securityRisk = clamp(round(s), 0, 100);

  const projectScore = clamp(
    round(
      maintainability * 0.28 +
        technicalDebt * 0.26 +
        architectureHealth * 0.24 +
        securityRisk * 0.22,
    ),
    0,
    100,
  );

  return { projectScore, technicalDebt, architectureHealth, securityRisk, maintainability };
}

export function gradeFor(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

const VERDICTS: Record<Grade, Omit<Verdict, "grade">> = {
  A: { title: "Clean Scene", blurb: "No body, no blood. This codebase keeps its hands clean." },
  B: { title: "Minor Offenses", blurb: "A few misdemeanors on record — nothing the precinct can't handle." },
  C: { title: "Persons of Interest", blurb: "Several suspects loitering near the code. Bring them in for questioning." },
  D: { title: "Active Crime Scene", blurb: "Tape is up. Debt and duplication left prints all over the building." },
  F: { title: "Homicide", blurb: "Call it in. This codebase needs a full forensic team and a long night." },
};

export function computeVerdict(score: number): Verdict {
  const grade = gradeFor(score);
  return { grade, ...VERDICTS[grade] };
}

export type ScoreLevel = "good" | "warn" | "bad";

export function scoreLevel(score: number): ScoreLevel {
  if (score >= 80) return "good";
  if (score >= 60) return "warn";
  return "bad";
}
