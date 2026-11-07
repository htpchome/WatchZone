import { describe, expect, it } from "vitest";

import { homeAssistantNumberFormat } from "../src/core/number-format";

describe("Home Assistant number formatting", () => {
  it("honors the selected decimal convention", () => {
    expect(
      homeAssistantNumberFormat({
        language: "en",
        number_format: "decimal_comma",
      }).format(1234.5),
    ).toBe("1.234,5");
  });
});
