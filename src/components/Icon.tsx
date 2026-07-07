import type { SVGProps } from "react";

/**
 * A small, hand-tuned line-icon set. One consistent stroke weight, rounded
 * joins, 24px grid — so the app speaks in a single visual voice instead of a
 * grab-bag of emoji. Icons inherit `currentColor` and scale with `size`.
 */
export type IconName =
  | "alarm"
  | "car"
  | "transit"
  | "cycle"
  | "walk"
  | "pin"
  | "sunrise"
  | "moon"
  | "plus"
  | "close"
  | "chevron"
  | "sound"
  | "route";

const PATHS: Record<IconName, JSX.Element> = {
  alarm: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9.5V13l2.4 1.6" />
      <path d="M5.2 3.4 2.4 6" />
      <path d="m21.6 6-2.8-2.6" />
      <path d="M6.5 19.5 4.4 21.6" />
      <path d="m17.5 19.5 2.1 2.1" />
    </>
  ),
  car: (
    <>
      <path d="M4 13.5 5.6 8.7c.3-.9 1.1-1.5 2-1.5h8.8c.9 0 1.7.6 2 1.5L20 13.5" />
      <path d="M3 13.5h18v3.8a1 1 0 0 1-1 1h-1.5" />
      <path d="M5.5 18.3H4a1 1 0 0 1-1-1v-3.8" />
      <path d="M9 18.3h6" />
      <circle cx="7" cy="18.3" r="1.7" />
      <circle cx="17" cy="18.3" r="1.7" />
    </>
  ),
  transit: (
    <>
      <rect x="5" y="3.5" width="14" height="13.5" rx="3" />
      <path d="M5 11h14" />
      <path d="M12 3.5V11" />
      <path d="M8.5 14.2h.01" />
      <path d="M15.5 14.2h.01" />
      <path d="m8 17-2 3.5" />
      <path d="m16 17 2 3.5" />
    </>
  ),
  cycle: (
    <>
      <circle cx="6" cy="17" r="3.2" />
      <circle cx="18" cy="17" r="3.2" />
      <circle cx="14.5" cy="5.5" r="1" />
      <path d="M6 17 10 8h4l-2.5 5.5H16l-1.5-4" />
    </>
  ),
  walk: (
    <>
      <circle cx="12.5" cy="4.2" r="1.6" />
      <path d="M11 21.5 12.2 15l-2.2-2.4.8-4.4 3 1.6 2.4 1.2" />
      <path d="m10.8 12.6-2.3 2 .8 3" />
      <path d="M12.4 15.2 15 18.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.5s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 11.3C5.5 16.1 12 21.5 12 21.5Z" />
      <circle cx="12" cy="11" r="2.4" />
    </>
  ),
  sunrise: (
    <>
      <path d="M12 3v6" />
      <path d="m8.5 6.5 3.5-3.5 3.5 3.5" />
      <path d="M4 14.5h1.6" />
      <path d="M18.4 14.5H20" />
      <path d="m6 9.6 1.1 1.1" />
      <path d="m18 9.6-1.1 1.1" />
      <path d="M8 15a4 4 0 0 1 8 0" />
      <path d="M3 19h18" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5Z" />,
  plus: (
    <>
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  chevron: <path d="m6 9.5 6 6 6-6" />,
  sound: (
    <>
      <path d="M4 9.5v5h3l4.5 4v-13L7 9.5H4Z" />
      <path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4" />
      <path d="M18.4 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18.5" r="2.5" />
      <circle cx="18" cy="5.5" r="2.5" />
      <path d="M8.5 18.5H14a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h5.5" />
    </>
  ),
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, strokeWidth = 1.7, ...rest }: IconProps) {
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
      aria-hidden
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export const MODE_ICON: Record<string, IconName> = {
  drive: "car",
  transit: "transit",
  walk: "walk",
  cycle: "cycle",
};
