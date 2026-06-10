import type { FileInfo, RefactorStep } from "../types";
import { type T, SERVER_ONLY } from "./shared";
import {
  PR_DEFAULT,
  PR_TEMPLATES,
  REFACTOR_DEFAULT,
  REFACTOR_TEMPLATES,
  expandPath,
  stepApplies,
} from "./templates";

// --- Context-aware refactor templates (with client/server sanity, req #8) ----
// The actual step content lives in declarative tables in ./templates.ts;
// these functions just look up → filter by responsibility → expand → cap at 6.

export const JS_EXTS = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"];

export function refactorFor(t: T, fi: FileInfo): RefactorStep[] {
  // Template suggestions assume a JS/TS module shape — never emit `.ts` splits for
  // a Rust/JSON/CSS file (that's where "analysis.core.ts" nonsense came from).
  if (!JS_EXTS.includes(fi.ext)) return [];
  const rows = REFACTOR_TEMPLATES[fi.fileType] ?? REFACTOR_DEFAULT;
  const s: RefactorStep[] = rows
    .filter((r) => stepApplies(r.requires, fi))
    .map((r) => ({ path: expandPath(r.path, fi), note: t(r.key) }));

  // SANITY: a client file must never receive server-only module suggestions.
  const filtered = fi.runtime === "client" ? s.filter((x) => !SERVER_ONLY.some((n) => x.path.includes(n))) : s;
  return filtered.slice(0, 6);
}

// --- Recommended PR slicing (req #9) ----------------------------------------

export function prSlicesFor(t: T, fi: FileInfo, kind: string): string[] {
  const rows = PR_TEMPLATES[kind] ?? PR_DEFAULT;
  return rows
    .filter((r) => stepApplies(r.requires, fi))
    .map((r) => t(r.key))
    .slice(0, 6);
}
