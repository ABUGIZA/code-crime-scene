// App store — central state + orchestration, exposed via React context.
// Keeps views thin: they read state and call actions, never touch the API directly.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "./api";
import { computeScores, gradeFor } from "./scoring";
import type {
  AiResult,
  AnalysisResult,
  NewReport,
  ProgressPayload,
  Scores,
} from "./types";

export type Route = "onboarding" | "home" | "analyzing" | "report" | "cases" | "settings";

export interface CurrentCase {
  analysis: AnalysisResult;
  scores: Scores;
  reportId: number | null;
  createdAt: number;
  aiContent: string | null;
}

interface Store {
  ready: boolean;
  route: Route;
  hasKey: boolean;
  current: CurrentCase | null;
  progress: ProgressPayload | null;
  notice: string | null;

  navigate(route: Route): void;
  setHasKey(v: boolean): void;
  setNotice(msg: string | null): void;
  completeOnboarding(): Promise<void>;
  analyzePath(path: string): Promise<void>;
  openReport(id: number): Promise<void>;
  setAiContent(content: string): void;
}

const Ctx = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>("home");
  const [hasKey, setHasKey] = useState(false);
  const [current, setCurrent] = useState<CurrentCase | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [keyExists, onboarded] = await Promise.all([
          api.keyExists(),
          api.getSetting("onboarded"),
        ]);
        setHasKey(keyExists);
        setRoute(onboarded === "true" ? "home" : "onboarding");
      } catch {
        setRoute("home");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const navigate = useCallback((r: Route) => setRoute(r), []);

  const completeOnboarding = useCallback(async () => {
    await api.setSetting("onboarded", "true");
    setHasKey(await api.keyExists());
    setRoute("home");
  }, []);

  const analyzePath = useCallback(async (path: string) => {
    setProgress({ phase: "scanning", processed: 0, message: "Securing the perimeter…" });
    setRoute("analyzing");
    const unlisten = await api.onAnalysisProgress((p) => setProgress(p));
    try {
      const analysis = await api.scanAndAnalyze(path);
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
  }, []);

  const openReport = useCallback(async (id: number) => {
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
  }, []);

  const setAiContent = useCallback((content: string) => {
    setCurrent((c) => (c ? { ...c, aiContent: content } : c));
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      route,
      hasKey,
      current,
      progress,
      notice,
      navigate,
      setHasKey,
      setNotice,
      completeOnboarding,
      analyzePath,
      openReport,
      setAiContent,
    }),
    [ready, route, hasKey, current, progress, notice, navigate, completeOnboarding, analyzePath, openReport, setAiContent],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside <AppProvider>");
  return ctx;
}
