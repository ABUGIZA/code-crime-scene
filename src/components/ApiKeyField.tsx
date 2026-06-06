// Shared DeepSeek key entry field (input + verify button + status message),
// used by both onboarding and settings so the markup lives in one place.

import type { ApiKeyControl } from "../lib/useApiKey";
import { Check, Alert } from "./Icons";

export function ApiKeyField({ ctrl, cta }: { ctrl: ApiKeyControl; cta: string }) {
  const { key, status, msg, onChange, verifyAndSave } = ctrl;
  return (
    <>
      <div className="field-row">
        <input
          className="input"
          type="password"
          placeholder="sk-…"
          value={key}
          spellCheck={false}
          dir="ltr"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && verifyAndSave()}
        />
        <button
          className="btn btn-primary"
          onClick={verifyAndSave}
          disabled={!key.trim() || status === "verifying"}
        >
          {status === "verifying" ? <span className="spinner" /> : cta}
        </button>
      </div>
      {msg && (
        <div className={`verify-msg ${status === "ok" ? "t-good" : status === "error" ? "t-bad" : "muted"}`}>
          {status === "ok" ? <Check size={14} /> : status === "error" ? <Alert size={14} /> : null}
          {msg}
        </div>
      )}
    </>
  );
}
