// New v2 evidence sections: cyclomatic-complexity "Interrogation Room" and the
// git-history "Rap Sheet" (hotspots / co-changes / bus factor). Every field is
// OPTIONAL on AnalysisResult — old saved reports lack all of them — so each
// section renders nothing (or a graceful fallback) when its data is undefined.

import { formatNumber } from "../../lib/format";
import { Magnifier, Stack } from "../../components/Icons";
import { Section, type Tr } from "./parts";
import type { AnalysisResult, GitForensics } from "../../lib/types";

type Hotspot = GitForensics["hotspots"][number];
type CoChange = GitForensics["coChanges"][number];
type BusFactor = GitForensics["busFactor"][number];

/** Severity bucket for a cyclomatic-complexity badge (reuses .sev classes). */
export function ccLevel(cc: number): "high" | "medium" | "low" {
  return cc >= 20 ? "high" : cc >= 14 ? "medium" : "low";
}

export function ComplexitySection({ a, t }: { a: AnalysisResult; t: Tr }) {
  const fns = a.complexFunctions;
  if (!fns) return null; // old report — field absent
  const top = fns.slice(0, 15);
  return (
    <Section
      idx="03"
      title={t("sec.interrogation")}
      count={t("sec.interrogation.count", { n: a.highComplexityFunctions ?? 0 })}
      icon={<Magnifier size={14} />}
    >
      {top.length === 0 ? (
        <div className="card card-pad muted">{t("sec.interrogation.clean")}</div>
      ) : (
        <div className="card">
          <table className="etable">
            <thead>
              <tr>
                <th>{t("th.file")}</th>
                <th>{t("th.function")}</th>
                <th style={{ textAlign: "right" }}>{t("th.cc")}</th>
                <th style={{ textAlign: "right" }}>{t("th.length")}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((f, i) => (
                <tr key={`${f.file}:${f.startLine}:${i}`}>
                  <td>
                    <span className="path" dir="ltr">
                      {f.file}:{f.startLine}
                    </span>
                  </td>
                  <td>
                    <span className="fn" dir="ltr">{f.name}</span>
                  </td>
                  <td className="num">
                    <span className={`sev ${ccLevel(f.complexity)}`}>{f.complexity}</span>
                  </td>
                  <td className="num">{f.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function BlockLabel({ text }: { text: string }) {
  // .finding-label is 96px wide inside finding rows — widen it here, where it
  // sits alone as a small table caption.
  return (
    <div className="finding-label" style={{ padding: "12px 14px 2px", width: "auto" }}>
      {text}
    </div>
  );
}

function HotspotsBlock({ hotspots, t }: { hotspots: Hotspot[]; t: Tr }) {
  if (hotspots.length === 0) return null;
  const maxScore = hotspots.reduce((m, h) => Math.max(m, h.score), 0) || 1;
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <BlockLabel text={t("sec.rapsheet.hotspots")} />
      <table className="etable">
        <thead>
          <tr>
            <th>{t("th.file")}</th>
            <th style={{ textAlign: "right" }}>{t("th.commits")}</th>
            <th style={{ textAlign: "right" }}>{t("th.churn")}</th>
            <th style={{ width: 110 }}>{t("th.heat")}</th>
          </tr>
        </thead>
        <tbody>
          {hotspots.map((h) => (
            <tr key={h.path}>
              <td>
                <span className="path" dir="ltr">{h.path}</span>
              </td>
              <td className="num">{h.commits}</td>
              <td className="num">{formatNumber(h.churn)}</td>
              <td>
                <div className="bar" dir="ltr">
                  <span
                    style={{
                      width: `${Math.max(6, Math.round((h.score / maxScore) * 100))}%`,
                      background: "var(--amber)",
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoChangeBlock({ pairs, t }: { pairs: CoChange[]; t: Tr }) {
  if (pairs.length === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <BlockLabel text={t("sec.rapsheet.pairs")} />
      <table className="etable">
        <thead>
          <tr>
            <th>{t("th.pair")}</th>
            <th style={{ textAlign: "right" }}>{t("th.together")}</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p) => (
            <tr key={`${p.a}↔${p.b}`}>
              <td>
                <span className="path" dir="ltr">{p.a}</span>
                <span className="muted mono"> ↔ </span>
                <span className="path" dir="ltr">{p.b}</span>
              </td>
              <td className="num">{p.count}×</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BusFactorBlock({ bus, t }: { bus: BusFactor[]; t: Tr }) {
  if (bus.length === 0) return null;
  return (
    <div className="card">
      <BlockLabel text={t("sec.rapsheet.bus")} />
      <table className="etable">
        <thead>
          <tr>
            <th>{t("th.file")}</th>
            <th>{t("th.topAuthor")}</th>
            <th style={{ textAlign: "right" }}>{t("th.share")}</th>
          </tr>
        </thead>
        <tbody>
          {bus.map((b) => (
            <tr key={b.path}>
              <td>
                <span className="path" dir="ltr">{b.path}</span>
              </td>
              <td>
                <span className="lang-tag" dir="ltr">{b.topAuthor}</span>
              </td>
              <td className={`num ${b.share >= 0.8 ? "t-bad" : b.share >= 0.6 ? "t-warn" : ""}`}>
                {Math.round(b.share * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GitForensicsSection({ g, t }: { g: GitForensics; t: Tr }) {
  if (!g.available) {
    return (
      <div className="muted mono" style={{ fontSize: 12, marginTop: 18 }}>
        {t("sec.rapsheet.unavailable", { reason: g.reason ?? "—" })}
      </div>
    );
  }

  return (
    <Section
      idx="04"
      title={t("sec.rapsheet")}
      count={t("sec.rapsheet.count", { c: formatNumber(g.commitsAnalyzed), a: g.authorsTotal })}
      icon={<Stack size={14} />}
    >
      <HotspotsBlock hotspots={g.hotspots.slice(0, 10)} t={t} />
      <CoChangeBlock pairs={g.coChanges.slice(0, 8)} t={t} />
      <BusFactorBlock bus={g.busFactor.slice(0, 5)} t={t} />
    </Section>
  );
}
