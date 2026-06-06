// Shared DeepSeek API-key state + verify/save/remove flow, used by both the
// onboarding screen and the settings page (previously duplicated in each).

import { useState } from "react";
import { useStore } from "./store";
import { useI18n } from "./i18n";
import * as api from "./api";

export type KeyStatus = "idle" | "verifying" | "ok" | "error";

export interface ApiKeyControl {
  key: string;
  status: KeyStatus;
  msg: string;
  onChange(value: string): void;
  verifyAndSave(): Promise<void>;
  remove(): Promise<void>;
}

export function useApiKey(): ApiKeyControl {
  const { setHasKey, setNotice } = useStore();
  const { t } = useI18n();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<KeyStatus>("idle");
  const [msg, setMsg] = useState("");

  function onChange(value: string) {
    setKey(value);
    setStatus("idle");
    setMsg("");
  }

  async function verifyAndSave() {
    if (!key.trim()) return;
    setStatus("verifying");
    setMsg(t("settings.contacting"));
    try {
      await api.verifyApiKey(key.trim());
      await api.saveApiKey(key.trim());
      setHasKey(true);
      setStatus("ok");
      setMsg(t("settings.verified"));
      setKey("");
    } catch (e) {
      setStatus("error");
      setMsg(api.errText(e));
    }
  }

  async function remove() {
    try {
      await api.deleteApiKey();
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
