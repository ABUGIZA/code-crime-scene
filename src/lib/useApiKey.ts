// Shared AI API-key state + verify/save/remove flow, used by both the
// onboarding screen and the settings page (previously duplicated in each).
// Provider-aware: pass the active provider (and, for "custom", its base URL).

import { useEffect, useState } from "react";
import { useStore } from "./store";
import { useI18n } from "./i18n";
import * as api from "./api";
import { providerInfo, type AiProvider } from "./types";

export type KeyStatus = "idle" | "verifying" | "ok" | "error";

export interface ApiKeyControl {
  key: string;
  status: KeyStatus;
  msg: string;
  onChange(value: string): void;
  verifyAndSave(): Promise<void>;
  remove(): Promise<void>;
}

export function useApiKey(provider: AiProvider, baseUrl?: string): ApiKeyControl {
  const { setHasKey, setNotice } = useStore();
  const { t } = useI18n();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<KeyStatus>("idle");
  const [msg, setMsg] = useState("");

  const info = providerInfo(provider);

  // Switching providers invalidates whatever was typed/verified for the old one.
  useEffect(() => {
    setKey("");
    setStatus("idle");
    setMsg("");
  }, [provider]);

  function onChange(value: string) {
    setKey(value);
    setStatus("idle");
    setMsg("");
  }

  async function verifyAndSave() {
    const trimmed = key.trim();
    // "custom" (local server) may verify with no key at all.
    if (!trimmed && info.needsKey) return;
    setStatus("verifying");
    setMsg(t("settings.contacting", { provider: t(`provider.${provider}`) }));
    try {
      await api.verifyApiKey(trimmed, provider, baseUrl);
      if (trimmed) await api.saveApiKey(trimmed, provider);
      if (provider === "custom") await api.setSetting("customLinked", "true");
      setHasKey(true);
      setStatus("ok");
      setMsg(trimmed ? t("settings.verified") : t("settings.verifiedNoKey"));
      setKey("");
    } catch (e) {
      setStatus("error");
      setMsg(api.errText(e));
    }
  }

  async function remove() {
    try {
      await api.deleteApiKey(provider);
      if (provider === "custom") await api.setSetting("customLinked", "false");
      setHasKey(false);
      setStatus("idle");
      setMsg("");
      setNotice(t("settings.removed"));
    } catch (e) {
      setNotice(api.errText(e));
    }
  }

  return { key, status, msg, onChange, verifyAndSave, remove };
}
