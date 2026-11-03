import { svg, type TemplateResult } from "lit";

interface IconPath {
  readonly d: string;
  readonly fillRule?: "evenodd" | "nonzero";
}

interface IconDefinition {
  readonly paths: readonly IconPath[];
  readonly viewBox?: string;
}

const ICONS = {
  chevronDown: {
    paths: [
      {
        d: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z",
      },
    ],
  },
  fullscreen: {
    paths: [
      {
        d: "M7 14H5v5h5v-2H7v-3M5 10h2V7h3V5H5v5m12 7h-3v2h5v-5h-2v3M14 5v2h3v3h2V5h-5Z",
      },
    ],
  },
  fullscreenExit: {
    paths: [
      {
        d: "M14 14h5v2h-3v3h-2v-5M5 14h5v5H8v-3H5v-2m3-9h2v5H5V8h3V5m11 3v2h-5V5h2v3h3Z",
      },
    ],
  },
  pipPopOut: {
    paths: [
      { d: "m4.264 5.633-.594.804 8.555 6.321.594-.803z" },
      { d: "m14.145 13.557-3.921.211 2.972-4.021z", fillRule: "evenodd" },
      {
        d: "M3.68 2.867A3.185 3.185 0 0 0 .5 6.047v10.641a3.185 3.185 0 0 0 3.18 3.18h11.332A1.5 1.5 0 0 1 15 19.674v-.855H3.68a2.126 2.126 0 0 1-2.133-2.131V6.047A2.127 2.127 0 0 1 3.68 3.914h14.141a2.127 2.127 0 0 1 2.131 2.133V14H21V6.047a3.185 3.185 0 0 0-3.18-3.18z",
      },
      {
        d: "M16.75 14.75h5.325a1 1 0 0 1 1 1v4.174a1 1 0 0 1-1 1H16.75a1 1 0 0 1-1-1V15.75a1 1 0 0 1 1-1z",
      },
    ],
  },
  power: {
    paths: [
      {
        d: "M16.56 5.44 15.11 6.89A6 6 0 1 1 8.89 6.89L7.44 5.44A8 8 0 1 0 16.56 5.44M13 3h-2v10h2V3Z",
      },
    ],
  },
  takeSnapshot: {
    paths: [
      {
        d: "M3 4V1h2v3h3v2H5v3H3V6H0V4h3m3 6V7h3V4h7l1.8 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V10h3m7 9a5 5 0 1 0 0-10 5 5 0 0 0 0 10m0-2a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z",
      },
    ],
  },
  videoOff: {
    paths: [
      {
        d: "M3.27 2 2 3.27 4.73 6H4C2.89 6 2 6.89 2 8v10c0 1.11.89 2 2 2h12c.22 0 .42-.04.61-.1L19.73 23 21 21.73 3.27 2M22 8l-4 4V8c0-1.11-.89-2-2-2H9.82L22 18.18V8Z",
      },
    ],
  },
  volumeOff: {
    paths: [
      {
        d: "M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63m2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.96 8.96 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3M12 4 9.91 6.09 12 8.18V4Z",
      },
    ],
  },
  volumeOn: {
    paths: [
      {
        d: "M3 9v6h4l5 5V4L7 9H3m13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77Z",
      },
    ],
  },
} as const satisfies Readonly<Record<string, IconDefinition>>;

export type IconName = keyof typeof ICONS;

export function renderIcon(name: IconName): TemplateResult {
  const definition: IconDefinition = ICONS[name];
  return svg`<svg
    viewBox=${definition.viewBox ?? "0 0 24 24"}
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    ${definition.paths.map((path) =>
      path.fillRule
        ? svg`<path d=${path.d} fill-rule=${path.fillRule}></path>`
        : svg`<path d=${path.d}></path>`,
    )}
  </svg>`;
}
