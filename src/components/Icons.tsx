import type { SVGProps } from "react";

type IconProps = { size?: number } & SVGProps<SVGSVGElement>;

function base(size: number, props: SVGProps<SVGSVGElement>) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const Fingerprint = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 11c0 3.5-.4 5.5-1 7" />
    <path d="M8 10a4 4 0 0 1 8 0c0 3-.3 5.5-1 7.5" />
    <path d="M5 12a7 7 0 0 1 14 0c0 1.5-.1 3-.4 4.5" />
    <path d="M12 11v1c0 2.5-.3 4.5-.8 6" />
    <path d="M9 19c.4-1.2.6-2.5.6-4" />
  </svg>
);

export const Search = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
);

export const Folder = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const Archive = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </svg>
);

export const Gear = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </svg>
);

export const Shield = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
  </svg>
);

export const Alert = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 4 2 20h20z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
);

export const FileIcon = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);

export const Link = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M10 14a4 4 0 0 0 5.6 0l2.4-2.4a4 4 0 0 0-5.6-5.6L11 7" />
    <path d="M14 10a4 4 0 0 0-5.6 0L6 12.4a4 4 0 0 0 5.6 5.6L13 17" />
  </svg>
);

export const Key = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <circle cx="8" cy="8" r="4" />
    <path d="m11 11 8 8M16 16l2-2M18 18l2-2" />
  </svg>
);

export const Check = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="m4 12 5 5L20 6" />
  </svg>
);

export const Trash = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </svg>
);

export const Copy = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </svg>
);

export const Magnifier = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-3.5-3.5" />
    <path d="M11 8v6M8 11h6" />
  </svg>
);

export const Brain = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5 3 3 0 0 0 1 5 3 3 0 0 0 3 3 2 2 0 0 0 3-1.7V5.7A2 2 0 0 0 9 4z" />
    <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5 3 3 0 0 1-1 5 3 3 0 0 1-3 3 2 2 0 0 1-3-1.7" />
  </svg>
);

export const Stack = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </svg>
);

export const Ghost = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M5 20V11a7 7 0 0 1 14 0v9l-2.3-1.5L14.4 20 12 18.4 9.6 20 7.3 18.5z" />
    <path d="M9.5 10h.01M14.5 10h.01" />
  </svg>
);

export const Download = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const Languages = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18" />
  </svg>
);

export const Sparkles = ({ size = 24, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />
  </svg>
);
