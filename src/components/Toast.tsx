import { useEffect } from "react";
import { useStore } from "../lib/store";

export function Toast() {
  const { notice, setNotice } = useStore();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  if (!notice) return null;
  return (
    <div className="toast">
      <span>{notice}</span>
      <button onClick={() => setNotice(null)} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
