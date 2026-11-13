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
  alertCircle: {
    paths: [
      {
        d: "M13 13h-2V7h2v6m0 4h-2v-2h2v2M12 2A10 10 0 1 0 12 22 10 10 0 0 0 12 2Z",
      },
    ],
  },
  check: {
    paths: [
      {
        d: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z",
      },
    ],
  },
  informationOutline: {
    paths: [
      {
        d: "M13 9h-2V7h2v2m0 8h-2v-6h2v6m-1-15A10 10 0 1 0 12 22 10 10 0 0 0 12 2m0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z",
      },
    ],
  },
  ptz: {
    paths: [
      {
        d: "M9,12C9,11.19 9.3,10.5 9.89,9.89C10.5,9.3 11.19,9 12,9C12.81,9 13.5,9.3 14.11,9.89C14.7,10.5 15,11.19 15,12C15,12.81 14.7,13.5 14.11,14.11C13.5,14.7 12.81,15 12,15C11.19,15 10.5,14.7 9.89,14.11C9.3,13.5 9,12.81 9,12M5.53,8.44L7.31,10.22L5.53,12L7.31,13.78L5.53,15.56L2,12L5.53,8.44M8.44,18.47L10.22,16.69L12,18.47L13.78,16.69L15.56,18.47L12,22L8.44,18.47M18.47,15.56L16.69,13.78L18.47,12L16.69,10.22L18.47,8.44L22,12L18.47,15.56M15.56,5.53L13.78,7.31L12,5.53L10.22,7.31L8.44,5.53L12,2L15.56,5.53Z",
      },
    ],
  },
  arrowCollapseAll: {
    paths: [
      {
        d: "M19.5 3.09 15 7.59V4h-2v7h7V9h-3.59l4.5-4.5-1.41-1.41M4.5 3.09 3.09 4.5 7.59 9H4v2h7V4H9v3.59L4.5 3.09M4 13v2h3.59l-4.5 4.5 1.41 1.41 4.5-4.5V20h2v-7H4m9 0v7h2v-3.59l4.5 4.5 1.41-1.41-4.5-4.5H20v-2h-7Z",
      },
    ],
  },
  reviews: {
    paths: [
      {
        d: "M12 2L4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1 14l-4-4 1.4-1.4L11 13.2l5.6-5.6L18 9l-7 7z",
      },
    ],
  },
  shieldAlert: {
    paths: [
      {
        d: "M12 2 4 5v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V5l-8-3m1 15h-2v-2h2v2m0-4h-2V7h2v6Z",
      },
    ],
  },
  account: {
    paths: [
      {
        d: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4Z",
      },
    ],
  },
  calendar: {
    paths: [
      {
        d: "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 16H5V9h14v11Z",
      },
    ],
  },
  clock: {
    paths: [
      {
        d: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20m1 5h-2v6l5.2 3.2 1-1.7-4.2-2.5V7Z",
      },
    ],
  },
  mapMarker: {
    paths: [
      {
        d: "M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7m0 4.5A2.5 2.5 0 1 0 12 11a2.5 2.5 0 0 0 0-5Z",
      },
    ],
  },
  camera: {
    paths: [
      {
        d: "M4 4h3l2-2h6l2 2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m8 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
      },
    ],
  },
  chevronDown: {
    paths: [
      {
        d: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z",
      },
    ],
  },
  chevronLeft: {
    paths: [{ d: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59Z" }],
  },
  chevronUp: {
    paths: [
      {
        d: "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41Z",
      },
    ],
  },
  chevronRight: {
    paths: [{ d: "M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12l-4.58 4.59Z" }],
  },
  arrowUp: {
    paths: [{ d: "M12 3 3 12h6v9h6v-9h6Z" }],
  },
  arrowDown: {
    paths: [{ d: "M12 21 3 12h6V3h6v9h6Z" }],
  },
  arrowLeft: {
    paths: [{ d: "M3 12 12 3v6h9v6h-9v6Z" }],
  },
  arrowRight: {
    paths: [{ d: "m21 12-9-9v6H3v6h9v6Z" }],
  },
  remove: {
    paths: [
      {
        d: "M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12Z",
      },
    ],
  },
  dragHorizontal: {
    paths: [
      {
        d: "M7 7V5h10v2H7m0 6v-2h10v2H7m0 6v-2h10v2H7Z",
      },
    ],
  },
  download: {
    paths: [
      {
        d: "M19 9h-4V3H9v6H5l7 7 7-7M5 18v2h14v-2H5Z",
      },
    ],
  },
  export: {
    paths: [
      {
        d: "M23 12l-4-4v3h-8v2h8v3l4-4M21 19H3V5h7V3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-2h-2v2Z",
      },
    ],
  },
  reset: {
    paths: [
      {
        d: "M12 5a7 7 0 1 1-6.65 9.2l-1.9.63A9 9 0 1 0 6.2 4.1L3 1v8h8L7.65 5.65A6.96 6.96 0 0 1 12 5Z",
      },
    ],
  },
  edit: {
    paths: [
      {
        d: "M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z",
      },
    ],
  },
  events: {
    paths: [
      {
        d: "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z",
      },
    ],
  },
  filter: {
    paths: [
      {
        d: "M14 12v7.88c.04.3-.06.62-.29.83a1 1 0 0 1-1.42 0l-2-2A1 1 0 0 1 10 18v-6h-.03L4.21 4.62A1 1 0 0 1 5 3h14a1 1 0 0 1 .79 1.62L14.03 12H14Z",
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
  layout: {
    paths: [
      {
        d: "M3 3h2v8h8v2H5v8H3V3m6 4h12v2H9V7m6 8h6v2h-6v-2Z",
      },
    ],
  },
  lightbulb: {
    paths: [
      {
        d: "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1m3-19a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1.26A7 7 0 0 0 12 2m2.85 12.1-.85.5V16h-4v-1.4l-.85-.5A5 5 0 1 1 14.85 14.1Z",
      },
    ],
  },
  close: {
    paths: [
      {
        d: "M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.41 4.29 19.71 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29 10.59 10.59 16.89 4.29 18.3 5.71Z",
      },
    ],
  },
  microphone: {
    paths: [
      {
        d: "M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3m5.3-3a5.3 5.3 0 0 1-10.6 0H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08A7 7 0 0 0 19 11h-1.7Z",
      },
    ],
  },
  microphoneOff: {
    paths: [
      {
        d: "m19 11-1.7.01c0 .84-.2 1.64-.55 2.34l1.23 1.23A6.9 6.9 0 0 0 19 11M4.27 3 3 4.27 9 10.27V11a3 3 0 0 0 4.73 2.45l1.1 1.1A5.3 5.3 0 0 1 6.7 11H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08a7 7 0 0 0 3.05-1.1L19.73 20 21 18.73 4.27 3M15 11V5a3 3 0 0 0-5.94-.6L15 10.34V11Z",
      },
    ],
  },
  movie: {
    paths: [
      {
        d: "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4h-4Z",
      },
    ],
  },
  packageOutline: {
    paths: [
      {
        d: "m12 2 9 5v10l-9 5-9-5V7l9-5m0 2.3L5.7 7.8 12 11.3l6.3-3.5L12 4.3M5 9.5v6.3l6 3.3v-6.3L5 9.5m8 9.6 6-3.3V9.5l-6 3.3v6.3Z",
      },
    ],
  },
  pause: {
    paths: [{ d: "M6 19h4V5H6v14m8-14v14h4V5h-4Z" }],
  },
  play: {
    paths: [{ d: "M8 5v14l11-7L8 5Z" }],
  },
  stop: {
    paths: [{ d: "M6 6h12v12H6z" }],
  },
  dotsHorizontalCircleOutline: {
    paths: [
      {
        d: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20m0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16M7 10.5A1.5 1.5 0 1 1 7 13.5a1.5 1.5 0 0 1 0-3m5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3m5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
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
  settings: {
    paths: [
      {
        d: "M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98L14.5 2.42A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.49.49 0 0 0-.61.22l-2 3.46a.49.49 0 0 0 .12.64l2.11 1.65c-.04.32-.08.67-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.08.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65M12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z",
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
  tune: {
    paths: [
      {
        d: "M3 17v2h6v-2H3m0-12v2h10V5H3m10 16v-2h8v-2h-8v-2h-2v6h2M7 9v2H3v2h4v2h2V9H7m14 4v-2H11v2h10m-6-4h2V7h4V5h-4V3h-2v6Z",
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

export function isIconName(value: string): value is IconName {
  return value in ICONS;
}

export function iconPath(name: IconName): string | undefined {
  const definition: IconDefinition = ICONS[name];
  const path = definition.paths[0];
  return definition.paths.length === 1 && path && !path.fillRule
    ? path.d
    : undefined;
}

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
