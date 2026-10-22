import type { ReactNode } from "react";
import type { PermanentSite } from "@realms/quest";

/** One silhouette per kind of permanent site, drawn in a 24 x 24 box centred on the origin. They take the colour of the surrounding text. */
const shapes: Record<PermanentSite, ReactNode> = {
  city: (
    <g>
      <rect x={-9} y={1} width={18} height={8} />
      <rect x={-9} y={-6} width={5} height={9} />
      <rect x={4} y={-6} width={5} height={9} />
      <rect x={-3} y={-10} width={6} height={13} />
    </g>
  ),
  village: <path fillRule="evenodd" d="M0-10L10-1V8H-10V-1ZM-2.5 8V2H2.500V8Z" />,
  shrine: (
    <path
      fillRule="evenodd"
      d="M0-11C4-6 8-3 8 3A8 8 0 0 1-8 3C-8-1-4-4 0-11ZM0 1C2 3 3.4 4 3.4 6A3.4 3.4 0 0 1-3.4 6C-3.4 4-2 3 0 1Z"
    />
  ),
  ruin: (
    <g>
      <rect x={-9} y={7} width={18} height={3} />
      <path d="M-7 7V-3L-4.500-6L-2-3L-1-5V7Z" />
      <path d="M2 7V1L4-2L6 1L8 0V7Z" />
    </g>
  ),
  waymark: (
    <g>
      <rect x={-1.2} y={-10} width={2.4} height={20} />
      <path d="M1-8H7.500L10-5L7.500-2H1Z" />
      <path d="M-1 0H-7.500L-10 3L-7.500 6H-1Z" />
    </g>
  ),
  arena: (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      d="M-9-9L6 6M9-9L-6 6M1 10L10 1M-1 10L-10 1"
    />
  ),
  capital: <path d="M-10 8V-5L-5 1L0-8L5 1L10-5V8Z" />,
  landmark: <path d="M-11 9L-3-6L1 1L4-3L11 9Z" />,
};

export const siteShape = (site: PermanentSite) => shapes[site];

/** The icon on its own, for buttons and lists. */
export function SiteIcon({ site, size = 18 }: { site: PermanentSite; size?: number }) {
  return (
    <svg
      className="site-ico"
      viewBox="-12 -12 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      {shapes[site]}
    </svg>
  );
}
