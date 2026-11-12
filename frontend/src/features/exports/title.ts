import { normalizePlainText } from "../../core/plain-text";

export const MAX_EXPORT_TITLE_LENGTH = 256;

const EXPORT_TITLE_OPTIONS = { maxLength: MAX_EXPORT_TITLE_LENGTH } as const;

export function normalizeExportTitle(value: string): string {
  return normalizePlainText(value, EXPORT_TITLE_OPTIONS);
}
