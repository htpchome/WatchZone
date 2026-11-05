import { expect, test, type Page } from "@playwright/test";

import {
  installHaControlSliderFixture,
  installHaIconFixture,
  installHaSelectorFixture,
} from "./ha-selector.fixture";

const LIGHT_LONG_PRESS_WAIT_MS = 500;

async function waitForCard(page: Page): Promise<void> {
  await page.waitForFunction(
    () => customElements.get("watchzone-card") !== undefined,
  );
}

async function mountEditor(page: Page): Promise<void> {
  await page.goto("/");
  await waitForCard(page);
  await installHaIconFixture(page);
  await installHaControlSliderFixture(page);
  await installHaSelectorFixture(page);
  await page.evaluate(async () => {
    const constructor = customElements.get(
      "watchzone-card",
    ) as typeof HTMLElement & {
      getConfigElement(): Promise<
        HTMLElement & {
          hass: unknown;
          setConfig(config: unknown): void;
          updateComplete: Promise<boolean>;
        }
      >;
    };
    const editor = await constructor.getConfigElement();
    editor.id = "linked-light-editor";
    editor.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front Door" },
        },
        "light.driveway": {
          entity_id: "light.driveway",
          state: "off",
          attributes: { friendly_name: "Driveway" },
        },
        "light.porch": {
          entity_id: "light.porch",
          state: "on",
          attributes: { friendly_name: "Porch" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      callService: async () => undefined,
      callWS: async () => ({ supported: false }),
      hassUrl: (path: string) => path,
    };
    editor.setConfig({
      type: "custom:watchzone-card",
      cameras: [{ entity_id: "camera.front" }],
    });
    (
      window as unknown as {
        linkedLightConfigs?: unknown[];
      }
    ).linkedLightConfigs = [];
    editor.addEventListener("config-changed", (event) => {
      (
        window as unknown as {
          linkedLightConfigs: unknown[];
        }
      ).linkedLightConfigs.push(
        (event as CustomEvent<{ config: unknown }>).detail.config,
      );
    });
    document.body.append(editor);
    await editor.updateComplete;
  });
}

async function openCameraEditor(page: Page): Promise<void> {
  const editor = page.locator("#linked-light-editor");
  await editor.locator("wzc-accordion-item").first().locator("summary").click();
  await editor.locator('[aria-label="Edit camera: Front Door"]').click();
}

async function openLights(page: Page): Promise<void> {
  const items = page.locator(
    "#linked-light-editor .camera-dialog-accordion > wzc-accordion-item",
  );
  await items.nth(3).locator("summary").click();
}

async function addLight(page: Page, name: string): Promise<void> {
  const editor = page.locator("#linked-light-editor");
  await editor.locator(".add-light").click();
  const selector = editor.locator(".add-light-form ha-selector").first();
  await selector.getByRole("button", { name: "Choose Light" }).click();
  await selector.getByRole("option", { name }).click();
  await expect(selector.getByRole("button", { name })).toBeVisible();
  await expect
    .poll(() =>
      editor
        .locator('.add-light-form ha-button[variant="brand"]')
        .evaluate((element) =>
          Boolean((element as HTMLElement & { disabled?: boolean }).disabled),
        ),
    )
    .toBe(false);
  await editor.locator('.add-light-form ha-button[variant="brand"]').click();
}

test("adds, limits, saves, reopens, and removes lights through visible controls", async ({
  page,
}) => {
  await mountEditor(page);
  await openCameraEditor(page);
  await openLights(page);

  const editor = page.locator("#linked-light-editor");
  await editor.locator(".add-light").click();
  let selector = editor.locator(".add-light-form ha-selector").first();
  await selector.getByRole("button", { name: "Choose Light" }).click();
  await selector.getByRole("option", { name: "Porch" }).click();
  await editor.locator('.add-light-form ha-button[variant="neutral"]').click();
  await expect(editor.locator(".linked-light-row")).toHaveCount(0);

  await addLight(page, "Porch");
  await editor.locator(".add-light").click();
  selector = editor.locator(".add-light-form ha-selector").first();
  await selector.getByRole("button", { name: "Choose Light" }).click();
  await selector.getByRole("option", { name: "Porch" }).click();
  await expect
    .poll(() =>
      editor
        .locator('.add-light-form ha-button[variant="brand"]')
        .evaluate((element) =>
          Boolean((element as HTMLElement & { disabled?: boolean }).disabled),
        ),
    )
    .toBe(true);
  await editor.locator('.add-light-form ha-button[variant="neutral"]').click();
  await addLight(page, "Driveway");
  await expect(editor.locator(".linked-light-row")).toHaveCount(2);
  await expect(editor.locator(".add-light")).toHaveCount(0);
  await editor
    .locator('.camera-editor-dialog ha-button[variant="brand"][size="m"]')
    .click();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              linkedLightConfigs?: Array<{
                cameras?: Array<{ light_entity_ids?: string[] }>;
              }>;
            }
          ).linkedLightConfigs?.at(-1)?.cameras?.[0]?.light_entity_ids,
      ),
    )
    .toEqual(["light.porch", "light.driveway"]);

  await editor.locator('[aria-label="Edit camera: Front Door"]').click();
  await openLights(page);
  await expect(editor.locator(".linked-light-row")).toHaveCount(2);
  await editor.locator(".remove-light").first().click();
  await editor
    .locator('.camera-editor-dialog ha-button[variant="brand"][size="m"]')
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              linkedLightConfigs?: Array<{
                cameras?: Array<{ light_entity_ids?: string[] }>;
              }>;
            }
          ).linkedLightConfigs?.at(-1)?.cameras?.[0]?.light_entity_ids,
      ),
    )
    .toEqual(["light.driveway"]);
});

test("shows the camera friendly name as the empty title placeholder", async ({
  page,
}) => {
  await mountEditor(page);
  await openCameraEditor(page);
  await expect
    .poll(() =>
      page
        .locator("#linked-light-editor .camera-title-field ha-input")
        .evaluate(
          (element) =>
            (element as HTMLElement & { placeholder?: string }).placeholder,
        ),
    )
    .toBe("Front Door");
});

test("provides a defaulted icon picker for each pending light", async ({
  page,
}) => {
  await mountEditor(page);
  await openCameraEditor(page);
  await openLights(page);
  const editor = page.locator("#linked-light-editor");
  await editor.locator(".add-light").click();
  const selectors = editor.locator(".add-light-form ha-selector");
  await expect(selectors).toHaveCount(2);
  await expect
    .poll(() =>
      selectors.nth(1).evaluate((element) => ({
        selector: (element as HTMLElement & { selector?: unknown }).selector,
        value: (element as HTMLElement & { value?: string }).value,
      })),
    )
    .toEqual({
      selector: { icon: {} },
      value: "mdi:lightbulb-off-outline",
    });
});

test("preserves a custom icon identically across off and on states", async ({
  page,
}) => {
  await mountEditor(page);
  await openCameraEditor(page);
  await openLights(page);
  const editor = page.locator("#linked-light-editor");
  await editor.locator(".add-light").click();
  const selectors = editor.locator(".add-light-form ha-selector");
  await expect(selectors).toHaveCount(2);

  await selectors.first().getByRole("button", { name: "Choose Light" }).click();
  await selectors.first().getByRole("option", { name: "Porch" }).click();
  await selectors.nth(1).getByRole("button", { name: "Stateful bulb" }).click();
  await selectors.nth(1).getByRole("option", { name: "Coach lamp" }).click();
  await editor.locator('.add-light-form ha-button[variant="brand"]').click();
  await editor
    .locator('.camera-editor-dialog ha-button[variant="brand"][size="m"]')
    .click();

  const savedConfig = await page.evaluate(() =>
    (
      window as unknown as {
        linkedLightConfigs?: unknown[];
      }
    ).linkedLightConfigs?.at(-1),
  );
  expect(savedConfig).toBeDefined();
  await editor.evaluate((element) => element.remove());
  await page.locator("watchzone-card").evaluate((element, config) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig(config);
    card.hass = lightHass("off");

    function lightHass(state: "off" | "on") {
      return {
        states: {
          "camera.front": {
            entity_id: "camera.front",
            state: "streaming",
            attributes: { friendly_name: "Front Door" },
          },
          "light.porch": {
            entity_id: "light.porch",
            state,
            attributes: { brightness: 128, friendly_name: "Porch" },
          },
        },
        connection: { subscribeMessage: async () => () => undefined },
        callService: async () => undefined,
        callWS: async (message: { type: string }) =>
          message.type === "watchzone/live/camera/ready"
            ? { ready: false }
            : undefined,
        hassUrl: (path: string) => path,
      };
    }
  }, savedConfig);
  await page.locator("wzc-camera-live .viewport").hover();
  const icon = page.locator("wzc-light-control .light-button ha-icon");
  await expect
    .poll(() =>
      icon.evaluate(
        (element) => (element as HTMLElement & { icon?: string }).icon,
      ),
    )
    .toBe("mdi:coach-lamp");

  await page.locator("watchzone-card").evaluate((element) => {
    const card = element as HTMLElement & { hass: unknown };
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front Door" },
        },
        "light.porch": {
          entity_id: "light.porch",
          state: "on",
          attributes: { brightness: 128, friendly_name: "Porch" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      callService: async () => undefined,
      callWS: async (message: { type: string }) =>
        message.type === "watchzone/live/camera/ready"
          ? { ready: false }
          : undefined,
      hassUrl: (path: string) => path,
    };
  });
  await expect
    .poll(() =>
      icon.evaluate(
        (element) => (element as HTMLElement & { icon?: string }).icon,
      ),
    )
    .toBe("mdi:coach-lamp");
});

async function mountLightControl(
  page: Page,
  state: "off" | "on",
): Promise<void> {
  await page.goto("/");
  await waitForCard(page);
  await installHaIconFixture(page);
  await installHaControlSliderFixture(page);
  await page.locator("watchzone-card").evaluate((element, lightState) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.style.setProperty("--primary-color", "#03a9f4");
    card.setConfig({
      type: "custom:watchzone-card",
      cameras: [
        {
          entity_id: "camera.front",
          light_entity_ids: ["light.porch"],
        },
      ],
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front Door" },
        },
        "light.porch": {
          entity_id: "light.porch",
          state: lightState,
          attributes: { brightness: 128, friendly_name: "Porch" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      callService: async () => undefined,
      callWS: async (message: { type: string }) =>
        message.type === "watchzone/live/camera/ready"
          ? { ready: false }
          : undefined,
      hassUrl: (path: string) => path,
    };
  }, state);
  await page.locator("wzc-camera-live .viewport").hover();
  await expect(page.locator("wzc-light-control .light-button")).toBeVisible();
}

test("uses visibly different icons for off and on states", async ({ page }) => {
  await mountLightControl(page, "off");
  const offIcon = page.locator("wzc-light-control .light-button ha-icon");
  await expect(offIcon).toHaveCount(1);
  await expect
    .poll(() =>
      offIcon.evaluate(
        (element) => (element as HTMLElement & { icon?: string }).icon,
      ),
    )
    .toBe("mdi:lightbulb-off-outline");

  await mountLightControl(page, "on");
  const onIcon = page.locator("wzc-light-control .light-button ha-icon");
  await expect(onIcon).toHaveCount(1);
  await expect
    .poll(() =>
      onIcon.evaluate(
        (element) => (element as HTMLElement & { icon?: string }).icon,
      ),
    )
    .toBe("mdi:lightbulb");
});

test("uses the approved dimmer interaction and presentation contract", async ({
  page,
}) => {
  await mountLightControl(page, "on");
  const button = page.locator("wzc-light-control .light-button");
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(LIGHT_LONG_PRESS_WAIT_MS);
  await page.mouse.up();

  const panel = page.locator("wzc-light-control .dimmer-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("ha-control-slider")).toHaveCount(1);
  await expect(panel.locator(".brightness-value")).toHaveText("50%");
  await expect(panel.locator(".close-dimmer")).toHaveCount(0);
  await expect(panel).toHaveScreenshot("linked-light-dimmer-approved.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.1,
  });
  await page
    .locator("wzc-camera-live .viewport")
    .click({ position: { x: 8, y: 8 } });
  await expect(panel).not.toBeVisible();
});

test("requires an approved visual baseline for the light control", async ({
  page,
}) => {
  await mountLightControl(page, "on");
  await expect(page.locator("wzc-light-control .light-stack")).toHaveScreenshot(
    "linked-light-control-approved.png",
    { animations: "disabled" },
  );
});
