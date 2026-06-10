import { useEffect, useState } from "react";
import * as api from "../../lib/api";
import type { Scores } from "../../lib/types";

// Score-delta trends: fetch the previous report of the same project (if any)
// and keep only its Scores. Entirely non-fatal — no prior report, a parse
// error or a backend hiccup simply leaves the deltas hidden.
export function useTrends(
  projectPath: string | null,
  reportId: number | null,
  createdAt: number,
): Scores | null {
  const [prev, setPrev] = useState<Scores | null>(null);

  useEffect(() => {
    let alive = true;
    setPrev(null);
    if (!projectPath) return;
    (async () => {
      try {
        const list = await api.listReportsForProject(projectPath);
        const prior = list
          .filter((r) => r.id !== reportId)
          .filter(
            (r) =>
              r.createdAt < createdAt ||
              (r.createdAt === createdAt && reportId != null && r.id < reportId),
          )
          .sort((x, y) => y.createdAt - x.createdAt || y.id - x.id)[0];
        if (!prior) return;
        const rec = await api.getReport(prior.id);
        if (!rec) return;
        const scores = JSON.parse(rec.scoresJson) as Scores;
        if (alive) setPrev(scores);
      } catch {
        /* non-fatal — trends are a bonus, never an error */
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectPath, reportId, createdAt]);

  return prev;
}
