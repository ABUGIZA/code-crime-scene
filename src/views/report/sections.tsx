// Lower half of the report: AI review brief, quality warnings, the AI panel,
// and the supporting evidence tables (noise / largest files / fan-in).

import { formatBytes, formatNumber } from "../../lib/format";
import { Markdown } from "../../components/Markdown";
import { Sparkles, Ghost, FileIcon, Link, Alert } from "../../components/Icons";
import { FingerprintArt } from "../../components/EmptyArt";
import { Section, prioClass, type Tr } from "./parts";
import type { AiReviewBrief, AnalysisResult, Finding } from "../../lib/types";

function InspectionOrderCol({ brief, t }: { brief: AiReviewBrief; t: Tr }) {
  return (
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
  );
}

function NoiseCol({ brief, t }: { brief: AiReviewBrief; t: Tr }) {
  return (
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
  );
}

export function AiBrief({ brief, t }: { brief: AiReviewBrief; t: Tr }) {
  return (
    <Section idx="★" title={t("brief.title")} icon={null}>
      <div className="card card-pad">
        <div className="brief-risk">
          <span className="finding-label">{t("brief.primaryRisk")}</span>
          <span>{brief.primaryRisk}</span>
        </div>
        <div className="brief-grid">
          <InspectionOrderCol brief={brief} t={t} />
          <NoiseCol brief={brief} t={t} />
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
  providerLabel: string; // display name of the active AI provider
  onRun: () => void;
  onAddKey: () => void;
  t: Tr;
}

export function AiPanel({ hasKey, aiContent, aiLoading, providerLabel, onRun, onAddKey, t }: AiPanelProps) {
  const pv = { provider: providerLabel };
  return (
    <div className="section">
      <div className="card ai-card">
        <div className="ai-head">
          <div>
            <div className="section-title">
              <span className="idx">AI</span>
              {t("ai.title")}
            </div>
            <div className="ai-sub">{t("ai.subtitle", pv)}</div>
          </div>
          {hasKey ? (
            <button className="btn btn-primary" onClick={onRun} disabled={aiLoading}>
              {aiLoading ? <span className="spinner" /> : <Sparkles size={16} />}
              {aiLoading ? t("ai.calling", pv) : aiContent ? t("ai.rerun") : t("ai.analyze")}
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
              <Sparkles size={12} /> {t("ai.via", pv)}
            </div>
            <Markdown content={aiContent} />
          </div>
        ) : (
          <div className="ai-empty" style={{ marginTop: 14 }}>
            <div className="disc">
              <FingerprintArt size={24} />
            </div>
            <div>{hasKey ? t("ai.emptyLinked", pv) : t("ai.emptyOffline")}</div>
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

function NoiseTable({ noise, t }: { noise: Finding[]; t: Tr }) {
  if (noise.length === 0) return null;
  return (
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
  );
}

function LargestFilesTable({ a, t }: { a: AnalysisResult; t: Tr }) {
  if (a.largestFiles.length === 0) return null;
  return (
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
  );
}

function KnownAssociatesTable({ a, connected, t }: { a: AnalysisResult; connected: { file: string; count: number }[]; t: Tr }) {
  if (connected.length === 0) return null;
  return (
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
  );
}

function CyclesSection({ a, t }: { a: AnalysisResult; t: Tr }) {
  // Dependency cycles — only when the v2 analyzer ran (old reports lack the field).
  if (a.cycleCount === undefined) return null;
  return (
    <Section idx="∞" title={t("sec.cycles")} icon={<Link size={14} />}
      count={t("sec.cycles.count", { n: a.cycleCount })}>
      {a.cycleCount === 0 || !a.cycles?.length ? (
        <div className="card card-pad muted">{t("sec.cycles.none")}</div>
      ) : (
        <div className="card card-pad">
          <ul className="ev-list mono" dir="ltr">
            {a.cycles.slice(0, 6).map((c, i) => (
              <li key={i}>{[...c, c[0]].join(" → ")}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

export function EvidenceTables({ a, noise, connected, t }: EvidenceTablesProps) {
  return (
    <>
      <NoiseTable noise={noise} t={t} />
      <LargestFilesTable a={a} t={t} />
      <KnownAssociatesTable a={a} connected={connected} t={t} />
      <CyclesSection a={a} t={t} />
    </>
  );
}
