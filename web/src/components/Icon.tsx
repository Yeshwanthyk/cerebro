import type { ReactNode } from "react";

/**
 * Accessible SVG icons - all decorative icons use aria-hidden
 * For interactive icons, wrap in a button with proper aria-label
 */

interface IconProps {
  name: keyof typeof icons;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const icons = {
  folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  close: "M18 6L6 18M6 6l12 12",
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  edit: [
    "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
    "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  ],
  clock: ["M12 6v6l4 2", "circle:12,12,10"],
  chevronRight: "M9 18l6-6-6-6",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  check: "M20 6L9 17l-5-5",
  dots: ["circle:12,12,1", "circle:19,12,1", "circle:5,12,1"],
  git: [
    "circle:12,12,3",
    "M12 3v6M12 15v6",
    "M5.63 5.63l4.25 4.25M14.12 14.12l4.25 4.25",
    "M3 12h6M15 12h6",
    "M5.63 18.37l4.25-4.25M14.12 9.88l4.25-4.25",
  ],
  refresh: ["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"],
} as const;

function renderPath(path: string): ReactNode {
  if (path.startsWith("circle:")) {
    const parts = path.slice(7).split(",");
    return <circle cx={parts[0]} cy={parts[1]} r={parts[2]} />;
  }
  return <path d={path} />;
}

export function Icon({ name, size = 16, className, strokeWidth = 2 }: IconProps) {
  const pathData = icons[name];
  const paths: string[] = Array.isArray(pathData)
    ? (pathData as readonly string[]).slice()
    : [pathData as string];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths.map((p) => (
        <g key={p}>{renderPath(p)}</g>
      ))}
    </svg>
  );
}
