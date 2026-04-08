import { h } from "preact";

export interface ShieldLogoProps {
  size?: number;
  title?: string;
}

// Inline SVG placeholder — shield silhouette wrapping an envelope.
// Path geometry derived from the shield-mail-color.svg master (M2 stand-in).
export function ShieldLogo({ size = 24, title = "ShieldMail" }: ShieldLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="sm-shield-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#00D4AA" />
          <stop offset="100%" stop-color="#00A884" />
        </linearGradient>
      </defs>
      <path
        d="M16 2 L28 6 V15 C28 22 22.5 28 16 30 C9.5 28 4 22 4 15 V6 Z"
        fill="url(#sm-shield-grad)"
      />
      <rect x="9" y="12" width="14" height="9" rx="1.5" fill="#ffffff" />
      <path
        d="M9 13 L16 18 L23 13"
        stroke="#00A884"
        stroke-width="1.4"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
