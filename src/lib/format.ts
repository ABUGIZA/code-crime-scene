// Small presentation helpers for numbers, sizes and timestamps.

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(unixSecs: number): string {
  const d = new Date(unixSecs * 1000);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/// Arabic needs real unit words (dual/plural), not a tacked-on "ago".
function arUnit(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return `قبل ${one}`;
  if (n === 2) return `قبل ${two}`;
  if (n <= 10) return `قبل ${n} ${few}`;
  return `قبل ${n} ${many}`;
}

export function timeAgo(unixSecs: number, lang: string = "en"): string {
  const diff = Date.now() / 1000 - unixSecs;
  const m = Math.floor(diff / 60);
  const h = Math.floor(diff / 3600);
  const d = Math.floor(diff / 86400);
  if (lang === "ar") {
    if (diff < 60) return "الحين";
    if (diff < 3600) return arUnit(m, "دقيقة", "دقيقتين", "دقائق", "دقيقة");
    if (diff < 86400) return arUnit(h, "ساعة", "ساعتين", "ساعات", "ساعة");
    if (diff < 604800) return arUnit(d, "يوم", "يومين", "أيام", "يومًا");
    return formatDate(unixSecs);
  }
  if (diff < 60) return "just now";
  if (diff < 3600) return `${m}m ago`;
  if (diff < 86400) return `${h}h ago`;
  if (diff < 604800) return `${d}d ago`;
  return formatDate(unixSecs);
}

/// A stable, case-file-style identifier derived from a report id + timestamp.
export function caseNumber(id: number, createdAt: number): string {
  const year = new Date(createdAt * 1000).getFullYear();
  return `CCS-${year}-${String(id).padStart(4, "0")}`;
}
