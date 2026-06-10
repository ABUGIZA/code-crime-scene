// Brand mark — the magnifier + </> glyph, matching the app icon (concept B).
// Inherits its color via currentColor; the emblem containers paint it amber.

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.7" />
      <line x1="15.5" y1="15.5" x2="20.5" y2="20.5" />
      <g strokeWidth={1.5}>
        <path d="M9.1 8.4 7.4 10.5 9.1 12.6" />
        <path d="M11.9 8.4 13.6 10.5 11.9 12.6" />
        <path d="M11 7.9 10 13.1" />
      </g>
    </svg>
  );
}
