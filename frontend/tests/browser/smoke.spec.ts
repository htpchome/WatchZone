import { expect, test } from "@playwright/test";

test("loads the Lit development surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("integration-dev-root")).toContainText(
    "Lit frontend development environment is ready.",
  );
});
