import { unsafeCSS } from "lit";

const cursor = (path: string, fallback: string) =>
  unsafeCSS(
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='${path}' fill='none' stroke='%23111111' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='${path}' fill='none' stroke='%23f5f5f5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") 12 12, ${fallback}`,
  );

export const cameraPanCursor = cursor(
  "M12 2v20M2 12h20M12 2 8 6m4-4 4 4m6 6-4-4m4 4-4 4m-6 6-4-4m4 4 4-4M2 12l4-4m-4 4 4 4",
  "all-scroll",
);

export const cameraVerticalResizeCursor = cursor(
  "M12 2v20M12 2 8 6m4-4 4 4m-4 16-4-4m4 4 4-4",
  "row-resize",
);
