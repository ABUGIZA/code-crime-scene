// Bespoke "Forensic Noir" empty-state illustrations — evidence-board language,
// amber-on-charcoal with soft depth. No generic icons. Sizing is handled by CSS
// (.empty-art); the fingerprint inherits its parent color via currentColor.

function Shadow({ id }: { id: string }) {
  return (
    <filter id={id} x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#000" floodOpacity={0.5} />
    </filter>
  );
}

/** Empty case file — a folder with a blank document and a magnifier. */
export function CaseFileArt() {
  return (
    <svg className="empty-art" viewBox="0 0 168 124" role="img" aria-hidden="true">
      <defs>
        <Shadow id="efCase" />
      </defs>
      <g filter="url(#efCase)">
        <rect x="56" y="20" width="66" height="80" rx="3" fill="#16171c" stroke="#e0a33a" strokeOpacity={0.14} />
        <g stroke="#e0a33a" strokeOpacity={0.14} strokeWidth={2}>
          <line x1="66" y1="36" x2="112" y2="36" />
          <line x1="66" y1="46" x2="100" y2="46" />
        </g>
        <path
          d="M26 52 h36 l8 -9 h46 a5 5 0 0 1 5 5 v44 a5 5 0 0 1 -5 5 H26 a5 5 0 0 1 -5 -5 V57 a5 5 0 0 1 5 -5 z"
          fill="#1d1e26"
          stroke="#e0a33a"
          strokeOpacity={0.3}
        />
        <rect x="33" y="63" width="42" height="10" rx="2" fill="#e0a33a" fillOpacity={0.16} />
      </g>
      <circle cx="112" cy="40" r="13" fill="none" stroke="#e0a33a" strokeOpacity={0.5} strokeWidth={2.4} />
      <line x1="121" y1="49" x2="131" y2="59" stroke="#e0a33a" strokeOpacity={0.5} strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}

/** Empty archive — hanging case folders in a drawer, nothing filed yet. */
export function ArchiveArt() {
  return (
    <svg className="empty-art" viewBox="0 0 168 124" role="img" aria-hidden="true">
      <defs>
        <Shadow id="efArch" />
      </defs>
      <g filter="url(#efArch)">
        <rect x="26" y="42" width="116" height="66" rx="6" fill="#15161b" stroke="#e0a33a" strokeOpacity={0.16} />
        <g fill="#1d1e26" stroke="#e0a33a" strokeOpacity={0.24}>
          <rect x="40" y="30" width="40" height="60" rx="3" transform="rotate(-3 60 60)" />
          <rect x="100" y="32" width="40" height="58" rx="3" transform="rotate(5 120 60)" />
        </g>
        <rect x="60" y="44" width="48" height="46" rx="3" fill="#20212a" stroke="#e0a33a" strokeOpacity={0.32} />
        <g stroke="#e0a33a" strokeOpacity={0.13} strokeWidth={2}>
          <line x1="68" y1="60" x2="100" y2="60" />
          <line x1="68" y1="70" x2="92" y2="70" />
        </g>
      </g>
    </svg>
  );
}

/** Latent fingerprint — concentric ridges. Inherits color via currentColor. */
export function FingerprintArt({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <ellipse cx="24" cy="24" rx="15" ry="17" />
        <ellipse cx="24" cy="24" rx="10" ry="12" />
        <ellipse cx="24" cy="24" rx="5" ry="7" />
      </g>
    </svg>
  );
}
