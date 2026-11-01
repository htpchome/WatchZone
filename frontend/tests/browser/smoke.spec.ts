import { expect, test } from "@playwright/test";

test("loads the WatchZone development surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("watchzone-card")).toContainText(
    "WatchZone frontend development environment is ready.",
  );
});
