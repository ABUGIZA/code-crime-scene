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
import { isAiProvider } from "./types";
import type {
  AiProvider,
  CurrentCase,
  ProgressPayload,
  Route,
} from "./types";
import { useCaseActions } from "./useCaseActions";

export type { CurrentCase, Route };

interface Store {
  ready: boolean;
  route: Route;
  hasKey: boolean;
  aiProvider: AiProvider;
  current: CurrentCase | null;
  progress: ProgressPayload | null;
  notice: string | null;

  navigate(route: Route): void;
  setHasKey(v: boolean): void;
  setAiProvider(p: AiProvider): Promise<void>;
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
  const [aiProvider, setAiProviderState] = useState<AiProvider>("deepseek");
  const [current, setCurrent] = useState<CurrentCase | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [providerSetting, onboarded] = await Promise.all([
          api.getSetting("aiProvider"),
          api.getSetting("onboarded"),
        ]);
        const provider: AiProvider = isAiProvider(providerSetting) ? providerSetting : "deepseek";
        setAiProviderState(provider);
        setHasKey(await api.providerLinked(provider));
        setRoute(onboarded === "true" ? "home" : "onboarding");
      } catch {
        setRoute("home");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const navigate = useCallback((r: Route) => setRoute(r), []);

  const setAiProvider = useCallback(async (p: AiProvider) => {
    setAiProviderState(p);
    api.setSetting("aiProvider", p).catch(() => {});
    try {
      setHasKey(await api.providerLinked(p));
    } catch {
      setHasKey(false);
    }
  }, []);

  const completeOnboarding = useCallback(async () => {
    await api.setSetting("onboarded", "true");
    setHasKey(await api.providerLinked(aiProvider));
    setRoute("home");
  }, [aiProvider]);

  // Imperative case workflows (scan/open) live in their own hook.
  const { analyzePath, openReport } = useCaseActions({ setRoute, setProgress, setCurrent, setNotice });

  const setAiContent = useCallback((content: string) => {
    setCurrent((c) => (c ? { ...c, aiContent: content } : c));
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      route,
      hasKey,
      aiProvider,
      current,
      progress,
      notice,
      navigate,
      setHasKey,
      setAiProvider,
      setNotice,
      completeOnboarding,
      analyzePath,
      openReport,
      setAiContent,
    }),
    [ready, route, hasKey, aiProvider, current, progress, notice, navigate, setAiProvider, completeOnboarding, analyzePath, openReport, setAiContent],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside <AppProvider>");
  return ctx;
}
