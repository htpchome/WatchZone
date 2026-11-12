import { describe, expect, it } from "vitest";

import {
  normalizePlainText,
  sanitizePlainTextInput,
} from "../src/core/plain-text";
import {
  MAX_EXPORT_TITLE_LENGTH,
  normalizeExportTitle,
} from "../src/features/exports";

describe("plain-text normalization", () => {
  it("preserves Unicode punctuation while removing controls and extra spacing", () => {
    expect(
      normalizePlainText("  Café\u0000\n —   driveway  ", { maxLength: 64 }),
    ).toBe("Café — driveway");
  });

  it("supports stricter field-specific character policies", () => {
    expect(
      sanitizePlainTextInput("  Front! ドア 42  ", {
        allowCharacter: (character) => /[\p{L}\p{N} ]/u.test(character),
        maxLength: 12,
      }),
    ).toBe("Front ドア 42 ");
  });

  it("uses the same normalization and length policy for export titles", () => {
    expect(normalizeExportTitle("  Visitor\u0000\n clip  ")).toBe(
      "Visitor clip",
    );
    const title = normalizeExportTitle("x".repeat(300));
    expect(Array.from(title)).toHaveLength(MAX_EXPORT_TITLE_LENGTH);
  });
});
