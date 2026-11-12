import { normalizePlainText } from "../../core/plain-text";

export const MAX_EXPORT_TITLE_LENGTH = 256;

const EXPORT_TITLE_OPTIONS = { maxLength: MAX_EXPORT_TITLE_LENGTH } as const;

export function normalizeExportTitle(value: string): string {
  return normalizePlainText(value, EXPORT_TITLE_OPTIONS);
}

/** Preserve the configured camera label when fitting a generated title. */
export function appendExportCameraLabel(
  providerTitle: string,
  cameraLabel: string | undefined,
): string {
  const title = normalizeExportTitle(providerTitle);
  const label = normalizeExportTitle(cameraLabel ?? "");
  if (!label) return title;
  if (!title) return label;
  const separator = " — ";
  const labelBudget = MAX_EXPORT_TITLE_LENGTH - separator.length;
  const fittedLabel = Array.from(label)
    .slice(0, labelBudget)
    .join("")
    .trimEnd();
  const suffix = `${separator}${fittedLabel}`;
  const titleBudget = MAX_EXPORT_TITLE_LENGTH - Array.from(suffix).length;
  const fittedTitle = Array.from(title)
    .slice(0, titleBudget)
    .join("")
    .trimEnd();
  return `${fittedTitle}${suffix}`;
}
