// Lucide-style minimal SVG icons — no runtime deps.
type P = { size?: number; className?: string };
const base = (size = 22) => ({
  width: size, height: size, viewBox: "0 0 24 24",
  fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
});

export const IconUsers  = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
export const IconBriefcase = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);
export const IconLeaf = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4 19 2c1 2 2 5 2 8a7 7 0 0 1-7 7" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6" />
  </svg>
);
export const IconStats = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 4 4 5-5" />
  </svg>
);
export const IconSparkles = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M12 3l1.9 5.7L19 10l-5.1 1.3L12 17l-1.9-5.7L5 10l5.1-1.3z" />
    <path d="M19 17l.5 1.5L21 19l-1.5.5L19 21l-.5-1.5L17 19l1.5-.5z" />
  </svg>
);
export const IconDownload = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);
export const IconClose = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
export const IconChevronRight = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);
export const IconSend = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4z" />
  </svg>
);
export const IconBot = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <circle cx="8.5" cy="13.5" r="1" />
    <circle cx="15.5" cy="13.5" r="1" />
    <path d="M12 7V3" />
    <path d="M10 3h4" />
  </svg>
);
export const IconWind = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2" />
    <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
    <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
  </svg>
);
export const IconReset = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M3 2v6h6" />
    <path d="M21 12A9 9 0 1 1 6 5.3L3 8" />
  </svg>
);
export const IconMap = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M1 6v16l7-3 8 3 7-3V3l-7 3-8-3-7 3z" />
    <path d="M8 3v16" />
    <path d="M16 6v16" />
  </svg>
);
export const IconLayers = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);
export const IconFuture = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
    <path d="M20 4l-1 2" />
    <path d="M22 8l-2 0" />
  </svg>
);
export const IconUser = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
export const IconPlay = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" />
  </svg>
);
export const IconPause = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <rect x="6" y="4" width="4" height="16" fill="currentColor" />
    <rect x="14" y="4" width="4" height="16" fill="currentColor" />
  </svg>
);
export const IconGlobe = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
  </svg>
);
export const IconWand = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" />
  </svg>
);
export const IconMenu = (p: P) => (
  <svg {...base(p.size)} className={p.className}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
);
