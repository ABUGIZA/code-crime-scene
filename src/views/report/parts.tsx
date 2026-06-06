// Shared atoms + helpers for the report view (gauge, metric, finding card,
// section wrapper, and the small formatting helpers they need).

import type { CSSProperties, ReactNode } from "react";
import { scoreLevel, type ScoreLevel } from "../../lib/scoring";
import type { DependencyEdge, Finding, Priority } from "../../lib/types";
import { Alert } from "../../components/Icons";

export type Tr = (key: string, vars?: Record<string, string | number>) => string;

export function sv(obj: Record<string, string | number>): CSSProperties {
  return obj as unknown as CSSProperties;
}
export function colVar(level: ScoreLevel): string {
  return level === "good" ? "var(--green)" : level === "warn" ? "var(--amber)" : "var(--red)";
}
export function prioClass(p: Priority): string {
  return p.toLowerCase();
}

export function rationaleText(f: Finding, t: Tr): string {
  const r = f.rationale;
  const yn = (b: boolean) => (b ? t("val.yes") : t("val.no"));
  return (
    `${t("rat.score")} ${r.score}/100 · ` +
    `${t("rat.blast")}: ${t(`val.${r.blastRadius}`)} · ` +
    `${t("rat.directIO")}: ${yn(r.directIO)} · ` +
    `${t("rat.stateMachine")}: ${yn(r.stateMachine)}`
  );
}

export function fanIn(deps: DependencyEdge[]) {
  const m = new Map<string, number>();
  for (const e of deps) m.set(e.to, (m.get(e.to) ?? 0) + 1);
  return [...m.entries()].map(([file, count]) => ({ file, count })).sort((a, b) => b.count - a.count).slice(0, 6);
}

export function Gauge({ score }: { score: number }) {
  const col = colVar(scoreLevel(score));
  return (
    <div className="gauge" style={sv({ "--p": score, "--col": col })}>
      <div className="gauge-inner">
        <div className="gauge-num">{score}</div>
        <div className="gauge-cap">/ 100</div>
      </div>
    </div>
  );
}

export function Metric({ name, value }: { name: string; value: number }) {
  const col = colVar(scoreLevel(value));
  return (
    <div className="card metric">
      <div className="metric-top">
        <span className="metric-name">{name}</span>
        <span className="metric-val" style={{ color: col }}>
          {value}
        </span>
      </div>
      <div className="bar">
        <span style={{ width: `${value}%`, background: col }} />
      </div>
    </div>
  );
}

export function Section({ idx, title, count, icon, children }: { idx: string; title: string; count?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-head">
        <div className="section-title">
          <span className="idx">{idx}</span>
          {title}
        </div>
        {count && (
          <div className="section-count" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {icon}
            {count}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function FindingCard({ f, t }: { f: Finding; t: Tr }) {
  const nv = f.category === "needs-verification";
  return (
    <div className={`finding prio-${prioClass(f.priority)}${nv ? " finding-nv" : ""}`}>
      <div className="finding-head">
        <span className={`prio ${prioClass(f.priority)}`}>{t(`prio.${f.priority}`)}</span>
        <span className={`conf conf-${f.confidence}`}>{t(`conf.${f.confidence}`)}</span>
        <span className="finding-title">{f.title}</span>
        {f.runtime !== "shared" && <span className="rt-tag">{f.runtime}</span>}
        <span className="path finding-file" dir="ltr">{f.file}</span>
      </div>

      <div className="finding-row">
        <span className="finding-label">{t("find.priorityRationale")}</span>
        <span className="finding-ev mono">{rationaleText(f, t)}</span>
      </div>

      {nv && f.verifyNotes.length > 0 && (
        <div className="nv-box">
          <Alert size={13} />
          <ul>
            {f.verifyNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {f.evidence.length > 0 && (
        <div className="finding-row col">
          <span className="finding-label">{t("find.evidence")}</span>
          <ul className="ev-list mono" dir="ltr">
            {f.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {f.why && (
        <div className="finding-row">
          <span className="finding-label">{t("find.why")}</span>
          <span>{f.why}</span>
        </div>
      )}
      {f.nextStep && (
        <div className="finding-row">
          <span className="finding-label">{t("find.next")}</span>
          <span>{f.nextStep}</span>
        </div>
      )}
      {f.refactor.length > 0 && (
        <div className="finding-refactor">
          <div className="finding-label">{t("find.refactor")}</div>
          <ul>
            {f.refactor.map((r, i) => (
              <li key={i}>
                <code dir="ltr">{r.path}</code>
                <span className="muted"> — {r.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {f.prSlices.length > 0 && (
        <div className="finding-refactor">
          <div className="finding-label">{t("find.prs")}</div>
          <ol className="pr-list">
            {f.prSlices.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
