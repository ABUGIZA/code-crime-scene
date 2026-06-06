// Bilingual layer (English + strong, natural Arabic). Arabic is intentionally
// confident and colloquial-leaning (Gulf flavor) — not stiff classical Arabic —
// while keeping the noir "crime scene" attitude. The dictionaries themselves live
// in ./i18n/{en,ar}-{ui,report}.ts; this file is just the React provider.

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
import type { Dict } from "./i18n/dict";
import { EN_UI } from "./i18n/en-ui";
import { EN_REPORT } from "./i18n/en-report";
import { AR_UI } from "./i18n/ar-ui";
import { AR_REPORT } from "./i18n/ar-report";

export type Lang = "en" | "ar";

const EN: Dict = { ...EN_UI, ...EN_REPORT };
const AR: Dict = { ...AR_UI, ...AR_REPORT };
const DICTS: Record<Lang, Dict> = { en: EN, ar: AR };

interface I18n {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang(lang: Lang): void;
  t(key: string, vars?: Record<string, string | number>): string;
}

const Ctx = createContext<I18n | null>(null);

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    api.getSetting("language").then((v) => {
      if (v === "ar" || v === "en") setLangState(v);
    });
  }, []);

  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    api.setSetting("language", l).catch(() => {});
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      interpolate(DICTS[lang][key] ?? DICTS.en[key] ?? key, vars),
    [lang],
  );

  const value = useMemo<I18n>(() => ({ lang, dir, setLang, t }), [lang, dir, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
