// Inline stroke icons (currentColor), 16–20px. Decorative unless labelled by the parent.

type IconProps = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 18 18',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function Logo({ size = 26 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path
        d="M6 20V6h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="20" r="3.2" fill="var(--accent)" />
      <circle cx="6" cy="6" r="3.2" fill="currentColor" />
      <circle cx="20" cy="6" r="3.2" fill="currentColor" />
    </svg>
  );
}

export const SearchIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="8" cy="8" r="5" />
    <path d="M12 12l4 4" />
  </svg>
);

export const BellIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M4.5 12.5V8a4.5 4.5 0 0 1 9 0v4.5l1.5 1.5H3z" />
    <path d="M7.5 15.5a1.6 1.6 0 0 0 3 0" />
  </svg>
);

export const SunIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="9" cy="9" r="3.5" />
    <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" />
  </svg>
);

export const MoonIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M15 10.8A6.5 6.5 0 0 1 7.2 3a6.5 6.5 0 1 0 7.8 7.8z" />
  </svg>
);

export const ServerIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <rect x="2.5" y="2.5" width="13" height="5" rx="1" />
    <rect x="2.5" y="10.5" width="13" height="5" rx="1" />
  </svg>
);

export const AppsIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M2.5 2.5h5v5h-5zM10.5 2.5h5v5h-5zM2.5 10.5h5v5h-5zM10.5 10.5h5v5h-5z" />
  </svg>
);

export const ScreenIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <rect x="1.5" y="2.5" width="15" height="10" rx="1" />
    <path d="M6 15.5h6M9 12.5v3" />
  </svg>
);

export const UserIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="9" cy="6" r="3" />
    <path d="M3 16c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" />
  </svg>
);

export const PinIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M6.5 2.5h5l-1 5 3 3H4.5l3-3zM9 10.5v5" />
  </svg>
);

export const SharedIcon = ({ size = 12 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="6.5" cy="6" r="2.6" />
    <path d="M1.5 15c.7-2.6 2.5-3.8 5-3.8s4.3 1.2 5 3.8M11.5 3.5a2.5 2.5 0 0 1 0 5" />
  </svg>
);
