import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  CAMERA_CAROUSEL_NAVIGATION_HEIGHT_RATIO,
  CAMERA_CAROUSEL_NAVIGATION_MAX_SIZE_PX,
  CAMERA_CAROUSEL_NAVIGATION_MIN_SIZE_PX,
  CAMERA_OVERLAY_HIDE_DELAY_MS,
} from "../../src/modules/camera/constants";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
const expectedBuild = process.env.GITHUB_SHA?.slice(0, 7) ?? "local";
const expectedVersion = packageJson.version;
const LIGHT_LONG_PRESS_WAIT_MS = 500;
const pageErrors = new WeakMap<Page, string[]>();

function cssAlpha(color: string): number {
  const modern = color.match(/\/\s*([\d.]+)\s*\)$/);
  if (modern) return Number(modern[1]);
  const legacy = color.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/);
  return legacy ? Number(legacy[1]) : 1;
}

async function waitForWatchZoneDefinition(page: Page): Promise<void> {
  await page.waitForFunction(
    () => customElements.get("watchzone-card") !== undefined,
  );
}

async function installHaIconFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (customElements.get("ha-icon")) return;
    class TestHaIcon extends HTMLElement {
      private _icon?: string;

      public get icon(): string | undefined {
        return this._icon;
      }

      public set icon(value: string | undefined) {
        this._icon = value;
        this._render();
      }

      public connectedCallback(): void {
        this._render();
      }

      private _render(): void {
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        root.innerHTML = `<style>
          :host {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            inline-size: var(--mdc-icon-size, 24px);
            block-size: var(--mdc-icon-size, 24px);
          }
          svg { display: block; inline-size: 100%; block-size: 100%; }
        </style><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 2h10v20H7zM9 4v14h6V4zm2 15h2v1h-2z"></path>
        </svg>`;
      }
    }
    customElements.define("ha-icon", TestHaIcon);
  });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test("loads the responsive WatchZone card shell", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.goto("/");
  await waitForWatchZoneDefinition(page);

  await expect(page.locator("watchzone-card .shell")).toHaveAttribute(
    "aria-label",
    "WatchZone",
  );
  await expect(page.locator("watchzone-card ha-card")).toBeVisible();
  expect(
    consoleMessages.some(
      (message) =>
        message.includes("WatchZone") &&
        message.includes("CURRENT") &&
        message.includes(`v${expectedVersion} (${expectedBuild})`),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.wzc)).toMatchObject({
    activeCardVersion: expectedVersion,
    build: expectedBuild,
    version: expectedVersion,
  });
  expect(
    await page.evaluate(() => typeof window.wzc?.getLiveStartupTimings),
  ).toBe("function");
});

test("does not load camera code for a camera-free layout", async ({ page }) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);

  expect(
    await page.evaluate(() => ({
      cameraDefined: customElements.get("wzc-camera") !== undefined,
      cameraResources: performance
        .getEntriesByType("resource")
        .map(({ name }) => name)
        .filter(
          (name) =>
            name.includes("/modules/camera/") ||
            name.toLocaleLowerCase().includes("swiper"),
        ),
    })),
  ).toEqual({ cameraDefined: false, cameraResources: [] });
  await expect(page.locator("watchzone-card")).toContainText(
    "No modules are configured.",
  );
});

test("keeps the panel camera switcher and carousel selection bidirectional", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      cameras: [
        { entity_id: "camera.front", title: "Front Door" },
        { entity_id: "camera.back", title: "Back Yard" },
      ],
    });
  });

  const switcher = page.locator("wzc-camera-switcher");
  const buttons = switcher.locator("button");
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveText("Front Door");
  await expect(buttons.nth(0)).toHaveAttribute("aria-selected", "true");
  await page.locator("watchzone-card").evaluate((element) => {
    (element as HTMLElement).style.setProperty(
      "--wzc-color-text-reversed",
      "rgb(246, 247, 248)",
    );
    (element as HTMLElement).style.setProperty(
      "--ha-card-border-radius",
      "19px",
    );
    (element as HTMLElement).style.setProperty(
      "--ha-box-shadow-m",
      "rgb(20, 21, 22) 0px 4px 8px",
    );
    (element as HTMLElement).style.setProperty(
      "--ha-box-shadow-s",
      "rgb(30, 31, 32) 0px 1px 2px",
    );
  });
  await expect(buttons.nth(0)).toHaveCSS("color", "rgb(246, 247, 248)");
  await expect(switcher.locator(".track")).toHaveCSS("border-style", "none");
  await expect(switcher.locator(".scroller")).toHaveCSS(
    "box-shadow",
    "rgb(20, 21, 22) 0px 4px 8px 0px",
  );
  await expect(switcher.locator(".active-indicator")).toHaveCSS(
    "box-shadow",
    "rgb(30, 31, 32) 0px 1px 2px 0px",
  );
  await expect(page.locator("wzc-camera .camera-carousel")).toHaveCSS(
    "border-radius",
    "19px",
  );

  await buttons.nth(1).click();
  await expect(buttons.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(buttons.nth(0)).toHaveAttribute("aria-selected", "false");
  await expect
    .poll(() =>
      page
        .locator("wzc-camera-view")
        .evaluateAll((views) =>
          views.map(
            (view) => (view as HTMLElement & { active: boolean }).active,
          ),
        ),
    )
    .toEqual([false, true]);

  await page
    .locator("wzc-camera .carousel-navigation.previous")
    .click({ force: true });
  await expect(buttons.nth(0)).toHaveAttribute("aria-selected", "true");

  const cameraBox = await page.locator("wzc-camera").boundingBox();
  const panelBox = await page.locator("wzc-panel").boundingBox();
  const selectorBox = await switcher.boundingBox();
  expect(cameraBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(selectorBox).not.toBeNull();
  expect(panelBox?.y).toBeGreaterThanOrEqual(
    (cameraBox?.y ?? 0) + (cameraBox?.height ?? 0),
  );
  expect(panelBox?.height).toBeCloseTo(selectorBox?.height ?? 0, 1);

  await page.locator("watchzone-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      camera_bar_shadows: false,
      cameras: [
        { entity_id: "camera.front", title: "Front Door" },
        { entity_id: "camera.back", title: "Back Yard" },
      ],
    });
  });
  await expect(switcher.locator(".scroller")).not.toHaveClass(/shadows/);
  await expect(switcher.locator(".scroller")).toHaveCSS("box-shadow", "none");
  await expect(switcher.locator(".active-indicator")).toHaveCSS(
    "box-shadow",
    "none",
  );
});

test("restores the camera switcher after an inner-dashboard detach", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      cameras: [
        { entity_id: "camera.front", title: "Front Door" },
        { entity_id: "camera.back", title: "Back Yard" },
      ],
    });
  });

  const card = page.locator("watchzone-card");
  const switcher = card.locator("wzc-camera-switcher");
  await expect(switcher.locator("button")).toHaveCount(2);

  await card.evaluate((element) => {
    const parent = element.parentNode;
    if (!parent) throw new Error("WatchZone card has no parent");
    const marker = document.createComment("inner-dashboard-navigation");
    parent.insertBefore(marker, element);
    element.remove();
    parent.insertBefore(element, marker);
    marker.remove();
  });

  await expect(switcher.locator("button")).toHaveCount(2);
  await expect(switcher.locator('button[aria-selected="true"]')).toHaveText(
    "Front Door",
  );
  await switcher.locator("button").nth(1).click();
  await expect(switcher.locator("button").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("requests visibility for an active overflow camera", async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as typeof window & {
      __wzcScrollIntoViewOptions?: ScrollIntoViewOptions;
    };
    Element.prototype.scrollIntoView = function (options) {
      testWindow.__wzcScrollIntoViewOptions =
        typeof options === "object" ? options : undefined;
    };
  });
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      cameras: Array.from({ length: 8 }, (_, index) => ({
        entity_id: `camera.camera_${index}`,
        title: `Camera ${index + 1}`,
      })),
    });
  });

  const switcher = page.locator("wzc-camera-switcher");
  await expect(switcher.locator("button")).toHaveCount(8);
  await switcher.evaluate((element) => {
    element.style.inlineSize = "14rem";
  });
  await switcher
    .locator("button")
    .last()
    .evaluate((button) => (button as HTMLButtonElement).click());

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __wzcScrollIntoViewOptions?: ScrollIntoViewOptions;
            }
          ).__wzcScrollIntoViewOptions,
      ),
    )
    .toMatchObject({ block: "nearest", inline: "center" });
});

test("preserves expanded camera-stage geometry across carousel selection", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      cameras: [{ entity_id: "camera.front" }, { entity_id: "camera.back" }],
    });
  });
  await expect(page.locator("wzc-camera-view")).toHaveCount(2);
  await expect(page.locator("wzc-camera .camera-carousel")).toHaveClass(
    /swiper-initialized/,
  );
  const nextNavigation = page.locator("wzc-camera .carousel-navigation.next");
  await expect(nextNavigation).toBeHidden();
  await page.locator("wzc-camera-live .viewport").first().hover();
  await expect(nextNavigation).toBeVisible();

  const result = await page.locator("wzc-camera").evaluate(async (element) => {
    const camera = element as HTMLElement & {
      updateComplete: Promise<boolean>;
    };
    const views = [
      ...(camera.shadowRoot?.querySelectorAll<
        HTMLElement & {
          active: boolean;
          updateComplete: Promise<boolean>;
        }
      >("wzc-camera-view") ?? []),
    ];
    const stage = (view: HTMLElement): HTMLElement | undefined =>
      view.shadowRoot?.querySelector<HTMLElement>(".camera") ?? undefined;
    const firstHandle = views[0]?.shadowRoot?.querySelector<HTMLButtonElement>(
      ".stage-resize-handle",
    );
    const next = camera.shadowRoot?.querySelector<HTMLButtonElement>(
      ".carousel-navigation.next",
    );
    const previous = camera.shadowRoot?.querySelector<HTMLButtonElement>(
      ".carousel-navigation.previous",
    );
    const before = stage(views[0])?.getBoundingClientRect();

    firstHandle?.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "End",
      }),
    );
    await camera.updateComplete;
    await Promise.all(views.map((view) => view.updateComplete));
    const expandedFirst = stage(views[0])?.getBoundingClientRect();
    const expandedSecond = stage(views[1])?.getBoundingClientRect();

    next?.click();
    await camera.updateComplete;
    await Promise.all(views.map((view) => view.updateComplete));
    const selectedSecond = stage(views[1])?.getBoundingClientRect();
    const nextStyle = next ? getComputedStyle(next) : undefined;
    const carousel =
      camera.shadowRoot?.querySelector<HTMLElement>(".camera-carousel");
    const carouselRect = carousel?.getBoundingClientRect();
    const nextRect = next?.getBoundingClientRect();
    const previousRect = previous?.getBoundingClientRect();
    const previousIconRect = previous
      ?.querySelector("svg")
      ?.getBoundingClientRect();

    return {
      active: views.map((view) => view.active),
      beforeHeight: before?.height,
      expandedFirstHeight: expandedFirst?.height,
      expandedSecondHeight: expandedSecond?.height,
      navigation: {
        background: nextStyle?.backgroundColor,
        border: nextStyle?.borderTopWidth,
        carouselHeight: carouselRect?.height,
        carouselLeft: carouselRect?.left,
        carouselRight: carouselRect?.right,
        carouselTop: carouselRect?.top,
        iconHeight: previousIconRect?.height,
        nextTop: next?.getBoundingClientRect().top,
        nextRight: nextRect?.right,
        previousHeight: previousRect?.height,
        previousLeft: previousRect?.left,
        previousTop: previous?.getBoundingClientRect().top,
      },
      selectedSecondHeight: selectedSecond?.height,
    };
  });

  expect(result.expandedFirstHeight).toBeGreaterThan(result.beforeHeight ?? 0);
  expect(result.expandedSecondHeight).toBeCloseTo(
    result.expandedFirstHeight ?? 0,
    1,
  );
  expect(result.selectedSecondHeight).toBeCloseTo(
    result.expandedFirstHeight ?? 0,
    1,
  );
  expect(result.active).toEqual([false, true]);
  expect(result.navigation).toMatchObject({
    background: "rgba(0, 0, 0, 0)",
    border: "0px",
  });
  expect(result.navigation.nextTop).toBeCloseTo(
    result.navigation.previousTop ?? 0,
    1,
  );
  const previousInset =
    (result.navigation.previousLeft ?? 0) -
    (result.navigation.carouselLeft ?? 0);
  const nextInset =
    (result.navigation.carouselRight ?? 0) - (result.navigation.nextRight ?? 0);
  expect(previousInset).toBeGreaterThan(0);
  expect(previousInset).toBeCloseTo(nextInset, 1);
  expect(
    (result.navigation.previousTop ?? 0) +
      (result.navigation.previousHeight ?? 0) / 2,
  ).toBeCloseTo(
    (result.navigation.carouselTop ?? 0) +
      (result.navigation.carouselHeight ?? 0) / 2,
    1,
  );
  expect(result.navigation.iconHeight).toBeCloseTo(
    Math.min(
      CAMERA_CAROUSEL_NAVIGATION_MAX_SIZE_PX,
      Math.max(
        CAMERA_CAROUSEL_NAVIGATION_MIN_SIZE_PX,
        CAMERA_CAROUSEL_NAVIGATION_HEIGHT_RATIO *
          (result.navigation.carouselHeight ?? 0),
      ),
    ),
    1,
  );

  const previousNavigation = page.locator(
    "wzc-camera .carousel-navigation.previous",
  );
  await expect(previousNavigation).toBeHidden();
  await page.locator("wzc-camera-live .viewport").nth(1).hover();
  await expect(previousNavigation).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(previousNavigation).toBeHidden({
    timeout: CAMERA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
});

test("fills the camera overlay slot with talk, PTZ, and light controls", async ({
  page,
}) => {
  await installHaIconFixture(page);
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    const connection = {
      subscribeMessage: async () => () => undefined,
    };
    card.setConfig({
      type: "custom:watchzone-card",
      cameras: [
        {
          entity_id: "camera.front",
          lights: [{ entity_id: "light.porch", icon: "mdi:cellphone" }],
          ptz_enabled: true,
          two_way_talk_enabled: true,
        },
      ],
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
        "light.porch": {
          entity_id: "light.porch",
          state: "on",
          attributes: { brightness: 128, friendly_name: "Porch" },
        },
      },
      connection,
      hassUrl: (path: string) => path,
      callService: async (
        domain: string,
        service: string,
        data: Record<string, unknown> | undefined,
        target: Record<string, unknown> | undefined,
      ) => {
        (
          window as unknown as {
            lightCalls?: unknown[];
          }
        ).lightCalls ??= [];
        (
          window as unknown as {
            lightCalls: unknown[];
          }
        ).lightCalls.push({ data, domain, service, target });
      },
      callWS: async (message: { type: string }) => {
        if (message.type === "watchzone/live/camera/ready") {
          return { ready: false };
        }
        if (message.type === "watchzone/talk/capability") {
          return { supported: true };
        }
        if (message.type === "watchzone/ptz/capability") {
          return {
            supported: true,
            pan: true,
            tilt: true,
            zoom: false,
            focus: false,
            presets: [],
          };
        }
        return undefined;
      },
    };
  });

  const camera = page.locator("wzc-camera");
  await camera.locator("wzc-camera-live .viewport").hover();
  const talk = page.locator("wzc-two-way-talk");
  const ptz = page.locator("wzc-ptz");
  const lights = page.locator("wzc-light-control");
  const talkButton = talk.locator("button.inactive");
  const ptzControl = ptz.locator(".ptz-control.visible");
  const lightButton = lights.locator(".light-button");
  const talkIcon = talkButton.locator(":scope > svg");
  const lightIcon = lightButton.locator(":scope > ha-icon svg");
  await expect(talkButton).toBeVisible();
  await expect(ptzControl).toBeVisible();
  await expect(lightButton).toBeVisible();
  await expect(lightIcon).toBeVisible();
  await expect(lightButton).toHaveAttribute("title", "Turn off Porch");
  await expect(lightButton).toHaveAttribute("aria-label", "Turn off Porch");

  const [
    cameraBox,
    talkHostBox,
    ptzHostBox,
    lightHostBox,
    talkButtonBox,
    talkIconBox,
    ptzControlBox,
    lightButtonBox,
    lightIconBox,
  ] = await Promise.all([
    camera.boundingBox(),
    talk.boundingBox(),
    ptz.boundingBox(),
    lights.boundingBox(),
    talkButton.boundingBox(),
    talkIcon.boundingBox(),
    ptzControl.boundingBox(),
    lightButton.boundingBox(),
    lightIcon.boundingBox(),
  ]);
  expect(cameraBox).not.toBeNull();
  expect(talkHostBox).not.toBeNull();
  expect(ptzHostBox).not.toBeNull();
  expect(lightHostBox).not.toBeNull();
  expect(talkButtonBox).not.toBeNull();
  expect(talkIconBox).not.toBeNull();
  expect(ptzControlBox).not.toBeNull();
  expect(lightButtonBox).not.toBeNull();
  expect(lightIconBox).not.toBeNull();
  if (
    !cameraBox ||
    !talkHostBox ||
    !ptzHostBox ||
    !lightHostBox ||
    !talkButtonBox ||
    !talkIconBox ||
    !ptzControlBox ||
    !lightButtonBox ||
    !lightIconBox
  ) {
    return;
  }

  expect(talkHostBox.height).toBeCloseTo(cameraBox.height, 0);
  expect(ptzHostBox.height).toBeCloseTo(cameraBox.height, 0);
  expect(talkHostBox.y).toBeCloseTo(cameraBox.y, 0);
  expect(ptzHostBox.y).toBeCloseTo(cameraBox.y, 0);
  expect(lightHostBox.height).toBeCloseTo(cameraBox.height, 0);
  expect(lightHostBox.y).toBeCloseTo(cameraBox.y, 0);
  expect(talkButtonBox.y).toBeGreaterThan(cameraBox.y + cameraBox.height / 2);
  expect(talkButtonBox.x + talkButtonBox.width / 2).toBeCloseTo(
    cameraBox.x + cameraBox.width / 2,
    0,
  );
  expect(ptzControlBox.x).toBeGreaterThan(cameraBox.x + cameraBox.width / 2);
  expect(ptzControlBox.y).toBeGreaterThan(cameraBox.y + cameraBox.height / 2);
  expect(ptzControlBox.y + ptzControlBox.height).toBeLessThanOrEqual(
    cameraBox.y + cameraBox.height,
  );
  expect(lightButtonBox.x + lightButtonBox.width).toBeLessThan(talkButtonBox.x);
  expect(lightButtonBox.width).toBeCloseTo(talkButtonBox.width, 1);
  expect(lightButtonBox.height).toBeCloseTo(talkButtonBox.height, 1);
  const [talkButtonColor, lightButtonColor] = await Promise.all([
    talkButton.evaluate((element) => getComputedStyle(element).color),
    lightButton.evaluate((element) => getComputedStyle(element).color),
  ]);
  expect(talkButtonColor).toBe(lightButtonColor);
  expect(lightIconBox.width).toBeCloseTo(talkIconBox.width, 1);
  expect(lightIconBox.height).toBeCloseTo(talkIconBox.height, 1);
  expect(lightIconBox.x + lightIconBox.width / 2).toBeCloseTo(
    lightButtonBox.x + lightButtonBox.width / 2,
    1,
  );
  expect(lightIconBox.y + lightIconBox.height / 2).toBeCloseTo(
    lightButtonBox.y + lightButtonBox.height / 2,
    1,
  );
  expect(talkIconBox.x + talkIconBox.width / 2).toBeCloseTo(
    talkButtonBox.x + talkButtonBox.width / 2,
    1,
  );
  expect(talkIconBox.y + talkIconBox.height / 2).toBeCloseTo(
    talkButtonBox.y + talkButtonBox.height / 2,
    1,
  );

  await Promise.all([
    talk.evaluate((element) =>
      element.style.setProperty("--wzc-round-button-size", "2rem"),
    ),
    lights.evaluate((element) =>
      element.style.setProperty("--wzc-round-button-size", "2rem"),
    ),
  ]);
  const [
    resizedTalkButton,
    resizedTalkIcon,
    resizedLightButton,
    resizedLightIcon,
  ] = await Promise.all([
    talkButton.boundingBox(),
    talkIcon.boundingBox(),
    lightButton.boundingBox(),
    lightIcon.boundingBox(),
  ]);
  expect(resizedTalkButton?.width).toBeCloseTo(32, 1);
  expect(resizedLightButton?.width).toBeCloseTo(32, 1);
  expect(resizedTalkIcon?.width).toBeCloseTo(resizedLightIcon?.width ?? 0, 1);
  expect(resizedTalkIcon?.height).toBeCloseTo(resizedLightIcon?.height ?? 0, 1);
  expect(
    (resizedTalkIcon?.x ?? 0) + (resizedTalkIcon?.width ?? 0) / 2,
  ).toBeCloseTo(
    (resizedTalkButton?.x ?? 0) + (resizedTalkButton?.width ?? 0) / 2,
    1,
  );
  expect(
    (resizedLightIcon?.x ?? 0) + (resizedLightIcon?.width ?? 0) / 2,
  ).toBeCloseTo(
    (resizedLightButton?.x ?? 0) + (resizedLightButton?.width ?? 0) / 2,
    1,
  );
  await Promise.all([
    talk.evaluate((element) =>
      element.style.removeProperty("--wzc-round-button-size"),
    ),
    lights.evaluate((element) =>
      element.style.removeProperty("--wzc-round-button-size"),
    ),
  ]);
  const interactionLightButtonBox = await lightButton.boundingBox();
  expect(interactionLightButtonBox).not.toBeNull();
  if (!interactionLightButtonBox) return;

  await page.mouse.move(
    interactionLightButtonBox.x + interactionLightButtonBox.width / 2,
    interactionLightButtonBox.y + interactionLightButtonBox.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(LIGHT_LONG_PRESS_WAIT_MS);
  await page.mouse.up();
  const dimmer = lights.locator(".dimmer-panel");
  await expect(dimmer).toBeVisible();
  const slider = dimmer.locator("ha-control-slider");
  await expect(slider).toHaveAttribute("vertical", "");
  await expect(slider).toHaveAttribute("show-handle", "");
  await expect(slider).toHaveAttribute("tooltip-mode", "interaction");
  await slider.evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        detail: { value: 70 },
      }),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              lightCalls?: Array<{ data?: { brightness_pct?: number } }>;
            }
          ).lightCalls?.at(-1)?.data?.brightness_pct,
      ),
    )
    .toBe(70);
});

test("aligns phone carousel controls and stage handle to the active stage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      cameras: [{ entity_id: "camera.front" }, { entity_id: "camera.back" }],
    });
  });
  await expect(page.locator("wzc-camera-view")).toHaveCount(2);

  const geometry = await page
    .locator("wzc-camera")
    .evaluate(async (element) => {
      const camera = element as HTMLElement & {
        updateComplete: Promise<boolean>;
      };
      const view = camera.shadowRoot?.querySelector<
        HTMLElement & { updateComplete: Promise<boolean> }
      >("wzc-camera-view");
      const presentation = view?.shadowRoot?.querySelector<
        HTMLElement & {
          requestUpdate(): void;
          selected?: "hls" | "webrtc";
          transport?: "hls_native" | "hls_mse" | "webrtc";
          updateComplete: Promise<boolean>;
        }
      >("wzc-camera-live");
      if (!view || !presentation)
        throw new Error("Camera view was not rendered");
      presentation.selected = "hls";
      presentation.transport = "hls_native";
      presentation.requestUpdate();
      await presentation.updateComplete;
      await camera.updateComplete;

      const stage = view.shadowRoot?.querySelector<HTMLElement>(".camera");
      const handle = view.shadowRoot?.querySelector<HTMLElement>(
        ".stage-resize-handle",
      );
      const controls = presentation.shadowRoot?.querySelector<HTMLElement>(
        "wzc-camera-controls",
      );
      const controlButton =
        controls?.shadowRoot?.querySelector<HTMLElement>(".control-button");
      const carousel =
        camera.shadowRoot?.querySelector<HTMLElement>(".camera-carousel");
      const previous = camera.shadowRoot?.querySelector<HTMLElement>(
        ".carousel-navigation.previous",
      );
      const next = camera.shadowRoot?.querySelector<HTMLElement>(
        ".carousel-navigation.next",
      );
      const rect = (target?: HTMLElement | null) =>
        target?.getBoundingClientRect();
      return {
        carousel: rect(carousel),
        control: rect(controlButton),
        handle: rect(handle),
        next: rect(next),
        previous: rect(previous),
        stage: rect(stage),
      };
    });

  const stageCenterX =
    (geometry.stage?.left ?? 0) + (geometry.stage?.width ?? 0) / 2;
  const stageCenterY =
    (geometry.stage?.top ?? 0) + (geometry.stage?.height ?? 0) / 2;
  expect(
    (geometry.handle?.left ?? 0) + (geometry.handle?.width ?? 0) / 2,
  ).toBeCloseTo(stageCenterX, 0);
  const handleBottomInset =
    (geometry.stage?.bottom ?? 0) - (geometry.handle?.bottom ?? 0);
  expect(handleBottomInset).toBeGreaterThanOrEqual(0);
  expect(handleBottomInset).toBeLessThan(5);
  expect(
    (geometry.next?.top ?? 0) + (geometry.next?.height ?? 0) / 2,
  ).toBeCloseTo(stageCenterY, 1);
  expect(
    (geometry.previous?.top ?? 0) + (geometry.previous?.height ?? 0) / 2,
  ).toBeCloseTo(stageCenterY, 1);
  expect(geometry.control?.left ?? 0).toBeGreaterThan(
    geometry.next?.right ?? 0,
  );
  const previousInset =
    (geometry.previous?.left ?? 0) - (geometry.carousel?.left ?? 0);
  const nextInset =
    (geometry.carousel?.right ?? 0) - (geometry.next?.right ?? 0);
  expect(previousInset).toBeCloseTo(nextInset, 1);
});

test("fits phone, tablet, and desktop viewports without horizontal overflow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await waitForWatchZoneDefinition(page);
    await expect(page.locator("watchzone-card ha-card")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("applies outer shell appearance toggles without changing card identity", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);

  const result = await page
    .locator("watchzone-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement & {
        setConfig(config: unknown): void;
        updateComplete: Promise<boolean>;
      };
      const shellBefore = card.shadowRoot?.querySelector("ha-card");
      card.style.setProperty("--ha-box-shadow-m", "rgb(1, 2, 3) 0px 4px 8px");
      card.setConfig({
        type: "custom:watchzone-card",
        title: "Appearance",
        rounded_outer_corners: false,
        outer_shadows: false,
      });
      await card.updateComplete;
      const shellAfter = card.shadowRoot?.querySelector("ha-card");
      const disabledStyle = shellAfter
        ? getComputedStyle(shellAfter)
        : undefined;
      const disabledHostStyle = getComputedStyle(card);
      const disabledCardPadding = disabledStyle?.padding;
      const disabledShellPadding = shellAfter?.querySelector(".shell")
        ? getComputedStyle(shellAfter.querySelector(".shell") as Element)
            .padding
        : undefined;
      const disabled = {
        borderRadius: disabledStyle?.borderRadius,
        boxShadow: disabledStyle?.boxShadow,
        classes: shellAfter?.className,
        hostBorderRadius: disabledHostStyle.borderRadius,
        hostBoxShadow: disabledHostStyle.boxShadow,
        identityRetained: shellAfter === shellBefore,
        cardPadding: disabledCardPadding,
        shellPadding: disabledShellPadding,
      };
      card.setConfig({
        type: "custom:watchzone-card",
        title: "Appearance",
      });
      await card.updateComplete;
      const enabledStyle = shellAfter
        ? getComputedStyle(shellAfter)
        : undefined;
      const enabledHostStyle = getComputedStyle(card);
      const enabledCardPadding = enabledStyle?.padding;
      const enabledShellPadding = shellAfter?.querySelector(".shell")
        ? getComputedStyle(shellAfter.querySelector(".shell") as Element)
            .padding
        : undefined;
      return {
        disabled,
        enabled: {
          borderRadius: enabledStyle?.borderRadius,
          boxShadow: enabledStyle?.boxShadow,
          classes: shellAfter?.className,
          hostBorderRadius: enabledHostStyle.borderRadius,
          hostBoxShadow: enabledHostStyle.boxShadow,
          nativeRadiusToken: enabledHostStyle
            .getPropertyValue("--ha-card-border-radius")
            .trim(),
          nativeShadowToken: enabledHostStyle
            .getPropertyValue("--ha-card-box-shadow")
            .trim(),
          cardPadding: enabledCardPadding,
          shellPadding: enabledShellPadding,
        },
      };
    });

  expect(result.disabled).toMatchObject({
    borderRadius: "0px",
    boxShadow: "none",
    classes: "square-outer-corners no-outer-shadow",
    hostBorderRadius: "0px",
    hostBoxShadow: "none",
    identityRetained: true,
    shellPadding: "0px",
  });
  expect(result.enabled).toMatchObject({
    classes: "",
    nativeRadiusToken: "",
    nativeShadowToken: "rgb(1, 2, 3) 0px 4px 8px",
  });
  expect(result.enabled.borderRadius).not.toBe("0px");
  expect(result.enabled.hostBorderRadius).not.toBe("0px");
  expect(result.enabled.boxShadow).toContain("rgb(1, 2, 3)");
  expect(result.enabled.hostBoxShadow).toContain("rgb(1, 2, 3)");
  expect(result.disabled.cardPadding).not.toBe("0px");
  expect(result.enabled.cardPadding).not.toBe("0px");
  expect(result.enabled.shellPadding).toBe("0px");
});

test("exposes and honors the WatchZone semantic theme-token contract", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);

  const result = await page.locator("watchzone-card").evaluate((element) => {
    const requiredTokens = [
      "--wzc-color-primary",
      "--wzc-color-primary-dark",
      "--wzc-color-accent",
      "--wzc-color-text-1",
      "--wzc-color-text-2",
      "--wzc-color-text-3",
      "--wzc-color-text-reversed",
      "--wzc-color-error",
      "--wzc-color-warning",
      "--wzc-color-success",
      "--wzc-color-border",
      "--wzc-radius-card",
      "--wzc-shadow-card",
      "--wzc-shadow-small",
      "--wzc-shadow-medium",
      "--wzc-card-outer-shadow",
      "--wzc-camera-stage",
      "--wzc-live-radius",
      "--wzc-live-shadow",
      "--wzc-media-overlay-opacity",
      "--wzc-media-overlay-hover-opacity",
      "--wzc-media-overlay-surface",
      "--wzc-media-overlay-border-color",
    ];
    const host = element as HTMLElement;
    host.style.setProperty("--wzc-color-text-1", "rgb(10, 20, 30)");
    host.style.setProperty("--wzc-card-background", "rgb(40, 50, 60)");
    host.style.setProperty("--wzc-card-radius", "18px");
    host.style.setProperty(
      "--wzc-card-outer-shadow",
      "rgb(1, 2, 3) 0px 4px 8px",
    );
    const hostStyle = getComputedStyle(host);
    const shell = host.shadowRoot?.querySelector("ha-card");
    const shellStyle = shell ? getComputedStyle(shell) : undefined;
    return {
      background: shellStyle?.backgroundColor,
      borderRadius: shellStyle?.borderRadius,
      boxShadow: shellStyle?.boxShadow,
      missingTokens: requiredTokens.filter(
        (token) => hostStyle.getPropertyValue(token).trim().length === 0,
      ),
      textColor: shellStyle?.color,
      overlayOpacity: hostStyle
        .getPropertyValue("--wzc-media-overlay-opacity")
        .trim(),
      overlayHoverOpacity: hostStyle
        .getPropertyValue("--wzc-media-overlay-hover-opacity")
        .trim(),
    };
  });

  expect(result).toMatchObject({
    background: "rgb(40, 50, 60)",
    borderRadius: "18px",
    missingTokens: [],
    overlayHoverOpacity: "84%",
    overlayOpacity: "72%",
    textColor: "rgb(10, 20, 30)",
  });
  expect(result.boxShadow).toContain("rgb(1, 2, 3)");
});

test("camera selection does not recursively republish dirty state", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);

  const result = await page.evaluate(async () => {
    interface ContextRequest extends Event {
      callback?: (context: {
        setState(config: unknown, key: string): void;
      }) => void;
      context?: string;
      subscribe?: boolean;
    }

    interface TestEditor extends HTMLElement {
      setConfig(config: unknown): void;
      updateComplete: Promise<boolean>;
    }

    interface TestCardConstructor extends CustomElementConstructor {
      getConfigElement(): Promise<TestEditor>;
    }

    interface PreviewCard extends HTMLElement {
      preview: boolean;
      setConfig(config: unknown): void;
    }

    interface TestDialog extends HTMLElement {
      _cardConfig?: Record<string, unknown>;
      _updateDirtyState?(config: unknown): void;
    }

    let callback: ContextRequest["callback"];
    let subscribed = false;
    let writes = 0;
    const setState = (): void => {
      writes += 1;
      if (subscribed) {
        callback?.({ setState });
      }
    };
    const handleContext = (event: Event): void => {
      const request = event as ContextRequest;
      if (request.context === "dirtyState") {
        subscribed = request.subscribe === true;
        callback = request.callback;
        callback?.({ setState });
      }
    };
    document.addEventListener("context-request", handleContext);

    const cardConstructor = customElements.get(
      "watchzone-card",
    ) as TestCardConstructor;
    const previewCard = document.querySelector("watchzone-card") as PreviewCard;
    previewCard.preview = true;
    previewCard.setConfig({
      type: "custom:watchzone-card",
      title: "Camera",
    });
    const editor = await cardConstructor.getConfigElement();
    editor.setConfig({
      type: "custom:watchzone-card",
      title: "Camera",
    });
    const dialog = document.createElement("hui-dialog-edit-card") as TestDialog;
    dialog._cardConfig = {
      type: "custom:watchzone-card",
      title: "Camera",
    };
    dialog._updateDirtyState = () => undefined;
    const root = dialog.attachShadow({ mode: "open" });
    const save = document.createElement("button");
    save.slot = "primaryAction";
    root.append(editor, save);
    document.body.append(dialog);
    await editor.updateComplete;
    (editor.shadowRoot?.querySelector(".add-camera") as HTMLElement).click();
    await editor.updateComplete;
    editor.shadowRoot
      ?.querySelector(".camera-editor-dialog ha-selector")
      ?.dispatchEvent(
        new CustomEvent("value-changed", {
          detail: { value: "camera.front" },
          bubbles: true,
          composed: true,
        }),
      );
    editor.shadowRoot
      ?.querySelector(".camera-editor-dialog form")
      ?.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
    await new Promise(requestAnimationFrame);
    const previewUpdated = !document
      .querySelector("watchzone-card")
      ?.shadowRoot?.textContent?.includes(
        "Select a camera in the card editor.",
      );
    save.click();
    const writesBeforeReopen = writes;

    const reopened = await cardConstructor.getConfigElement();
    reopened.setConfig(dialog._cardConfig);
    document.body.append(reopened);
    await reopened.updateComplete;
    const reopenedCamera = reopened.shadowRoot
      ?.querySelector("wzc-sortable-tile")
      ?.getAttribute("item-key");
    const savedCameras = dialog._cardConfig?.cameras as
      Array<{ entity_id?: string }> | undefined;

    document.removeEventListener("context-request", handleContext);
    return {
      previewUpdated,
      reopenedCamera,
      savedCamera: savedCameras?.[0]?.entity_id,
      subscribed,
      writes,
      writesBeforeReopen,
    };
  });

  expect(result).toEqual({
    previewUpdated: true,
    reopenedCamera: "camera.front",
    savedCamera: "camera.front",
    subscribed: false,
    writes: 3,
    writesBeforeReopen: 2,
  });
});

test("editor uses exclusive accordions and shared draft status", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.evaluate(async () => {
    const constructor = customElements.get(
      "watchzone-card",
    ) as typeof HTMLElement & {
      getConfigElement(): Promise<
        HTMLElement & {
          setConfig(config: unknown): void;
          updateComplete: Promise<boolean>;
        }
      >;
    };
    const editor = await constructor.getConfigElement();
    editor.id = "accordion-editor";
    editor.setConfig({
      type: "custom:watchzone-card",
      title: "Accordion",
    });
    document.body.append(editor);
    await editor.updateComplete;
  });

  const editor = page.locator("#accordion-editor");
  const items = editor.locator("wzc-accordion-item");
  await expect(items).toHaveCount(3);
  await expect(items.locator("details[open]")).toHaveCount(0);
  await items.nth(0).locator("summary").click();
  await expect(items.nth(0).locator("details")).toHaveAttribute("open", "");
  await items.nth(1).locator("summary").click();
  await expect(items.nth(0).locator("details")).not.toHaveAttribute("open", "");
  await expect(items.nth(1).locator("details")).toHaveAttribute("open", "");

  const status = editor.locator(
    'wzc-toast-region .toast[data-severity="success"]',
  );
  await expect(status).toContainText("No pending changes.");
  await expect(status).toHaveCSS("backdrop-filter", "none");
  await editor.evaluate(async (element) => {
    const input = element.shadowRoot?.querySelector("ha-input") as
      (HTMLElement & { value: string }) | undefined;
    if (!input) throw new Error("Editor title input was not rendered");
    input.value = "Changed";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await (element as HTMLElement & { updateComplete: Promise<boolean> })
      .updateComplete;
  });
  await expect(
    editor.locator('wzc-toast-region .toast[data-severity="warning"]'),
  ).toContainText("Unsaved changes");
});

test("camera editor configures lights and confirms accessible removal", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.evaluate(async () => {
    const constructor = customElements.get(
      "watchzone-card",
    ) as typeof HTMLElement & {
      getConfigElement(): Promise<
        HTMLElement & {
          setConfig(config: unknown): void;
          updateComplete: Promise<boolean>;
        }
      >;
    };
    const editor = await constructor.getConfigElement();
    editor.id = "camera-config-editor";
    editor.setConfig({
      type: "custom:watchzone-card",
      cameras: [{ entity_id: "camera.front" }],
    });
    document.body.append(editor);
    await editor.updateComplete;
  });

  const editor = page.locator("#camera-config-editor");
  await editor.locator("wzc-accordion-item").first().locator("summary").click();
  await editor.locator('[aria-label="Edit camera: front"]').click();

  const items = editor.locator(".camera-dialog-accordion > wzc-accordion-item");
  await expect(items).toHaveCount(5);
  await expect(items.locator(".heading")).toHaveText([
    "Camera",
    "Connection Source",
    "Additional Camera",
    "Lights",
    "Options and Controls",
  ]);
  await expect(items.nth(0).locator("details")).toHaveAttribute("open", "");
  await expect(items.nth(1).locator(".summary-text")).toHaveText(
    "Home Assistant",
  );
  const compactHeader = await items.nth(1).locator("summary").boundingBox();
  expect(compactHeader?.height).toBeLessThanOrEqual(44);

  await items.nth(3).locator("summary").click();
  await editor.locator(".add-light").click();
  await expect(editor.locator(".add-light-form")).toContainText("Linked Light");
  const addLightFields = editor.locator(".add-light-field");
  await expect(addLightFields).toHaveCount(2);
  const [lightFieldBox, iconFieldBox] = await Promise.all([
    addLightFields.nth(0).boundingBox(),
    addLightFields.nth(1).boundingBox(),
  ]);
  expect(lightFieldBox).not.toBeNull();
  expect(iconFieldBox).not.toBeNull();
  expect(iconFieldBox?.y).toBeCloseTo(lightFieldBox?.y ?? 0, 1);
  expect(iconFieldBox?.height).toBeCloseTo(lightFieldBox?.height ?? 0, 1);
  await editor.locator(".pending-light-selector").evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        composed: true,
        detail: { value: "light.porch" },
      }),
    );
  });
  await editor.locator(".pending-light-icon-selector").evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        composed: true,
        detail: { value: "mdi:coach-lamp" },
      }),
    );
  });
  await editor.locator('.add-light-form ha-button[variant="brand"]').click();
  await expect(editor.locator(".linked-light-row")).toHaveCount(1);
  await expect(
    editor.locator(".linked-light-row .light-icon-selector"),
  ).toHaveCount(1);
  await expect(editor.locator(".remove-light")).toHaveAttribute(
    "title",
    "Remove light",
  );

  await editor.locator(".add-light").click();
  await editor.locator(".pending-light-selector").evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        composed: true,
        detail: { value: "light.porch" },
      }),
    );
  });
  await expect(editor.locator(".add-light-feedback")).toContainText(
    "already linked",
  );
  expect(
    await editor
      .locator('.add-light-form ha-button[variant="brand"]')
      .evaluate(
        (element) => (element as HTMLElement & { disabled?: boolean }).disabled,
      ),
  ).toBe(true);
  await editor.locator('.add-light-form ha-button[variant="neutral"]').click();

  const titleInput = editor.locator(".camera-title-field ha-input");
  await expect(titleInput).toHaveAttribute("label", "Camera Name");
  await expect(titleInput).toHaveAttribute(
    "placeholder",
    "Display name (optional)",
  );
  await titleInput.evaluate((element) => {
    const input = element as HTMLElement & { value: string };
    input.value = "  Front!  Door @12345678901234567890";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  });
  await expect(editor.locator(".character-count")).toHaveText("24/24");
  await editor
    .locator('ha-button[appearance="accent"][variant="brand"]')
    .click();
  await expect(editor.locator(".camera-tile-copy span")).toHaveText(
    "Front Door 1234567890123",
  );
  const editAction = editor.locator('[title="Edit Camera"]');
  const removeAction = editor.locator('[title="Remove camera"]');
  await expect(editAction).toHaveAttribute(
    "aria-label",
    "Edit camera: Front Door 1234567890123",
  );
  await expect(removeAction).toHaveAttribute(
    "aria-label",
    "Remove camera: Front Door 1234567890123",
  );
  await removeAction.click();
  const removeDialog = editor.locator(".remove-camera-dialog");
  await expect(removeDialog).toBeVisible();
  await expect(removeDialog).toContainText("Remove camera?");
  await removeDialog.locator('ha-button[variant="neutral"]').click();
  await expect(removeDialog).not.toBeVisible();
  await expect(editor.locator("wzc-sortable-tile")).toHaveCount(1);
  await removeAction.click();
  await removeDialog.locator('ha-button[variant="danger"]').click();
  await expect(editor.locator("wzc-sortable-tile")).toHaveCount(0);
});

test("editor camera drag handles reorder the configured cameras", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.evaluate(async () => {
    const constructor = customElements.get(
      "watchzone-card",
    ) as typeof HTMLElement & {
      getConfigElement(): Promise<
        HTMLElement & {
          setConfig(config: unknown): void;
          updateComplete: Promise<boolean>;
        }
      >;
    };
    const editor = await constructor.getConfigElement();
    editor.id = "sortable-editor";
    editor.setConfig({
      type: "custom:watchzone-card",
      cameras: [
        { entity_id: "camera.first" },
        { entity_id: "camera.second" },
        { entity_id: "camera.third" },
      ],
    });
    document.body.append(editor);
    await editor.updateComplete;
  });

  const editor = page.locator("#sortable-editor");
  await editor.locator("wzc-accordion-item").first().locator("summary").click();
  const tiles = editor.locator("wzc-sortable-tile");
  const thirdTile = tiles.nth(2);
  const thirdHandle = thirdTile.locator(".handle");
  const firstTile = tiles.nth(0);
  const start = await thirdHandle.boundingBox();
  const target = await firstTile.boundingBox();
  expect(start).not.toBeNull();
  expect(target).not.toBeNull();
  if (!start || !target) return;

  await thirdTile.evaluate((element) => {
    const observer = new MutationObserver(() => {
      if (!element.hasAttribute("settle-lifted")) return;
      element.dataset.sawSettle = "true";
      const tile = element.shadowRoot?.querySelector(".tile");
      if (tile instanceof HTMLElement) {
        element.dataset.settleTransitionDuration =
          getComputedStyle(tile).transitionDuration;
      }
      observer.disconnect();
    });
    observer.observe(element, {
      attributeFilter: ["settle-lifted"],
      attributes: true,
    });

    const handle = element.shadowRoot?.querySelector(".handle");
    handle?.addEventListener(
      "pointerup",
      () => {
        const positions: number[] = [];
        const startedAt = performance.now();
        const sample = (): void => {
          const tile = element.shadowRoot?.querySelector(".tile");
          if (tile instanceof HTMLElement) {
            positions.push(tile.getBoundingClientRect().top);
          }
          if (performance.now() - startedAt < 300) {
            requestAnimationFrame(sample);
            return;
          }
          element.dataset.settlePositions = JSON.stringify(positions);
        };
        requestAnimationFrame(sample);
      },
      { once: true },
    );
  });

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height * 0.25,
    { steps: 12 },
  );
  const preReleasePosition = await thirdTile.evaluate((element) => {
    const tile = element.shadowRoot?.querySelector(".tile");
    if (!(tile instanceof HTMLElement)) {
      throw new Error("Sortable tile surface was not rendered");
    }
    return tile.getBoundingClientRect().top;
  });
  await page.mouse.up();

  await expect(tiles.nth(0)).toHaveAttribute("item-key", "camera.third");
  await expect(tiles.nth(1)).toHaveAttribute("item-key", "camera.first");
  await expect(tiles.nth(2)).toHaveAttribute("item-key", "camera.second");
  const movedTile = editor.locator(
    'wzc-sortable-tile[item-key="camera.third"]',
  );
  await expect(movedTile).toHaveAttribute("data-saw-settle", "true");
  await expect(movedTile).toHaveAttribute(
    "data-settle-transition-duration",
    /^0s(?:, 0s)*$/,
  );
  await expect(movedTile).toHaveAttribute("data-settle-positions", /\[/);
  const positions = await movedTile.evaluate((element) =>
    JSON.parse(element.dataset.settlePositions ?? "[]"),
  );
  expect(positions.length).toBeGreaterThan(4);
  expect(Math.abs((positions[0] ?? 0) - preReleasePosition)).toBeLessThan(3);
  const finalPosition = positions.at(-1) ?? 0;
  let previousDistance = Number.POSITIVE_INFINITY;
  for (const position of positions) {
    const distance = Math.abs(position - finalPosition);
    expect(distance).toBeLessThanOrEqual(previousDistance + 1.5);
    previousDistance = distance;
  }
});

test("round-trips boolean toggles through defaults before Save", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);

  const result = await page.evaluate(async () => {
    interface ContextRequest extends Event {
      callback?: (context: {
        setState(config: Record<string, unknown>, key: string): void;
      }) => void;
      context?: string;
    }
    interface TestEditor extends HTMLElement {
      setConfig(config: unknown): void;
      updateComplete: Promise<boolean>;
    }
    interface TestCard extends HTMLElement {
      preview: boolean;
      setConfig(config: unknown): void;
      updateComplete: Promise<boolean>;
    }
    interface TestCardConstructor extends CustomElementConstructor {
      getConfigElement(): Promise<TestEditor>;
    }
    interface TestDialog extends HTMLElement {
      _cardConfig?: Record<string, unknown>;
      _updateDirtyState?(config: unknown): void;
    }

    let latestDirtyState: Record<string, unknown> | undefined;
    const handleContext = (event: Event): void => {
      const request = event as ContextRequest;
      if (request.context === "dirtyState") {
        request.callback?.({
          setState: (config) => {
            latestDirtyState = config;
          },
        });
      }
    };
    document.addEventListener("context-request", handleContext);

    const baseline = {
      type: "custom:watchzone-card",
      title: "Appearance",
      cameras: [{ entity_id: "camera.front" }],
    };
    const card = document.querySelector("watchzone-card") as TestCard;
    card.preview = true;
    card.setConfig(baseline);
    const constructor = customElements.get(
      "watchzone-card",
    ) as TestCardConstructor;
    const editor = await constructor.getConfigElement();
    editor.setConfig(baseline);
    const dialog = document.createElement("hui-dialog-edit-card") as TestDialog;
    dialog._cardConfig = baseline;
    dialog._updateDirtyState = () => undefined;
    const root = dialog.attachShadow({ mode: "open" });
    const save = document.createElement("button");
    save.slot = "primaryAction";
    root.append(editor, save);
    document.body.append(dialog);
    await Promise.all([card.updateComplete, editor.updateComplete]);

    const openCameraEditor = async (): Promise<void> => {
      (
        editor.shadowRoot?.querySelector(
          '[aria-label="Edit camera: front"]',
        ) as HTMLElement
      ).click();
      await editor.updateComplete;
    };
    const cameraSelector = (key: string): Element | null | undefined =>
      editor.shadowRoot?.querySelector(`[data-camera-config-key="${key}"]`);
    const submitCamera = async (): Promise<void> => {
      editor.shadowRoot
        ?.querySelector(".camera-editor-dialog form")
        ?.dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true }),
        );
      await editor.updateComplete;
    };

    await openCameraEditor();
    const pcAudioSelector = cameraSelector("start_live_unmuted_pc_tablet");
    pcAudioSelector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: true },
        bubbles: true,
        composed: true,
      }),
    );
    await submitCamera();
    const dirtyCameras = latestDirtyState?.cameras as
      Array<Record<string, unknown>> | undefined;
    const pcAudioEnabled =
      dirtyCameras?.[0]?.start_live_unmuted_pc_tablet === true;

    await openCameraEditor();
    cameraSelector("start_live_unmuted_pc_tablet")?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: false },
        bubbles: true,
        composed: true,
      }),
    );
    const phoneAudioSelector = cameraSelector("start_live_unmuted_phone");
    phoneAudioSelector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: true },
        bubbles: true,
        composed: true,
      }),
    );
    await submitCamera();
    const updatedCameras = latestDirtyState?.cameras as
      Array<Record<string, unknown>> | undefined;
    const pcAudioDefaultOmitted = !(
      "start_live_unmuted_pc_tablet" in (updatedCameras?.[0] ?? {})
    );
    const phoneAudioEnabled =
      updatedCameras?.[0]?.start_live_unmuted_phone === true;

    const selector = editor.shadowRoot?.querySelector(
      '[data-config-key="rounded_outer_corners"]',
    );
    selector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: false },
        bubbles: true,
        composed: true,
      }),
    );
    await Promise.all([card.updateComplete, editor.updateComplete]);
    const squareAfterOff = card.shadowRoot
      ?.querySelector("ha-card")
      ?.classList.contains("square-outer-corners");

    selector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: true },
        bubbles: true,
        composed: true,
      }),
    );
    await Promise.all([card.updateComplete, editor.updateComplete]);
    const roundedAfterOn = !card.shadowRoot
      ?.querySelector("ha-card")
      ?.classList.contains("square-outer-corners");
    const defaultOmitted = !(
      "rounded_outer_corners" in (latestDirtyState ?? {})
    );

    selector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: false },
        bubbles: true,
        composed: true,
      }),
    );
    await Promise.all([card.updateComplete, editor.updateComplete]);
    const squareBeforeSave = card.shadowRoot
      ?.querySelector("ha-card")
      ?.classList.contains("square-outer-corners");
    save.click();

    document.removeEventListener("context-request", handleContext);
    return {
      defaultOmitted,
      dirtyValue: latestDirtyState?.rounded_outer_corners,
      pcAudioDefaultOmitted,
      pcAudioEnabled,
      phoneAudioEnabled,
      roundedAfterOn,
      savedPhoneAudio: (
        dialog._cardConfig?.cameras as
          Array<Record<string, unknown>> | undefined
      )?.[0]?.start_live_unmuted_phone,
      savedValue: dialog._cardConfig?.rounded_outer_corners,
      selectorValue: (
        editor.shadowRoot?.querySelector(
          '[data-config-key="rounded_outer_corners"]',
        ) as HTMLElement & { value?: boolean }
      ).value,
      squareAfterOff,
      squareBeforeSave,
    };
  });

  expect(result).toEqual({
    defaultOmitted: true,
    dirtyValue: false,
    pcAudioDefaultOmitted: true,
    pcAudioEnabled: true,
    phoneAudioEnabled: true,
    roundedAfterOn: true,
    savedPhoneAudio: true,
    savedValue: false,
    selectorValue: false,
    squareAfterOff: true,
    squareBeforeSave: true,
  });
});

test("retains one live connection while the card presentation is replaced", async ({
  page,
}) => {
  await page.route("**/api/camera_proxy/**", (route) =>
    route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>',
      contentType: "image/svg+xml",
    }),
  );
  await page.goto("/");
  await waitForWatchZoneDefinition(page);

  await page.evaluate(async () => {
    interface TestCard extends HTMLElement {
      hass: unknown;
      setConfig(config: unknown): void;
    }

    interface TestWindow extends Window {
      __wzcTestConnectionCount: number;
      __wzcTestHass: unknown;
    }

    const testWindow = window as unknown as TestWindow;
    testWindow.__wzcTestConnectionCount = 0;

    class TestPeerConnection {
      public connectionState: RTCPeerConnectionState = "new";
      public onconnectionstatechange: (() => void) | null = null;
      public onicecandidate:
        ((event: RTCPeerConnectionIceEvent) => void) | null = null;
      public ontrack: ((event: RTCTrackEvent) => void) | null = null;
      public remoteDescription: RTCSessionDescription | null = null;

      public addIceCandidate(): Promise<void> {
        return Promise.resolve();
      }

      public addTransceiver(): void {}

      public close(): void {}

      public createDataChannel(): RTCDataChannel {
        return {} as RTCDataChannel;
      }

      public createOffer(): Promise<RTCSessionDescriptionInit> {
        return Promise.resolve({ type: "offer", sdp: "test-offer" });
      }

      public setLocalDescription(): Promise<void> {
        const canvas = document.createElement("canvas");
        const track = canvas.captureStream(1).getVideoTracks()[0];
        window.setTimeout(() => {
          this.ontrack?.({ track } as RTCTrackEvent);
        });
        return Promise.resolve();
      }

      public setRemoteDescription(
        description: RTCSessionDescriptionInit,
      ): Promise<void> {
        this.remoteDescription = description as RTCSessionDescription;
        return Promise.resolve();
      }
    }

    window.RTCPeerConnection =
      TestPeerConnection as unknown as typeof RTCPeerConnection;
    let runtimeSuspended = false;
    const runtimeSubscribers = new Set<(message: unknown) => void>();
    const runtimeSnapshot = (entityId: string | undefined) => ({
      available: true,
      entity_id: entityId,
      provider: "frigate",
      resume_at: null,
      supported: true,
      suspended: runtimeSuspended,
    });
    const connection = {
      subscribeMessage: async (
        callback: (message: unknown) => void,
        message: { entity_id?: string; type: string },
      ) => {
        if (message.type === "watchzone/camera/runtime/subscribe") {
          runtimeSubscribers.add(callback);
          callback(runtimeSnapshot(message.entity_id));
        }
        return () => runtimeSubscribers.delete(callback);
      },
    };
    const hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: {
            access_token: "poster-token",
            friendly_name: "Front",
          },
        },
      },
      connection,
      hassUrl: (path: string) => path,
      callWS: async (message: {
        entity_id?: string;
        suspended?: boolean;
        type: string;
      }) => {
        if (message.type === "watchzone/live/camera/ready") {
          return { ready: true };
        }
        if (message.type === "camera/webrtc/get_client_config") {
          testWindow.__wzcTestConnectionCount += 1;
          return { configuration: { iceServers: [] } };
        }
        if (message.type === "camera/stream") {
          // Keep the hedged HLS candidate in startup so WebRTC takeover must
          // cancel it without producing an unhandled browser rejection.
          return new Promise(() => undefined);
        }
        if (message.type === "watchzone/camera/runtime/set") {
          await new Promise((resolve) => window.setTimeout(resolve, 75));
          runtimeSuspended = message.suspended === true;
          const snapshot = runtimeSnapshot(message.entity_id);
          for (const subscriber of runtimeSubscribers) subscriber(snapshot);
          return snapshot;
        }
        return undefined;
      },
    };
    testWindow.__wzcTestHass = hass;

    const first = document.querySelector("watchzone-card") as TestCard;
    first.setConfig({
      type: "custom:watchzone-card",
      title: "Front",
      camera_entity: "camera.front",
      start_live_unmuted_pc_tablet: true,
      start_live_unmuted_phone: true,
    });
    first.hass = hass;
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const testWindow = window as unknown as Window & {
          __wzcTestConnectionCount: number;
        };
        return testWindow.__wzcTestConnectionCount;
      }),
    )
    .toBe(1);

  const carousel = page.locator("wzc-camera .camera-carousel");
  await expect(carousel).toHaveClass(/swiper-initialized/);
  await expect(
    carousel.locator(":scope > .swiper-wrapper > .swiper-slide"),
  ).toHaveCount(1);
  await expect(
    carousel.locator(
      ":scope > .swiper-wrapper > .swiper-slide > wzc-camera-view",
    ),
  ).toHaveCount(1);
  expect(
    await carousel.evaluate((element) => {
      const swiper = (
        element as HTMLElement & {
          swiper?: {
            allowTouchMove: boolean;
            params: { nested?: boolean };
          };
        }
      ).swiper;
      return {
        allowTouchMove: swiper?.allowTouchMove,
        interactive: element.classList.contains("camera-carousel-interactive"),
        nested: swiper?.params.nested,
      };
    }),
  ).toEqual({ allowTouchMove: false, interactive: false, nested: true });
  await carousel.evaluate((element) => {
    (
      window as typeof window & {
        __wzcRemovedCarousel?: { destroyed: boolean };
      }
    ).__wzcRemovedCarousel = (
      element as HTMLElement & {
        swiper?: { destroyed: boolean };
      }
    ).swiper;
  });

  const poster = page.locator("wzc-camera img.poster");
  await expect(poster).toHaveAttribute(
    "src",
    "/api/camera_proxy/camera.front?token=poster-token",
  );
  await expect(page.locator("wzc-camera .generic-fallback")).toBeVisible();

  await page.evaluate(() => {
    const testWindow = window as unknown as Window & {
      __wzcTestHass: unknown;
    };
    const routePageHide = new Event("pagehide");
    Object.defineProperty(routePageHide, "persisted", { value: false });
    window.dispatchEvent(routePageHide);
    const first = document.querySelector("watchzone-card");
    first?.remove();
    const replacement = document.createElement(
      "watchzone-card",
    ) as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    replacement.setConfig({
      type: "custom:watchzone-card",
      title: "Front",
      camera_entity: "camera.front",
      rounded_outer_corners: false,
      outer_shadows: false,
      start_live_unmuted_pc_tablet: true,
      start_live_unmuted_phone: true,
    });
    replacement.style.setProperty(
      "--ha-box-shadow-m",
      "rgb(4, 5, 6) 0px 4px 8px",
    );
    replacement.style.setProperty(
      "--ha-box-shadow-s",
      "rgb(7, 8, 9) 0px 1px 2px",
    );
    replacement.style.setProperty("--wzc-camera-stage", "rgb(12, 13, 14)");
    replacement.hass = testWindow.__wzcTestHass;
    document.body.append(replacement);
  });

  const video = page.locator("wzc-camera video.webrtc");
  await expect(video).toHaveAttribute("disablepictureinpicture", "");
  await expect(video).toHaveAttribute("controlslist", /nopictureinpicture/);
  await expect(video).toHaveCSS("pointer-events", "none");
  await expect(page.locator("wzc-camera .camera-carousel")).toHaveClass(
    /swiper-initialized/,
  );
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __wzcRemovedCarousel?: { destroyed: boolean };
          }
        ).__wzcRemovedCarousel?.destroyed,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      video.evaluate((element) => ({
        defaultMuted: (element as HTMLVideoElement).defaultMuted,
        muted: (element as HTMLVideoElement).muted,
      })),
    )
    .toEqual({ defaultMuted: false, muted: false });
  const connectionIndicator = page.locator("wzc-camera .source-indicator");
  await expect(connectionIndicator).toHaveJSProperty("localName", "wzc-badge");
  await expect(connectionIndicator).toHaveAttribute("shape", "pill");
  await expect(connectionIndicator).toHaveText("Connecting…");
  await expect(
    connectionIndicator.locator(".connection-spinner"),
  ).toBeVisible();
  await page.waitForTimeout(CAMERA_OVERLAY_HIDE_DELAY_MS + 250);
  await expect(connectionIndicator).toHaveText("Connecting…");
  await video.evaluate((element) =>
    element.dispatchEvent(new Event("loadeddata")),
  );
  await expect(video).toBeVisible();
  await expect(connectionIndicator).toHaveText("WebRTC");
  await expect(connectionIndicator.locator(".connection-spinner")).toHaveCount(
    0,
  );
  await expect(connectionIndicator).toBeHidden({
    timeout: CAMERA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await expect(connectionIndicator).toHaveCount(1);
  const layoutSizing = await page
    .locator("watchzone-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement;
      const frame = async (): Promise<void> => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      };
      const cameraView = card.shadowRoot
        ?.querySelector("wzc-camera")
        ?.shadowRoot?.querySelector("wzc-camera-view");
      const viewport = cameraView?.shadowRoot
        ?.querySelector("wzc-camera-live")
        ?.shadowRoot?.querySelector<HTMLElement>(".viewport");
      const resizeHandle =
        cameraView?.shadowRoot?.querySelector<HTMLButtonElement>(
          ".stage-resize-handle",
        );
      const shell = card.shadowRoot?.querySelector<HTMLElement>("ha-card");
      card.style.inlineSize = "640px";
      card.style.blockSize = "auto";
      await frame();
      const natural = viewport?.getBoundingClientRect();

      card.style.blockSize = "240px";
      await frame();
      const fixed = viewport?.getBoundingClientRect();
      const fixedCard = shell?.getBoundingClientRect();
      resizeHandle?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "End",
        }),
      );
      await frame();
      const fixedResized = viewport?.getBoundingClientRect();
      const fixedResizedCard = shell?.getBoundingClientRect();
      resizeHandle?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Home",
        }),
      );
      const result = {
        fixedHeight: fixed?.height,
        fixedWithinCard: Boolean(
          fixed &&
          fixedCard &&
          fixed.top >= fixedCard.top &&
          fixed.bottom <= fixedCard.bottom,
        ),
        fixedResizeWithinCard: Boolean(
          fixedResized &&
          fixedResizedCard &&
          fixedResized.top >= fixedResizedCard.top &&
          fixedResized.bottom <= fixedResizedCard.bottom,
        ),
        naturalHeight: natural?.height,
        naturalRatio:
          natural && natural.height > 0
            ? natural.width / natural.height
            : undefined,
      };
      card.style.removeProperty("block-size");
      card.style.removeProperty("inline-size");
      await frame();
      return result;
    });
  expect(layoutSizing.naturalRatio).toBeCloseTo(16 / 9, 2);
  expect(layoutSizing.fixedWithinCard).toBe(true);
  expect(layoutSizing.fixedResizeWithinCard).toBe(true);
  expect(layoutSizing.fixedHeight).toBeLessThan(
    layoutSizing.naturalHeight ?? Number.POSITIVE_INFINITY,
  );
  const controls = page.locator(
    "wzc-camera wzc-camera-controls .control-button",
  );
  const mediaSurface = page.locator("wzc-camera-live .media-surface");
  await mediaSurface.dblclick({ position: { x: 120, y: 80 } });
  await expect(mediaSurface).toHaveAttribute("style", /scale\(2\)/);
  await expect(mediaSurface).toHaveCSS("cursor", "move");
  await mediaSurface.dispatchEvent("wheel", {
    clientX: 120,
    clientY: 80,
    deltaMode: 0,
    deltaX: 0,
    deltaY: -100,
  });
  await expect(mediaSurface).toHaveAttribute("style", /scale\(2\.25\)/);
  const liveViewport = page.locator("wzc-camera-live .viewport");
  const stageResizeHandle = page.locator(
    'wzc-camera [aria-label="Camera stage height"]',
  );
  await page.setViewportSize({
    height: 1_000,
    width: page.viewportSize()?.width ?? 1_280,
  });
  await stageResizeHandle.scrollIntoViewIfNeeded();
  const cardShell = page.locator("watchzone-card ha-card");
  const initialCardBox = await cardShell.boundingBox();
  const initialStageBox = await liveViewport.boundingBox();
  expect(initialStageBox).not.toBeNull();
  expect(initialCardBox).not.toBeNull();
  if (initialStageBox) {
    await stageResizeHandle.hover({ force: true });
    const resizeHandleBox = await stageResizeHandle.boundingBox();
    expect(resizeHandleBox).not.toBeNull();
    if (resizeHandleBox) {
      const handleX = resizeHandleBox.x + resizeHandleBox.width / 2;
      const handleY = resizeHandleBox.y + resizeHandleBox.height / 2;
      const expansionDistance = Math.min(
        120,
        (initialStageBox.width - initialStageBox.height) / 2,
      );
      const currentMediaScale = (): Promise<number | undefined> =>
        mediaSurface.evaluate((element) => {
          const match = element.getAttribute("style")?.match(/scale\(([^)]+)/);
          return match ? Number(match[1]) : undefined;
        });
      await page.mouse.down();
      await expect(page.locator("wzc-camera .camera")).toHaveClass(
        /stage-resizing/,
      );
      await page.mouse.move(handleX, handleY + expansionDistance, {
        steps: 4,
      });
      await expect
        .poll(async () => (await liveViewport.boundingBox())?.height)
        .toBeGreaterThan(initialStageBox.height);
      if (initialCardBox) {
        await expect
          .poll(async () => (await cardShell.boundingBox())?.height)
          .toBeGreaterThan(initialCardBox.height);
      }
      const expandedMediaScale = await currentMediaScale();
      expect(expandedMediaScale).toBeGreaterThan(2.25);
      await expect(video).toHaveCSS("object-fit", "contain");

      await page.mouse.move(handleX, handleY + expansionDistance / 2, {
        steps: 4,
      });
      await expect
        .poll(currentMediaScale)
        .toBeLessThan(expandedMediaScale ?? Number.POSITIVE_INFINITY);
      await expect.poll(currentMediaScale).toBeGreaterThan(1);
      await page.mouse.move(handleX, handleY - 2, {
        steps: 4,
      });
      await expect(mediaSurface).toHaveAttribute(
        "style",
        /translate3d\(0px, 0px, 0\) scale\(1\)/,
      );

      await page.mouse.move(handleX, handleY + expansionDistance, {
        steps: 4,
      });
      await expect
        .poll(async () => (await liveViewport.boundingBox())?.height)
        .toBeGreaterThan(initialStageBox.height);
      await expect.poll(currentMediaScale).toBeGreaterThan(1);
      await page.mouse.move(handleX, handleY - 2, { steps: 4 });
      await page.mouse.up();
    }
    await expect
      .poll(async () => (await liveViewport.boundingBox())?.height)
      .toBeCloseTo(initialStageBox.height, 0);
  }
  await expect(mediaSurface).toHaveAttribute("style", /scale\(1\)/);
  await liveViewport.evaluate((element) => (element as HTMLElement).blur());
  await page.mouse.move(0, 0);
  await expect(controls).toHaveCount(5);
  await expect(controls.first()).toBeHidden({
    timeout: CAMERA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await video.evaluate((element) => {
    Object.defineProperties(element, {
      readyState: { configurable: true, value: 4 },
      videoHeight: { configurable: true, value: 720 },
      videoWidth: { configurable: true, value: 1280 },
    });
    HTMLCanvasElement.prototype.getContext = (() => ({
      drawImage: () => undefined,
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = ((callback: BlobCallback) =>
      callback(
        new Blob(["frame"], { type: "image/jpeg" }),
      )) as typeof HTMLCanvasElement.prototype.toBlob;
  });
  await liveViewport.hover();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('wzc-camera-controls [data-control="snapshot"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^camera\.front_\d{4}-\d{2}-\d{2}T.*Z\.jpg$/,
  );
  await page.locator('wzc-camera-controls [data-control="suspend"]').click();
  const suspendDialog = page.locator("wzc-camera-suspend-dialog dialog");
  await expect(suspendDialog).toBeVisible();
  await suspendDialog.locator('input[role="switch"]').check();
  await expect(suspendDialog.locator('input[type="number"]')).toHaveCount(2);
  await suspendDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(suspendDialog).toBeHidden();
  await page.locator('wzc-camera-controls [data-control="suspend"]').click();
  await expect(suspendDialog).toBeVisible();
  await suspendDialog.getByRole("button", { name: "Suspend camera" }).click();
  await expect(suspendDialog).toBeHidden();
  const suspendedPresentation = page.locator(
    "wzc-camera-live .suspended-presentation",
  );
  await expect(suspendedPresentation).toBeVisible();
  await expect(suspendedPresentation).toContainText("Camera suspended");
  await expect(suspendedPresentation).toContainText(
    "Resume this camera to restore live video.",
  );
  await expect(page.locator("wzc-camera video")).toHaveCount(0);
  const resumeControl = page.locator(
    'wzc-camera-controls [data-control="suspend"]',
  );
  await expect(resumeControl).toBeVisible();
  await expect(resumeControl).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("wzc-camera-controls .control-button")).toHaveCount(
    1,
  );
  await resumeControl.click();
  await expect(suspendDialog).toBeVisible();
  await suspendDialog.getByRole("button", { name: "Resume camera" }).click();
  await expect(suspendDialog).toBeHidden();
  await expect(suspendedPresentation).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const testWindow = window as unknown as Window & {
          __wzcTestConnectionCount: number;
        };
        return testWindow.__wzcTestConnectionCount;
      }),
    )
    .toBe(2);
  await page
    .locator("wzc-camera video.webrtc")
    .evaluate((element) => element.dispatchEvent(new Event("loadeddata")));
  await expect(connectionIndicator).toHaveText("WebRTC");
  const overlayTransitions = await page.evaluate(() => {
    const camera = document.querySelector("wzc-camera");
    const presentation = camera?.shadowRoot?.querySelector("wzc-camera-live");
    const source =
      presentation?.shadowRoot?.querySelector<HTMLElement>(".source-indicator");
    const controls = presentation?.shadowRoot?.querySelector(
      "wzc-camera-controls",
    );
    const controlGroup =
      controls?.shadowRoot?.querySelector<HTMLElement>(".control-group");
    return {
      controls: controlGroup
        ? getComputedStyle(controlGroup).transitionDuration
        : undefined,
      source: source ? getComputedStyle(source).transitionDuration : undefined,
    };
  });
  expect(overlayTransitions.source).toBe(overlayTransitions.controls);
  const viewport = page.locator("wzc-camera-live .viewport");
  const cameraStage = page.locator("wzc-camera .camera-carousel");
  const cameraSurface = page.locator("wzc-camera .camera");
  await expect
    .poll(() =>
      cameraSurface.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .toBe("rgb(12, 13, 14)");
  await expect
    .poll(() =>
      viewport.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe("rgb(12, 13, 14)");
  await expect
    .poll(() =>
      viewport.evaluate((element) => getComputedStyle(element).borderRadius),
    )
    .not.toBe("0px");
  await expect
    .poll(() =>
      viewport.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .toBe("none");
  await expect
    .poll(() =>
      cameraStage.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .toContain("rgb(4, 5, 6)");
  await page.locator("wzc-camera").evaluate(async (element) => {
    const cameraModule = element as HTMLElement & {
      shadowStyle: "medium" | "none" | "small";
      updateComplete: Promise<boolean>;
    };
    cameraModule.shadowStyle = "small";
    await cameraModule.updateComplete;
  });
  await expect
    .poll(() =>
      cameraStage.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .toContain("rgb(7, 8, 9)");
  const cameraIdentityRetained = await page
    .locator("watchzone-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement & {
        setConfig(config: unknown): void;
        updateComplete: Promise<boolean>;
      };
      const cameraBefore = card.shadowRoot?.querySelector("wzc-camera");
      card.setConfig({
        type: "custom:watchzone-card",
        title: "Front",
        camera_entity: "camera.front",
        rounded_outer_corners: false,
        outer_shadows: false,
        camera_rounded_corners: false,
        camera_shadows: false,
      });
      await card.updateComplete;
      const cameraAfter = card.shadowRoot?.querySelector("wzc-camera") as
        (HTMLElement & { updateComplete: Promise<boolean> }) | null;
      await cameraAfter?.updateComplete;
      return cameraAfter === cameraBefore;
    });
  expect(cameraIdentityRetained).toBe(true);
  await expect
    .poll(() =>
      viewport.evaluate((element) => getComputedStyle(element).borderRadius),
    )
    .toBe("0px");
  await expect
    .poll(() =>
      cameraStage.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .toBe("none");
  await viewport.hover();
  await expect(controls.first()).toBeVisible();
  await expect(connectionIndicator).toHaveText("WebRTC");
  const controlPresentation = await controls.evaluateAll((buttons) => {
    const group = buttons[0]?.parentElement;
    const rectangles = buttons.map((button) => button.getBoundingClientRect());
    return {
      backgrounds: buttons.map(
        (button) => getComputedStyle(button).backgroundColor,
      ),
      borders: buttons.map((button) => getComputedStyle(button).borderColor),
      gaps: rectangles.slice(1).map((rectangle, index) => {
        return rectangle.top - rectangles[index].bottom;
      }),
      icons: buttons.map((button) => {
        const svg = button.querySelector("svg");
        const paths = [...button.querySelectorAll("path")];
        const bounds = paths.map((path) => path.getBBox());
        return {
          hasGeometry: bounds.some(
            (rectangle) => rectangle.width > 0 && rectangle.height > 0,
          ),
          namespacesValid:
            svg?.namespaceURI === "http://www.w3.org/2000/svg" &&
            paths.every((path) => path.namespaceURI === svg.namespaceURI),
        };
      }),
      groupBackground: group
        ? getComputedStyle(group).backgroundColor
        : undefined,
    };
  });
  expect(controlPresentation.groupBackground).toBe("rgba(0, 0, 0, 0)");
  expect(
    controlPresentation.backgrounds.every(
      (background) => background !== controlPresentation.groupBackground,
    ),
  ).toBe(true);
  expect(controlPresentation.gaps.every((gap) => gap > 0)).toBe(true);
  expect(
    controlPresentation.icons.every(
      (icon) => icon.hasGeometry && icon.namespacesValid,
    ),
  ).toBe(true);
  const indicatorPresentation = await connectionIndicator.evaluate(
    (element) => {
      const badge = element.shadowRoot?.querySelector<HTMLElement>(".badge");
      if (!badge) throw new Error("Source badge presentation is missing");
      const style = getComputedStyle(badge);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        borderRadius: style.borderRadius,
      };
    },
  );
  expect(
    controlPresentation.backgrounds.every(
      (background) => background === indicatorPresentation.background,
    ),
  ).toBe(true);
  expect(cssAlpha(indicatorPresentation.background)).toBeCloseTo(0.72, 2);
  expect(
    controlPresentation.backgrounds.every(
      (background) => Math.abs(cssAlpha(background) - 0.72) < 0.01,
    ),
  ).toBe(true);
  expect(
    controlPresentation.borders.every(
      (border) => border === indicatorPresentation.border,
    ),
  ).toBe(true);
  expect(cssAlpha(indicatorPresentation.border)).toBe(1);
  expect(indicatorPresentation.border).toBe("rgb(74, 74, 74)");
  expect(indicatorPresentation.borderRadius).toBe("999px");
  const mute = page.locator(
    'wzc-camera wzc-camera-controls [data-control="mute"]',
  );
  await page.locator("watchzone-card").evaluate((element) => {
    element.style.setProperty("--wzc-color-primary", "rgb(0, 120, 255)");
    element.style.setProperty("--wzc-color-text-reversed", "rgb(1, 2, 3)");
  });
  const restingBackground = await mute.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await mute.hover();
  const hoverBackground = await mute.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(hoverBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(hoverBackground).not.toBe(restingBackground);
  expect(cssAlpha(hoverBackground)).toBeCloseTo(0.84, 2);
  expect(
    await mute.evaluate((element) => getComputedStyle(element).color),
  ).toBe("rgb(230, 230, 230)");
  await expect(
    page.locator('wzc-camera wzc-camera-controls [data-control="snapshot"]'),
  ).toBeEnabled();
  await expect(
    page.locator('wzc-camera wzc-camera-controls [data-control="suspend"]'),
  ).toBeEnabled();
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  const mutedBorder = await mute.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.borderColor}|${style.borderWidth}|${style.borderStyle}`;
  });
  await mute.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  expect(
    await video.evaluate((element) => (element as HTMLVideoElement).muted),
  ).toBe(true);
  await mute.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  expect(
    await mute.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.borderColor}|${style.borderWidth}|${style.borderStyle}`;
    }),
  ).toBe(mutedBorder);
  expect(
    await video.evaluate((element) => (element as HTMLVideoElement).muted),
  ).toBe(false);

  await page.locator("watchzone-card").evaluate((element) => {
    element.style.inlineSize = "320px";
  });
  await expect
    .poll(() =>
      mute.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeLessThan(36);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const testWindow = window as unknown as Window & {
          __wzcTestConnectionCount: number;
        };
        return testWindow.__wzcTestConnectionCount;
      }),
    )
    .toBe(2);

  await page.mouse.move(0, 0);
  await viewport.dispatchEvent("pointerdown", {
    isPrimary: true,
    pointerId: 1,
    pointerType: "touch",
  });
  await expect(controls.first()).toBeVisible();
  await expect(connectionIndicator).toHaveText("WebRTC");
  await expect(controls.first()).toBeHidden({
    timeout: CAMERA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await expect(connectionIndicator).toBeHidden({
    timeout: CAMERA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });

  await viewport.dispatchEvent("pointerdown", {
    isPrimary: true,
    pointerId: 2,
    pointerType: "touch",
  });
  await expect(mute).toBeVisible();
  await mute.evaluate((element) => (element as HTMLButtonElement).focus());
  expect(
    await mute.evaluate(
      (element) =>
        (element.getRootNode() as ShadowRoot).activeElement === element,
    ),
  ).toBe(true);
  await mute.dispatchEvent("pointerup", {
    isPrimary: true,
    pointerId: 3,
    pointerType: "touch",
  });
  expect(
    await mute.evaluate(
      (element) =>
        (element.getRootNode() as ShadowRoot).activeElement === element,
    ),
  ).toBe(false);

  expect(
    await page.evaluate(() => window.wzc?.getLiveStartupTimings()[0]?.phases),
  ).toMatchObject({
    adapter_imported: expect.any(Number),
    client_config_received: expect.any(Number),
    video_track_received: expect.any(Number),
  });
});
