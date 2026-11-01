import { expect, test } from "@playwright/test";

test("loads the responsive WatchZone card shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("watchzone-card")).toContainText("WatchZone");
  await expect(page.locator("watchzone-card ha-card")).toBeVisible();
});
