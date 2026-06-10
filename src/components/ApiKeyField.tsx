// Shared AI key entry field (input + verify button + status message),
// used by both onboarding and settings so the markup lives in one place.
// Placeholder comes from the provider's keyHint; `allowEmpty` lets the
// "custom" (local server) provider verify without typing a key.

import type { ApiKeyControl } from "../lib/useApiKey";
import { Check, Alert } from "./Icons";

export function ApiKeyField({
  ctrl,
  cta,
  placeholder,
  allowEmpty,
}: {
  ctrl: ApiKeyControl;
  cta: string;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const { key, status, msg, onChange, verifyAndSave } = ctrl;
  return (
    <>
      <div className="field-row">
        <input
          className="input"
          type="password"
          placeholder={placeholder ?? "sk-…"}
          value={key}
          spellCheck={false}
          dir="ltr"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && verifyAndSave()}
        />
        <button
          className="btn btn-primary"
          onClick={verifyAndSave}
          disabled={(!key.trim() && !allowEmpty) || status === "verifying"}
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
