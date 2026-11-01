import { afterEach, describe, expect, it } from "vitest";

import "../src/index";
import type { IntegrationRoot } from "../src/integration-root";

describe("integration-dev-root", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders the Lit development surface", async () => {
    const element = document.createElement(
      "integration-dev-root",
    ) as IntegrationRoot;
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.textContent).toContain(
      "Lit frontend development environment is ready.",
    );
  });
});
