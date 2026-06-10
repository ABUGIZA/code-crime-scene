import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import * as api from "../lib/api";
import type { ProjectRecord } from "../lib/types";
import { timeAgo } from "../lib/format";
import { Magnifier, Folder } from "../components/Icons";
import { CaseFileArt } from "../components/EmptyArt";

export function Home() {
  const { analyzePath, setNotice } = useStore();
  const { t, lang } = useI18n();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  async function pick() {
    try {
      const path = await api.pickFolder();
      if (path) analyzePath(path);
    } catch (e) {
      setNotice(api.errText(e));
    }
  }

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("home.eyebrow")}</div>
          <h1 className="page-title">{t("home.title")}</h1>
          <div className="page-sub">{t("home.subtitle")}</div>
        </div>
      </div>

      <div className="dropzone ticks" onClick={pick}>
        <div className="case-visual" aria-hidden="true" />
        <div className="disc">
          <Magnifier size={32} />
        </div>
        <h3>{t("home.dropTitle")}</h3>
        <p>{t("home.dropHint")}</p>
      </div>

      <div className="recent">
        <div className="section-head">
          <div className="section-title">{t("home.recent")}</div>
          <div className="section-count">{t("home.onFile", { n: projects.length })}</div>
        </div>

        {projects.length === 0 ? (
          <div className="empty">
            <CaseFileArt />
            {t("home.empty")}
          </div>
        ) : (
          projects.map((p) => (
            <div key={p.id} className="recent-item" onClick={() => analyzePath(p.path)}>
              <span className="folder">
                <Folder size={20} />
              </span>
              <div className="meta">
                <div className="name">{p.name}</div>
                <div className="path" dir="ltr">{p.path}</div>
              </div>
              <div className="num muted" style={{ fontSize: 12 }}>
                {p.reportCount === 1 ? t("home.report", { n: 1 }) : t("home.reports", { n: p.reportCount })} · {timeAgo(p.lastOpened, lang)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
