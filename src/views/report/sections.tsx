// Lower half of the report: AI review brief, quality warnings, the AI panel,
// and the supporting evidence tables (noise / largest files / fan-in).

import { formatBytes, formatNumber } from "../../lib/format";
import { Markdown } from "../../components/Markdown";
import { Sparkles, Ghost, FileIcon, Link, Alert } from "../../components/Icons";
import { Section, prioClass, type Tr } from "./parts";
import type { AiReviewBrief, AnalysisResult, Finding } from "../../lib/types";

export function AiBrief({ brief, t }: { brief: AiReviewBrief; t: Tr }) {
  return (
    <Section idx="★" title={t("brief.title")} icon={null}>
      <div className="card card-pad">
        <div className="brief-risk">
          <span className="finding-label">{t("brief.primaryRisk")}</span>
          <span>{brief.primaryRisk}</span>
        </div>
        <div className="brief-grid">
          <div className="brief-col">
            <div className="finding-label">{t("brief.order")}</div>
            <ol className="insp">
              {brief.inspectionOrder.map((it, i) => (
                <li key={i}>
                  <span className={`prio ${prioClass(it.priority)}`} style={{ fontSize: 9 }}>{it.priority}</span>
                  <span className="path" dir="ltr">{it.file}</span>
                  <span className="muted"> · {it.reason}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="brief-col">
            {brief.falsePositives.length > 0 && (
              <>
                <div className="finding-label t-warn">{t("brief.falsePos")}</div>
                <ul>
                  {brief.falsePositives.map((fp, i) => (
                    <li key={i}>
                      <span className="path" dir="ltr">{fp.file}</span>
                      <span className="muted"> — {fp.why}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {brief.ignoredNoise.length > 0 && (
              <>
                <div className="finding-label" style={{ marginTop: brief.falsePositives.length ? 12 : 0 }}>
                  {t("brief.ignored")}
                </div>
                <ul>
                  {brief.ignoredNoise.map((n, i) => (
                    <li key={i}><span className="path" dir="ltr">{n}</span></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
        {brief.pr1 && (
          <div className="brief-pr">
            <div className="finding-label">{t("brief.pr1")}</div>
            <div className="pr-scope">{brief.pr1.scope}</div>
            <div className="pr-files mono" dir="ltr">{brief.pr1.files.join("  ·  ")}</div>
          </div>
        )}
      </div>
    </Section>
  );
}

export function QualityWarnings({ warnings, t }: { warnings: string[]; t: Tr }) {
  if (warnings.length === 0) return null;
  return (
    <div className="qw">
      <Alert size={15} />
      <div>
        <div className="finding-label">{t("qw.title")}</div>
        {warnings.map((w, i) => (
          <div key={i} className="qw-line">{w}</div>
        ))}
      </div>
    </div>
  );
}

interface AiPanelProps {
  hasKey: boolean;
  aiContent: string | null;
  aiLoading: boolean;
  onRun: () => void;
  onAddKey: () => void;
  t: Tr;
}

export function AiPanel({ hasKey, aiContent, aiLoading, onRun, onAddKey, t }: AiPanelProps) {
  return (
    <div className="section">
      <div className="card ai-card">
        <div className="ai-head">
          <div>
            <div className="section-title">
              <span className="idx">AI</span>
              {t("ai.title")}
            </div>
            <div className="ai-sub">{t("ai.subtitle")}</div>
          </div>
          {hasKey ? (
            <button className="btn btn-primary" onClick={onRun} disabled={aiLoading}>
              {aiLoading ? <span className="spinner" /> : <Sparkles size={16} />}
              {aiLoading ? t("ai.calling") : aiContent ? t("ai.rerun") : t("ai.analyze")}
            </button>
          ) : (
            <button className="btn" onClick={onAddKey}>
              <Sparkles size={16} /> {t("ai.addKey")}
            </button>
          )}
        </div>
        {aiContent ? (
          <div style={{ marginTop: 14 }}>
            <div className="ai-source">
              <Sparkles size={12} /> {t("ai.via")}
            </div>
            <Markdown content={aiContent} />
          </div>
        ) : (
          <div className="ai-empty" style={{ marginTop: 14 }}>
            <div className="disc">
              <Sparkles size={22} />
            </div>
            <div>{hasKey ? t("ai.emptyLinked") : t("ai.emptyOffline")}</div>
          </div>
        )}
      </div>
    </div>
  );
}

interface EvidenceTablesProps {
  a: AnalysisResult;
  noise: Finding[];
  connected: { file: string; count: number }[];
  t: Tr;
}

export function EvidenceTables({ a, noise, connected, t }: EvidenceTablesProps) {
  return (
    <>
      {noise.length > 0 && (
        <Section idx="∅" title={t("find.noise")} count={`${noise.length}`} icon={<Ghost size={14} />}>
          <div className="card">
            <table className="etable">
              <tbody>
                {noise.map((f) => (
                  <tr key={f.id}>
                    <td><span className="path">{f.file}</span></td>
                    <td><span className="lang-tag">{f.evidence[1] ?? "noise"}</span></td>
                    <td className="muted" style={{ fontSize: 12 }}>{t("find.noiseNote")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {a.largestFiles.length > 0 && (
        <Section idx="01" title={t("sec.bodies")} count={t("sec.bodies.count", { n: a.largestFiles.length })} icon={<FileIcon size={14} />}>
          <div className="card">
            <table className="etable">
              <thead>
                <tr>
                  <th>{t("th.file")}</th>
                  <th>{t("th.lang")}</th>
                  <th style={{ textAlign: "right" }}>{t("th.lines")}</th>
                  <th style={{ textAlign: "right" }}>{t("th.funcs")}</th>
                  <th style={{ textAlign: "right" }}>{t("th.size")}</th>
                </tr>
              </thead>
              <tbody>
                {a.largestFiles.map((f) => (
                  <tr key={f.path}>
                    <td><span className="path">{f.path}</span></td>
                    <td><span className="lang-tag">{f.language}</span></td>
                    <td className="num">{formatNumber(f.lines)}</td>
                    <td className="num">{f.functions}</td>
                    <td className="num">{formatBytes(f.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {connected.length > 0 && (
        <Section idx="02" title={t("sec.associates")} count={t("sec.associates.count", { n: a.maxFanIn })} icon={<Link size={14} />}>
          <div className="card">
            <table className="etable">
              <thead>
                <tr>
                  <th>{t("th.file")}</th>
                  <th style={{ textAlign: "right" }}>{t("th.importedBy")}</th>
                </tr>
              </thead>
              <tbody>
                {connected.map((c) => (
                  <tr key={c.file}>
                    <td><span className="path">{c.file}</span></td>
                    <td className="num">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}
