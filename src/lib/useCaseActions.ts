// Imperative case workflows (scan → score → persist → show, and load → show),
// extracted from the store so AppProvider stays wiring + simple state.

import { useCallback } from "react";
import * as api from "./api";
import { computeScores, gradeFor } from "./scoring";
import type {
  AiResult,
  AnalysisResult,
  CurrentCase,
  NewReport,
  ProgressPayload,
  Route,
  Scores,
} from "./types";

interface CaseActionDeps {
  setRoute: (r: Route) => void;
  setProgress: (p: ProgressPayload | null) => void;
  setCurrent: (c: CurrentCase | null) => void;
  setNotice: (msg: string | null) => void;
}

export function useCaseActions({ setRoute, setProgress, setCurrent, setNotice }: CaseActionDeps) {
  const analyzePath = useCallback(
    async (path: string) => {
      setProgress({ phase: "scanning", processed: 0, message: "Securing the perimeter…" });
      setRoute("analyzing");
      const unlisten = await api.onAnalysisProgress((p) => setProgress(p));
      try {
        const analysis = await api.scanAndAnalyze(path);
        try {
          // Attach git history before scoring/persisting so it round-trips
          // inside analysisJson with zero DB changes. Non-fatal: not a repo,
          // git missing, etc. simply leaves the field undefined.
          analysis.gitForensics = await api.gitForensics(path);
        } catch {
          /* non-fatal */
        }
        const scores = computeScores(analysis);
        const grade = gradeFor(scores.projectScore);

        const newReport: NewReport = {
          projectPath: analysis.projectPath,
          projectName: analysis.projectName,
          overallScore: scores.projectScore,
          grade,
          scoresJson: JSON.stringify(scores),
          analysisJson: JSON.stringify(analysis),
          aiJson: null,
        };

        let reportId: number | null = null;
        try {
          reportId = await api.saveReport(newReport);
        } catch (e) {
          console.error("save_report failed", e);
        }

        setCurrent({
          analysis,
          scores,
          reportId,
          createdAt: analysis.generatedAt,
          aiContent: null,
        });
        setRoute("report");
      } catch (e) {
        setNotice(`Investigation failed: ${String(e)}`);
        setRoute("home");
      } finally {
        unlisten();
        setProgress(null);
      }
    },
    [setRoute, setProgress, setCurrent, setNotice],
  );

  const openReport = useCallback(
    async (id: number) => {
      try {
        const rec = await api.getReport(id);
        if (!rec) {
          setNotice("Report not found.");
          return;
        }
        const analysis = JSON.parse(rec.analysisJson) as AnalysisResult;
        const scores = JSON.parse(rec.scoresJson) as Scores;
        let aiContent: string | null = null;
        if (rec.aiJson) {
          try {
            aiContent = (JSON.parse(rec.aiJson) as AiResult).content;
          } catch {
            aiContent = null;
          }
        }
        setCurrent({ analysis, scores, reportId: rec.id, createdAt: rec.createdAt, aiContent });
        setRoute("report");
      } catch (e) {
        setNotice(`Could not open report: ${String(e)}`);
      }
    },
    [setRoute, setCurrent, setNotice],
  );

  return { analyzePath, openReport };
}
