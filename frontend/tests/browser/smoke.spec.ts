import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { MEDIA_OVERLAY_HIDE_DELAY_MS } from "../../src/ui/media-overlay-visibility.controller";

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

async function emitReviewNotification(
  page: Page,
  payload: unknown,
): Promise<void> {
  await page.evaluate((notification) => {
    for (const callback of (
      window as unknown as {
        reviewNotifications?: Array<(value: unknown) => void>;
      }
    ).reviewNotifications ?? []) {
      callback(JSON.stringify(notification));
    }
  }, payload);
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

test("uses the first real touch only to reveal hidden media controls", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { height: 844, width: 390 },
  });
  const touchPage = await context.newPage();
  const errors: string[] = [];
  touchPage.on("pageerror", (error) => errors.push(error.message));
  try {
    await touchPage.route("**/poster.svg", (route) =>
      route.fulfill({
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="black"/></svg>',
        contentType: "image/svg+xml",
      }),
    );
    await touchPage.goto("/");
    await waitForWatchZoneDefinition(touchPage);
    const card = touchPage.locator("watchzone-card");
    await card.evaluate((element) => {
      const cardElement = element as HTMLElement & {
        hass: unknown;
        setConfig(config: unknown): void;
      };
      cardElement.setConfig({
        type: "custom:watchzone-card",
        camera_switcher_overlay: true,
        cameras: [
          { entity_id: "camera.front", title: "Front" },
          { entity_id: "camera.back", title: "Back" },
        ],
      });
      cardElement.hass = {
        states: {
          "camera.front": {
            entity_id: "camera.front",
            state: "streaming",
            attributes: { entity_picture: "/poster.svg" },
          },
          "camera.back": {
            entity_id: "camera.back",
            state: "streaming",
            attributes: { entity_picture: "/poster.svg" },
          },
        },
        connection: { subscribeMessage: async () => () => undefined },
        hassUrl: (path: string) => path,
        callService: async () => undefined,
        callWS: async (message: { type: string }) =>
          message.type === "watchzone/reviews/list"
            ? { items: [] }
            : { ready: false },
      };
    });

    const viewport = card.locator("wzc-camera-live .viewport").first();
    const slideshow = card.locator("wzc-slideshow button");
    await expect(slideshow).toHaveCount(1);
    await expect(slideshow).toBeHidden({
      timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
    });
    const slideshowBox = await slideshow.boundingBox();
    expect(slideshowBox).not.toBeNull();
    if (!slideshowBox) return;
    const initialPressed = await slideshow.getAttribute("aria-pressed");

    await touchPage.touchscreen.tap(
      slideshowBox.x + slideshowBox.width / 2,
      slideshowBox.y + slideshowBox.height / 2,
    );

    await expect(viewport).toBeVisible();
    await expect(slideshow).toBeVisible();
    await expect(slideshow).toHaveAttribute(
      "aria-pressed",
      initialPressed ?? "false",
    );

    await touchPage.touchscreen.tap(
      slideshowBox.x + slideshowBox.width / 2,
      slideshowBox.y + slideshowBox.height / 2,
    );
    await expect(slideshow).not.toHaveAttribute(
      "aria-pressed",
      initialPressed ?? "false",
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
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

test("opens notification deep links independently of activity presentation", async ({
  page,
}) => {
  await installHaIconFixture(page);
  await page.route("**/recording.mp4", (route) =>
    route.fulfill({ body: "", contentType: "video/mp4" }),
  );
  await page.goto(
    "/?camera=back&event=event-1&review=review-1&unrelated=preserved",
  );
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:watchzone-card",
      cameras: [
        { entity_id: "camera.front", title: "Front" },
        { entity_id: "camera.back", title: "Back" },
      ],
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
        "camera.back": {
          entity_id: "camera.back",
          state: "streaming",
          attributes: { friendly_name: "Back" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { type: string }) => {
        if (message.type === "watchzone/events/list") {
          return {
            items: [
              {
                camera: "back",
                clip_url: "/recording.mp4",
                end_time: 20,
                has_clip: true,
                has_snapshot: true,
                id: "frigate:event-1",
                label: "person",
                playback_sources: [
                  {
                    content_type: "video/mp4",
                    transport: "file",
                    url: "/recording.mp4",
                  },
                ],
                preferred_transport: "file",
                revision: "event-1-final",
                snapshot_url: "/thumbnail.svg",
                start_time: 10,
                sub_label: null,
                thumbnail_url: "/thumbnail.svg",
                zones: [],
              },
            ],
          };
        }
        if (message.type === "watchzone/activity/source") {
          return {
            camera_name: "back",
            instance_id: "frigate",
            type: "frigate",
          };
        }
        if (message.type === "watchzone/reviews/list") return { items: [] };
        if (message.type === "watchzone/live/camera/ready") {
          return { ready: false };
        }
        return undefined;
      },
    };
  });

  await expect(
    page.locator('wzc-camera-navigation button[aria-selected="true"]'),
  ).toHaveText("Back");
  await expect(
    page.locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) dialog",
    ),
  ).toBeVisible();
  await expect(
    page.locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .title",
    ),
  ).toContainText("Back");
  await expect
    .poll(() => new URL(page.url()).search)
    .toBe("?unrelated=preserved");
});

test("starts the active camera poster before the full camera element loads", async ({
  page,
}) => {
  let releaseCameraDefinition!: () => void;
  const cameraDefinitionGate = new Promise<void>((resolve) => {
    releaseCameraDefinition = resolve;
  });
  let posterRequested = false;
  await page.route("**/src/stage/modules/camera/camera.ts*", async (route) => {
    await cameraDefinitionGate;
    await route.continue();
  });
  await page.route("**/poster.svg", async (route) => {
    posterRequested = true;
    await route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="black"/></svg>',
      contentType: "image/svg+xml",
    });
  });

  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:watchzone-card",
      camera_entity: "camera.front",
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { entity_picture: "/poster.svg" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { type: string }) =>
        message.type === "watchzone/reviews/list"
          ? { items: [] }
          : { ready: false },
    };
  });

  await expect.poll(() => posterRequested).toBe(true);
  expect(
    await page.evaluate(() => customElements.get("wzc-camera")),
  ).toBeUndefined();
  releaseCameraDefinition();
  await expect(page.locator("wzc-camera")).toBeVisible();
});

test("keeps picker and activity geometry stable across lazy loading", async ({
  page,
}) => {
  let releasePlaceables!: () => void;
  const placeableGate = new Promise<void>((resolve) => {
    releasePlaceables = resolve;
  });
  for (const path of [
    "**/src/stage/modules/camera-navigation/camera-navigation.ts*",
    "**/src/stage/modules/reviews/reviews.ts*",
  ]) {
    await page.route(path, async (route) => {
      await placeableGate;
      await route.continue();
    });
  }

  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
    const host = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    host.setConfig({
      type: "custom:watchzone-card",
      camera_entity: "camera.front",
    });
    host.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { type: string }) => {
        if (message.type === "watchzone/reviews/list") {
          return {
            items: Array.from({ length: 5 }, (_, index) => ({
              camera: "front",
              classification: "detection",
              clip_url: null,
              end_time: 1_700_000_020 - index,
              id: `review-${index}`,
              labels: ["person"],
              media_end_time: 1_700_000_025 - index,
              media_start_time: 1_699_999_995 - index,
              playback_sources: [],
              preferred_transport: "file",
              preview_url: null,
              revision: `revision-${index}`,
              related_event_ids: [],
              reviewed: false,
              snapshot_url: null,
              start_time: 1_700_000_000 - index,
              sub_labels: [],
              thumbnail_url: null,
              zones: [],
            })),
          };
        }
        return { ready: false };
      },
    };
  });

  const navigationSkeleton = card.locator(".camera-navigation-skeleton");
  const activitySkeleton = card.locator(".activity-skeleton");
  await expect(navigationSkeleton).toBeVisible();
  await expect(activitySkeleton).toBeVisible();
  const loading = await Promise.all([
    card.locator("ha-card").boundingBox(),
    navigationSkeleton.boundingBox(),
    activitySkeleton.boundingBox(),
  ]);

  releasePlaceables();
  const navigation = card.locator("wzc-camera-navigation");
  const activity = card.locator("wzc-reviews .viewport");
  await expect(navigation).toBeVisible();
  await expect(card.locator("wzc-reviews .tile")).toHaveCount(5);
  const loaded = await Promise.all([
    card.locator("ha-card").boundingBox(),
    navigation.boundingBox(),
    activity.boundingBox(),
  ]);

  for (const index of [0, 1, 2]) {
    expect(loading[index]).not.toBeNull();
    expect(loaded[index]).not.toBeNull();
    expect(loaded[index]?.height).toBeCloseTo(loading[index]?.height ?? 0, 0);
  }
});

test("keeps camera navigation module and carousel selection bidirectional", async ({
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

  const navigation = page.locator("wzc-camera-navigation");
  const buttons = navigation.locator("button");
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveText("Front Door");
  await expect(buttons.nth(0)).toHaveAttribute("aria-selected", "true");
  const navigationCentering = await navigation.evaluate((element) => {
    const root = element.shadowRoot;
    const items = root?.querySelector("wzc-segmented-control");
    const itemRoot = items?.shadowRoot;
    const viewport = itemRoot?.querySelector(".segmented-control");
    const options = itemRoot?.querySelectorAll("button");
    const first = options?.item(0).getBoundingClientRect();
    const last = options
      ?.item((options?.length ?? 1) - 1)
      .getBoundingClientRect();
    const viewportRect = viewport?.getBoundingClientRect();
    return {
      itemsCenter: first && last ? (first.left + last.right) / 2 : 0,
      viewportCenter: viewportRect
        ? (viewportRect.left + viewportRect.right) / 2
        : 0,
    };
  });
  expect(navigationCentering.itemsCenter).toBeCloseTo(
    navigationCentering.viewportCenter,
    1,
  );
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
  await expect(navigation.locator(".items")).toHaveCSS("border-style", "none");
  await expect(navigation.locator(".bar")).toHaveCSS(
    "box-shadow",
    "rgb(20, 21, 22) 0px 4px 8px 0px",
  );
  await expect(navigation.locator(".bar")).toHaveCSS("border-radius", "19px");
  await expect(buttons.nth(0)).toHaveCSS("border-radius", "999px");
  await expect(buttons.nth(0)).toHaveCSS("transition-duration", "0s");
  await expect(buttons.nth(0)).toHaveCSS(
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
  await expect
    .poll(() =>
      page
        .locator("wzc-camera .camera-carousel")
        .evaluate(
          (element) =>
            (element as HTMLElement & { swiper?: { animating: boolean } })
              .swiper?.animating,
        ),
    )
    .toBe(false);

  await page
    .locator("wzc-camera .carousel-navigation.previous")
    .click({ force: true });
  await expect(buttons.nth(0)).toHaveAttribute("aria-selected", "true");

  const cameraBox = await page.locator("wzc-camera").boundingBox();
  const navigationModuleBox = await page
    .locator('[data-layout-node="wzc:default-camera-navigation-module"]')
    .boundingBox();
  const selectorBox = await navigation.boundingBox();
  expect(cameraBox).not.toBeNull();
  expect(navigationModuleBox).not.toBeNull();
  expect(selectorBox).not.toBeNull();
  expect(navigationModuleBox?.y).toBeGreaterThanOrEqual(
    (cameraBox?.y ?? 0) + (cameraBox?.height ?? 0),
  );
  expect(navigationModuleBox?.height).toBeCloseTo(selectorBox?.height ?? 0, 1);

  await page.locator("watchzone-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      camera_bar_rounded_corners: false,
      camera_bar_shadows: false,
      cameras: [
        { entity_id: "camera.front", title: "Front Door" },
        { entity_id: "camera.back", title: "Back Yard" },
      ],
    });
  });
  await expect(navigation.locator(".bar")).toHaveClass(/square/);
  await expect(navigation.locator(".bar")).toHaveCSS("border-radius", "0px");
  await expect(navigation.locator(".bar")).not.toHaveClass(/shadows/);
  await expect(navigation.locator(".bar")).toHaveCSS("box-shadow", "none");
  await expect(buttons.nth(0)).toHaveCSS("border-radius", "999px");
  await expect(buttons.nth(0)).toHaveCSS("box-shadow", "none");
});

test("cycles a grouped camera from combined to each member and back", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      cameras: [
        {
          additional_camera: {
            entity_id: "camera.driveway",
            layout: "side_by_side",
          },
          entity_id: "camera.porch",
          title: "Group A/B",
        },
        { entity_id: "camera.driveway", title: "Driveway" },
      ],
    });
  });

  const button = card
    .locator("wzc-camera-navigation button")
    .filter({ hasText: "Group A/B" });
  const group = card.locator("wzc-camera-group-view");
  const leadingIcon = button.locator(".option-leading-icon");
  await expect(button).toHaveCount(1);
  await expect(button).toContainText("Group A/B");
  await expect(leadingIcon).toHaveCount(0);
  await expect
    .poll(async () => {
      const box = await group.boundingBox();
      return box ? box.width / box.height : 0;
    })
    .toBeCloseTo(16 / 9, 1);
  await group.evaluate((element) => {
    const view = element as HTMLElement & {
      classifications: ReadonlyMap<string, "alert" | "detection">;
      requestUpdate(): void;
    };
    view.classifications = new Map([["camera.porch", "detection"]]);
    view.requestUpdate();
  });
  await expect(group.locator(".feed").nth(0)).toHaveClass(/activity-detection/);
  await expect(group.locator(".feed").nth(1)).not.toHaveClass(
    /activity-(alert|detection)/,
  );
  await expect(card.locator(".camera-carousel")).not.toHaveClass(
    /activity-(alert|detection)/,
  );

  await group.hover();
  const firstFeedActions = group.locator(".feed-actions");
  const firstSoloTarget = firstFeedActions.locator(".solo-target").nth(0);
  await expect(firstFeedActions).toHaveClass(/visible/);
  await expect(firstFeedActions.locator(".audio-target")).toHaveCount(2);
  await expect(firstFeedActions.locator(".solo-target")).toHaveCount(2);
  await expect(firstFeedActions.locator(".position-label")).toHaveText([
    "A",
    "A",
    "B",
    "B",
  ]);
  const [groupControlBox, playerControlBox] = await Promise.all([
    firstFeedActions.locator(".feed-action").first().boundingBox(),
    group.locator('[data-control="mute"]').boundingBox(),
  ]);
  expect(groupControlBox?.height).toBeCloseTo(playerControlBox?.height ?? 0, 1);
  expect(groupControlBox?.width).toBeCloseTo(playerControlBox?.width ?? 0, 1);
  const [groupBox, groupActionsBox] = await Promise.all([
    group.boundingBox(),
    firstFeedActions.boundingBox(),
  ]);
  expect(groupBox).not.toBeNull();
  expect(groupActionsBox).not.toBeNull();
  if (groupBox && groupActionsBox) {
    const railGeometry = await group.evaluate((element) => {
      const railProbe = document.createElement("span");
      const insetProbe = document.createElement("span");
      railProbe.style.cssText =
        "position:absolute;inline-size:var(--wzc-camera-side-lane-inline-size)";
      insetProbe.style.cssText =
        "position:absolute;inline-size:var(--wzc-camera-control-inline-inset)";
      element.shadowRoot?.append(railProbe, insetProbe);
      const geometry = {
        inset: insetProbe.getBoundingClientRect().width,
        rail: railProbe.getBoundingClientRect().width,
      };
      railProbe.remove();
      insetProbe.remove();
      return geometry;
    });
    expect(groupActionsBox.x).toBeCloseTo(groupBox.x, 1);
    expect(groupActionsBox.width).toBeCloseTo(railGeometry.rail, 1);
    const firstGroupButtonBox = await firstFeedActions
      .locator(".feed-action")
      .first()
      .boundingBox();
    expect(firstGroupButtonBox?.x).toBeGreaterThanOrEqual(groupBox.x);
    expect(
      (firstGroupButtonBox?.x ?? 0) + (firstGroupButtonBox?.width ?? 0),
    ).toBeLessThanOrEqual(groupBox.x + railGeometry.rail + 1);
  }
  const groupLabelFontSize = await firstFeedActions
    .locator(".position-label")
    .first()
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
  expect(groupLabelFontSize).toBeGreaterThanOrEqual(10);
  await expect(firstSoloTarget.locator("path")).toHaveAttribute("d", /^m4 20c/);
  await firstSoloTarget.hover();
  await page.waitForTimeout(MEDIA_OVERLAY_HIDE_DELAY_MS + 250);
  await expect(firstFeedActions).toHaveClass(/visible/);
  await expect(firstSoloTarget).toBeVisible();
  await firstSoloTarget.click();
  await expect(group.locator(".feed:not(.hidden)")).toHaveCount(1);
  await expect(firstFeedActions.locator(".audio-target")).toHaveCount(1);
  await expect(firstFeedActions.locator(".solo-target")).toHaveCount(1);
  await expect(firstFeedActions.locator(".position-label")).toHaveText([
    "A",
    "A",
  ]);
  await expect(firstSoloTarget.locator("path")).toHaveAttribute("d", /^M13,16/);
  await expect(leadingIcon).toHaveCount(1);
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowLeft");

  await button.click();
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowRight");

  await button.click();
  await expect(leadingIcon).toHaveCount(0);
  await expect(firstFeedActions.locator(".audio-target")).toHaveCount(2);
  await expect(firstFeedActions.locator(".solo-target")).toHaveCount(2);

  await group.hover();
  await group.locator(".solo-target").nth(1).click();
  await expect(group.locator(".feed:not(.hidden)")).toHaveCount(1);
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowRight");
  await expect(firstFeedActions.locator(".position-label")).toHaveText([
    "B",
    "B",
  ]);
});

test("keeps grouped phone navigation to one visible A or B feed", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 500 });
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      camera_switcher_overlay: true,
      cameras: [
        {
          additional_camera: {
            entity_id: "camera.driveway",
            layout: "side_by_side",
          },
          entity_id: "camera.porch",
          title: "Group A/B",
        },
        { entity_id: "camera.driveway", title: "Driveway" },
        { entity_id: "camera.hall", title: "Hall" },
      ],
    });
  });

  const group = card.locator("wzc-camera-group-view");
  const button = card
    .locator("wzc-camera-navigation button")
    .filter({ hasText: "Group A/B" });
  const leadingIcon = button.locator(".option-leading-icon");
  await expect(group.locator(".feed:not(.hidden)")).toHaveCount(1);
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowLeft");
  await group.hover();
  const [
    phoneGroupBox,
    phoneSelectorBox,
    phonePlayerControlBox,
    phonePickerBox,
    phoneSlideshowBox,
  ] = await Promise.all([
    group.boundingBox(),
    group.locator(".feed-selector").boundingBox(),
    group.locator('[data-control="mute"]').boundingBox(),
    card.locator("wzc-camera-switcher .trigger").boundingBox(),
    card.locator("wzc-slideshow button").boundingBox(),
  ]);
  expect(phoneGroupBox).not.toBeNull();
  expect(phoneSelectorBox).not.toBeNull();
  expect(phonePickerBox).not.toBeNull();
  expect(phoneSlideshowBox).not.toBeNull();
  expect(phoneSelectorBox?.width).toBeCloseTo(
    phonePlayerControlBox?.width ?? 0,
    1,
  );
  expect(phoneSelectorBox?.height).toBeCloseTo(
    phonePlayerControlBox?.height ?? 0,
    1,
  );
  if (
    phoneGroupBox &&
    phoneSelectorBox &&
    phonePickerBox &&
    phoneSlideshowBox
  ) {
    const phoneRailGeometry = await group.evaluate((element) => {
      const railProbe = document.createElement("span");
      const insetProbe = document.createElement("span");
      railProbe.style.cssText =
        "position:absolute;inline-size:var(--wzc-camera-side-lane-inline-size)";
      insetProbe.style.cssText =
        "position:absolute;inline-size:var(--wzc-camera-control-inline-inset)";
      element.shadowRoot?.append(railProbe, insetProbe);
      const result = {
        inset: insetProbe.getBoundingClientRect().width,
        rail: railProbe.getBoundingClientRect().width,
      };
      railProbe.remove();
      insetProbe.remove();
      return result;
    });
    expect(phoneSelectorBox.x).toBeGreaterThanOrEqual(phoneGroupBox.x);
    expect(phoneSelectorBox.x + phoneSelectorBox.width).toBeLessThanOrEqual(
      phoneGroupBox.x + phoneRailGeometry.rail + 1,
    );
    expect(phonePickerBox.x + phonePickerBox.width / 2).toBeCloseTo(
      phoneGroupBox.x + phoneGroupBox.width / 2,
      0,
    );
    expect(phonePickerBox.width).toBeCloseTo(7.125 * 16, 0);
    expect(
      phonePickerBox.x - (phoneSlideshowBox.x + phoneSlideshowBox.width),
    ).toBeCloseTo(4, 1);
    expect(phoneSelectorBox.x + phoneSelectorBox.width).toBeLessThanOrEqual(
      phoneSlideshowBox.x,
    );
  }

  const phoneSwitcher = card.locator("wzc-camera-switcher");
  await phoneSwitcher.locator(".trigger").click();
  const phoneOptions = phoneSwitcher.locator(".options");
  await expect(phoneOptions).toBeVisible();
  expect((await phoneOptions.boundingBox())?.width).toBeCloseTo(
    phonePickerBox?.width ?? 0,
    1,
  );
  expect(
    await phoneOptions
      .locator(".option")
      .evaluateAll((options) =>
        options.every((option) => option.scrollWidth <= option.clientWidth),
      ),
  ).toBe(true);
  await phoneSwitcher.locator(".trigger").click();

  await button.click();
  await expect(group.locator(".feed:not(.hidden)")).toHaveCount(1);
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowRight");

  await button.click();
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowLeft");

  await page.mouse.move(0, 0);
  const feedActions = group.locator(".feed-actions");
  await expect(feedActions).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await expect(feedActions).toHaveCSS("pointer-events", "none");
  await expect(feedActions).toHaveCSS("visibility", "hidden");
  const hiddenFeedActionHit = await group
    .locator(".feed-action")
    .first()
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      let target = document.elementFromPoint(x, y);
      while (target?.shadowRoot) {
        const nested = target.shadowRoot.elementFromPoint(x, y);
        if (!nested || nested === target) break;
        target = nested;
      }
      return target === element || Boolean(target && element.contains(target));
    });
  expect(hiddenFeedActionHit).toBe(false);
  const groupedRevealTouchAccepted = await group
    .locator(".group")
    .evaluate((element) =>
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          composed: true,
          isPrimary: true,
          pointerId: 91,
          pointerType: "touch",
        }),
      ),
    );
  expect(groupedRevealTouchAccepted).toBe(false);
  await expect(feedActions).toBeVisible();
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowLeft");
});

test("releases grouped overlay and resize interaction before selecting another camera", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      slide_transition: "fade",
      cameras: [
        {
          additional_camera: {
            entity_id: "camera.driveway",
            layout: "stacked",
          },
          entity_id: "camera.porch",
          title: "Group A/B",
        },
        { entity_id: "camera.driveway", title: "Driveway" },
        { entity_id: "camera.hall", title: "Hall" },
      ],
    });
  });

  const camera = card.locator("wzc-camera");
  const group = camera.locator("wzc-camera-group-view");
  const navigation = card.locator("wzc-camera-navigation button");
  await group.hover();
  await expect(group.locator(".feed-actions").first()).toHaveClass(/visible/);
  const groupViewports = group.locator("wzc-camera-live .viewport");
  await expect(groupViewports).toHaveCount(2);
  await groupViewports.evaluateAll((viewports) => {
    for (const viewport of viewports) {
      const badge = document.createElement("wzc-badge");
      badge.className = "source-indicator visible source-placement-probe";
      badge.setAttribute("shape", "pill");
      badge.textContent = "MSE";
      viewport.append(badge);
    }
  });
  const [stackedFeedBoxes, stackedSourceBoxes] = await Promise.all([
    group.locator(".feed").evaluateAll((feeds) =>
      feeds.map((feed) => {
        const rect = feed.getBoundingClientRect();
        return {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      }),
    ),
    group.locator(".source-placement-probe").evaluateAll((badges) =>
      badges.map((badge) => {
        const rect = badge.getBoundingClientRect();
        return {
          height: rect.height,
          right: rect.right,
          top: rect.top,
        };
      }),
    ),
  ]);
  const groupedSideLaneWidth = await group.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.cssText =
      "position:absolute;inline-size:var(--wzc-camera-side-lane-inline-size)";
    element.shadowRoot?.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  expect(stackedSourceBoxes).toHaveLength(2);
  for (const [index, feedBox] of stackedFeedBoxes.entries()) {
    const sourceBox = stackedSourceBoxes[index];
    expect(sourceBox).toBeDefined();
    if (!sourceBox) continue;
    expect(sourceBox.right).toBeCloseTo(
      feedBox.x + feedBox.width - groupedSideLaneWidth - 8,
      1,
    );
    expect(sourceBox.top).toBeCloseTo(feedBox.y + 8, 1);
  }
  const stackedSoloTarget = group
    .locator(".feed-actions")
    .first()
    .locator(".solo-target")
    .first();
  await expect(stackedSoloTarget.locator("path")).toHaveAttribute(
    "d",
    /^m4 20c/,
  );
  await stackedSoloTarget.click();
  await expect(group.locator(".feed:not(.hidden)")).toHaveCount(1);
  await expect(stackedSoloTarget.locator("path")).toHaveAttribute(
    "d",
    /^M8,18/,
  );
  await stackedSoloTarget.click();
  await expect(group.locator(".feed:not(.hidden)")).toHaveCount(2);

  const groupHandle = group.locator(".stage-resize-handle:visible").first();
  await groupHandle.press("End");
  await expect(groupHandle).toHaveAttribute("aria-valuenow", "100");

  await navigation.filter({ hasText: "Hall" }).click();
  await expect(camera.locator(".swiper-slide").nth(0)).toHaveAttribute(
    "inert",
    "",
  );
  await expect(camera.locator(".swiper-slide").nth(1)).not.toHaveAttribute(
    "inert",
  );
  const hall = camera
    .locator(".swiper-slide")
    .nth(1)
    .locator("wzc-camera-view")
    .first();
  await expect
    .poll(() =>
      group.evaluate(
        (element) => !(element as HTMLElement & { active: boolean }).active,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      hall.evaluate(
        (element) => (element as HTMLElement & { active: boolean }).active,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      camera.evaluate((element) => {
        const module = element as HTMLElement & {
          cameraSelection?: {
            subscribe(
              targetId: string,
              listener: (state: {
                activeEntityId?: string;
                activeEntityIds?: readonly string[];
                settled?: boolean;
              }) => void,
            ): () => void;
          };
          selectionId?: string;
        };
        let snapshot:
          | {
              activeEntityId?: string;
              activeEntityIds?: readonly string[];
              settled?: boolean;
            }
          | undefined;
        if (!module.cameraSelection || !module.selectionId) return undefined;
        const unsubscribe = module.cameraSelection.subscribe(
          module.selectionId,
          (state) => {
            snapshot = state;
          },
        );
        unsubscribe();
        return snapshot
          ? {
              activeEntityId: snapshot.activeEntityId,
              activeEntityIds: snapshot.activeEntityIds,
              settled: snapshot.settled,
            }
          : undefined;
      }),
    )
    .toEqual({
      activeEntityId: "camera.hall",
      activeEntityIds: ["camera.hall"],
      settled: true,
    });
  await hall.locator("wzc-camera-live .viewport").hover();
  await expect(camera.locator(".carousel-navigation.previous")).toBeVisible();

  const hallHandle = hall.locator(".stage-resize-handle:visible").first();
  await hallHandle.press("Home");
  await expect(hallHandle).toHaveAttribute("aria-valuenow", "56");
  await hallHandle.press("End");
  await expect(hallHandle).toHaveAttribute("aria-valuenow", "100");

  await navigation.filter({ hasText: "Group A/B" }).click();
  await expect(camera.locator(".swiper-slide").nth(0)).not.toHaveAttribute(
    "inert",
  );
  await expect(camera.locator(".swiper-slide").nth(1)).toHaveAttribute(
    "inert",
    "",
  );
  await expect
    .poll(() =>
      group.evaluate(
        (element) => (element as HTMLElement & { active: boolean }).active,
      ),
    )
    .toBe(true);
  await group.hover();
  await expect(group.locator(".feed-actions").first()).toHaveClass(/visible/);
  await expect(camera.locator(".carousel-navigation.next")).toBeVisible();

  await groupHandle.press("Home");
  await expect(groupHandle).toHaveAttribute("aria-valuenow", "56");
  await groupHandle.press("End");
  await expect(groupHandle).toHaveAttribute("aria-valuenow", "100");

  const groupViewport = group.locator("wzc-camera-live .viewport").first();
  await groupViewport.dblclick();
  await expect(groupViewport).toHaveAttribute("aria-label", /zoom 200 percent/);
  await groupViewport.dblclick();
  await expect(groupViewport).toHaveAttribute("aria-label", /zoom 100 percent/);
});

test("keeps grouped interaction alive across slide alert takeover", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
    const cardElement = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    const connection = {
      subscribeMessage: async (
        callback: (payload: unknown) => void,
        message: { type: string },
      ) => {
        if (message.type === "frigate/reviews/subscribe") {
          const target = window as unknown as {
            reviewNotifications?: Array<(payload: unknown) => void>;
          };
          target.reviewNotifications ??= [];
          target.reviewNotifications.push(callback);
        }
        return () => undefined;
      },
    };
    cardElement.setConfig({
      type: "custom:watchzone-card",
      alert_detection_takeover: "both",
      start_alert_takeover_on: true,
      cameras: [
        {
          additional_camera: {
            entity_id: "camera.driveway",
            layout: "stacked",
          },
          entity_id: "camera.porch",
          title: "Group A/B",
        },
        { entity_id: "camera.driveway", title: "Driveway" },
        { entity_id: "camera.hall", title: "Hall" },
      ],
    });
    cardElement.hass = {
      states: Object.fromEntries(
        ["porch", "driveway", "hall"].map((camera) => [
          `camera.${camera}`,
          {
            entity_id: `camera.${camera}`,
            state: "streaming",
            attributes: { friendly_name: camera },
          },
        ]),
      ),
      connection,
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { entity_id?: string; type: string }) => {
        if (message.type === "watchzone/activity/source") {
          return {
            type: "frigate",
            instance_id: "frigate-main",
            camera_name: message.entity_id?.replace("camera.", ""),
          };
        }
        if (message.type === "watchzone/live/camera/ready") {
          return { ready: false };
        }
        return undefined;
      },
    };
  });

  const navigation = card.locator("wzc-camera-navigation button");
  const hallButton = navigation.filter({ hasText: "Hall" });
  await hallButton.click();
  await expect(hallButton).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              reviewNotifications?: Array<(payload: unknown) => void>;
            }
          ).reviewNotifications?.length ?? 0,
      ),
    )
    .toBeGreaterThan(1);

  await emitReviewNotification(page, {
    type: "new",
    after: {
      camera: "driveway",
      id: "group-review",
      severity: "detection",
      start_time: Date.now() / 1000 - 1,
    },
  });
  const groupButton = navigation.filter({ hasText: "Group A/B" });
  await expect(groupButton).toHaveAttribute("aria-selected", "true");
  await expect(groupButton.locator(".option-indicator")).toHaveCount(1);
  const takeoverSlides = card.locator("wzc-camera .swiper-slide");
  await expect(takeoverSlides.nth(0)).not.toHaveAttribute("inert");
  await expect(takeoverSlides.nth(1)).toHaveAttribute("inert", "");

  const group = card.locator("wzc-camera-group-view");
  await group.hover();
  await expect(group.locator(".feed-actions").first()).toHaveClass(/visible/);
  const viewport = group.locator("wzc-camera-live .viewport").first();
  await viewport.dblclick();
  await expect(viewport).toHaveAttribute("aria-label", /zoom 200 percent/);
  const handle = group.locator(".stage-resize-handle:visible");
  await handle.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "100");

  await emitReviewNotification(page, {
    type: "update",
    after: {
      camera: "driveway",
      end_time: Date.now() / 1000,
      id: "group-review",
      severity: "detection",
      start_time: Date.now() / 1000 - 1,
    },
  });
  await expect(hallButton).toHaveAttribute("aria-selected", "true");
  await expect(groupButton.locator(".option-indicator")).toHaveCount(0);
  await expect(takeoverSlides.nth(0)).toHaveAttribute("inert", "");
  await expect(takeoverSlides.nth(1)).not.toHaveAttribute("inert");
  const hallViewport = card
    .locator("wzc-camera .swiper-slide")
    .nth(1)
    .locator("wzc-camera-live .viewport");
  await hallViewport.hover();
  await hallViewport.dblclick();
  await expect(hallViewport).toHaveAttribute("aria-label", /zoom 200 percent/);
});

test("keeps activity loading out of an active camera transition", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    const testWindow = window as typeof window & {
      __wzcReviewCalls?: string[];
    };
    testWindow.__wzcReviewCalls = [];
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:watchzone-card",
      cameras: [
        { entity_id: "camera.front", title: "Front" },
        { entity_id: "camera.back", title: "Back" },
      ],
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "unavailable",
          attributes: { friendly_name: "Front" },
        },
        "camera.back": {
          entity_id: "camera.back",
          state: "unavailable",
          attributes: { friendly_name: "Back" },
        },
      },
      connection: {
        subscribeMessage: async () => () => undefined,
      },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { entity_id?: string; type: string }) => {
        if (message.type === "watchzone/reviews/list") {
          testWindow.__wzcReviewCalls?.push(message.entity_id ?? "");
          return { items: [] };
        }
        if (message.type === "watchzone/events/list") return { items: [] };
        return { ready: false };
      },
    };
  });

  const carousel = page.locator("wzc-camera .camera-carousel");
  await expect(carousel).toHaveClass(/swiper-initialized/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & { __wzcReviewCalls?: string[] }
          ).__wzcReviewCalls?.filter((id) => id === "camera.front").length ?? 0,
      ),
    )
    .toBeGreaterThan(0);

  await carousel.evaluate((element) => {
    const swiper = (
      element as HTMLElement & {
        swiper: { slideTo(index: number, speed: number): void };
      }
    ).swiper;
    swiper.slideTo(1, 400);
  });
  await page.waitForTimeout(75);

  expect(
    await carousel.evaluate((element) => {
      const swiper = (
        element as HTMLElement & {
          swiper: { activeIndex: number; animating: boolean };
        }
      ).swiper;
      return { activeIndex: swiper.activeIndex, animating: swiper.animating };
    }),
  ).toEqual({ activeIndex: 1, animating: true });
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & { __wzcReviewCalls?: string[] }
        ).__wzcReviewCalls?.includes("camera.back") ?? false,
    ),
  ).toBe(false);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & { __wzcReviewCalls?: string[] }
          ).__wzcReviewCalls?.includes("camera.back") ?? false,
      ),
    )
    .toBe(true);

  await page.evaluate(() => {
    (
      window as typeof window & { __wzcReviewCalls?: string[] }
    ).__wzcReviewCalls = [];
  });
  await page
    .locator('wzc-camera-navigation button[data-value="camera.front"]')
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & { __wzcReviewCalls?: string[] }
          ).__wzcReviewCalls?.includes("camera.front") ?? false,
      ),
    )
    .toBe(true);
  expect(
    await carousel.evaluate(
      (element) =>
        (element as HTMLElement & { swiper: { animating: boolean } }).swiper
          .animating,
    ),
  ).toBe(true);
});

test("applies configured camera carousel transitions to swipe and arrow navigation", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const setTransition = (transition: "fade" | "none") =>
    page.locator("watchzone-card").evaluate((element, slideTransition) => {
      (
        element as HTMLElement & {
          setConfig(config: unknown): void;
        }
      ).setConfig({
        type: "custom:watchzone-card",
        slide_transition: slideTransition,
        cameras: [
          { entity_id: "camera.front", title: "Front" },
          { entity_id: "camera.back", title: "Back" },
        ],
      });
    }, transition);

  await setTransition("fade");
  const carousel = page.locator("wzc-camera .camera-carousel");
  await expect(carousel).toHaveClass(/swiper-fade/, { timeout: 10_000 });
  await expect
    .poll(() =>
      carousel.evaluate((element) => {
        const swiper = (
          element as HTMLElement & {
            swiper?: { params: { effect?: string; speed?: number } };
          }
        ).swiper;
        return { effect: swiper?.params.effect, speed: swiper?.params.speed };
      }),
    )
    .toEqual({ effect: "fade", speed: 300 });

  await page
    .locator('wzc-camera-navigation button[data-value="camera.back"]')
    .click();
  await page.waitForTimeout(75);
  expect(
    await carousel.evaluate((element) => {
      const swiper = (
        element as HTMLElement & {
          swiper?: { activeIndex: number; animating: boolean };
        }
      ).swiper;
      return { activeIndex: swiper?.activeIndex, animating: swiper?.animating };
    }),
  ).toEqual({ activeIndex: 1, animating: true });
  await expect
    .poll(() =>
      carousel.evaluate(
        (element) =>
          (element as HTMLElement & { swiper?: { animating: boolean } }).swiper
            ?.animating,
      ),
    )
    .toBe(false);

  await carousel
    .locator(".carousel-navigation.previous")
    .click({ force: true });
  await expect
    .poll(() =>
      carousel.evaluate(
        (element) =>
          (element as HTMLElement & { swiper?: { activeIndex: number } }).swiper
            ?.activeIndex,
      ),
    )
    .toBe(0);

  await setTransition("none");
  await expect(carousel).not.toHaveClass(/swiper-fade/);
  await expect
    .poll(() =>
      carousel.evaluate((element) => {
        const swiper = (
          element as HTMLElement & {
            swiper?: { params: { effect?: string; speed?: number } };
          }
        ).swiper;
        return { effect: swiper?.params.effect, speed: swiper?.params.speed };
      }),
    )
    .toEqual({ effect: "slide", speed: 0 });
});

test("uses readable camera navigation labels before HA state is available", async ({
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
        { entity_id: "camera.hall" },
        { entity_id: "camera.front_door" },
      ],
    });
  });

  const buttons = page.locator("wzc-camera-navigation button");
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveText("Hall");
  await expect(buttons.nth(1)).toHaveText("Front Door");
});

test("advances the authoritative camera selection through slideshow controls", async ({
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
      camera_switcher_overlay: true,
      slide_advance_time: 10,
      slide_transition: "fade",
      cameras: [
        { entity_id: "camera.front", title: "Front" },
        { entity_id: "camera.back", title: "Back" },
      ],
    });
  });

  const navigation = page.locator("wzc-camera-navigation button");
  await expect(page.locator("wzc-camera .camera-carousel")).toHaveClass(
    /swiper-fade/,
    { timeout: 10_000 },
  );
  const toolbarToggle = page.locator("wzc-activity-slideshow-toggle button");
  const overlayToggle = page.locator("wzc-slideshow button");
  const idleSlideshowBox = await overlayToggle.boundingBox();
  expect(idleSlideshowBox).not.toBeNull();
  expect(idleSlideshowBox?.width).toBeCloseTo(idleSlideshowBox?.height ?? 0, 1);
  await expect(navigation.nth(0)).toHaveAttribute("aria-selected", "true");
  const frontViewport = page
    .locator("wzc-camera .swiper-slide")
    .nth(0)
    .locator("wzc-camera-live .viewport");
  await frontViewport.dblclick();
  await expect(frontViewport).toHaveAttribute("aria-label", /zoom 200 percent/);
  const frontHandle = page
    .locator("wzc-camera .swiper-slide")
    .nth(0)
    .locator(".stage-resize-handle");
  await frontHandle.press("End");
  await expect(frontHandle).toHaveAttribute("aria-valuenow", "100");
  await expect(toolbarToggle).toHaveAttribute("aria-pressed", "false");
  await toolbarToggle.click();
  await expect(toolbarToggle).toHaveAttribute("aria-pressed", "true");
  await expect(overlayToggle).toHaveAttribute("aria-pressed", "true");
  await expect(overlayToggle.locator(".status")).toHaveText("10s");
  await expect(overlayToggle).toHaveClass(/dimmed/);
  const tenSecondSlideshowBox = await overlayToggle.boundingBox();
  expect(tenSecondSlideshowBox?.width).toBeGreaterThan(
    idleSlideshowBox?.width ?? 0,
  );
  await expect(overlayToggle.locator(".status")).toHaveText(/^[1-9]s$/, {
    timeout: 2_000,
  });
  const singleDigitSlideshowBox = await overlayToggle.boundingBox();
  expect(singleDigitSlideshowBox?.width).toBeCloseTo(
    tenSecondSlideshowBox?.width ?? 0,
    1,
  );

  await expect(navigation.nth(1)).toHaveAttribute("aria-selected", "true", {
    timeout: 12_000,
  });
  await expect(page.locator("wzc-camera-switcher .trigger span")).toHaveText(
    "Back",
  );
  const backViewport = page
    .locator("wzc-camera .swiper-slide")
    .nth(1)
    .locator("wzc-camera-live .viewport");
  await expect(backViewport).toHaveAttribute("aria-label", /zoom 100 percent/);
  await expect(
    page
      .locator("wzc-camera .swiper-slide")
      .nth(1)
      .locator(".stage-resize-handle"),
  ).toHaveAttribute("aria-valuenow", "100");

  await navigation.nth(0).click();
  await expect(navigation.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(frontViewport).toHaveAttribute("aria-label", /zoom 100 percent/);
  await expect(overlayToggle.locator(".status")).toHaveText("10s");
  await toolbarToggle.click();
  await expect(toolbarToggle).toHaveAttribute("aria-pressed", "false");
});

test("highlights live video directly from draft review notifications", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    const connection = {
      subscribeMessage: async (
        callback: (payload: unknown) => void,
        message: { type: string },
      ) => {
        if (message.type === "frigate/reviews/subscribe") {
          const target = window as unknown as {
            reviewNotifications?: Array<(payload: unknown) => void>;
          };
          target.reviewNotifications ??= [];
          target.reviewNotifications.push(callback);
        }
        return () => undefined;
      },
    };
    card.setConfig({
      type: "custom:watchzone-card",
      camera_switcher_overlay: true,
      slide_advance_time: 30,
      slide_transition: "fade",
      cameras: [
        { entity_id: "camera.front" },
        { entity_id: "camera.driveway" },
      ],
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
        "camera.driveway": {
          entity_id: "camera.driveway",
          state: "streaming",
          attributes: { friendly_name: "Driveway" },
        },
      },
      connection,
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { entity_id?: string; type: string }) => {
        if (message.type === "watchzone/activity/source") {
          return {
            type: "frigate",
            instance_id: "frigate-main",
            camera_name:
              message.entity_id === "camera.driveway" ? "driveway" : "front",
          };
        }
        if (message.type === "watchzone/live/camera/ready") {
          return { ready: false };
        }
        return undefined;
      },
    };
  });

  const carousel = page.locator("wzc-camera .camera-carousel");
  await expect(carousel).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              reviewNotifications?: Array<(payload: unknown) => void>;
            }
          ).reviewNotifications?.length ?? 0,
      ),
    )
    .toBeGreaterThan(1);

  await page.evaluate(() => {
    for (const callback of (
      window as unknown as {
        reviewNotifications?: Array<(payload: unknown) => void>;
      }
    ).reviewNotifications ?? [])
      callback(
        JSON.stringify({
          type: "new",
          after: {
            camera: "front",
            id: "review-1",
            severity: "detection",
          },
        }),
      );
  });
  await expect(carousel).toHaveClass(/activity-detection/);

  const cameraButtons = page.locator("wzc-camera-navigation button");
  await expect(
    cameraButtons.nth(0).locator(".option-indicator.warning"),
  ).toBeVisible();
  await cameraButtons.nth(1).click();
  await expect(carousel).not.toHaveClass(/activity-(alert|detection)/);
  await cameraButtons.nth(0).click();
  await expect(carousel).toHaveClass(/activity-detection/);

  await page.evaluate(() => {
    for (const callback of (
      window as unknown as {
        reviewNotifications?: Array<(payload: unknown) => void>;
      }
    ).reviewNotifications ?? [])
      callback(
        JSON.stringify({
          type: "update",
          after: { camera: "front", id: "review-1", severity: "alert" },
        }),
      );
  });
  await expect(carousel).toHaveClass(/activity-alert/);

  await cameraButtons.nth(1).click();

  await page.evaluate(() => {
    for (const callback of (
      window as unknown as {
        reviewNotifications?: Array<(payload: unknown) => void>;
      }
    ).reviewNotifications ?? [])
      callback(
        JSON.stringify({
          type: "end",
          after: { camera: "front", id: "review-1", severity: "alert" },
        }),
      );
  });
  await cameraButtons.nth(0).click();
  await expect(carousel).not.toHaveClass(/activity-(alert|detection)/);

  const takeoverToggle = page.locator("wzc-activity-takeover-toggle button");
  await page.locator("wzc-activity-takeover-toggle").evaluate((element) => {
    element.style.setProperty(
      "--wzc-stage-stack-button-color",
      "rgb(90, 90, 90)",
    );
    element.style.setProperty(
      "--wzc-stage-stack-button-hover-color",
      "rgb(0, 120, 200)",
    );
  });
  await expect(takeoverToggle).toHaveAttribute("aria-pressed", "false");
  const inactiveTakeoverColor = await takeoverToggle.evaluate(
    (button) => getComputedStyle(button).color,
  );
  await takeoverToggle.click();
  await expect(takeoverToggle).toHaveAttribute("aria-pressed", "true");
  const activeTakeoverColor = await takeoverToggle.evaluate(
    (button) => getComputedStyle(button).color,
  );
  expect(activeTakeoverColor).not.toBe(inactiveTakeoverColor);
  await takeoverToggle.click();
  await expect(takeoverToggle).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() =>
      takeoverToggle.evaluate((button) => getComputedStyle(button).color),
    )
    .toBe(inactiveTakeoverColor);
  await page.mouse.move(0, 0);
  await takeoverToggle.hover();
  await expect
    .poll(() =>
      takeoverToggle.evaluate((button) => getComputedStyle(button).color),
    )
    .toBe(inactiveTakeoverColor);
  await takeoverToggle.click();
  await expect(takeoverToggle).toHaveAttribute("aria-pressed", "true");
  const slideshowToggle = page.locator("wzc-activity-slideshow-toggle button");
  await slideshowToggle.click();
  await expect(slideshowToggle).toHaveAttribute("aria-pressed", "true");

  await page.evaluate(() => {
    for (const callback of (
      window as unknown as {
        reviewNotifications?: Array<(payload: unknown) => void>;
      }
    ).reviewNotifications ?? [])
      callback(
        JSON.stringify({
          type: "new",
          after: {
            camera: "driveway",
            data: { objects: ["car"], zones: ["driveway"] },
            id: "review-2",
            severity: "detection",
            start_time: Date.now() / 1000 - 2,
          },
        }),
      );
  });
  await expect(cameraButtons.nth(1)).toHaveAttribute("aria-selected", "true");
  const slideshowOverlay = page.locator("wzc-slideshow button");
  await expect(slideshowOverlay.locator(".status")).toHaveText("Hold");
  const activeDraft = page.locator("wzc-reviews .tile").first();
  await expect(activeDraft.locator(".in-progress")).toHaveText("In progress");
  await expect(activeDraft).toContainText("Detection");
  const takeoverViewport = page
    .locator("wzc-camera .swiper-slide")
    .nth(1)
    .locator("wzc-camera-live .viewport");
  await takeoverViewport.hover();
  await expect(
    page.locator("wzc-camera .carousel-navigation.previous"),
  ).toBeVisible();
  await takeoverViewport.dblclick();
  await expect(takeoverViewport).toHaveAttribute(
    "aria-label",
    /zoom 200 percent/,
  );
  await takeoverViewport.dblclick();
  const takeoverHandle = page
    .locator("wzc-camera .swiper-slide")
    .nth(1)
    .locator(".stage-resize-handle:visible");
  await takeoverHandle.press("End");
  await expect(takeoverHandle).toHaveAttribute("aria-valuenow", "100");
  const toolbarBackgrounds = await page
    .locator(
      "wzc-activity-takeover-toggle button, wzc-activity-filter .filter-trigger, wzc-activity-calendar .calendar-trigger",
    )
    .evaluateAll((buttons) =>
      buttons.map((button) => getComputedStyle(button).backgroundColor),
    );
  expect(new Set(toolbarBackgrounds)).toEqual(new Set(["rgba(0, 0, 0, 0)"]));
  await page.evaluate(() => {
    for (const callback of (
      window as unknown as {
        reviewNotifications?: Array<(payload: unknown) => void>;
      }
    ).reviewNotifications ?? [])
      callback(
        JSON.stringify({
          type: "new",
          after: {
            camera: "front",
            data: { objects: ["person"], zones: ["porch"] },
            id: "review-3",
            severity: "alert",
            start_time: Date.now() / 1000 - 1,
          },
        }),
      );
  });
  await expect(cameraButtons.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(
    cameraButtons.nth(0).locator(".option-indicator.danger"),
  ).toBeVisible();

  await page.evaluate(() => {
    for (const callback of (
      window as unknown as {
        reviewNotifications?: Array<(payload: unknown) => void>;
      }
    ).reviewNotifications ?? [])
      callback(
        JSON.stringify({
          type: "end",
          after: {
            camera: "driveway",
            id: "review-2",
            severity: "detection",
          },
        }),
      );
  });
  await expect(cameraButtons.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(activeDraft.locator(".in-progress")).toHaveText("In progress");
  await expect(activeDraft).toContainText("Alert");
  await expect(slideshowOverlay.locator(".status")).toHaveText("Hold");
  await page.evaluate(() => {
    for (const callback of (
      window as unknown as {
        reviewNotifications?: Array<(payload: unknown) => void>;
      }
    ).reviewNotifications ?? [])
      callback(
        JSON.stringify({
          type: "end",
          after: {
            camera: "front",
            id: "review-3",
            severity: "alert",
          },
        }),
      );
  });
  await expect(cameraButtons.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(slideshowOverlay.locator(".status")).toHaveText("30s");

  await page.evaluate(() => {
    for (const callback of (
      window as unknown as {
        reviewNotifications?: Array<(payload: unknown) => void>;
      }
    ).reviewNotifications ?? [])
      callback(
        JSON.stringify({
          type: "new",
          after: {
            camera: "front",
            id: "review-4",
            severity: "alert",
            start_time: Date.now() / 1000,
          },
        }),
      );
  });
  await expect(cameraButtons.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(slideshowOverlay.locator(".status")).toHaveText("Hold");
  await slideshowOverlay.click();
  await expect(cameraButtons.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(slideshowOverlay.locator(".status")).toHaveText("30s");
});

test("keeps activity content in an independently scrolling viewport", async ({
  page,
}) => {
  let previewRequests = 0;
  await installHaIconFixture(page);
  await page.route("**/thumbnail.svg", async (route) => {
    await route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="black"/></svg>',
      contentType: "image/svg+xml",
    });
  });
  await page.route("**/recording.mp4", async (route) => {
    await route.fulfill({ body: "", contentType: "video/mp4" });
  });
  await page.route(/\/recording\.mp4\?download=true$/, async (route) => {
    await route.fulfill({
      body: "review recording",
      contentType: "video/mp4",
      headers: {
        "Content-Disposition": 'attachment; filename="recording.mp4"',
      },
    });
  });
  await page.route("**/review-preview.gif", async (route) => {
    previewRequests += 1;
    await route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="blue"/></svg>',
      contentType: "image/svg+xml",
    });
  });
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    const events = (camera: string) =>
      Array.from({ length: 6 }, (_, index) => {
        const start = 1_700_000_000 - index * 60 - (index === 0 ? 0 : 86_400);
        return {
          camera,
          clip_url: index === 0 ? "/recording.mp4" : null,
          end_time: start + 24,
          has_clip: index === 0,
          has_snapshot: index !== 3,
          id: `frigate:${camera}:${index}`,
          label: index === 0 ? "person" : "bird",
          playback_sources:
            index < 2
              ? [
                  {
                    content_type: "video/mp4",
                    transport: "file",
                    url: "/recording.mp4",
                  },
                ]
              : [],
          preferred_transport: "file",
          revision: `revision-${index}`,
          snapshot_url: index === 3 ? null : "/thumbnail.svg",
          start_time: start,
          sub_label: index === 0 ? "Resident" : null,
          thumbnail_url: index === 3 ? null : "/thumbnail.svg",
          zones: [camera === "back" ? "back_yard" : "driveway"],
        };
      });
    card.setConfig({
      type: "custom:watchzone-card",
      event_history_days: 7,
      cameras: [
        { entity_id: "camera.front", title: "Front" },
        { entity_id: "camera.back", title: "Back" },
      ],
    });
    card.style.setProperty("--restore-card-border-radius", "21px");
    card.style.setProperty("--ha-card-border-radius", "0px");
    card.style.setProperty("--ha-color-on-primary-normal", "#111111");
    card.style.setProperty("--primary-color", "#03a9f4");
    card.style.setProperty("--success-color", "#00a000");
    card.style.setProperty("--text-primary-color", "#ffffff");
    card.style.setProperty("--warning-color", "#d09000");
    card.hass = {
      config: { time_zone: "America/New_York" },
      locale: {
        date_format: "MDY",
        language: "en",
        time_format: "12",
        time_zone: "server",
      },
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
        "camera.back": {
          entity_id: "camera.back",
          state: "streaming",
          attributes: { friendly_name: "Back" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: {
        entity_id?: string;
        path?: string;
        type: string;
      }) => {
        if (message.type === "watchzone/live/camera/ready") {
          return { ready: false };
        }
        if (message.type === "watchzone/events/list") {
          return {
            items: events(
              message.entity_id === "camera.back" ? "back" : "front",
            ),
          };
        }
        if (message.type === "watchzone/reviews/list") {
          const camera = message.entity_id === "camera.back" ? "back" : "front";
          return {
            items: events(camera).map((event, index) => ({
              analysis_description:
                index === 0
                  ? "The resident enters the garage and approaches the red car."
                  : null,
              analysis_concerns: [],
              analysis_score: index === 0 ? 0.98 : null,
              analysis_title: index === 0 ? "Resident entering garage" : null,
              camera,
              classification: index === 0 ? "alert" : "detection",
              clip_url: event.clip_url,
              download_url: event.clip_url
                ? `${event.clip_url}?download=true`
                : null,
              end_time: event.end_time,
              id: `review:${camera}:${index}`,
              labels: [event.label],
              media_end_time: event.end_time + 5,
              media_start_time: event.start_time - 5,
              playback_sources: event.playback_sources,
              preferred_transport: "hls",
              preview_url: "/review-preview.gif",
              revision: event.revision,
              related_event_ids: [event.id],
              reviewed: false,
              snapshot_url: event.snapshot_url,
              start_time: event.start_time,
              sub_labels: event.sub_label ? [event.sub_label] : [],
              thumbnail_url: event.thumbnail_url,
              zones: event.zones,
            })),
          };
        }
        if (message.type === "watchzone/reviews/tracking_details") {
          return {
            objects: [
              {
                end_time: 1_700_000_024,
                events: [
                  {
                    area: 37_742,
                    area_percentage: 7.28,
                    kind: "detected",
                    ratio: 0.74,
                    score: 0.56,
                    timestamp: 1_700_000_000,
                    zones: [],
                  },
                  {
                    area: 43_860,
                    area_percentage: 8.46,
                    kind: "entered_zone",
                    ratio: 0.67,
                    score: 0.86,
                    timestamp: 1_700_000_003,
                    zones: ["garage"],
                  },
                  {
                    area: 41_200,
                    area_percentage: 7.95,
                    kind: "became_stationary",
                    ratio: 0.71,
                    score: 0.82,
                    timestamp: 1_700_000_006,
                    zones: ["garage"],
                  },
                  {
                    area: 40_100,
                    area_percentage: 7.74,
                    kind: "became_active",
                    ratio: 0.73,
                    score: 0.8,
                    timestamp: 1_700_000_010,
                    zones: ["garage"],
                  },
                  {
                    area: 39_000,
                    area_percentage: 7.52,
                    kind: "left",
                    ratio: 0.76,
                    score: 0.78,
                    timestamp: 1_700_000_024,
                    zones: [],
                  },
                ],
                id: "frigate:front:0",
                label: "person",
                start_time: 1_700_000_000,
                sub_label: "Resident",
              },
            ],
            review_id: "review:front:0",
          };
        }
        if (message.type === "watchzone/exports/prepare") {
          return {
            name: "front 2026-11-10 15:59:55 2026-11-10 16:00:29",
          };
        }
        if (message.type === "watchzone/exports/create") {
          const requests = ((
            window as Window & {
              reviewExportRequests?: unknown[];
            }
          ).reviewExportRequests ??= []);
          requests.push(message);
          return { export_id: "front-export", success: true };
        }
        if (message.type === "watchzone/exports/list") {
          return {
            items: [
              {
                camera: "front",
                created_time: 1_794_352_800,
                download_path: "/export-video.mp4?download=true",
                entity_id: "camera.front",
                id: "front-export",
                in_progress: false,
                name: "Resident at garage",
                revision: "export-revision",
                thumbnail_path: "/export-thumbnail.svg",
                video_path: "/export-video.mp4",
              },
            ],
          };
        }
        if (message.type === "auth/sign_path") {
          return { path: message.path };
        }
        return undefined;
      },
    };
  });

  const stackNavigation = page.locator(".stage-stack-navigation");
  const stackButtons = stackNavigation.locator(".stage-stack-button");
  await expect(stackButtons).toHaveCount(4);
  const reviewTiles = page.locator("wzc-reviews .tile");
  await expect(reviewTiles).toHaveCount(6);
  const normalNavigation = await stackNavigation.evaluate((navigation) => {
    const buttons = [...navigation.querySelectorAll("button")];
    const active = getComputedStyle(buttons[0]!);
    const activeIcon = getComputedStyle(buttons[0]!.querySelector("svg")!);
    const activePath = getComputedStyle(buttons[0]!.querySelector("path")!);
    const inactive = getComputedStyle(buttons[1]!);
    const navigationRect = navigation.getBoundingClientRect();
    const firstRect = buttons[0]!.getBoundingClientRect();
    return {
      activeBackground: active.backgroundColor,
      activeColor: active.color,
      activeIconColor: activeIcon.color,
      activeIconOpacity: activeIcon.opacity,
      activePathFill: activePath.fill,
      firstHeight: firstRect.height,
      leadingInset: firstRect.left - navigationRect.left,
      inactiveBackground: inactive.backgroundColor,
      inactiveColor: inactive.color,
      outlineStyle: inactive.outlineStyle,
    };
  });
  const firstNavigationBox = await stackButtons.first().boundingBox();
  const firstReviewTileBox = await reviewTiles.first().boundingBox();
  expect(firstNavigationBox?.x).toBeCloseTo(firstReviewTileBox?.x ?? -1, 0);
  expect(normalNavigation.leadingInset).toBeGreaterThan(0);
  expect(normalNavigation.firstHeight).toBeGreaterThanOrEqual(44);
  expect(normalNavigation.outlineStyle).toBe("none");
  expect(normalNavigation.activeBackground).not.toBe(
    normalNavigation.inactiveBackground,
  );
  expect(normalNavigation.activeColor).not.toBe(normalNavigation.inactiveColor);
  expect(normalNavigation.activeColor).toBe("rgb(255, 255, 255)");
  expect(normalNavigation.activeIconColor).toBe("rgb(255, 255, 255)");
  expect(normalNavigation.activeIconOpacity).toBe("1");
  expect(normalNavigation.activePathFill).toBe("rgb(255, 255, 255)");
  const analysisTitle = page.locator("wzc-reviews .analysis-title");
  await expect(analysisTitle).toHaveCount(1);
  await expect(analysisTitle).toContainText("Resident entering garage");
  await expect(analysisTitle.locator("ha-icon")).toHaveAttribute(
    "icon",
    "mdi:creation",
  );
  const analysisTopBeforeExport = await analysisTitle.evaluate((element) => {
    const tile = element.closest(".tile");
    if (!tile)
      throw new Error("Expected the AI title inside an activity tile.");
    return (
      element.getBoundingClientRect().top - tile.getBoundingClientRect().top
    );
  });
  const standardTileLayout = await analysisTitle.evaluate((element) => {
    const tile = element.closest(".tile");
    const thumbnail = tile?.querySelector(".thumbnail-wrap");
    const badges = tile?.querySelector(".badges");
    const details = tile?.querySelector(".details");
    const aside = tile?.querySelector(".review-aside");
    const actions = tile?.querySelector(".actions");
    const firstBadge = badges?.querySelector("wzc-badge");
    if (
      !tile ||
      !thumbnail ||
      !badges ||
      !firstBadge ||
      !details ||
      !aside ||
      !actions
    ) {
      throw new Error("Expected the complete standard activity-tile grid.");
    }
    const tileBounds = tile.getBoundingClientRect();
    const thumbnailBounds = thumbnail.getBoundingClientRect();
    const badgeBounds = firstBadge.getBoundingClientRect();
    const detailBounds = details.getBoundingClientRect();
    const asideBounds = aside.getBoundingClientRect();
    const actionBounds = actions.getBoundingClientRect();
    const analysisBounds = element.getBoundingClientRect();
    const metadataRows = details.querySelectorAll(".metadata");
    const firstMetadataBounds = metadataRows[0]?.getBoundingClientRect();
    const secondMetadataBounds = metadataRows[1]?.getBoundingClientRect();
    if (!firstMetadataBounds || !secondMetadataBounds) {
      throw new Error("Expected adjacent activity metadata rows.");
    }
    return {
      actionsAfterAside: actionBounds.left >= asideBounds.right,
      actionCenterDelta: Math.abs(
        actionBounds.top +
          actionBounds.height / 2 -
          (tileBounds.top + tileBounds.height / 2),
      ),
      analysisActionHeightDelta: Math.abs(
        analysisBounds.height - actionBounds.height,
      ),
      analysisActionTopDelta: Math.abs(analysisBounds.top - actionBounds.top),
      analysisGap: analysisBounds.top - badgeBounds.bottom,
      asideAfterDetails: asideBounds.left >= detailBounds.right,
      badgeInset: badgeBounds.top - tileBounds.top,
      contentBelowBadges:
        detailBounds.top >= badgeBounds.bottom &&
        analysisBounds.top >= badgeBounds.bottom &&
        actionBounds.top >= badgeBounds.bottom,
      metadataRowGap: secondMetadataBounds.top - firstMetadataBounds.bottom,
      standard: tile.classList.contains("standard"),
      thumbnailBottom: Math.abs(thumbnailBounds.bottom - tileBounds.bottom),
      thumbnailTop: Math.abs(thumbnailBounds.top - tileBounds.top),
    };
  });
  expect(standardTileLayout.standard).toBe(true);
  expect(standardTileLayout.thumbnailTop).toBeLessThanOrEqual(1);
  expect(standardTileLayout.thumbnailBottom).toBeLessThanOrEqual(1);
  expect(standardTileLayout.badgeInset).toBeGreaterThanOrEqual(13);
  expect(standardTileLayout.analysisGap).toBeGreaterThanOrEqual(5);
  expect(standardTileLayout.contentBelowBadges).toBe(true);
  expect(standardTileLayout.metadataRowGap).toBeGreaterThanOrEqual(1);
  expect(standardTileLayout.asideAfterDetails).toBe(true);
  expect(standardTileLayout.actionsAfterAside).toBe(true);
  expect(standardTileLayout.actionCenterDelta).toBeLessThanOrEqual(1);
  expect(standardTileLayout.analysisActionHeightDelta).toBeLessThanOrEqual(1);
  expect(standardTileLayout.analysisActionTopDelta).toBeLessThanOrEqual(1);
  const detectionTile = page
    .locator("wzc-reviews .tile")
    .filter({ has: page.locator(".thumbnail-wrap.detection") })
    .first();
  const detectionColors = await detectionTile.evaluate((tile) => {
    const outline = tile.querySelector(".thumbnail-wrap.detection");
    const badges = [...tile.querySelectorAll("wzc-badge")];
    const detectionBadge = badges.find(
      (badge) => badge.textContent?.trim() === "Detection",
    );
    const badgeSurface = detectionBadge?.shadowRoot?.querySelector(".badge");
    if (!outline || !badgeSurface) {
      throw new Error("Expected a detection outline and classification badge.");
    }
    return {
      badge: getComputedStyle(badgeSurface).backgroundColor,
      outline: getComputedStyle(outline, "::after").borderTopColor,
    };
  });
  expect(detectionColors.badge).toBe(detectionColors.outline);
  await expect(page.locator("wzc-events .analysis-title")).toHaveCount(0);
  const reviewExportButtons = page.getByRole("button", {
    name: "Export review",
  });
  await expect(reviewExportButtons).toHaveCount(2);
  const cursor = (selector: string) =>
    page
      .locator(`wzc-reviews ${selector}`)
      .first()
      .evaluate((element) => getComputedStyle(element).cursor);
  const reviewActionCursors = {
    download: await cursor('button[aria-label="Download clip"]'),
    export: await cursor('button[aria-label="Export review"]'),
    snapshot: await cursor('button[aria-label="View snapshot"]'),
  };
  expect(reviewActionCursors).toEqual({
    download: "pointer",
    export: "pointer",
    snapshot: "pointer",
  });
  const reviewInfo = page
    .locator('wzc-reviews button[aria-label="View tracking details"]')
    .first();
  await expect(reviewInfo).toBeVisible();
  const infoDefaultColor = await reviewInfo.evaluate((button) => ({
    button: getComputedStyle(button).color,
    tile: getComputedStyle(button.closest(".tile")!).color,
  }));
  expect(infoDefaultColor.button).toBe(infoDefaultColor.tile);
  await reviewInfo.hover();
  await expect
    .poll(() => reviewInfo.evaluate((button) => getComputedStyle(button).color))
    .toBe("rgb(3, 169, 244)");
  await reviewInfo.click();
  const trackingDialog = page.locator(
    "wzc-reviews wzc-review-tracking-dialog dialog",
  );
  await expect(trackingDialog).toBeVisible();
  await expect(trackingDialog).toContainText("Tracking details");
  await expect(trackingDialog).toContainText("Resident entering garage");
  await expect(trackingDialog).toContainText("Resident entered garage");
  await expect(trackingDialog.locator(".tracking")).toHaveClass(/alert/);
  const trackingEvent = trackingDialog.locator(".lifecycle-event").first();
  await trackingEvent.hover();
  const trackingMetrics = trackingDialog.locator(".event-metrics");
  await expect(trackingMetrics).toBeVisible();
  await expect(trackingMetrics).toContainText("56%");
  await expect(trackingMetrics).toContainText("0.74");
  await expect(trackingMetrics).toContainText("37,742px");
  await trackingDialog.locator(".lifecycle-event").last().hover();
  await expect(trackingMetrics).toBeVisible();
  const containedMetrics = await trackingMetrics.evaluate((metrics) => {
    const dialog = metrics.closest("dialog");
    if (!dialog) throw new Error("Expected tracking metrics in a dialog.");
    const dialogBounds = dialog.getBoundingClientRect();
    const metricsBounds = metrics.getBoundingClientRect();
    return {
      bottom: metricsBounds.bottom <= dialogBounds.bottom,
      left: metricsBounds.left >= dialogBounds.left,
      right: metricsBounds.right <= dialogBounds.right,
      top: metricsBounds.top >= dialogBounds.top,
    };
  });
  expect(containedMetrics).toEqual({
    bottom: true,
    left: true,
    right: true,
    top: true,
  });
  await trackingDialog
    .locator('button[aria-label="Close tracking details"]')
    .click();
  await expect(trackingDialog).not.toBeVisible();
  const reviewDownloadPromise = page.waitForEvent("download");
  await page
    .locator('wzc-reviews button[aria-label="Download clip"]')
    .first()
    .click();
  const reviewDownload = await reviewDownloadPromise;
  expect(reviewDownload.suggestedFilename()).toMatch(/\.mp4$/);
  await expect(
    page.locator('wzc-events button[aria-label="Export review"]'),
  ).toHaveCount(0);
  await reviewExportButtons.first().click();
  const exportDialog = page.locator(
    "wzc-reviews wzc-review-export-dialog dialog",
  );
  await expect(exportDialog).toBeVisible();
  await expect(exportDialog.locator("input")).toHaveValue(
    "front 2026-11-10 15:59:55 2026-11-10 16:00:29",
  );
  const confirmExport = exportDialog.getByRole("button", { name: "Export" });
  await expect(confirmExport).toHaveText("Export");
  const confirmColors = await confirmExport.evaluate((button) => {
    const style = getComputedStyle(button);
    return { background: style.backgroundColor, foreground: style.color };
  });
  expect(confirmColors.foreground).not.toBe(confirmColors.background);
  await exportDialog.locator("input").fill("Resident at garage");
  await confirmExport.click();
  await expect(exportDialog).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              reviewExportRequests?: unknown[];
            }
          ).reviewExportRequests?.length ?? 0,
      ),
    )
    .toBe(1);
  await expect(
    page.locator("wzc-reviews .export-status.success"),
  ).toContainText("Export successful");
  const exportPresentation = await page
    .locator("wzc-reviews .export-status.success")
    .evaluate((status) => {
      const analysis = status
        .closest(".review-aside")
        ?.querySelector(".analysis-title");
      if (!analysis)
        throw new Error("Expected the AI title beside export state.");
      const tile = status.closest(".tile");
      if (!tile) throw new Error("Expected the export state inside a tile.");
      return {
        analysisHeight: analysis.getBoundingClientRect().height,
        analysisTop:
          analysis.getBoundingClientRect().top -
          tile.getBoundingClientRect().top,
        statusHeight: status.getBoundingClientRect().height,
      };
    });
  expect(exportPresentation.analysisTop).toBeCloseTo(
    analysisTopBeforeExport,
    0,
  );
  expect(exportPresentation.statusHeight).toBeCloseTo(
    exportPresentation.analysisHeight,
    0,
  );
  await page
    .locator("wzc-reviews wzc-activity-list")
    .evaluate(async (element) => {
      const list = element as HTMLElement & {
        items: Array<{
          analysisTitle?: string;
          exportProgress?: number;
          exportStatus?: string;
          exportStatusText?: string;
        }>;
        updateComplete: Promise<boolean>;
      };
      list.items = list.items.map((item) =>
        item.analysisTitle
          ? {
              ...item,
              exportProgress: undefined,
              exportStatus: "progress",
              exportStatusText: "Export in progress",
            }
          : item,
      );
      await list.updateComplete;
    });
  const progressPresentation = await page
    .locator("wzc-reviews .export-status.progress")
    .evaluate((status) => {
      const aside = status.closest(".review-aside");
      const analysis = aside?.querySelector(".analysis-title");
      const spinner = status.querySelector(".export-spinner");
      if (!analysis || !spinner) {
        throw new Error("Expected matched AI and export progress chips.");
      }
      return {
        analysisHeight: analysis.getBoundingClientRect().height,
        spinnerHeight: spinner.getBoundingClientRect().height,
        statusHeight: status.getBoundingClientRect().height,
      };
    });
  expect(progressPresentation.statusHeight).toBeCloseTo(
    progressPresentation.analysisHeight,
    0,
  );
  expect(progressPresentation.spinnerHeight).toBeLessThanOrEqual(16);
  await analysisTitle.click();
  const analysisDialog = page.locator(
    "wzc-reviews wzc-review-analysis-dialog dialog",
  );
  await expect(analysisDialog).toBeVisible();
  await expect(analysisDialog).toContainText("AI Analysis");
  await expect(analysisDialog).toContainText(
    "The resident enters the garage and approaches the red car.",
  );
  await expect(analysisDialog).toContainText("98%");
  await expect(analysisDialog).toContainText("Concerns");
  await expect(analysisDialog).toContainText("None");
  const dialogPosition = await analysisDialog.evaluate((dialogElement) => {
    let current: Element | null = dialogElement;
    let card: HTMLElement | null = null;
    while (current) {
      if (current instanceof HTMLElement && current.matches("watchzone-card")) {
        card = current;
        break;
      }
      const root = current.getRootNode();
      current = root instanceof ShadowRoot ? root.host : current.parentElement;
    }
    if (!card)
      throw new Error("Expected analysis dialog inside WatchZone card.");
    const cardBounds = card.getBoundingClientRect();
    const dialogBounds = dialogElement.getBoundingClientRect();
    const viewportInset = 8;
    const expectedLeft = Math.min(
      Math.max(
        cardBounds.left + (cardBounds.width - dialogBounds.width) / 2,
        viewportInset,
      ),
      window.innerWidth - dialogBounds.width - viewportInset,
    );
    const expectedTop = Math.min(
      Math.max(
        cardBounds.top + (cardBounds.height - dialogBounds.height) / 2,
        viewportInset,
      ),
      window.innerHeight - dialogBounds.height - viewportInset,
    );
    return {
      left: Math.abs(dialogBounds.left - expectedLeft),
      top: Math.abs(dialogBounds.top - expectedTop),
    };
  });
  expect(dialogPosition.left).toBeLessThanOrEqual(1);
  expect(dialogPosition.top).toBeLessThanOrEqual(1);
  await page
    .locator(
      'wzc-reviews wzc-review-analysis-dialog button[aria-label="Close AI analysis"]',
    )
    .click();
  await expect(analysisDialog).not.toBeVisible();
  const reviewHeaders = page.locator(
    "wzc-reviews wzc-activity-list wzc-media-day-header",
  );
  await expect(reviewHeaders).toHaveCount(2);
  await expect(reviewHeaders.first()).toContainText("Reviews");
  const reviewHeaderInset = await page
    .locator("wzc-reviews .viewport")
    .evaluate((viewport) => {
      const header = viewport.querySelector("wzc-media-day-header");
      if (!header) throw new Error("Expected the Reviews day heading.");
      return (
        header.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top
      );
    });
  expect(reviewHeaderInset).toBeCloseTo(0, 0);
  const reviewState = page.locator("wzc-reviews .review-state").first();
  await expect(reviewState).toHaveClass(/unreviewed/);
  await expect(reviewState).toHaveAttribute("aria-pressed", "false");
  await expect(reviewState.locator(".review-state-label")).toHaveText(
    "Not reviewed",
  );
  await expect(reviewState.locator(".review-state-plus")).toHaveCount(1);
  const unreviewedPresentation = await reviewState.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      background: style.backgroundColor,
      borderColor: style.borderTopColor,
      color: style.color,
      cursor: style.cursor,
      height: button.getBoundingClientRect().height,
    };
  });
  expect(unreviewedPresentation.borderColor).toBe(unreviewedPresentation.color);
  expect(unreviewedPresentation.background).toBe("rgba(0, 0, 0, 0)");
  expect(unreviewedPresentation.cursor).toBe("pointer");
  expect(unreviewedPresentation.height).toBeLessThan(24);
  const reviewStatePlacement = await reviewState.evaluate((button) => {
    const thumbnail = button
      .closest(".tile")!
      .querySelector(".thumbnail-wrap")!
      .getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    return {
      outsideThumbnail: buttonBounds.left >= thumbnail.right,
    };
  });
  expect(reviewStatePlacement.outsideThumbnail).toBe(true);
  expect(previewRequests).toBe(0);
  await expect
    .poll(() =>
      page.locator("wzc-reviews wzc-activity-list").evaluate(
        (element) =>
          (
            element as HTMLElement & {
              items: Array<{ hoverPreviewUrl?: string }>;
            }
          ).items[0]?.hoverPreviewUrl,
      ),
    )
    .toBe("/review-preview.gif");
  await reviewState.hover();
  await expect
    .poll(() =>
      reviewState.evaluate(
        (button) => getComputedStyle(button).backgroundColor,
      ),
    )
    .not.toBe(unreviewedPresentation.background);
  await page.mouse.move(0, 0);
  await page
    .locator("wzc-reviews .tile")
    .first()
    .hover({
      position: { x: 10, y: 10 },
    });
  await expect(page.locator("wzc-reviews .hover-preview")).toHaveCount(1);
  await expect.poll(() => previewRequests).toBe(1);
  await page.mouse.move(0, 0);
  await expect(page.locator("wzc-reviews .hover-preview")).toHaveCount(0);
  await reviewState.click();
  await expect(reviewState).toHaveClass(/^review-state reviewed$/);
  await expect(reviewState).toHaveAttribute("aria-pressed", "true");
  await expect(reviewState.locator(".review-state-label")).toHaveText(
    "Reviewed",
  );
  await expect(reviewState.locator(".review-state-plus")).toHaveCount(0);
  await expect
    .poll(() =>
      reviewState
        .locator(".review-state-indicator")
        .evaluate((indicator) => getComputedStyle(indicator).color),
    )
    .not.toBe(unreviewedPresentation.color);
  const alertList = page.locator("wzc-reviews wzc-activity-list");
  await alertList.evaluate(async (element) => {
    const list = element as HTMLElement & {
      items: Array<{
        inProgress?: boolean;
        playbackSources: readonly unknown[];
      }>;
      resolvePlayback?: () => Promise<{
        playbackSources: readonly unknown[];
        preferredTransport: "file";
      }>;
      updateComplete: Promise<boolean>;
    };
    const originalItems = list.items;
    const originalResolver = list.resolvePlayback;
    Object.assign(list, {
      items: [
        {
          ...originalItems[0],
          inProgress: true,
          playbackSources: [],
        },
      ],
      resolvePlayback: async () => ({
        playbackSources: [
          {
            content_type: "video/mp4",
            transport: "file",
            url: "/recording.mp4",
          },
        ],
        preferredTransport: "file" as const,
      }),
    });
    await list.updateComplete;
    (
      list as typeof list & {
        restoreDraftFixture?: () => void;
      }
    ).restoreDraftFixture = () => {
      list.items = originalItems;
      list.resolvePlayback = originalResolver;
    };
  });
  await expect(alertList.locator(".in-progress")).toHaveText("In progress");
  await expect(alertList.locator(".actions")).toHaveCount(0);
  await expect(alertList.locator(".tile-player")).toHaveCount(1);
  await alertList.locator(".tile-player").click();
  const draftDialog = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) dialog",
  );
  await expect(draftDialog).toBeVisible();
  await expect(
    page.locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) img.snapshot",
    ),
  ).toHaveAttribute("src", "/review-preview.gif");
  await page.getByRole("button", { name: "Close video player" }).click();
  await alertList.evaluate(async (element) => {
    const list = element as HTMLElement & {
      restoreDraftFixture?: () => void;
      updateComplete: Promise<boolean>;
    };
    list.restoreDraftFixture?.();
    delete list.restoreDraftFixture;
    await list.updateComplete;
  });
  await expect(alertList.locator(".in-progress")).toHaveCount(4);
  await stackButtons.nth(1).hover();
  await expect(stackButtons.nth(1)).not.toHaveCSS(
    "color",
    normalNavigation.inactiveColor,
  );
  await page.mouse.move(0, 0);
  const alertOutlines = await page
    .locator("wzc-reviews .thumbnail-wrap")
    .evaluateAll((thumbnails) =>
      thumbnails.slice(0, 2).map((thumbnail) => {
        const outline = getComputedStyle(thumbnail, "::after");
        return {
          color: outline.borderTopColor,
          style: outline.borderTopStyle,
          width: outline.borderTopWidth,
        };
      }),
    );
  expect(alertOutlines[0]).toMatchObject({ style: "solid", width: "2px" });
  expect(alertOutlines[1]).toMatchObject({ style: "solid", width: "2px" });
  expect(alertOutlines[0]?.color).not.toBe(alertOutlines[1]?.color);
  await expect(stackNavigation.locator("button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .locator('wzc-camera-navigation button[data-value="camera.back"]')
    .click();
  await expect(page.locator("wzc-reviews .tile")).toHaveCount(6);
  await expect(page.locator("wzc-reviews")).toContainText("back_yard");
  await stackButtons.nth(1).click();
  await expect(stackButtons.nth(1)).toHaveCSS(
    "background-color",
    normalNavigation.activeBackground,
  );
  await expect(stackButtons.nth(1)).toHaveCSS(
    "color",
    normalNavigation.activeColor,
  );
  const events = page.locator("wzc-events");
  const viewport = events.locator(".scroller");
  await expect(events.locator(".tile")).toHaveCount(6);
  await page.locator("watchzone-card").evaluate((element) => {
    element.style.setProperty(
      "--wzc-media-tile-background",
      "rgb(200, 200, 200)",
    );
    element.style.setProperty(
      "--wzc-media-tile-hover-background",
      "rgb(180, 180, 180)",
    );
  });
  const activityTile = events.locator(".tile").first();
  await expect(activityTile).toHaveCSS(
    "background-color",
    "rgb(200, 200, 200)",
  );
  await activityTile.hover();
  await expect(activityTile).toHaveCSS(
    "background-color",
    "rgb(180, 180, 180)",
  );
  await page.mouse.move(0, 0);
  const activityHeaderOffset = await events
    .locator("wzc-media-day-header")
    .first()
    .evaluate((header) => {
      const label = header.shadowRoot?.querySelector<HTMLElement>(".label");
      if (!label) throw new Error("Media day label was not rendered");
      const headerBounds = header.getBoundingClientRect();
      const labelRange = document.createRange();
      labelRange.selectNodeContents(label);
      const labelBounds = labelRange.getBoundingClientRect();
      return (
        labelBounds.left +
        labelBounds.width / 2 -
        (headerBounds.left + headerBounds.width / 2)
      );
    });
  expect(Math.abs(activityHeaderOffset)).toBeLessThanOrEqual(1);
  const actionInset = await events
    .locator(".tile")
    .first()
    .evaluate((tile) => {
      const actions = tile.querySelector<HTMLElement>(".actions");
      if (!actions) throw new Error("Activity actions were not rendered");
      return (
        tile.getBoundingClientRect().right -
        actions.getBoundingClientRect().right
      );
    });
  expect(actionInset).toBeGreaterThanOrEqual(9);
  expect(actionInset).toBeLessThanOrEqual(12);
  await expect(page.locator("watchzone-card ha-card")).toHaveCSS(
    "border-radius",
    "21px",
  );
  await expect(page.locator("wzc-camera .camera-carousel")).toHaveCSS(
    "border-radius",
    "21px",
  );
  await expect(events.locator(".tile").first()).toHaveCSS(
    "border-radius",
    "21px",
  );
  await expect(events.locator(".placeholder svg")).toHaveCount(1);
  await expect(events).toContainText("back_yard");
  await expect(events).toContainText("5:13 PM");
  await expect(events.locator("wzc-badge").first()).toHaveText("Person");
  await page
    .locator('wzc-camera-navigation button[data-value="camera.front"]')
    .click();
  await expect(events).toContainText("driveway");
  const scrolling = await viewport.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));
  expect(scrolling.scrollHeight).toBeGreaterThan(scrolling.clientHeight);
  const virtualized = await events
    .locator("wzc-activity-list")
    .evaluate(async (element) => {
      const list = element as HTMLElement & {
        items: Array<Record<string, unknown>>;
        updateComplete: Promise<boolean>;
      };
      const originalItems = list.items;
      list.items = Array.from({ length: 100 }, (_, index) => ({
        ...originalItems[index % originalItems.length],
        id: `virtualized-${index}`,
        revision: `virtualized-${index}`,
        startTime:
          Number(originalItems[0]?.startTime ?? 0) -
          Math.floor(index / 20) * 86_400 -
          index,
      }));
      await list.updateComplete;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      await list.updateComplete;
      const viewportElement =
        list.shadowRoot?.querySelector<HTMLElement>(".scroller");
      if (!viewportElement)
        throw new Error("Activity viewport was not rendered");
      const initialCount =
        list.shadowRoot?.querySelectorAll(".tile").length ?? 0;
      const dayHeaderCount =
        list.shadowRoot?.querySelectorAll("wzc-media-day-header").length ?? 0;
      const headers = [
        ...(list.shadowRoot?.querySelectorAll<HTMLElement>(
          "wzc-media-day-header",
        ) ?? []),
      ];
      const initialHeaderTop = headers[0]?.getBoundingClientRect().top ?? 0;
      const initialHeaderLabel =
        (headers[0] as (HTMLElement & { label?: string }) | undefined)?.label ??
        "";
      const secondHeaderOffset = headers[1]
        ? headers[1].getBoundingClientRect().top -
          viewportElement.getBoundingClientRect().top +
          viewportElement.scrollTop
        : 0;
      viewportElement.scrollTop = secondHeaderOffset;
      viewportElement.dispatchEvent(new Event("scroll"));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      await list.updateComplete;
      const activeHeader = list.shadowRoot?.querySelector<HTMLElement>(
        ".viewport > wzc-media-day-header",
      );
      const activeHeaderLabel =
        (activeHeader as (HTMLElement & { label?: string }) | null)?.label ??
        "";
      const headerBottom = activeHeader?.getBoundingClientRect().bottom ?? 0;
      const scrollerTop = viewportElement.getBoundingClientRect().top;
      const scrollHeight = viewportElement.scrollHeight;
      viewportElement.scrollTop = scrollHeight;
      viewportElement.dispatchEvent(new Event("scroll"));
      await list.updateComplete;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      await list.updateComplete;
      const positions = [
        ...(list.shadowRoot?.querySelectorAll<HTMLElement>(".tile") ?? []),
      ].map((tile) => Number(tile.getAttribute("aria-posinset")));
      list.items = originalItems;
      await list.updateComplete;
      return {
        initialCount,
        dayHeaderCount,
        lastPosition: Math.max(...positions),
        activeHeaderLabel,
        headerBottom,
        initialHeaderLabel,
        scrollHeight,
        initialHeaderTop,
        scrollerTop,
        visibleHeight: viewportElement.clientHeight,
      };
    });
  expect(virtualized.initialCount).toBeLessThan(20);
  expect(virtualized.dayHeaderCount).toBe(5);
  expect(virtualized.activeHeaderLabel).not.toBe(
    virtualized.initialHeaderLabel,
  );
  expect(
    Math.abs(virtualized.headerBottom - virtualized.scrollerTop),
  ).toBeLessThanOrEqual(1);
  expect(virtualized.scrollHeight).toBeGreaterThan(virtualized.visibleHeight);
  expect(virtualized.lastPosition).toBe(100);
  const constrained = await events
    .locator("wzc-activity-list")
    .evaluate((element) => {
      const list = element as HTMLElement;
      list.style.blockSize = "400px";
      const viewportElement =
        list.shadowRoot?.querySelector<HTMLElement>(".scroller");
      const shell = list.shadowRoot?.querySelector<HTMLElement>(".viewport");
      const geometry = {
        clientHeight: viewportElement?.clientHeight ?? 0,
        shellHeight: shell?.clientHeight ?? 0,
        scrollHeight: viewportElement?.scrollHeight ?? 0,
      };
      list.style.removeProperty("block-size");
      return geometry;
    });
  expect(constrained.shellHeight).toBeGreaterThanOrEqual(400);
  expect(constrained.shellHeight).toBeLessThan(420);
  expect(constrained.clientHeight).toBeLessThan(constrained.shellHeight);
  expect(constrained.scrollHeight).toBeGreaterThan(constrained.clientHeight);
  const nonScrolling = await events
    .locator("wzc-activity-list")
    .evaluate(async (element) => {
      const list = element as HTMLElement & {
        items: readonly unknown[];
        updateComplete: Promise<boolean>;
      };
      const originalItems = list.items;
      list.items = list.items.slice(0, 1);
      await list.updateComplete;
      const viewportElement =
        list.shadowRoot?.querySelector<HTMLElement>(".scroller");
      if (!viewportElement)
        throw new Error("Activity viewport was not rendered");
      const geometry = {
        clientHeight: viewportElement.clientHeight,
        clientWidth: viewportElement.clientWidth,
        offsetWidth: viewportElement.offsetWidth,
        scrollHeight: viewportElement.scrollHeight,
      };
      list.items = originalItems;
      await list.updateComplete;
      return geometry;
    });
  expect(nonScrolling.scrollHeight).toBeLessThanOrEqual(
    nonScrolling.clientHeight,
  );
  expect(
    nonScrolling.offsetWidth - nonScrolling.clientWidth,
  ).toBeLessThanOrEqual(2);
  const tileGeometry = await events.locator(".tile").evaluateAll((tiles) =>
    tiles.map((tile) => {
      const tileRect = tile.getBoundingClientRect();
      const thumbnailRect = tile
        .querySelector(".thumbnail-wrap")
        ?.getBoundingClientRect();
      return {
        bottom: tileRect.bottom,
        thumbnailBottomInset: thumbnailRect
          ? tileRect.bottom - thumbnailRect.bottom
          : Number.POSITIVE_INFINITY,
        thumbnailLeadingInset: thumbnailRect
          ? thumbnailRect.left - tileRect.left
          : Number.POSITIVE_INFINITY,
        thumbnailRatio: thumbnailRect
          ? thumbnailRect.width / thumbnailRect.height
          : 0,
        thumbnailTopInset: thumbnailRect
          ? thumbnailRect.top - tileRect.top
          : Number.POSITIVE_INFINITY,
      };
    }),
  );
  const viewportBottom = await viewport.evaluate(
    (node) => node.getBoundingClientRect().bottom,
  );
  expect(tileGeometry[3]?.bottom).toBeLessThanOrEqual(viewportBottom + 1);
  expect(tileGeometry[4]?.bottom).toBeGreaterThan(viewportBottom);
  expect(tileGeometry[0]?.thumbnailRatio).toBeCloseTo(16 / 9, 2);
  expect(tileGeometry[0]?.thumbnailBottomInset).toBeLessThanOrEqual(1);
  expect(tileGeometry[0]?.thumbnailLeadingInset).toBeLessThanOrEqual(1);
  expect(tileGeometry[0]?.thumbnailTopInset).toBeLessThanOrEqual(1);
  const thumbnailPresentation = await events
    .locator(".thumbnail")
    .first()
    .evaluate((thumbnail) => {
      const wrapper = thumbnail.parentElement;
      return {
        background: wrapper ? getComputedStyle(wrapper).backgroundColor : "",
        objectFit: getComputedStyle(thumbnail).objectFit,
      };
    });
  expect(thumbnailPresentation).toEqual({
    background: "rgb(36, 36, 36)",
    objectFit: "cover",
  });

  const liveStageBox = await page
    .locator("wzc-camera-view .camera")
    .first()
    .boundingBox();
  await events.locator(".tile-player").first().click();
  const mediaDialog = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) dialog",
  );
  await expect(mediaDialog).toBeVisible();
  const initialPlacement = await mediaDialog.evaluate((dialog) => {
    return {
      explicitlyPositioned: dialog.classList.contains("dragged"),
      inlineLeft: dialog.style.left,
      inlineTop: dialog.style.top,
    };
  });
  expect(initialPlacement).toEqual({
    explicitlyPositioned: false,
    inlineLeft: "",
    inlineTop: "",
  });
  const modalClose = page.getByRole("button", { name: "Close video player" });
  const modalTitle = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .title",
  );
  const modalCloseBox = await modalClose.boundingBox();
  const modalTitleBox = await modalTitle.boundingBox();
  expect(modalCloseBox?.x).toBeLessThan(modalTitleBox?.x ?? 0);
  expect(modalCloseBox?.width).toBeCloseTo(modalCloseBox?.height ?? 0, 3);
  expect(modalCloseBox?.width).toBeGreaterThanOrEqual(44);
  await expect(modalClose.locator('ha-icon[icon="mdi:close"]')).toHaveCount(1);
  await expect(modalClose).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const modalCloseColor = await modalClose.evaluate(
    (element) => getComputedStyle(element).color,
  );
  await modalClose.hover();
  await expect
    .poll(() =>
      modalClose.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )
    .not.toBe("rgba(0, 0, 0, 0)");
  await expect(modalClose).toHaveCSS("color", modalCloseColor);
  const recordedVideo = page.locator("wzc-recorded-video-player video");
  await expect(recordedVideo).not.toHaveAttribute("controls", "");
  await expect(recordedVideo).toHaveAttribute("autoplay", "");
  await expect(recordedVideo).toHaveAttribute("muted", "");
  await expect(recordedVideo).toHaveAttribute("playsinline", "");
  await recordedVideo.evaluate((element) =>
    element.dispatchEvent(
      new CustomEvent("wzc-recorded-media-error", {
        bubbles: true,
        composed: true,
      }),
    ),
  );
  const mediaErrorToast = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) wzc-toast-region .toast",
  );
  await expect(mediaErrorToast).toContainText("Unable to play this recording.");
  const mediaErrorBox = await mediaErrorToast.boundingBox();
  expect(mediaErrorBox?.height).toBeLessThan(80);
  expect(mediaErrorBox?.width).toBeLessThan(600);
  const mediaBodyPadding = await page
    .locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .body",
    )
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        bottom: Number.parseFloat(style.paddingBottom),
        top: Number.parseFloat(style.paddingTop),
      };
    });
  expect(mediaBodyPadding.top).toBe(0);
  expect(mediaBodyPadding.bottom).toBeGreaterThan(0);
  expect(mediaBodyPadding.bottom).toBeLessThan(24);
  const playerViewportBox = await page
    .locator("wzc-recorded-video-player .viewport")
    .boundingBox();
  const recordedVideoBox = await recordedVideo.boundingBox();
  expect(liveStageBox).not.toBeNull();
  expect(playerViewportBox).not.toBeNull();
  if (liveStageBox && playerViewportBox) {
    expect(playerViewportBox.width).toBeLessThanOrEqual(liveStageBox.width + 2);
    expect(playerViewportBox.width / playerViewportBox.height).toBeCloseTo(
      16 / 9,
      2,
    );
  }
  if (recordedVideoBox && playerViewportBox) {
    expect(recordedVideoBox.width).toBeCloseTo(playerViewportBox.width, 1);
    expect(recordedVideoBox.height).toBeCloseTo(playerViewportBox.height, 1);
  }
  const modalBackgrounds = await page.evaluate(() => {
    const container = document
      .querySelector("watchzone-card")
      ?.shadowRoot?.querySelector(
        ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog)",
      )?.shadowRoot;
    const dialog = container?.querySelector("dialog");
    const header = container?.querySelector(".header");
    const body = container?.querySelector(".body");
    return {
      dialog: dialog ? getComputedStyle(dialog).backgroundColor : "",
      header: header ? getComputedStyle(header).backgroundColor : "",
      body: body ? getComputedStyle(body).backgroundColor : "",
    };
  });
  expect(modalBackgrounds.dialog).toBe(modalBackgrounds.header);
  expect(modalBackgrounds.body).toBe(modalBackgrounds.header);
  const headerBeforeResizeBox = await page
    .locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .header",
    )
    .boundingBox();
  if (headerBeforeResizeBox && playerViewportBox) {
    expect(playerViewportBox.y).toBeCloseTo(
      headerBeforeResizeBox.y + headerBeforeResizeBox.height,
      1,
    );
  }
  await expect(
    page.locator("wzc-recorded-video-player .media-surface"),
  ).toHaveCount(0);
  await expect(
    page.locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .scrim",
    ),
  ).toHaveCount(0);
  const stablePlayerBox = await page
    .locator("wzc-recorded-video-player .viewport")
    .boundingBox();
  expect(stablePlayerBox?.width).toBeCloseTo(playerViewportBox?.width ?? 0, 1);
  expect(stablePlayerBox?.height).toBeCloseTo(
    playerViewportBox?.height ?? 0,
    1,
  );
  const viewportSize = page.viewportSize();
  const fittedDialogBox = await mediaDialog.boundingBox();
  if (viewportSize && fittedDialogBox) {
    expect(fittedDialogBox.x).toBeGreaterThanOrEqual(0);
    expect(fittedDialogBox.y).toBeGreaterThanOrEqual(0);
    expect(fittedDialogBox.x + fittedDialogBox.width).toBeLessThanOrEqual(
      viewportSize.width,
    );
    expect(fittedDialogBox.y + fittedDialogBox.height).toBeLessThanOrEqual(
      viewportSize.height,
    );
  }
  const transport = page.locator("wzc-recorded-video-transport");
  await page.mouse.move(0, 0);
  await expect(transport).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await page
    .locator("wzc-recorded-video-player .viewport")
    .hover({ force: true });
  await expect(
    page.getByRole("button", { name: "Mute recorded video" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enter fullscreen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enter Picture-in-Picture" }),
  ).toBeVisible();
  const recordedControls = page.locator(
    "wzc-recorded-video-player wzc-media-controls .control-button",
  );
  await expect(recordedControls).toHaveCount(2);
  expect(
    await recordedControls.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-control")),
    ),
  ).toEqual(["picture_in_picture", "fullscreen"]);
  await expect(transport).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play recorded video" }),
  ).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Recorded video position" }),
  ).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Recorded video volume" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Additional recorded video control coming soon",
    }),
  ).toBeDisabled();
  const recordedMute = page.getByRole("button", {
    name: "Mute recorded video",
  });
  const recordedMuteBox = await recordedMute.boundingBox();
  expect(recordedMuteBox?.width).toBeGreaterThanOrEqual(30);
  expect(recordedMuteBox?.width).toBeLessThanOrEqual(44);
  expect(recordedMuteBox?.height).toBeCloseTo(recordedMuteBox?.width ?? 0, 3);
  await expect(recordedMute).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(recordedMute).toHaveCSS("color", "rgb(229, 229, 229)");
  await recordedMute.hover();
  await expect(recordedMute).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(recordedMute).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const transportBox = await transport.boundingBox();
  const currentPlayerBox = await page
    .locator("wzc-recorded-video-player .viewport")
    .boundingBox();
  expect(transportBox?.x).toBeCloseTo(currentPlayerBox?.x ?? 0, 1);
  expect(transportBox?.width).toBeCloseTo(currentPlayerBox?.width ?? 0, 1);
  expect((transportBox?.y ?? 0) + (transportBox?.height ?? 0)).toBeCloseTo(
    (currentPlayerBox?.y ?? 0) + (currentPlayerBox?.height ?? 0),
    1,
  );
  const dispatchRecordedDoubleClick = (): Promise<boolean> =>
    recordedVideo.evaluate((element) => {
      const event = new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
        composed: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await dispatchRecordedDoubleClick()).toBe(true);
  await expect(recordedVideo).toHaveAttribute("style", /scale\(2\)/);
  await expect(
    page.getByRole("button", { name: "Mute recorded video" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await dispatchRecordedDoubleClick()).toBe(true);
  await expect(recordedVideo).toHaveAttribute("style", /scale\(1\)/);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  const dispatchRecordedTouchTap = (): Promise<void> =>
    recordedVideo.evaluate((element) => {
      const pointerId = Number(element.dataset.testTouchPointer ?? "20") + 1;
      element.dataset.testTouchPointer = String(pointerId);
      for (const type of ["pointerdown", "pointerup"] as const) {
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: 120,
            clientY: 80,
            composed: true,
            pointerId,
            pointerType: "touch",
          }),
        );
      }
    });
  await dispatchRecordedTouchTap();
  await dispatchRecordedTouchTap();
  await expect(recordedVideo).toHaveAttribute("style", /scale\(2\)/);
  await expect(recordedMute).toBeVisible();
  await dispatchRecordedTouchTap();
  await dispatchRecordedTouchTap();
  await expect(recordedVideo).toHaveAttribute("style", /scale\(1\)/);
  const resizeHandle = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .resize-handle",
  );
  await expect(resizeHandle).toHaveAttribute(
    "aria-label",
    "Resize video player",
  );
  await expect(
    resizeHandle.locator('ha-icon[icon="mdi:resize-bottom-right"]'),
  ).toHaveCount(1);
  const initialDialogBox = await mediaDialog.boundingBox();
  const initialPlayerBox = await page
    .locator("wzc-recorded-video-player .viewport")
    .boundingBox();
  const resizeBox = await resizeHandle.boundingBox();
  expect(initialDialogBox).not.toBeNull();
  expect(resizeBox).not.toBeNull();
  if (initialDialogBox && resizeBox) {
    await page.mouse.move(
      resizeBox.x + resizeBox.width / 2,
      resizeBox.y + resizeBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(resizeBox.x - 80, resizeBox.y - 40);
    await page.mouse.up();
    const resizedDialogBox = await mediaDialog.boundingBox();
    const resizedPlayerBox = await page
      .locator("wzc-recorded-video-player .viewport")
      .boundingBox();
    expect(resizedDialogBox?.width).toBeLessThan(initialDialogBox.width);
    expect(resizedDialogBox?.height).toBeLessThanOrEqual(
      initialDialogBox.height + 1,
    );
    expect(resizedPlayerBox?.width).toBeLessThan(initialPlayerBox?.width ?? 0);
    expect(resizedPlayerBox?.height).toBeLessThan(
      initialPlayerBox?.height ?? 0,
    );
    if (resizedPlayerBox) {
      expect(resizedPlayerBox.width / resizedPlayerBox.height).toBeCloseTo(
        16 / 9,
        2,
      );
    }
  }
  const dragTitleBox = await modalTitle.boundingBox();
  expect(dragTitleBox).not.toBeNull();
  if (dragTitleBox) {
    await page.mouse.move(
      dragTitleBox.x + dragTitleBox.width / 2,
      dragTitleBox.y + dragTitleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(-500, -500);
    await page.mouse.up();
  }
  const draggedBox = await mediaDialog.boundingBox();
  expect(draggedBox?.x).toBeGreaterThanOrEqual(0);
  expect(draggedBox?.y).toBeGreaterThanOrEqual(0);
  const nextEventTile = events.locator(".tile-player").nth(1);
  await nextEventTile.scrollIntoViewIfNeeded();
  await nextEventTile.evaluate((button: HTMLButtonElement) => button.click());
  await expect(
    page.locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .title",
    ),
  ).toHaveText("Front - 5:12 PM - Mon, Nov 13");
  await expect(mediaDialog).toBeVisible();
  await page.evaluate(() =>
    document.body.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    ),
  );
  await expect(mediaDialog).toBeHidden();
  await expect(recordedVideo).toHaveCount(0);
  await expect(
    page.locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .scrim",
    ),
  ).toHaveCount(0);

  await events.locator('button[aria-label="View snapshot"]').first().click();
  await expect(mediaDialog).toBeVisible();
  const snapshot = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) img.snapshot",
  );
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveAttribute("src", "/thumbnail.svg");
  await expect(snapshot).toHaveCSS("background-color", "rgb(36, 36, 36)");
  await expect(page.locator("wzc-recorded-video-player")).toHaveCount(0);
  await modalClose.click();
  await expect(mediaDialog).toBeHidden();

  await page
    .locator("wzc-camera-navigation button")
    .nth(1)
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(events).toContainText("back_yard");
  await expect(events).not.toContainText("driveway");
  await page.locator("watchzone-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      display_event_type_badges: false,
      display_object_badges: false,
      display_zone: false,
      event_history_days: 7,
      rounded_outer_corners: false,
      camera_rounded_corners: false,
      event_rounded_corners: false,
      cameras: [
        { entity_id: "camera.front", title: "Front" },
        { entity_id: "camera.back", title: "Back" },
      ],
    });
  });
  await expect(events.locator(".tile")).toHaveCount(6);
  await expect(events.locator("wzc-badge")).toHaveCount(0);
  await expect(events).not.toContainText("back_yard");
  await expect(page.locator("watchzone-card ha-card")).toHaveCSS(
    "border-radius",
    "0px",
  );
  await expect(page.locator("wzc-camera .camera-carousel")).toHaveCSS(
    "border-radius",
    "0px",
  );
  await expect(events.locator(".tile").first()).toHaveCSS(
    "border-radius",
    "0px",
  );
});

test("switches activity and recordings through the shared media calendar", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Date.now = () => Date.UTC(2026, 10, 9, 12);
  });
  await page.route("**/recording.mp4", (route) =>
    route.fulfill({ body: "", contentType: "video/mp4" }),
  );
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    const today = Date.UTC(2026, 10, 9, 8) / 1000;
    const yesterday = Date.UTC(2026, 10, 8, 8) / 1000;
    const activity = [
      {
        classification: "alert",
        id: "today",
        label: "person",
        reviewed: true,
        start: today,
        zones: ["driveway"],
      },
      {
        classification: "detection",
        id: "yesterday",
        label: "bird",
        reviewed: false,
        start: yesterday,
        zones: ["yard"],
      },
    ];
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.style.setProperty(
      "--ha-dialog-surface-background",
      "rgb(170, 171, 172)",
    );
    card.style.setProperty("--ha-card-background", "rgb(10, 11, 12)");
    card.style.setProperty("--ha-dialog-surface-backdrop-filter", "blur(7px)");
    card.style.setProperty("--ha-dialog-border-radius", "28px");
    card.style.setProperty("--primary-background-color", "rgb(120, 121, 122)");
    card.style.setProperty("--ha-card-border-radius", "18px");
    card.style.setProperty("--wzc-popover-radius", "18px");
    card.setConfig({
      type: "custom:watchzone-card",
      event_history_days: 5,
      cameras: [{ entity_id: "camera.front", title: "Front" }],
    });
    card.hass = {
      config: { time_zone: "UTC" },
      locale: {
        first_weekday: "monday",
        language: "en",
        time_zone: "server",
      },
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { selected_date?: string; type: string }) => {
        if (message.type === "watchzone/live/camera/ready") {
          return { ready: false };
        }
        if (message.type === "watchzone/reviews/list") {
          return {
            items: activity.map((item) => ({
              camera: "front",
              classification: item.classification,
              clip_url: null,
              end_time: item.start + 1,
              id: `review:${item.id}`,
              labels: [item.label],
              media_end_time: item.start + 6,
              media_start_time: item.start - 5,
              playback_sources: [],
              preferred_transport: "file",
              related_event_ids: [`event:${item.id}`],
              reviewed: item.reviewed,
              revision: item.id,
              snapshot_url: null,
              start_time: item.start,
              sub_labels: [],
              thumbnail_url: null,
              zones: item.zones,
            })),
          };
        }
        if (message.type === "watchzone/events/list") {
          return {
            items: activity.map((item) => ({
              camera: "front",
              clip_url: null,
              end_time: item.start + 1,
              has_clip: false,
              has_snapshot: false,
              id: `event:${item.id}`,
              label: item.label,
              playback_sources: [],
              preferred_transport: "file",
              revision: item.id,
              snapshot_url: null,
              start_time: item.start,
              sub_label: null,
              thumbnail_url: null,
              zones: item.zones,
            })),
          };
        }
        if (message.type === "watchzone/recordings/list") {
          const selectedDate = message.selected_date ?? "2026-11-09";
          const latestStart =
            selectedDate === "2026-11-08"
              ? Date.UTC(2026, 10, 8, 10) / 1000
              : Date.UTC(2026, 10, 9, 10) / 1000;
          return {
            days: ["2026-11-09", "2026-11-08"],
            hours: Array.from({ length: 8 }, (_, index) => {
              const start = latestStart - index * 3600;
              return {
                camera: "front",
                download_url: "/recording.mp4",
                duration: 1620,
                end_time: start + 1620,
                id: `front:${selectedDate}:${10 - index}`,
                markers:
                  index === 0
                    ? [
                        {
                          classification: "detection",
                          end_time: start + 540,
                          id: "review:recording-marker",
                          start_time: start + 420,
                          thumbnail_url: "/thumbnail.svg",
                        },
                      ]
                    : [],
                playback_sources: [
                  {
                    content_type: "video/mp4",
                    transport: "file",
                    url: "/recording.mp4",
                  },
                ],
                preferred_transport: "file",
                revision: selectedDate,
                selection_end_time: start + 1620,
                selection_spans: [
                  { end_time: start + 600, start_time: start },
                  { end_time: start + 1620, start_time: start + 720 },
                ],
                selection_start_time: start,
                spans: [
                  {
                    end_time: start + 600,
                    media_offset: 0,
                    start_time: start,
                  },
                  {
                    end_time: start + 1620,
                    media_offset: 600,
                    start_time: start + 720,
                  },
                ],
                start_time: start,
                timeline_end_time: start + 3600,
                timeline_start_time: start,
              };
            }),
          };
        }
        if (message.type === "watchzone/recordings/segment") {
          return {
            filename: "front-segment.mp4",
            path: "/segment.mp4",
            playback_sources: [
              {
                content_type: "video/mp4",
                transport: "file",
                url: "/recording.mp4",
              },
            ],
            preferred_transport: "file",
          };
        }
        return undefined;
      },
    };
  });

  const navigation = page.locator(".stage-stack-navigation");
  const filter = navigation.locator("wzc-activity-filter");
  const calendar = navigation.locator("wzc-activity-calendar");
  const trigger = calendar.locator(".calendar-trigger");
  await expect(page.locator("wzc-reviews .tile")).toHaveCount(2);
  const reviewDayHeaders = page.locator("wzc-reviews wzc-media-day-header");
  await expect(reviewDayHeaders).toHaveCount(2);
  await expect(reviewDayHeaders.first()).toContainText("Mon, Nov 9 — Reviews");
  await expect(reviewDayHeaders.first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(reviewDayHeaders.nth(1)).toContainText("Sun, Nov 8 — Reviews");
  const loadingSurface = page.locator("wzc-reviews .thumbnail-wrap").first();
  await expect(loadingSurface).toHaveCSS("background-color", "rgb(36, 36, 36)");
  await expect(loadingSurface).toHaveCSS("color", "rgb(98, 98, 98)");
  await expect(trigger).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(trigger).toHaveCSS("border-top-width", "0px");
  const alignment = await navigation.evaluate((node) => {
    const navigationRect = node.getBoundingClientRect();
    const filterRect = node
      .querySelector("wzc-activity-filter")
      ?.getBoundingClientRect();
    const calendarRect = node
      .querySelector("wzc-activity-calendar")
      ?.getBoundingClientRect();
    const triggerRect = node
      .querySelector("wzc-activity-calendar")
      ?.shadowRoot?.querySelector("button")
      ?.getBoundingClientRect();
    return {
      endGap: calendarRect ? navigationRect.right - calendarRect.right : -1,
      filterBeforeCalendar:
        filterRect && calendarRect
          ? filterRect.right <= calendarRect.left
          : false,
      triggerHeight: triggerRect?.height ?? 0,
      triggerWidth: triggerRect?.width ?? 0,
    };
  });
  expect(alignment.endGap).toBeLessThanOrEqual(1);
  expect(alignment.filterBeforeCalendar).toBe(true);
  expect(alignment.triggerHeight).toBeGreaterThanOrEqual(44);
  expect(alignment.triggerWidth).toBeGreaterThanOrEqual(44);

  await trigger.click();
  await expect
    .poll(() =>
      calendar
        .locator(".popover")
        .evaluate((element) => element.matches(":popover-open")),
    )
    .toBe(true);
  await expect(calendar.locator(".popover")).toHaveCSS(
    "background-color",
    "rgb(120, 121, 122)",
  );
  await expect(calendar.locator(".popover")).toHaveCSS(
    "backdrop-filter",
    "none",
  );
  await expect(calendar.locator(".popover")).toHaveCSS("border-radius", "18px");
  await expect(calendar.locator(".day.marked")).toHaveCount(2);
  await calendar.locator(".day.marked").first().click();
  await expect(page.locator("wzc-reviews .tile")).toHaveCount(1);
  await expect(page.locator("wzc-reviews")).toContainText("Bird");
  await expect(reviewDayHeaders).toHaveCount(1);
  await expect(reviewDayHeaders).toContainText("Sun, Nov 8 — Reviews");

  await navigation.locator(".stage-stack-button").nth(1).click();
  await expect(page.locator("wzc-events .tile")).toHaveCount(1);
  await expect(page.locator("wzc-events")).toContainText("Bird");
  await expect(page.locator("wzc-events wzc-media-day-header")).toContainText(
    "Sun, Nov 8 — Events",
  );

  await trigger.click();
  await expect(calendar.locator(".day.selected")).toHaveCount(1);
  await calendar.locator(".reset").click();
  await expect(page.locator("wzc-events .tile")).toHaveCount(2);

  await filter.locator(".filter-trigger").click();
  await expect(filter.locator(".popover")).toBeVisible();
  await expect(filter.locator(".popover")).toHaveCSS(
    "background-color",
    "rgb(120, 121, 122)",
  );
  await expect(filter.locator(".popover")).toHaveCSS("backdrop-filter", "none");
  await expect(filter.locator(".popover")).toHaveCSS("border-radius", "18px");
  await expect(filter.locator("fieldset")).toHaveCount(4);
  const selectedFilterChip = filter
    .locator(".chip input:checked + span")
    .first();
  const unselectedFilterChip = filter
    .locator(".chip input:not(:checked) + span")
    .first();
  const filterChipPresentation = await Promise.all([
    selectedFilterChip.evaluate((chip) => {
      const style = getComputedStyle(chip);
      return {
        background: style.backgroundColor,
        borderRadius: style.borderRadius,
      };
    }),
    unselectedFilterChip.evaluate(
      (chip) => getComputedStyle(chip).backgroundColor,
    ),
    filter
      .locator(".chip")
      .first()
      .evaluate((chip) => chip.getBoundingClientRect().height),
  ]);
  expect(filterChipPresentation[0].background).not.toBe(
    filterChipPresentation[1],
  );
  expect(filterChipPresentation[0].borderRadius).not.toBe("0px");
  expect(filterChipPresentation[2]).toBeGreaterThanOrEqual(36);
  await expect
    .poll(() =>
      filter
        .locator(".popover")
        .evaluate((element) => element.matches(":popover-open")),
    )
    .toBe(true);
  const popoverBounds = await filter.locator(".popover").boundingBox();
  const viewportSize = page.viewportSize();
  expect(popoverBounds).not.toBeNull();
  expect(popoverBounds?.x).toBeGreaterThanOrEqual(0);
  expect(popoverBounds?.y).toBeGreaterThanOrEqual(0);
  expect(
    (popoverBounds?.x ?? 0) + (popoverBounds?.width ?? 0),
  ).toBeLessThanOrEqual(viewportSize?.width ?? 0);
  expect(
    (popoverBounds?.y ?? 0) + (popoverBounds?.height ?? 0),
  ).toBeLessThanOrEqual(viewportSize?.height ?? 0);
  await filter.getByText("person", { exact: true }).click();
  await expect(page.locator("wzc-events .tile")).toHaveCount(1);
  await filter.getByText("bird", { exact: true }).click();
  await expect(
    filter.locator("fieldset").nth(1).locator('input[type="checkbox"]:checked'),
  ).toHaveCount(2);
  await filter.getByText("Alerts", { exact: true }).click();
  await filter.getByText("Detections", { exact: true }).click();
  await expect(filter.locator('input[value="alert"]')).not.toBeChecked();
  await expect(filter.locator('input[value="detection"]')).toBeChecked();
  await filter.getByText("Alerts", { exact: true }).click();
  await filter.getByText("Reviewed", { exact: true }).click();
  await filter.getByText("driveway", { exact: true }).click();
  await expect(page.locator("wzc-events .tile")).toHaveCount(1);
  await filter.locator(".reset").click();
  await expect(page.locator("wzc-events .tile")).toHaveCount(2);

  await navigation.locator(".stage-stack-button").nth(2).click();
  const recordings = page.locator("wzc-recordings");
  await expect(recordings.locator(".tile")).toHaveCount(8);
  await page.locator("watchzone-card").evaluate((element) => {
    const host = element as HTMLElement;
    host.style.setProperty("--wzc-media-tile-background", "rgb(200, 200, 200)");
    host.style.setProperty(
      "--wzc-media-tile-hover-background",
      "rgb(180, 180, 180)",
    );
  });
  const recordingTile = recordings.locator(".tile").first();
  await expect(recordingTile).toHaveCSS(
    "background-color",
    "rgb(200, 200, 200)",
  );
  await recordingTile.hover();
  await expect(recordingTile).toHaveCSS(
    "background-color",
    "rgb(180, 180, 180)",
  );
  await page.mouse.move(0, 0);
  await expect(recordings.locator("wzc-media-day-header")).toContainText(
    "Mon, Nov 9 — Recordings",
  );
  await expect(recordings.locator(".range").first()).toHaveText(
    "10:00 AM – 10:27 AM",
  );
  const previousRecordingDay = recordings.locator(
    '.day-navigation[slot="previous"]',
  );
  const nextRecordingDay = recordings.locator('.day-navigation[slot="next"]');
  await expect(previousRecordingDay).toHaveCount(1);
  await expect(nextRecordingDay).toHaveCount(0);
  const recordingHeaderOffset = await recordings
    .locator("wzc-media-day-header")
    .evaluate((header) => {
      const label = header.shadowRoot?.querySelector<HTMLElement>(".label");
      if (!label) throw new Error("Media day label was not rendered");
      const headerBounds = header.getBoundingClientRect();
      const labelRange = document.createRange();
      labelRange.selectNodeContents(label);
      const labelBounds = labelRange.getBoundingClientRect();
      return (
        labelBounds.left +
        labelBounds.width / 2 -
        (headerBounds.left + headerBounds.width / 2)
      );
    });
  expect(Math.abs(recordingHeaderOffset)).toBeLessThanOrEqual(1);
  await previousRecordingDay.click();
  await expect(recordings.locator("wzc-media-day-header")).toContainText(
    "Sun, Nov 8 — Recordings",
  );
  await expect(previousRecordingDay).toHaveCount(0);
  await expect(nextRecordingDay).toHaveCount(1);
  await nextRecordingDay.click();
  await expect(recordings.locator("wzc-media-day-header")).toContainText(
    "Mon, Nov 9 — Recordings",
  );
  const recordingViewport = recordings.locator(".scroller");
  const recordingScroll = await recordingViewport.evaluate((viewport) => {
    const before = viewport.scrollTop;
    const top = viewport.getBoundingClientRect().top;
    const headerBottom =
      viewport.previousElementSibling?.getBoundingClientRect().bottom ?? -1;
    const firstTileGap =
      (viewport.querySelector(".tile")?.getBoundingClientRect().top ?? -1) -
      top;
    viewport.scrollTop = viewport.scrollHeight;
    return {
      before,
      after: viewport.scrollTop,
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      overflowY: getComputedStyle(viewport).overflowY,
      scrollbarGutter: getComputedStyle(viewport).scrollbarGutter,
      top,
      headerBottom,
      firstTileGap,
    };
  });
  expect(recordingScroll.overflowY).toBe("auto");
  expect(recordingScroll.scrollbarGutter).toBe("auto");
  expect(
    Math.abs(recordingScroll.top - recordingScroll.headerBottom),
  ).toBeLessThanOrEqual(1);
  expect(recordingScroll.firstTileGap).toBeLessThanOrEqual(5);
  expect(recordingScroll.scrollHeight).toBeGreaterThan(
    recordingScroll.clientHeight,
  );
  expect(recordingScroll.after).toBeGreaterThan(recordingScroll.before);
  await expect(filter).toHaveCount(1);
  await expect(filter.locator(".filter-trigger")).toBeDisabled();
  const recordingControlsAlignment = await navigation.evaluate((node) => {
    const navigationRect = node.getBoundingClientRect();
    const calendarRect = node
      .querySelector("wzc-activity-calendar")
      ?.getBoundingClientRect();
    return calendarRect ? navigationRect.right - calendarRect.right : -1;
  });
  expect(recordingControlsAlignment).toBeLessThanOrEqual(1);
  const downloadAlignment = await recordings
    .locator(".download")
    .first()
    .evaluate((button) => {
      const buttonRect = button.getBoundingClientRect();
      const iconRect = button.querySelector("ha-icon")?.getBoundingClientRect();
      return iconRect
        ? {
            x: Math.abs(
              buttonRect.left +
                buttonRect.width / 2 -
                (iconRect.left + iconRect.width / 2),
            ),
            y: Math.abs(
              buttonRect.top +
                buttonRect.height / 2 -
                (iconRect.top + iconRect.height / 2),
            ),
          }
        : { x: -1, y: -1 };
    });
  expect(downloadAlignment.x).toBeLessThanOrEqual(1);
  expect(downloadAlignment.y).toBeLessThanOrEqual(1);
  await trigger.click();
  await expect(calendar.locator(".day.marked")).toHaveCount(2);
  await calendar.locator('.day[aria-label^="November 8, 2026"]').click();
  await expect(recordings.locator(".range").first()).toHaveText(
    "10:00 AM – 10:27 AM",
  );
  await recordings.locator(".tile-player").first().click();
  await expect(
    page.locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) dialog",
    ),
  ).toBeVisible();
  const scrubber = page.locator("wzc-recording-scrubber");
  await expect(scrubber).toBeVisible();
  await page.locator("watchzone-card").evaluate((element) => {
    const host = element as HTMLElement;
    host.style.setProperty("--wzc-color-background", "rgb(20, 21, 22)");
    host.style.setProperty("--wzc-color-surface", "rgb(30, 31, 32)");
    host.style.setProperty("--wzc-color-surface-secondary", "rgb(40, 41, 42)");
    host.style.setProperty("--wzc-color-text-1", "rgb(230, 231, 232)");
    host.style.setProperty("--wzc-color-border", "rgb(70, 71, 72)");
    host.style.setProperty("--wzc-color-border-control", "rgb(80, 81, 82)");
    host.style.setProperty("--wzc-color-primary", "rgb(10, 120, 200)");
    host.style.setProperty("--wzc-color-text-reversed", "rgb(250, 251, 252)");
    host.style.setProperty("--wzc-color-error", "rgb(220, 60, 70)");
  });
  await expect(scrubber).toHaveCSS("background-color", "rgb(40, 41, 42)");
  await expect(scrubber).toHaveCSS("color", "rgb(230, 231, 232)");
  await expect(scrubber.locator('[data-control="toggle_play"]')).toHaveCSS(
    "border-color",
    "rgb(80, 81, 82)",
  );
  await expect(scrubber.locator(".span").first()).toHaveCSS(
    "background-color",
    "rgb(185, 239, 189)",
  );
  await expect(scrubber.locator(".label")).toHaveCount(7);
  await expect(scrubber.locator(".marker.detection")).toHaveCount(1);
  await expect(scrubber.locator('[data-control="toggle_play"]')).toBeVisible();
  await expect(scrubber.locator(".track")).toHaveCSS(
    "background-image",
    /repeating-linear-gradient/,
  );
  await scrubber.locator(".marker.detection").hover();
  await expect(scrubber.locator(".preview img")).toBeVisible();
  await expect(scrubber.locator(".preview")).toHaveCSS(
    "background-color",
    "rgb(30, 31, 32)",
  );
  await expect(scrubber.locator(".preview-label")).toContainText(
    "Detection - 10:07",
  );
  await scrubber
    .getByRole("button", { name: "Select recording segment" })
    .click();
  await expect(scrubber.locator(".context")).toHaveCount(2);
  await expect(scrubber.locator(".handle")).toHaveCount(2);
  await expect(scrubber.locator(".handle.start")).toHaveAttribute(
    "aria-valuetext",
    "10:00:00",
  );
  await expect(scrubber.locator(".handle.end")).toHaveAttribute(
    "aria-valuetext",
    "10:27:00",
  );
  await expect(scrubber.locator(".segment-toggle.active")).toHaveCSS(
    "color",
    "rgb(250, 251, 252)",
  );
  await expect(scrubber.locator(".selected")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(scrubber.locator(".selected-availability").first()).toHaveCSS(
    "background-color",
    "rgb(131, 223, 154)",
  );
  await expect(scrubber.locator(".excluded.after")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator("wzc-recorded-video-transport")).toHaveCount(1);
  const segmentManager = page.locator("wzc-recording-segment-manager");
  await expect(segmentManager).toBeVisible();
  const resetSegment = segmentManager.getByRole("button", { name: "Reset" });
  const darkSegmentSurfaces = await Promise.all([
    segmentManager.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
    resetSegment.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ]);
  expect(darkSegmentSurfaces[0]).not.toBe("rgb(40, 41, 42)");
  await expect(
    segmentManager.getByRole("button", { name: "Download Segment" }),
  ).toHaveCSS("background-color", "rgb(10, 120, 200)");
  await expect(
    segmentManager
      .getByRole("button", { name: "Download Segment" })
      .locator("svg"),
  ).toHaveCSS("fill", "rgb(250, 251, 252)");
  await expect(segmentManager).toContainText("Select a recording segment");
  await page.locator("watchzone-card").evaluate((element) => {
    const host = element as HTMLElement;
    host.style.setProperty(
      "--wzc-color-surface-secondary",
      "rgb(240, 241, 242)",
    );
    host.style.setProperty("--wzc-color-text-1", "rgb(20, 21, 22)");
  });
  await expect(scrubber).toHaveCSS("background-color", "rgb(240, 241, 242)");
  await expect(scrubber).toHaveCSS("color", "rgb(20, 21, 22)");
  const lightSegmentSurfaces = await Promise.all([
    segmentManager.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
    resetSegment.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ]);
  expect(lightSegmentSurfaces[0]).not.toBe("rgb(240, 241, 242)");
  expect(lightSegmentSurfaces).not.toEqual(darkSegmentSurfaces);
  await scrubber.locator(".handle.start").press("ArrowLeft");
  await expect(scrubber.locator(".handle.start")).toHaveAttribute(
    "aria-valuetext",
    "10:00:00",
  );
  await segmentManager
    .getByRole("button", { name: "Download Segment" })
    .click();
  await expect(page.locator("wzc-recording-media-dialog dialog")).toBeVisible();
  await segmentManager.getByRole("button", { name: "Preview Segment" }).click();
  await expect(
    segmentManager.getByRole("button", { name: "Stop Preview" }),
  ).toBeVisible();
  await scrubber.locator("input.range").evaluate((input) => {
    const range = input as HTMLInputElement;
    range.value = String(Number(range.min) + 60);
    range.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  });
  await expect(
    segmentManager.getByRole("button", { name: "Stop Preview" }),
  ).toBeVisible();
  await segmentManager.getByRole("button", { name: "Stop Preview" }).click();
  await expect(
    segmentManager.getByRole("button", { name: "Preview Segment" }),
  ).toBeVisible();
  await scrubber
    .getByRole("button", { name: "Select recording segment" })
    .click();
  await expect(segmentManager).toHaveCount(0);
  await expect(scrubber).toBeVisible();
});

test("shows and filters mixed-camera persistent exports", async ({ page }) => {
  await page.route("**/export-thumbnail.svg*", (route) => {
    const fourByThree = route.request().url().includes("driveway");
    return route.fulfill({
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${fourByThree ? 120 : 160}" height="90"><rect width="100%" height="100%" fill="#567"/></svg>`,
      contentType: "image/svg+xml",
    });
  });
  await page.route("**/export-video.mp4*", (route) =>
    route.fulfill({ body: "", contentType: "video/mp4" }),
  );
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.locator("watchzone-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:watchzone-card",
      cameras: [
        { entity_id: "camera.front", title: "Front Door" },
        { entity_id: "camera.driveway", title: "Driveway" },
      ],
    });
    card.style.setProperty("--wzc-media-tile-background", "rgb(200, 200, 200)");
    card.style.setProperty(
      "--wzc-media-tile-hover-background",
      "rgb(180, 180, 180)",
    );
    card.hass = {
      config: { time_zone: "UTC" },
      locale: { language: "en", time_zone: "server" },
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front Door" },
        },
        "camera.driveway": {
          entity_id: "camera.driveway",
          state: "streaming",
          attributes: { friendly_name: "Driveway" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { type: string }) => {
        if (message.type === "watchzone/live/camera/ready") {
          return { ready: false };
        }
        if (
          message.type === "watchzone/reviews/list" ||
          message.type === "watchzone/events/list"
        ) {
          return { items: [] };
        }
        if (message.type === "watchzone/exports/list") {
          return {
            items: [
              {
                camera: "front",
                created_time: 1_794_352_800,
                download_path: "/export-video.mp4?download=true",
                entity_id: "camera.front",
                id: "front-export",
                in_progress: false,
                name: "Front visitor",
                revision: "one",
                thumbnail_path: "/export-thumbnail.svg?front",
                video_path: "/export-video.mp4",
              },
              {
                camera: "driveway",
                created_time: Date.now() / 1_000,
                download_path: "/export-video.mp4?download=true",
                entity_id: "camera.driveway",
                id: "driveway-export",
                in_progress: true,
                name: "Driveway vehicle",
                revision: "two",
                thumbnail_path: "/export-thumbnail.svg?driveway",
                video_path: "/export-video.mp4",
              },
            ],
          };
        }
        if (message.type === "auth/sign_path") {
          return { path: "/export-video.mp4?authSig=test" };
        }
        return undefined;
      },
    };
  });

  await expect(
    page.locator("wzc-camera-navigation button[role='tab']"),
  ).toHaveCount(2);
  const navigation = page.locator(".stage-stack-navigation");
  const exportsButton = navigation.getByRole("button", { name: "Exports" });
  await exportsButton.click();
  await expect(exportsButton).toHaveAttribute("aria-pressed", "true");
  const exports = page.locator("wzc-exports");
  await expect(exports.locator(".tile")).toHaveCount(2);
  await expect(exports.locator("wzc-media-day-header")).toContainText(
    "Exports",
  );
  const collection = exports.locator("#exports-collection");
  const navigationButtonBox = await navigation
    .locator(".stage-stack-button")
    .first()
    .boundingBox();
  const listTileBox = await exports.locator(".tile").first().boundingBox();
  expect(navigationButtonBox?.x).toBeCloseTo(listTileBox?.x ?? -1, 0);
  const layoutToggle = exports.getByRole("button", {
    name: "Show exports as grid",
  });
  await expect(collection).toHaveClass(/\blist\b/);
  await expect(layoutToggle.locator("ha-icon")).toHaveAttribute(
    "icon",
    "mdi:view-grid",
  );
  const listThumbnailBox = await exports
    .locator(".thumbnail")
    .first()
    .boundingBox();
  await layoutToggle.click();
  await expect(collection).toHaveClass(/\bgrid\b/);
  const listToggle = exports.getByRole("button", {
    name: "Show exports as list",
  });
  await expect(listToggle.locator("ha-icon")).toHaveAttribute(
    "icon",
    "mdi:view-list",
  );
  const gridGeometry = await exports.locator(".tile").evaluateAll((tiles) =>
    tiles.map((tile) => {
      const thumbnail = tile.querySelector(".thumbnail");
      const details = tile.querySelector(".details");
      const actions = tile.querySelector(".actions");
      if (!thumbnail || !details || !actions) {
        throw new Error("Export grid tile is incomplete");
      }
      const tileRect = tile.getBoundingClientRect();
      const thumbnailRect = thumbnail.getBoundingClientRect();
      const detailsRect = details.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      return {
        actionsTop: actionsRect.top,
        detailsTop: detailsRect.top,
        thumbnailBottom: thumbnailRect.bottom,
        thumbnailWidth: thumbnailRect.width,
        tileLeft: tileRect.left,
      };
    }),
  );
  expect(gridGeometry[0]?.thumbnailWidth).toBeGreaterThan(
    listThumbnailBox?.width ?? Number.POSITIVE_INFINITY,
  );
  expect(gridGeometry[0]?.detailsTop).toBeGreaterThanOrEqual(
    gridGeometry[0]?.thumbnailBottom ?? Number.POSITIVE_INFINITY,
  );
  expect(gridGeometry[0]?.actionsTop).toBeGreaterThanOrEqual(
    gridGeometry[0]?.thumbnailBottom ?? Number.POSITIVE_INFINITY,
  );
  expect(gridGeometry[1]?.tileLeft).toBeGreaterThan(
    gridGeometry[0]?.tileLeft ?? Number.POSITIVE_INFINITY,
  );
  await listToggle.click();
  await expect(collection).toHaveClass(/\blist\b/);
  const exportCalendar = navigation.locator("wzc-activity-calendar");
  const exportCalendarTrigger = exportCalendar.locator(".calendar-trigger");
  await expect(exportCalendarTrigger).toBeDisabled();
  await expect(exportCalendarTrigger).toHaveAttribute(
    "aria-label",
    "Export calendar unavailable",
  );
  expect(
    await exports
      .locator(".tile")
      .first()
      .evaluate((tile) => getComputedStyle(tile).borderTopWidth),
  ).toBe("0px");
  const exportTile = exports.locator(".tile:has(.tile-player)").first();
  await expect(exportTile).toHaveCSS("background-color", "rgb(200, 200, 200)");
  await expect(exports).toContainText("Front Door");
  await expect(exports).toContainText("Driveway");
  await expect(exports).toContainText("Preparing export…");
  const tileHeights = await exports
    .locator(".tile")
    .evaluateAll((tiles) =>
      tiles.map((tile) => tile.getBoundingClientRect().height),
    );
  expect(new Set(tileHeights).size).toBe(1);
  await expect(
    exports.getByRole("button", { name: "Add to Case — coming soon" }).first(),
  ).toBeDisabled();
  await exportTile.locator(".tile-player").hover({
    position: { x: 20, y: 20 },
  });
  await expect(exportTile).toHaveCSS("background-color", "rgb(180, 180, 180)");
  const hoverPreview = exports.locator("video.hover-preview");
  await expect(hoverPreview).toHaveCount(1);
  await expect(hoverPreview).toHaveAttribute(
    "src",
    "/export-video.mp4?authSig=test",
  );

  const filter = navigation.locator("wzc-export-filter");
  await filter.locator(".filter-trigger").click();
  await expect(filter.locator(".popover")).toBeVisible();
  await expect(filter.getByLabel("Newest first")).toBeChecked();
  await filter.getByText("Oldest first", { exact: true }).click();
  await expect(filter.getByLabel("Oldest first")).toBeChecked();
  await expect(exports.locator(".title").first()).toHaveText("Front visitor");
  await filter.getByText("Newest first", { exact: true }).click();
  await expect(filter.getByLabel("Newest first")).toBeChecked();
  await expect(exports.locator(".title").first()).toHaveText(
    "Driveway vehicle",
  );
  await filter.getByText("Front Door", { exact: true }).click();
  await expect(exports.locator(".tile")).toHaveCount(1);
  await expect(exports).toContainText("Front visitor");

  await exports.locator(".tile-player").click();
  await expect(page.locator("wzc-export-media-dialog dialog")).toBeVisible();

  const scrollGeometry = await exports.locator(".scroller").evaluate((node) => {
    const collection = node.querySelector(".collection");
    const tile = collection?.querySelector(".tile");
    if (!collection || !tile) throw new Error("Export list is incomplete");
    for (let index = 0; index < 6; index += 1) {
      collection.append(tile.cloneNode(true));
    }
    return {
      clientHeight: node.clientHeight,
      overflowY: getComputedStyle(node).overflowY,
      scrollHeight: node.scrollHeight,
    };
  });
  expect(scrollGeometry.overflowY).toBe("auto");
  expect(scrollGeometry.scrollHeight).toBeGreaterThan(
    scrollGeometry.clientHeight,
  );
});

test("lets the camera navigation shadow paint into the card padding", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      cameras: [{ entity_id: "camera.front", title: "Front Door" }],
    });
  });
  const bar = card.locator("wzc-camera-navigation .bar");
  await expect(bar).toBeVisible();

  const cardResult = await card.evaluate((element) => {
    const cardRoot = element.shadowRoot;
    const cardShell = cardRoot?.querySelector("ha-card");
    const shell = cardRoot?.querySelector<HTMLElement>(".shell");
    if (!cardShell || !shell) {
      throw new Error("Card presentation is incomplete");
    }

    const cardStyle = getComputedStyle(cardShell);
    const shellStyle = getComputedStyle(shell);
    return {
      cardOverflow: cardStyle.overflow,
      cardPaddingBottom: Number.parseFloat(cardStyle.paddingBottom),
      shellOverflow: shellStyle.overflow,
      cardBottom: cardShell.getBoundingClientRect().bottom,
    };
  });
  const navigationResult = await bar.evaluate((element) => ({
    navigationShadow: getComputedStyle(element).boxShadow,
    barBottom: element.getBoundingClientRect().bottom,
  }));

  expect(cardResult.cardOverflow).toBe("clip");
  expect(cardResult.shellOverflow).toBe("visible");
  expect(navigationResult.navigationShadow).not.toBe("none");
  expect(cardResult.cardPaddingBottom).toBeGreaterThan(0);
  expect(
    cardResult.cardBottom - navigationResult.barBottom,
  ).toBeGreaterThanOrEqual(cardResult.cardPaddingBottom - 1);
});

test("restores camera navigation after an inner-dashboard detach", async ({
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
  const navigation = card.locator("wzc-camera-navigation");
  await expect(navigation.locator("button")).toHaveCount(2);

  await card.evaluate((element) => {
    const parent = element.parentNode;
    if (!parent) throw new Error("WatchZone card has no parent");
    const marker = document.createComment("inner-dashboard-navigation");
    parent.insertBefore(marker, element);
    element.remove();
    parent.insertBefore(element, marker);
    marker.remove();
  });

  await expect(navigation.locator("button")).toHaveCount(2);
  await expect(navigation.locator('button[aria-selected="true"]')).toHaveText(
    "Front Door",
  );
  await navigation.locator("button").nth(1).click();
  await expect(navigation.locator("button").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("keeps the camera switcher overlay in tandem with camera navigation", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      camera_switcher_overlay: true,
      cameras: [
        { entity_id: "camera.front", title: "Front Door" },
        { entity_id: "camera.back", title: "Back Yard" },
      ],
    });
  });

  const switcher = card.locator("wzc-camera-switcher");
  const navigation = card.locator("wzc-camera-navigation");
  await expect(switcher.locator("button.trigger")).toContainText("Front Door");
  await card.locator("wzc-camera-live .viewport").first().hover();
  await switcher.locator("button.trigger").click();
  await switcher.locator('button.option[data-entity-id="camera.back"]').click();

  await expect(
    navigation.locator('button[data-value="camera.back"]'),
  ).toHaveAttribute("aria-selected", "true");
  await expect(switcher.locator("button.trigger")).toContainText("Back Yard");
});

test("keeps the HA pre-editor wrapper stable with bounded navigation observation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const testWindow = window as typeof window & {
      __wzcNavigationResizeObservations?: number;
    };
    testWindow.__wzcNavigationResizeObservations = 0;
    const NativeResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeResizeObserver {
      public override observe(
        target: Element,
        options?: ResizeObserverOptions,
      ): void {
        const root = target.getRootNode();
        if (
          root instanceof ShadowRoot &&
          root.host.localName === "wzc-camera-navigation"
        ) {
          testWindow.__wzcNavigationResizeObservations =
            (testWindow.__wzcNavigationResizeObservations ?? 0) + 1;
        }
        super.observe(target, options);
      }
    };
  });
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
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
  await expect(card.locator("wzc-camera-navigation button")).toHaveCount(2);

  const result = await card.evaluate(async (element) => {
    const wrapper = document.createElement("div");
    const root = wrapper.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { display: block; position: relative; }
      .card-wrapper { position: relative; height: 100%; z-index: 0; }
      .card-overlay {
        position: absolute;
        inset: 0;
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease-in-out;
      }
      .card-overlay.visible { opacity: 1; pointer-events: auto; }
      .control-overlay {
        position: absolute;
        inset: 0;
        opacity: 0.8;
        background: white;
      }
    `;
    const cardWrapper = document.createElement("div");
    cardWrapper.className = "card-wrapper";
    cardWrapper.inert = true;
    const overlay = document.createElement("div");
    overlay.className = "card-overlay";
    const controlOverlay = document.createElement("div");
    controlOverlay.className = "control-overlay";
    overlay.append(controlOverlay);
    const width = element.getBoundingClientRect().width;
    wrapper.style.inlineSize = `${width}px`;
    element.replaceWith(wrapper);
    cardWrapper.append(element);
    root.append(style, cardWrapper, overlay);

    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    let resizeNotifications = 0;
    const observer = new ResizeObserver(() => {
      resizeNotifications += 1;
    });
    observer.observe(element);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    resizeNotifications = 0;
    const boxes: DOMRect[] = [];
    const sample = async (): Promise<void> => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      boxes.push(element.getBoundingClientRect());
    };
    const pagePosition = { x: window.scrollX, y: window.scrollY };
    overlay.classList.add("visible");
    for (let index = 0; index < 15; index += 1) await sample();
    overlay.classList.remove("visible");
    for (let index = 0; index < 15; index += 1) await sample();
    observer.disconnect();

    return {
      heightDelta:
        Math.max(...boxes.map(({ height }) => height)) -
        Math.min(...boxes.map(({ height }) => height)),
      pageMoved:
        window.scrollX !== pagePosition.x || window.scrollY !== pagePosition.y,
      resizeNotifications,
      widthDelta:
        Math.max(...boxes.map(({ width: boxWidth }) => boxWidth)) -
        Math.min(...boxes.map(({ width: boxWidth }) => boxWidth)),
    };
  });

  expect(result).toEqual({
    heightDelta: 0,
    pageMoved: false,
    resizeNotifications: 0,
    widthDelta: 0,
  });
  const navigationObservations = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __wzcNavigationResizeObservations?: number;
        }
      ).__wzcNavigationResizeObservations ?? 0,
  );
  expect(navigationObservations).toBeGreaterThanOrEqual(2);
  expect(navigationObservations).toBeLessThanOrEqual(4);
});

test("scrolls overflow camera navigation with directional counts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const testWindow = window as typeof window & {
      __wzcScrollIntoViewCalls?: number;
    };
    testWindow.__wzcScrollIntoViewCalls = 0;
    Element.prototype.scrollIntoView = function () {
      testWindow.__wzcScrollIntoViewCalls =
        (testWindow.__wzcScrollIntoViewCalls ?? 0) + 1;
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

  const navigation = page.locator("wzc-camera-navigation");
  const cameraButtons = navigation.locator(".items button");
  await expect(cameraButtons).toHaveCount(8);
  await navigation.evaluate((element) => {
    element.style.inlineSize = "20rem";
  });
  const viewport = navigation.locator(".items .segmented-control");
  const previous = navigation.locator(
    ".overflow-slot.previous .overflow-control",
  );
  const next = navigation.locator(".overflow-slot.next .overflow-control");
  await viewport.evaluate((element) => {
    element.scrollLeft = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(previous).toHaveCount(0);
  await expect(next).toBeVisible();
  const initialNext = await next.evaluate((button) => ({
    count: Number(button.querySelector(".overflow-count")?.textContent),
    label: button.getAttribute("aria-label"),
  }));
  const initialNextCount = initialNext.count;
  expect(initialNextCount).toBeGreaterThan(0);
  expect(initialNext.label).toBe(`Show ${initialNextCount} later cameras`);
  await expect(viewport).toHaveCSS("overflow-x", "auto");
  await expect(viewport).toHaveCSS("touch-action", /pan-x/);
  await expect(viewport).toHaveCSS("scroll-snap-type", "x");
  const pagePosition = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  await next.evaluate((button) => (button as HTMLButtonElement).click());
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(previous).toBeVisible();
  await expect
    .poll(async () =>
      (await next.count()) === 0
        ? 0
        : Number(await next.locator(".overflow-count").textContent()),
    )
    .toBeLessThan(initialNextCount);

  await cameraButtons
    .last()
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(next).toHaveCount(0);
  await expect(previous).toBeVisible();
  await expect(cameraButtons.last()).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __wzcScrollIntoViewCalls?: number;
          }
        ).__wzcScrollIntoViewCalls,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })),
  ).toEqual(pagePosition);
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
    const nextIconRect = next?.querySelector("svg")?.getBoundingClientRect();
    const laneProbe = document.createElement("span");
    laneProbe.style.cssText =
      "position:absolute;inline-size:var(--wzc-camera-side-lane-inline-size)";
    camera.shadowRoot?.append(laneProbe);
    const laneWidth = laneProbe.getBoundingClientRect().width;
    laneProbe.remove();
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
        nextIconCenter: nextIconRect
          ? nextIconRect.left + nextIconRect.width / 2
          : undefined,
        laneWidth,
        nextTop: next?.getBoundingClientRect().top,
        nextRight: nextRect?.right,
        previousHeight: previousRect?.height,
        previousIconCenter: previousIconRect
          ? previousIconRect.left + previousIconRect.width / 2
          : undefined,
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
  expect(previousInset).toBeCloseTo(result.navigation.laneWidth, 1);
  expect(nextInset).toBeCloseTo(result.navigation.laneWidth, 1);
  const mediaCenter =
    (result.navigation.carouselTop ?? 0) +
    (result.navigation.carouselHeight ?? 0) / 2;
  expect(
    (result.navigation.previousTop ?? 0) +
      (result.navigation.previousHeight ?? 0) / 2,
  ).toBeCloseTo(mediaCenter, 1);
  expect(result.navigation.iconHeight).toBeGreaterThanOrEqual(28);
  expect(result.navigation.iconHeight).toBeLessThanOrEqual(44);
  expect(
    (result.navigation.previousIconCenter ?? 0) -
      ((result.navigation.carouselLeft ?? 0) + result.navigation.laneWidth),
  ).toBeCloseTo(
    (result.navigation.carouselRight ?? 0) -
      result.navigation.laneWidth -
      (result.navigation.nextIconCenter ?? 0),
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
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
});

test("keeps PTZ, talk, and light controls attached to the resizing viewport", async ({
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
      camera_switcher_overlay: true,
      cameras: [
        {
          entity_id: "camera.front",
          lights: [{ entity_id: "light.porch", icon: "mdi:cellphone" }],
          ptz_enabled: true,
          two_way_talk_enabled: true,
        },
        { entity_id: "camera.doorbell" },
        { entity_id: "camera.birdfeeder" },
        { entity_id: "camera.driveway" },
      ],
      ptz_overlay_control: "start_closed",
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
        "camera.doorbell": {
          entity_id: "camera.doorbell",
          state: "streaming",
          attributes: { friendly_name: "Doorbell" },
        },
        "camera.birdfeeder": {
          entity_id: "camera.birdfeeder",
          state: "streaming",
          attributes: { friendly_name: "Birdfeeder" },
        },
        "camera.driveway": {
          entity_id: "camera.driveway",
          state: "streaming",
          attributes: { friendly_name: "Driveway" },
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
  await expect(camera.locator(".swiper-slide")).toHaveCount(4);
  await expect(camera.locator(".camera-carousel")).toHaveClass(
    /swiper-initialized/,
  );
  const controlsSlot = page.locator(".camera-overlay-grid");
  const leadingControls = controlsSlot.locator(".lower-control-group.leading");
  const selectedLiveViewport = camera
    .locator(".swiper-slide-active wzc-camera-live .viewport")
    .first();
  const selectedCameraStage = camera
    .locator(".swiper-slide-active wzc-camera-view .camera")
    .first();
  await selectedLiveViewport.hover();
  const talk = page.locator("wzc-two-way-talk");
  const ptz = page.locator("wzc-ptz");
  const lights = page.locator("wzc-light-control");
  const cameraPicker = page.locator("wzc-camera-switcher .trigger");
  const slideshowButton = page.locator("wzc-slideshow button");
  const sourceBadge = selectedLiveViewport.locator(".source-indicator .badge");
  const talkButton = talk.locator("button.inactive");
  const ptzControl = ptz.locator(".ptz-control");
  const ptzCollapse = ptz.locator("button.collapse");
  const ptzTrigger = ptz.locator("button.ptz-trigger");
  const ptzRightButton = ptz.locator("button.right");
  const lightButton = lights.locator(".light-button");
  const talkIcon = talkButton.locator(":scope > svg");
  const lightIcon = lightButton.locator(":scope > ha-icon svg");
  await expect(talkButton).toBeVisible();
  await expect(ptzTrigger).toBeVisible();
  await selectedLiveViewport.evaluate((viewport) => {
    const badge = document.createElement("wzc-badge");
    badge.className = "source-indicator visible";
    badge.setAttribute("shape", "pill");
    badge.textContent = "MSE";
    viewport.append(badge);
  });
  await expect(sourceBadge).toBeVisible();
  const desktopSourceBadgeMetrics = await sourceBadge.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(styles.fontSize),
      paddingInline: Number.parseFloat(styles.paddingInlineStart),
    };
  });
  const [initialPtzTriggerBox, initialTalkButtonBox] = await Promise.all([
    ptzTrigger.boundingBox(),
    talkButton.boundingBox(),
  ]);
  expect(initialPtzTriggerBox?.width).toBeCloseTo(
    initialTalkButtonBox?.width ?? 0,
    1,
  );
  expect(initialPtzTriggerBox?.height).toBeCloseTo(
    initialTalkButtonBox?.height ?? 0,
    1,
  );
  if (!initialPtzTriggerBox) {
    throw new Error("Expected the collapsed PTZ control to be measurable");
  }
  const collapsedPtzControlBox = await ptzControl.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const host = element.getRootNode() as ShadowRoot;
    const hostRect = (host.host as HTMLElement).getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      x: rect.x - hostRect.x,
      y: rect.y - hostRect.y,
    };
  });
  await ptzTrigger.click();
  await expect(ptzControl).toHaveClass(/\bexpanded\b/);
  const expansionFrames = await ptzControl.evaluate(async (element) => {
    const frames: Array<{
      computedWidth: string;
      width: number;
      x: number;
      y: number;
    }> = [];
    for (let frame = 0; frame < 10; frame += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      frames.push({
        computedWidth: style.width,
        width: rect.width,
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      });
    }
    return frames;
  });
  expect(
    Math.max(...expansionFrames.map(({ x }) => x)) -
      Math.min(...expansionFrames.map(({ x }) => x)),
  ).toBeLessThan(1);
  expect(expansionFrames.at(-1)).toMatchObject({
    computedWidth: expect.not.stringMatching(/^0px$/),
  });
  expect(
    Math.max(...expansionFrames.map(({ y }) => y)) -
      Math.min(...expansionFrames.map(({ y }) => y)),
  ).toBeLessThan(1);
  expect(
    Math.max(...expansionFrames.map(({ width }) => width)),
  ).toBeGreaterThan(initialPtzTriggerBox.width * 1.5);
  await ptzControl.hover();
  await expect
    .poll(async () => {
      return ptzControl.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const root = element.getRootNode();
        if (!(root instanceof ShadowRoot) || !root.host.isConnected) {
          return Number.NaN;
        }
        const hostRect = root.host.getBoundingClientRect();
        return rect.x - hostRect.x + rect.width / 2;
      });
    })
    .toBeCloseTo(
      collapsedPtzControlBox.x + collapsedPtzControlBox.width / 2,
      0,
    );
  await expect
    .poll(async () => {
      return ptzControl.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const root = element.getRootNode();
        if (!(root instanceof ShadowRoot) || !root.host.isConnected) {
          return Number.NaN;
        }
        const hostRect = root.host.getBoundingClientRect();
        return rect.y - hostRect.y + rect.height / 2;
      });
    })
    .toBeCloseTo(
      collapsedPtzControlBox.y + collapsedPtzControlBox.height / 2,
      0,
    );
  await ptzCollapse.click();
  await expect(ptzControl).toHaveClass(/\bcollapsed\b/);
  await ptzTrigger.click();
  await expect(ptzControl).toHaveClass(/\bexpanded\b/);
  await ptzControl.hover();
  await expect(ptz.locator("xpath=..")).toHaveAttribute(
    "data-layout-node",
    "wzc:default-ptz-component",
  );
  await expect(ptz.locator("xpath=..")).toHaveAttribute(
    "data-control-region",
    "trailing",
  );
  await expect(lightButton).toBeVisible();
  await expect(lightIcon).toBeVisible();
  await expect(lightButton).toHaveAttribute("title", "Turn off Porch");
  await expect(lightButton).toHaveAttribute("aria-label", "Turn off Porch");

  // Focus keeps the shared interaction overlay active while slower WebKit
  // gathers every box; a hover-only timer can expire mid-measurement.
  await ptzRightButton.focus();
  await expect(ptzRightButton).toBeFocused();

  const [
    cameraBox,
    controlsSlotBox,
    talkHostBox,
    lightHostBox,
    ptzHostBox,
    cameraPickerBox,
    slideshowButtonBox,
    talkButtonBox,
    talkIconBox,
    lightButtonBox,
    lightIconBox,
  ] = await Promise.all([
    selectedCameraStage.boundingBox(),
    controlsSlot.boundingBox(),
    talk.boundingBox(),
    lights.boundingBox(),
    ptz.boundingBox(),
    cameraPicker.boundingBox(),
    slideshowButton.boundingBox(),
    talkButton.boundingBox(),
    talkIcon.boundingBox(),
    lightButton.boundingBox(),
    lightIcon.boundingBox(),
  ]);
  expect(cameraBox).not.toBeNull();
  expect(controlsSlotBox).not.toBeNull();
  expect(talkHostBox).not.toBeNull();
  expect(lightHostBox).not.toBeNull();
  expect(ptzHostBox).not.toBeNull();
  expect(cameraPickerBox).not.toBeNull();
  expect(slideshowButtonBox).not.toBeNull();
  expect(talkButtonBox).not.toBeNull();
  expect(talkIconBox).not.toBeNull();
  expect(lightButtonBox).not.toBeNull();
  expect(lightIconBox).not.toBeNull();
  if (
    !cameraBox ||
    !controlsSlotBox ||
    !talkHostBox ||
    !lightHostBox ||
    !ptzHostBox ||
    !cameraPickerBox ||
    !slideshowButtonBox ||
    !talkButtonBox ||
    !talkIconBox ||
    !lightButtonBox ||
    !lightIconBox
  ) {
    return;
  }
  const { button: ptzRightButtonBox, icon: ptzRightIconBox } =
    await ptzRightButton.evaluate((element) => {
      const icon = element.querySelector(":scope > svg");
      if (!icon) throw new Error("PTZ direction icon is unavailable");
      const buttonRect = element.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      return {
        button: {
          height: buttonRect.height,
          width: buttonRect.width,
        },
        icon: {
          height: iconRect.height,
          width: iconRect.width,
        },
      };
    });

  const overlayAreas = page.locator(".camera-overlay-area");
  await expect(page.locator('[data-stage-slot="overlay"]')).toHaveCount(1);
  await expect(overlayAreas).toHaveCount(6);
  expect(
    await overlayAreas.evaluateAll((areas) =>
      areas.map((area) => area.getAttribute("data-overlay-area")),
    ),
  ).toEqual(["top", "left", "media", "right", "lower", "metadata"]);
  const areaBoxes = await overlayAreas.evaluateAll((areas) =>
    Object.fromEntries(
      areas.map((area) => {
        const rect = area.getBoundingClientRect();
        return [
          area.getAttribute("data-overlay-area"),
          {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          },
        ];
      }),
    ),
  );
  const topArea = areaBoxes.top!;
  const leftArea = areaBoxes.left!;
  const mediaArea = areaBoxes.media!;
  const rightArea = areaBoxes.right!;
  const lowerArea = areaBoxes.lower!;
  const metadataArea = areaBoxes.metadata!;
  expect(topArea.left).toBeCloseTo(leftArea.right, 1);
  expect(topArea.right).toBeCloseTo(rightArea.left, 1);
  expect(topArea.top).toBeCloseTo(cameraBox.y, 1);
  expect(metadataArea.left).toBeCloseTo(cameraBox.x, 1);
  expect(metadataArea.width).toBeCloseTo(cameraBox.width, 1);
  expect(metadataArea.bottom).toBeCloseTo(cameraBox.y + cameraBox.height, 1);
  expect(leftArea.left).toBeCloseTo(cameraBox.x, 1);
  expect(rightArea.right).toBeCloseTo(cameraBox.x + cameraBox.width, 1);
  expect(leftArea.width).toBeCloseTo(rightArea.width, 1);
  expect(leftArea.top).toBeCloseTo(cameraBox.y, 1);
  expect(rightArea.top).toBeCloseTo(cameraBox.y, 1);
  expect(leftArea.bottom).toBeCloseTo(metadataArea.top, 1);
  expect(rightArea.bottom).toBeCloseTo(metadataArea.top, 1);
  expect(mediaArea.left).toBeCloseTo(leftArea.right, 1);
  expect(mediaArea.right).toBeCloseTo(rightArea.left, 1);
  expect(mediaArea.top).toBeCloseTo(topArea.bottom, 1);
  expect(mediaArea.bottom).toBeCloseTo(lowerArea.top, 1);
  expect(lowerArea.left).toBeCloseTo(leftArea.right, 1);
  expect(lowerArea.right).toBeCloseTo(rightArea.left, 1);
  expect(lowerArea.bottom).toBeCloseTo(metadataArea.top, 1);
  expect(controlsSlotBox.x).toBeCloseTo(cameraBox.x, 1);
  expect(controlsSlotBox.y).toBeCloseTo(cameraBox.y, 1);
  expect(controlsSlotBox.width).toBeCloseTo(cameraBox.width, 1);
  expect(controlsSlotBox.height).toBeCloseTo(cameraBox.height, 1);
  expect(cameraPickerBox.x + cameraPickerBox.width / 2).toBeCloseTo(
    cameraBox.x + cameraBox.width / 2,
    0,
  );
  expect(slideshowButtonBox.width).toBeCloseTo(slideshowButtonBox.height, 1);
  const desktopTopControlGap =
    cameraPickerBox.x - (slideshowButtonBox.x + slideshowButtonBox.width);
  expect(desktopTopControlGap).toBeGreaterThan(0);
  expect(desktopTopControlGap).toBeLessThanOrEqual(8);
  const currentPtzControlBox = await ptzControl.boundingBox();
  expect(currentPtzControlBox).not.toBeNull();
  if (!currentPtzControlBox) return;
  expect(currentPtzControlBox.x).toBeGreaterThanOrEqual(cameraBox.x);
  expect(currentPtzControlBox.y).toBeGreaterThanOrEqual(cameraBox.y);
  expect(
    currentPtzControlBox.x + currentPtzControlBox.width,
  ).toBeLessThanOrEqual(cameraBox.x + cameraBox.width);
  expect(
    currentPtzControlBox.y + currentPtzControlBox.height,
  ).toBeLessThanOrEqual(cameraBox.y + cameraBox.height);
  expect(
    currentPtzControlBox.x +
      currentPtzControlBox.width / 2 -
      (ptzHostBox.x + ptzHostBox.width / 2),
  ).toBeCloseTo(0, 0);
  expect(
    currentPtzControlBox.y +
      currentPtzControlBox.height / 2 -
      (ptzHostBox.y + ptzHostBox.height / 2),
  ).toBeCloseTo(0, 0);

  expect(talkHostBox.height).toBeCloseTo(talkButtonBox.height, 0);
  expect(cameraBox.width / cameraBox.height).toBeCloseTo(16 / 9, 1);
  expect(lightHostBox.height).toBeCloseTo(lightButtonBox.height, 0);
  expect(talkHostBox.y + talkHostBox.height).toBeCloseTo(
    lightHostBox.y + lightHostBox.height,
    0,
  );
  expect(ptzHostBox.y + ptzHostBox.height).toBeCloseTo(
    lightHostBox.y + lightHostBox.height,
    0,
  );
  const lowerAreaBox = await page
    .locator(".camera-overlay-area-lower")
    .boundingBox();
  expect(lowerAreaBox).not.toBeNull();
  if (!lowerAreaBox) return;
  expect(ptzHostBox.x + ptzHostBox.width).toBeCloseTo(
    lowerAreaBox.x + lowerAreaBox.width,
    0,
  );
  expect(
    initialPtzTriggerBox.x + initialPtzTriggerBox.width,
  ).toBeLessThanOrEqual(lowerAreaBox.x + lowerAreaBox.width + 1);
  expect(initialPtzTriggerBox.x).toBeGreaterThanOrEqual(lowerAreaBox.x);
  expect(
    currentPtzControlBox.x + currentPtzControlBox.width,
  ).toBeLessThanOrEqual(lowerAreaBox.x + lowerAreaBox.width + 1);
  const ptzDirectionVisualGeometry = await ptzRightButton.evaluate(
    (element) => {
      const styles = getComputedStyle(element, "::before");
      const control = element.closest(".ptz-control");
      if (!control) throw new Error("PTZ control is unavailable");
      const buttonRect = element.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      return {
        height: Number.parseFloat(styles.height),
        width: Number.parseFloat(styles.width),
        expectedDiameter:
          2 * (controlRect.right - (buttonRect.left + buttonRect.width / 2)),
      };
    },
  );
  expect(ptzDirectionVisualGeometry.width).toBeCloseTo(
    ptzDirectionVisualGeometry.expectedDiameter,
    0,
  );
  expect(ptzDirectionVisualGeometry.height).toBeCloseTo(
    ptzDirectionVisualGeometry.expectedDiameter,
    0,
  );
  expect(ptzRightIconBox.width).toBeCloseTo(ptzRightButtonBox.width * 0.42, 1);
  expect(ptzRightIconBox.height).toBeCloseTo(
    ptzRightButtonBox.height * 0.42,
    1,
  );
  await ptzRightButton.hover();
  const ptzHoverLayers = await ptzRightButton.evaluate((element) => {
    const neutralProbe = document.createElement("span");
    neutralProbe.style.background =
      "var(--wzc-neutral-control-hover-background)";
    element.append(neutralProbe);
    const result = {
      button: getComputedStyle(element).backgroundColor,
      expected: getComputedStyle(neutralProbe).backgroundColor,
      visual: getComputedStyle(element, "::before").backgroundColor,
    };
    neutralProbe.remove();
    return result;
  });
  expect(ptzHoverLayers.button).toBe("rgba(0, 0, 0, 0)");
  expect(ptzHoverLayers.visual).toBe(ptzHoverLayers.expected);
  expect(talkHostBox.y + talkHostBox.height).toBeLessThanOrEqual(
    controlsSlotBox.y + controlsSlotBox.height,
  );
  expect(talkButtonBox.y).toBeGreaterThan(cameraBox.y + cameraBox.height / 2);
  expect(talkButtonBox.x + talkButtonBox.width / 2).toBeCloseTo(
    cameraBox.x + cameraBox.width / 2,
    0,
  );
  const desktopTalkBottomInset =
    cameraBox.y + cameraBox.height - (talkButtonBox.y + talkButtonBox.height);
  const desktopLightBottomInset =
    cameraBox.y + cameraBox.height - (lightButtonBox.y + lightButtonBox.height);
  expect(desktopTalkBottomInset).toBeCloseTo(metadataArea.height, 0);
  expect(desktopLightBottomInset).toBeCloseTo(metadataArea.height, 0);
  expect(
    talkButtonBox.x - (lightButtonBox.x + lightButtonBox.width),
  ).toBeGreaterThanOrEqual(8);
  const dockLayout = await controlsSlot
    .locator(".camera-overlay-area-lower")
    .evaluate((element) => {
      const styles = getComputedStyle(element);
      return { columnGap: styles.columnGap, display: styles.display };
    });
  expect(dockLayout).toEqual({ columnGap: "8px", display: "grid" });
  await expect
    .poll(() =>
      leadingControls.evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          display: styles.display,
          gridAutoFlow: styles.gridAutoFlow,
        };
      }),
    )
    .toEqual({ display: "grid", gridAutoFlow: "column" });

  await talk.evaluate((element) => {
    element.style.inlineSize = "calc(var(--wzc-camera-control-size) * 3)";
  });
  const [expandedTalkHostBox, reflowedLightHostBox] = await Promise.all([
    talk.boundingBox(),
    lights.boundingBox(),
  ]);
  expect(expandedTalkHostBox).not.toBeNull();
  expect(reflowedLightHostBox).not.toBeNull();
  expect(
    (expandedTalkHostBox?.x ?? 0) -
      ((reflowedLightHostBox?.x ?? 0) + (reflowedLightHostBox?.width ?? 0)),
  ).toBeGreaterThanOrEqual(8);
  expect(expandedTalkHostBox?.width).toBeCloseTo(talkButtonBox.width * 3, 0);
  expect(
    (expandedTalkHostBox?.x ?? 0) + (expandedTalkHostBox?.width ?? 0) / 2,
  ).toBeCloseTo(cameraBox.x + cameraBox.width / 2, 0);
  await talk.evaluate((element) => {
    element.style.removeProperty("inline-size");
  });
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
  expect(resizedTalkButton?.width).toBeCloseTo(44, 1);
  expect(resizedLightButton?.width).toBeCloseTo(44, 1);
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

  await lights.evaluate((element) => {
    element.style.setProperty(
      "--wzc-light-panel-background",
      "rgb(120, 121, 122)",
    );
    element.style.setProperty("--wzc-light-panel-backdrop-filter", "none");
    element.style.setProperty("--wzc-light-panel-radius", "18px");
  });

  await page.mouse.move(
    interactionLightButtonBox.x + interactionLightButtonBox.width / 2,
    interactionLightButtonBox.y + interactionLightButtonBox.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(LIGHT_LONG_PRESS_WAIT_MS);
  await page.mouse.up();
  const dimmer = lights.locator(".dimmer-panel");
  await expect(dimmer).toBeVisible();
  await expect(dimmer).toHaveCSS("background-color", "rgb(120, 121, 122)");
  await expect(dimmer).toHaveCSS("backdrop-filter", "none");
  await expect(dimmer).toHaveCSS("border-radius", "18px");
  const desktopDimmerBox = await dimmer.boundingBox();
  expect(desktopDimmerBox).not.toBeNull();
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

  await page.locator("body").dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerId: 99,
    pointerType: "mouse",
  });
  await expect(dimmer).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const [stageBox, controlBox] = await Promise.all([
        selectedCameraStage.boundingBox(),
        controlsSlot.boundingBox(),
      ]);
      if (!stageBox || !controlBox) return false;
      const boxesMatch =
        Math.abs(controlBox.x - stageBox.x) <= 1 &&
        Math.abs(controlBox.y - stageBox.y) <= 1 &&
        Math.abs(controlBox.width - stageBox.width) <= 1 &&
        Math.abs(controlBox.height - stageBox.height) <= 1;
      return (
        boxesMatch &&
        Math.abs(stageBox.width / stageBox.height - 16 / 9) <= 0.05
      );
    })
    .toBe(true);
  const mobileCameraBox = await selectedCameraStage.boundingBox();
  const mobileControlsSlotBox = await controlsSlot.boundingBox();
  const [
    mobileTalkBox,
    mobileLightBox,
    mobilePtzBox,
    mobilePickerBox,
    mobileSlideshowBox,
  ] = await Promise.all([
    talkButton.boundingBox(),
    lightButton.boundingBox(),
    ptz.boundingBox(),
    cameraPicker.boundingBox(),
    slideshowButton.boundingBox(),
  ]);
  const mobileSourceBadgeMetrics = await sourceBadge.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(styles.fontSize),
      paddingInline: Number.parseFloat(styles.paddingInlineStart),
    };
  });
  const mobileResizeHandle = camera
    .locator('.swiper-slide-active [aria-label="Camera stage height"]')
    .first();
  const mobileResizeHandleBox = await mobileResizeHandle.boundingBox();
  const mobileMetadataAreaBox = await page
    .locator(".camera-overlay-area-metadata")
    .boundingBox();
  expect(mobileCameraBox).not.toBeNull();
  if (mobileCameraBox) {
    expect(mobileMetadataAreaBox).not.toBeNull();
    expect(mobileControlsSlotBox).not.toBeNull();
    expect(mobilePickerBox).not.toBeNull();
    expect(mobileSlideshowBox).not.toBeNull();
    if (mobilePickerBox && mobileSlideshowBox) {
      expect(mobilePickerBox.x + mobilePickerBox.width / 2).toBeCloseTo(
        mobileCameraBox.x + mobileCameraBox.width / 2,
        0,
      );
      const mobileTopControlGap =
        mobilePickerBox.x - (mobileSlideshowBox.x + mobileSlideshowBox.width);
      expect(mobileTopControlGap).toBeGreaterThan(0);
      expect(mobileTopControlGap).toBeLessThanOrEqual(desktopTopControlGap);
      expect(mobilePickerBox.width).toBeLessThan(cameraPickerBox.width);
      expect(mobilePickerBox.height).toBeLessThan(cameraPickerBox.height);
      expect(mobileSlideshowBox.height).toBeLessThan(slideshowButtonBox.height);
      expect(mobileSlideshowBox.width).toBeCloseTo(
        mobileSlideshowBox.height,
        1,
      );
    }
    expect(mobileSourceBadgeMetrics.fontSize).toBeLessThan(
      desktopSourceBadgeMetrics.fontSize,
    );
    expect(mobileSourceBadgeMetrics.paddingInline).toBeLessThan(
      desktopSourceBadgeMetrics.paddingInline,
    );
    if (mobileControlsSlotBox) {
      expect(mobileControlsSlotBox.x).toBeCloseTo(mobileCameraBox.x, 1);
      expect(
        mobileControlsSlotBox.y,
        JSON.stringify({ mobileCameraBox, mobileControlsSlotBox }),
      ).toBeCloseTo(mobileCameraBox.y, 1);
      expect(mobileControlsSlotBox.width).toBeCloseTo(mobileCameraBox.width, 1);
      expect(mobileControlsSlotBox.height).toBeCloseTo(
        mobileCameraBox.height,
        1,
      );
    }
    expect(mobileCameraBox.width / mobileCameraBox.height).toBeCloseTo(
      16 / 9,
      1,
    );
    for (const controlBox of [mobileTalkBox, mobileLightBox] as const) {
      expect(controlBox).not.toBeNull();
      if (controlBox) {
        const desktopControlBox =
          controlBox === mobileTalkBox ? talkButtonBox : lightButtonBox;
        expect(controlBox.width).toBeCloseTo(desktopControlBox.width, 1);
        expect(controlBox.height).toBeCloseTo(desktopControlBox.height, 1);
        const mobileBottomInset =
          mobileCameraBox.y +
          mobileCameraBox.height -
          (controlBox.y + controlBox.height);
        expect(mobileBottomInset).toBeCloseTo(
          mobileMetadataAreaBox?.height ?? 0,
          0,
        );
      }
    }
    expect(mobileResizeHandleBox).not.toBeNull();
    expect(mobilePtzBox).not.toBeNull();
    if (
      mobileResizeHandleBox &&
      mobileTalkBox &&
      mobileLightBox &&
      mobilePtzBox
    ) {
      const mobileLowerAreaBox = await page
        .locator(".camera-overlay-area-lower")
        .boundingBox();
      expect(mobileLowerAreaBox).not.toBeNull();
      if (!mobileLowerAreaBox) return;
      expect(mobilePtzBox.y + mobilePtzBox.height).toBeCloseTo(
        mobileLightBox.y + mobileLightBox.height,
        0,
      );
      expect(mobilePtzBox.x + mobilePtzBox.width).toBeCloseTo(
        mobileLowerAreaBox.x + mobileLowerAreaBox.width,
        0,
      );
      expect(mobilePtzBox.width).toBeCloseTo(ptzHostBox.width, 1);
      expect(mobilePtzBox.height).toBeCloseTo(ptzHostBox.height, 1);
      const mobileHandleVisualTop = await mobileResizeHandle.evaluate(
        (element) => {
          const handle = element.getBoundingClientRect();
          const visual = getComputedStyle(element, "::before");
          return (
            handle.bottom -
            Number.parseFloat(visual.bottom) -
            Number.parseFloat(visual.height)
          );
        },
      );
      expect(mobileTalkBox.y + mobileTalkBox.height).toBeLessThanOrEqual(
        mobileHandleVisualTop + 2,
      );
      expect(mobileResizeHandleBox.width).toBeGreaterThanOrEqual(96);
      expect(mobileResizeHandleBox.height).toBeGreaterThanOrEqual(44);
      const mobileHandleGeometry = await mobileResizeHandle.evaluate(
        (element) => {
          const hitTarget = element.getBoundingClientRect();
          const visual = getComputedStyle(element, "::before");
          return {
            borderWidth: visual.borderWidth,
            hitTargetWidth: hitTarget.width,
            visualWidth: Number.parseFloat(visual.width),
          };
        },
      );
      expect(mobileHandleGeometry.visualWidth).toBeLessThan(
        mobileHandleGeometry.hitTargetWidth,
      );
      expect(mobileHandleGeometry.visualWidth).toBeGreaterThanOrEqual(64);
      expect(mobileHandleGeometry.borderWidth).toBe("0px");
      expect(
        mobileCameraBox.y +
          mobileCameraBox.height -
          (mobileResizeHandleBox.y + mobileResizeHandleBox.height),
      ).toBeCloseTo(0, 1);

      await selectedLiveViewport.dispatchEvent("pointerdown", {
        isPrimary: true,
        pointerId: 98,
        pointerType: "touch",
      });
      await selectedLiveViewport.dispatchEvent("pointerup", {
        isPrimary: true,
        pointerId: 98,
        pointerType: "touch",
      });
      await lightButton.focus();
      await lightButton.press("ArrowUp");
      await expect(dimmer).toBeVisible();
      const unresizedMobileDimmerBox = await dimmer.boundingBox();
      expect(unresizedMobileDimmerBox).not.toBeNull();
      if (unresizedMobileDimmerBox) {
        expect(unresizedMobileDimmerBox.y).toBeGreaterThanOrEqual(
          mobileCameraBox.y,
        );
        expect(
          unresizedMobileDimmerBox.y + unresizedMobileDimmerBox.height,
        ).toBeLessThanOrEqual(mobileCameraBox.y + mobileCameraBox.height + 1);
      }
      await page.locator("body").dispatchEvent("pointerdown", {
        button: 0,
        isPrimary: true,
        pointerId: 99,
        pointerType: "touch",
      });
      await expect(dimmer).toBeHidden();

      await mobileResizeHandle.focus();
      await expect(mobileResizeHandle).toHaveCSS("outline-style", "none");
      const cameraComposition = page.locator(".module-composition").first();
      const [initialModuleBox, initialCompositionBox] = await Promise.all([
        camera.boundingBox(),
        cameraComposition.boundingBox(),
      ]);
      expect(initialModuleBox).not.toBeNull();
      expect(initialCompositionBox).not.toBeNull();
      if (!initialModuleBox || !initialCompositionBox) return;
      expect(initialModuleBox.height).toBeCloseTo(mobileCameraBox.height, 1);
      expect(initialCompositionBox.height).toBeCloseTo(
        mobileCameraBox.height,
        1,
      );

      await page.mouse.move(
        mobileResizeHandleBox.x + mobileResizeHandleBox.width / 2,
        mobileResizeHandleBox.y + mobileResizeHandleBox.height - 8,
      );
      await page.mouse.down();
      await page.mouse.move(
        mobileResizeHandleBox.x + mobileResizeHandleBox.width / 2,
        mobileResizeHandleBox.y + mobileResizeHandleBox.height + 22,
      );
      await page.mouse.up();

      await expect
        .poll(async () => {
          const [stage, module, composition, controls] = await Promise.all([
            selectedCameraStage.boundingBox(),
            camera.boundingBox(),
            cameraComposition.boundingBox(),
            controlsSlot.boundingBox(),
          ]);
          if (!stage || !module || !composition || !controls) return undefined;
          return {
            composition: composition.height,
            controls: controls.height,
            module: module.height,
            stage: stage.height,
          };
        })
        .toEqual({
          composition: mobileCameraBox.height + 30,
          controls: mobileCameraBox.height + 30,
          module: mobileCameraBox.height + 30,
          stage: mobileCameraBox.height + 30,
        });

      const [movedTalkBox, movedLightBox, movedPtzBox] = await Promise.all([
        talkButton.boundingBox(),
        lightButton.boundingBox(),
        ptz.boundingBox(),
      ]);
      expect(movedTalkBox?.y).toBeGreaterThan(mobileTalkBox.y);
      expect(movedLightBox?.y).toBeGreaterThan(mobileLightBox.y);
      expect(movedPtzBox?.y).toBeGreaterThan(mobilePtzBox.y);
      expect((movedPtzBox?.y ?? 0) + (movedPtzBox?.height ?? 0)).toBeCloseTo(
        (movedLightBox?.y ?? 0) + (movedLightBox?.height ?? 0),
        0,
      );

      await selectedLiveViewport.dispatchEvent("pointerdown", {
        isPrimary: true,
        pointerId: 100,
        pointerType: "touch",
      });
      await selectedLiveViewport.dispatchEvent("pointerup", {
        isPrimary: true,
        pointerId: 100,
        pointerType: "touch",
      });
      await expect(lightButton).toBeVisible();
      await lightButton.focus();
      await lightButton.press("ArrowUp");
      await expect(dimmer).toBeVisible();
      const mobileDimmerBox = await dimmer.boundingBox();
      const resizedMobileCameraBox = await selectedCameraStage.boundingBox();
      expect(mobileDimmerBox).not.toBeNull();
      expect(resizedMobileCameraBox).not.toBeNull();
      if (mobileDimmerBox && resizedMobileCameraBox) {
        expect(mobileDimmerBox.width).toBeCloseTo(4.75 * 16, 1);
        expect(mobileDimmerBox.width).toBeLessThan(
          desktopDimmerBox?.width ?? Number.POSITIVE_INFINITY,
        );
        expect(mobileDimmerBox.x).toBeGreaterThanOrEqual(mobileCameraBox.x);
        expect(mobileDimmerBox.x + mobileDimmerBox.width).toBeLessThanOrEqual(
          mobileCameraBox.x + mobileCameraBox.width + 1,
        );
        expect(mobileDimmerBox.y).toBeGreaterThanOrEqual(
          resizedMobileCameraBox.y,
        );
        expect(mobileDimmerBox.y + mobileDimmerBox.height).toBeLessThanOrEqual(
          resizedMobileCameraBox.y + resizedMobileCameraBox.height + 1,
        );
      }
      await page.locator("body").dispatchEvent("pointerdown", {
        button: 0,
        isPrimary: true,
        pointerId: 101,
        pointerType: "touch",
      });
      await expect(dimmer).toBeHidden();
      await ptzRightButton.evaluate((button) => {
        button.dispatchEvent(
          new FocusEvent("focusin", { bubbles: true, composed: true }),
        );
      });
      await page.mouse.move(0, 0);
      await expect(ptzControl).toBeHidden({
        timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
      });
      await expect(ptz.locator("button.ptz-trigger")).toHaveCount(0);
      await expect(lights.locator(".light-stack")).toHaveCSS(
        "pointer-events",
        "none",
      );
      await expect(lights.locator(".light-stack")).toHaveCSS(
        "visibility",
        "hidden",
      );
      await expect(talk.locator(".inactive-control")).toHaveCSS(
        "pointer-events",
        "none",
      );
      await expect(talk.locator(".inactive-control")).toHaveCSS(
        "visibility",
        "hidden",
      );
      await expect(page.locator("wzc-camera-switcher .switcher")).toHaveCSS(
        "pointer-events",
        "none",
      );
      await expect(page.locator("wzc-slideshow button")).toHaveCSS(
        "pointer-events",
        "none",
      );
      await expect(camera.locator(".carousel-navigation").first()).toHaveCSS(
        "pointer-events",
        "none",
      );
      const hiddenLowerControlHits = await Promise.all(
        [lightButton, talkButton, ptzRightButton].map((control) =>
          control.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const x = bounds.x + bounds.width / 2;
            const y = bounds.y + bounds.height / 2;
            let target = document.elementFromPoint(x, y);
            while (target?.shadowRoot) {
              const nested = target.shadowRoot.elementFromPoint(x, y);
              if (!nested || nested === target) break;
              target = nested;
            }
            return (
              target === element || Boolean(target && element.contains(target))
            );
          }),
        ),
      );
      expect(hiddenLowerControlHits).toEqual([false, false, false]);
    }
  }
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
          selected?: "fallback" | "webrtc";
          transport?: "hls_native" | "hls_mse" | "webrtc";
          updateComplete: Promise<boolean>;
        }
      >("wzc-camera-live");
      if (!view || !presentation)
        throw new Error("Camera view was not rendered");
      presentation.selected = "fallback";
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
      const controlButton = controls?.shadowRoot
        ?.querySelector("wzc-media-controls")
        ?.shadowRoot?.querySelector<HTMLElement>(".control-button");
      const controlButtons = [
        ...(controls?.shadowRoot
          ?.querySelector("wzc-media-controls")
          ?.shadowRoot?.querySelectorAll<HTMLElement>(".control-button") ?? []),
      ];
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
      const insetProbe = document.createElement("span");
      insetProbe.style.cssText =
        "position:absolute;inline-size:var(--wzc-camera-control-inline-inset)";
      view.shadowRoot?.append(insetProbe);
      const controlInset = insetProbe.getBoundingClientRect().width;
      insetProbe.remove();
      return {
        carousel: rect(carousel),
        control: rect(controlButton),
        controlInset,
        controlRight: Math.max(
          ...controlButtons.map(
            (button) => button.getBoundingClientRect().right,
          ),
        ),
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
    Math.abs(
      (geometry.next?.top ?? 0) +
        (geometry.next?.height ?? 0) / 2 -
        stageCenterY,
    ),
  ).toBeLessThan(1);
  expect(
    Math.abs(
      (geometry.previous?.top ?? 0) +
        (geometry.previous?.height ?? 0) / 2 -
        stageCenterY,
    ),
  ).toBeLessThan(1);
  expect(geometry.control?.left ?? 0).toBeGreaterThanOrEqual(
    geometry.next?.right ?? 0,
  );
  expect(geometry.control?.width).toBeGreaterThanOrEqual(30);
  expect(geometry.control?.width).toBeLessThan(36);
  expect((geometry.stage?.right ?? 0) - geometry.controlRight).toBeCloseTo(
    geometry.controlInset,
    1,
  );
  expect(
    (geometry.stage?.width ?? 0) / (geometry.stage?.height ?? 1),
  ).toBeCloseTo(16 / 9, 1);
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
        outer_padding: false,
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

  expect(result.disabled).toEqual({
    borderRadius: "0px",
    boxShadow: "none",
    classes: "square-outer-corners no-outer-shadow no-outer-padding",
    hostBorderRadius: "0px",
    hostBoxShadow: "none",
    identityRetained: true,
    cardPadding: "0px",
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
  expect(result.enabled.cardPadding).not.toBe("0px");
  expect(result.enabled.shellPadding).toBe("0px");
  await expect(page.locator("watchzone-card ha-card")).toHaveCSS(
    "isolation",
    "isolate",
  );
});

test("exposes and honors the WatchZone semantic theme-token contract", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:watchzone-card",
      cameras: [{ entity_id: "camera.front" }],
    });
  });
  await expect(card.locator(".stage-grid")).toBeVisible();

  const result = await card.evaluate((element) => {
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
      "--wzc-dialog-background",
      "--wzc-dialog-backdrop-filter",
      "--wzc-dialog-radius",
      "--wzc-dialog-scrim-backdrop-filter",
      "--wzc-dialog-scrim-background",
      "--wzc-dialog-shadow",
      "--wzc-editor-dialog-background",
      "--wzc-editor-dialog-backdrop-filter",
      "--wzc-task-dialog-background",
      "--wzc-task-dialog-backdrop-filter",
      "--wzc-task-dialog-radius",
      "--wzc-task-dialog-shadow",
      "--wzc-popover-background",
      "--wzc-popover-backdrop-filter",
      "--wzc-popover-radius",
      "--wzc-popover-shadow",
      "--wzc-color-border",
      "--wzc-radius-card",
      "--wzc-shadow-card",
      "--wzc-shadow-small",
      "--wzc-shadow-medium",
      "--wzc-card-outer-shadow",
      "--wzc-stage-module-gap",
      "--wzc-camera-stage",
      "--wzc-camera-navigation-overflow-control-size",
      "--wzc-camera-navigation-overflow-control-color",
      "--wzc-camera-navigation-overflow-control-background",
      "--wzc-camera-navigation-overflow-control-hover-background",
      "--wzc-camera-navigation-overflow-count-color",
      "--wzc-camera-navigation-overflow-count-background",
      "--wzc-live-radius",
      "--wzc-live-shadow",
      "--wzc-media-overlay-opacity",
      "--wzc-media-overlay-hover-opacity",
      "--wzc-media-overlay-dimmed-opacity",
      "--wzc-media-overlay-surface",
      "--wzc-media-overlay-border-color",
      "--wzc-media-tile-background",
      "--wzc-media-tile-hover-background",
      "--wzc-recording-scrubber-surface",
      "--wzc-recording-segment-panel",
      "--wzc-recording-segment-button",
    ];
    const host = element as HTMLElement;
    host.style.setProperty("--wzc-color-text-1", "rgb(10, 20, 30)");
    host.style.setProperty("--text-primary-color", "rgba(0, 0, 0, 0.95)");
    host.style.setProperty("--ha-color-on-primary-loud", "rgb(245, 246, 247)");
    host.style.setProperty(
      "--ha-color-on-primary-normal",
      "rgb(235, 236, 237)",
    );
    host.style.setProperty("--wzc-card-background", "rgb(40, 50, 60)");
    host.style.setProperty("--wzc-card-radius", "18px");
    host.style.setProperty(
      "--wzc-card-outer-shadow",
      "rgb(1, 2, 3) 0px 4px 8px",
    );
    const hostStyle = getComputedStyle(host);
    const shell = host.shadowRoot?.querySelector("ha-card");
    const shellStyle = shell ? getComputedStyle(shell) : undefined;
    const stageGrid = host.shadowRoot?.querySelector(".stage-grid");
    const stageGridStyle = stageGrid ? getComputedStyle(stageGrid) : undefined;
    const defaultCardPadding = Number.parseFloat(shellStyle?.paddingTop ?? "0");
    const defaultStageModuleGap = Number.parseFloat(
      stageGridStyle?.rowGap ?? "0",
    );
    const reversedTextProbe = document.createElement("span");
    reversedTextProbe.style.color = "var(--wzc-color-text-reversed)";
    host.shadowRoot?.append(reversedTextProbe);
    const reversedTextColor = getComputedStyle(reversedTextProbe).color;
    reversedTextProbe.remove();
    const onPrimaryProbe = document.createElement("span");
    onPrimaryProbe.style.color = "var(--wzc-color-on-primary)";
    host.shadowRoot?.append(onPrimaryProbe);
    const onPrimaryColor = getComputedStyle(onPrimaryProbe).color;
    onPrimaryProbe.remove();
    host.style.setProperty("--wzc-stage-module-gap", "7px");
    const placementRects = Array.from(stageGrid?.children ?? []).map((child) =>
      child.getBoundingClientRect(),
    );
    return {
      background: shellStyle?.backgroundColor,
      borderRadius: shellStyle?.borderRadius,
      boxShadow: shellStyle?.boxShadow,
      missingTokens: requiredTokens.filter(
        (token) => hostStyle.getPropertyValue(token).trim().length === 0,
      ),
      defaultCardPadding,
      defaultStageModuleGap,
      overriddenCardPadding: Number.parseFloat(shellStyle?.paddingTop ?? "0"),
      overriddenStageModuleGap: stageGridStyle?.rowGap,
      overriddenPlacementGaps: placementRects
        .slice(1)
        .map((rect, index) => rect.top - placementRects[index].bottom),
      textColor: shellStyle?.color,
      overlayOpacity: hostStyle
        .getPropertyValue("--wzc-media-overlay-opacity")
        .trim(),
      overlayHoverOpacity: hostStyle
        .getPropertyValue("--wzc-media-overlay-hover-opacity")
        .trim(),
      overlayDimmedOpacity: hostStyle
        .getPropertyValue("--wzc-media-overlay-dimmed-opacity")
        .trim(),
      onPrimaryColor,
      reversedTextColor,
    };
  });

  expect(result).toMatchObject({
    background: "rgb(40, 50, 60)",
    borderRadius: "18px",
    overriddenStageModuleGap: "7px",
    missingTokens: [],
    overlayHoverOpacity: "84%",
    overlayDimmedOpacity: "52%",
    overlayOpacity: "72%",
    onPrimaryColor: "rgb(235, 236, 237)",
    overriddenPlacementGaps: [7, 7],
    reversedTextColor: "rgb(245, 246, 247)",
    textColor: "rgb(10, 20, 30)",
  });
  expect(
    Math.abs(result.defaultStageModuleGap - result.defaultCardPadding / 2),
  ).toBeLessThanOrEqual(1);
  expect(result.overriddenCardPadding).toBeCloseTo(
    result.defaultCardPadding,
    1,
  );
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
  await expect(items).toHaveCount(7);
  await expect(items.locator("details[open]")).toHaveCount(0);
  await items.nth(0).locator("summary").click();
  await expect(items.nth(0).locator("details")).toHaveAttribute("open", "");
  await items.nth(1).locator("summary").click();
  await expect(items.nth(0).locator("details")).not.toHaveAttribute("open", "");
  await expect(items.nth(1).locator("details")).toHaveAttribute("open", "");
  const selectionBars = items.nth(1).locator("wzc-segmented-control");
  await expect(selectionBars).toHaveCount(4);
  const ptzBar = items.nth(1).locator('[data-setting="ptz-overlay-control"]');
  const transitionBar = items
    .nth(1)
    .locator('[data-setting="slide-transition"]');
  const ptzSelection = ptzBar.locator('[data-value="start_open"]');
  const transitionSelection = transitionBar.locator('[data-value="slide"]');
  await expect(transitionSelection).toHaveAttribute("aria-checked", "true");
  await expect(transitionBar.locator(".segmented-control")).toHaveCSS(
    "border-style",
    "none",
  );
  expect(
    await transitionSelection.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    ),
  ).toBe(
    await ptzSelection.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    ),
  );
  expect(
    await transitionSelection.evaluate((node) => getComputedStyle(node).color),
  ).toBe(await ptzSelection.evaluate((node) => getComputedStyle(node).color));

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

test("keeps the editor shell uniform and nested tasks independently solid", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  await page.evaluate(async () => {
    const card = document.querySelector("watchzone-card") as HTMLElement & {
      setConfig(config: unknown): void;
    };
    card.style.setProperty("--ha-card-background", "rgba(255, 255, 255, 0.14)");
    card.setConfig({ type: "custom:watchzone-card" });

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
    const dialog = document.createElement("hui-dialog-edit-card");
    dialog.id = "glass-theme-dialog";
    dialog.style.setProperty(
      "--ha-dialog-surface-background",
      "rgb(170, 171, 172)",
    );
    dialog.style.setProperty(
      "--ha-dialog-surface-backdrop-filter",
      "blur(7px)",
    );
    const dialogRoot = dialog.attachShadow({ mode: "open" });
    editor.id = "glass-theme-editor";
    editor.style.setProperty(
      "--ha-card-background",
      "rgba(255, 255, 255, 0.14)",
    );
    editor.style.setProperty(
      "--ha-dialog-surface-background",
      "rgb(170, 171, 172)",
    );
    editor.style.setProperty(
      "--ha-dialog-surface-backdrop-filter",
      "blur(7px)",
    );
    editor.style.setProperty(
      "--primary-background-color",
      "rgb(120, 121, 122)",
    );
    editor.style.setProperty(
      "--ha-color-surface-default",
      "rgb(160, 161, 170)",
    );
    editor.style.setProperty("--dialog-box-shadow", "rgb(1, 2, 3) 0px 4px 8px");
    editor.style.setProperty("--ha-dialog-border-radius", "28px");
    (
      editor as unknown as HTMLElement & {
        hass: unknown;
      }
    ).hass = {
      states: {},
      connection: { subscribeMessage: async () => () => undefined },
      callService: async () => undefined,
      callWS: async () => undefined,
      hassUrl: (path: string) => path,
      themes: {
        darkMode: true,
        default_dark_theme: "Frosted Glass",
        default_theme: "default",
        theme: "Frosted Glass",
        themes: { "Frosted Glass": { modes: { dark: {} } } },
      },
    };
    editor.setConfig({ type: "custom:watchzone-card" });
    dialogRoot.append(editor);
    document.body.append(dialog);
    await editor.updateComplete;
  });

  const cardSurface = page.locator("watchzone-card ha-card");
  await expect(cardSurface).toHaveCSS(
    "background-color",
    "rgba(255, 255, 255, 0.14)",
  );

  const editor = page.locator("#glass-theme-editor");
  await expect(editor).toHaveAttribute("data-theme-mode", "dark");
  await expect(editor).toHaveAttribute("data-theme-name", "Frosted Glass");
  await expect(editor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(editor).toHaveCSS("backdrop-filter", "none");
  const editorDialog = page.locator("#glass-theme-dialog");
  await expect
    .poll(() =>
      editorDialog.evaluate((element) => ({
        background: element.style
          .getPropertyValue("--ha-dialog-surface-background")
          .trim(),
        backgroundPriority: element.style.getPropertyPriority(
          "--ha-dialog-surface-background",
        ),
        backdropFilter: element.style
          .getPropertyValue("--ha-dialog-surface-backdrop-filter")
          .trim(),
      })),
    )
    .toEqual({
      background: "rgb(120, 121, 122)",
      backgroundPriority: "important",
      backdropFilter: "none",
    });

  await editor.evaluate((element) => {
    (element as HTMLElement).style.setProperty(
      "--primary-background-color",
      "rgb(210, 211, 212)",
    );
    (element as HTMLElement).style.setProperty(
      "--ha-color-surface-default",
      "rgb(180, 181, 190)",
    );
    (
      element as HTMLElement & {
        hass: unknown;
      }
    ).hass = {
      states: {},
      connection: { subscribeMessage: async () => () => undefined },
      callService: async () => undefined,
      callWS: async () => undefined,
      hassUrl: (path: string) => path,
      themes: {
        darkMode: false,
        default_dark_theme: "Frosted Glass",
        default_theme: "default",
        theme: "Frosted Glass",
        themes: { "Frosted Glass": { modes: { dark: {}, light: {} } } },
      },
    };
  });
  await expect(editor).toHaveAttribute("data-theme-mode", "light");
  await expect(editor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect
    .poll(() =>
      editorDialog.evaluate((element) =>
        element.style.getPropertyValue("--ha-dialog-surface-background").trim(),
      ),
    )
    .toBe("rgb(180, 181, 190)");

  await editor.locator("wzc-accordion-item").first().locator("summary").click();
  await editor.locator("button.add-camera").click();
  const cameraDialog = editor.locator("dialog.camera-editor-dialog");
  await expect(cameraDialog).toHaveAttribute("open", "");
  await expect(cameraDialog).toHaveCSS(
    "background-color",
    "rgb(210, 211, 212)",
  );
  await expect(cameraDialog).toHaveCSS("backdrop-filter", "none");
  await expect(cameraDialog).toHaveCSS("border-radius", "28px");
  expect(
    await cameraDialog.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    ),
  ).toContain("rgb(1, 2, 3)");
  await cameraDialog
    .locator("ha-icon-button.dialog-close")
    .evaluate((element) => (element as HTMLElement).click());
  await expect(cameraDialog).not.toHaveAttribute("open", "");
});

test("assigns native information and solid task dialog surfaces", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWatchZoneDefinition(page);
  const card = page.locator("watchzone-card");
  await card.evaluate((element) => {
    const host = element as HTMLElement & {
      setConfig(config: unknown): void;
    };
    host.style.setProperty("--ha-card-background", "rgba(255, 255, 255, 0.14)");
    host.style.setProperty(
      "--ha-dialog-surface-background",
      "rgb(170, 171, 172)",
    );
    host.style.setProperty("--ha-dialog-surface-backdrop-filter", "blur(7px)");
    host.style.setProperty("--primary-background-color", "rgb(120, 121, 122)");
    host.style.setProperty("--ha-dialog-border-radius", "28px");
    host.style.setProperty("--ha-dialog-scrim-backdrop-filter", "blur(3px)");
    host.style.setProperty("--mdc-dialog-scrim-color", "rgba(1, 2, 3, 0.4)");
    host.setConfig({
      type: "custom:watchzone-card",
      cameras: [{ entity_id: "camera.front" }],
    });
  });

  const exportHost = page.locator("wzc-review-export-dialog");
  await expect(exportHost).toHaveCount(1);
  const analysisHost = page.locator("wzc-review-analysis-dialog");
  await expect(analysisHost).toHaveCount(1);
  await analysisHost.evaluate((element) => {
    (
      element as HTMLElement & {
        analysis?: {
          concerns: string[];
          description: string;
          title: string;
        };
      }
    ).analysis = {
      concerns: [],
      description: "Theme role check",
      title: "Native information surface",
    };
  });
  const analysisDialog = analysisHost.locator("dialog");
  await expect(analysisDialog).toBeVisible();
  await expect(analysisDialog).toHaveCSS(
    "background-color",
    "rgb(170, 171, 172)",
  );
  await expect(analysisDialog).toHaveCSS("backdrop-filter", "blur(7px)");
  await analysisHost.evaluate((element) => {
    (
      element as HTMLElement & {
        analysis?: unknown;
      }
    ).analysis = undefined;
  });
  await expect(analysisDialog).toBeHidden();

  await exportHost.evaluate((element) => {
    (
      element as HTMLElement & {
        draft?: { name: string };
      }
    ).draft = { name: "Glass theme export" };
  });
  const exportDialog = exportHost.locator("dialog");
  await expect(exportDialog).toBeVisible();
  await expect(exportDialog).toHaveCSS(
    "background-color",
    "rgb(120, 121, 122)",
  );
  await expect(exportDialog).toHaveCSS("backdrop-filter", "none");
  await expect(exportDialog).toHaveCSS("border-radius", "28px");
  expect(
    await exportDialog.evaluate((element) => {
      const backdrop = getComputedStyle(element, "::backdrop");
      return {
        backdropFilter: backdrop.backdropFilter,
        backgroundColor: backdrop.backgroundColor,
      };
    }),
  ).toEqual({
    backdropFilter: "blur(3px)",
    backgroundColor: "rgba(1, 2, 3, 0.4)",
  });
  await exportHost.evaluate((element) => {
    (
      element as HTMLElement & {
        draft?: { name: string };
      }
    ).draft = undefined;
  });
  await expect(exportDialog).toBeHidden();

  const suspendHost = page.locator("wzc-camera-suspend-dialog").first();
  await expect(suspendHost).toHaveCount(1);
  await suspendHost.evaluate((element) => {
    (element as HTMLElement & { active: boolean }).active = true;
  });
  const suspendDialog = suspendHost.locator("dialog");
  await expect(suspendDialog).toBeVisible();
  await expect(suspendDialog).toHaveCSS(
    "background-color",
    "rgb(120, 121, 122)",
  );
  await expect(suspendDialog).toHaveCSS("backdrop-filter", "none");
  await expect(suspendDialog).toHaveCSS("border-radius", "28px");
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
  await expect(editor.locator(".pending-light-icon-selector")).toHaveJSProperty(
    "value",
    "mdi:lightbulb",
  );
  await expect(editor.locator(".pending-light-icon-selector")).toHaveJSProperty(
    "required",
    false,
  );
  await editor.locator(".pending-light-icon-selector").evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        composed: true,
        detail: { value: "" },
      }),
    );
  });
  await expect(editor.locator(".pending-light-icon-selector")).toHaveJSProperty(
    "value",
    "mdi:lightbulb",
  );
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
  await expect(editor.locator(".light-icon-selector")).toHaveJSProperty(
    "required",
    false,
  );
  await expect(editor.locator(".remove-light")).toHaveAttribute(
    "title",
    "Remove light",
  );
  const [linkedLightRowBox, linkedLightIconBox, removeLightBox] =
    await Promise.all([
      editor.locator(".linked-light-row").boundingBox(),
      editor.locator(".light-icon-selector").boundingBox(),
      editor.locator(".remove-light").boundingBox(),
    ]);
  expect(linkedLightRowBox).not.toBeNull();
  expect(linkedLightIconBox).not.toBeNull();
  expect(removeLightBox).not.toBeNull();
  expect(linkedLightIconBox?.width).toBeGreaterThanOrEqual(200);
  expect(linkedLightIconBox?.width).toBeLessThan(
    (linkedLightRowBox?.width ?? 0) * 0.6,
  );
  expect(
    (linkedLightIconBox?.y ?? 0) <
      (removeLightBox?.y ?? 0) + (removeLightBox?.height ?? 0),
  ).toBe(true);
  expect(
    (removeLightBox?.x ?? 0) -
      ((linkedLightIconBox?.x ?? 0) + (linkedLightIconBox?.width ?? 0)),
  ).toBeGreaterThanOrEqual(8);
  await editor.locator(".light-icon-selector").evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        composed: true,
        detail: { value: "" },
      }),
    );
  });
  await expect(editor.locator(".light-icon-selector")).toHaveJSProperty(
    "value",
    "mdi:lightbulb",
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

test("camera editor configures and sanitizes an additional-camera group", async ({
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
    editor.id = "group-config-editor";
    editor.setConfig({
      type: "custom:watchzone-card",
      cameras: [
        { entity_id: "camera.porch", title: "Porch" },
        { entity_id: "camera.back", title: "Back" },
      ],
    });
    document.body.append(editor);
    await editor.updateComplete;
  });

  const editor = page.locator("#group-config-editor");
  await editor.locator("wzc-accordion-item").first().locator("summary").click();
  await editor.locator('[aria-label="Edit camera: Porch"]').click();
  const additional = editor
    .locator(".camera-dialog-accordion > wzc-accordion-item")
    .nth(2);
  await additional.locator("summary").click();
  expect(
    await additional.locator("ha-selector").evaluate((element) => {
      return (element as HTMLElement & { selector?: unknown }).selector;
    }),
  ).toEqual({ entity: { filter: { domain: "camera" } } });
  const secondaryCameraPicker = additional.locator(
    'ha-selector[label="Second Camera"]',
  );
  await secondaryCameraPicker.evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        composed: true,
        detail: { value: "camera.back" },
      }),
    );
  });
  await expect(additional.locator(".field-error")).toHaveText(
    "This camera is already configured in the card and cannot be added twice.",
  );
  await secondaryCameraPicker.evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        composed: true,
        detail: { value: "camera.driveway" },
      }),
    );
  });

  const cameraName = editor.locator(".camera-title-field ha-input");
  const groupName = editor.locator(".camera-group-name-field ha-input");
  await expect(cameraName).toHaveJSProperty("value", "Porch");
  await expect(groupName).toHaveJSProperty("value", "Group A/B");
  await expect(additional.locator(".field-error")).toHaveCount(0);
  const secondarySettings = additional.locator(".secondary-camera-settings");
  const secondaryName = secondarySettings.locator("ha-input");
  await secondaryName.evaluate((element) => {
    const input = element as HTMLElement & { value: string };
    input.value = "Street View";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  });
  await secondarySettings
    .locator(".secondary-connection-source")
    .evaluate((element) => {
      element.dispatchEvent(
        new CustomEvent("value-changed", {
          bubbles: true,
          composed: true,
          detail: { value: "frigate_go2rtc" },
        }),
      );
    });
  await secondarySettings
    .locator(".secondary-frigate-fallback")
    .evaluate((element) => {
      element.dispatchEvent(
        new CustomEvent("value-changed", {
          bubbles: true,
          composed: true,
          detail: { value: "hls" },
        }),
      );
    });
  await expect(
    secondarySettings.locator(".secondary-low-latency-hls"),
  ).toHaveCount(1);
  await expect(additional.locator(".remove-additional-camera")).toHaveAttribute(
    "appearance",
    "filled",
  );
  await expect(additional.locator(".remove-additional-camera")).toHaveAttribute(
    "variant",
    "brand",
  );
  await groupName.evaluate((element) => {
    const input = element as HTMLElement & { value: string };
    input.value = "  Entry \n\n Pair  ";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  });
  await additional
    .locator('wzc-segmented-control button[data-value="stacked"]')
    .click();
  await editor
    .locator('ha-button[appearance="accent"][variant="brand"]')
    .click();

  expect(
    await editor.evaluate((element) => {
      const config = (
        element as HTMLElement & {
          _config?: {
            cameras?: Array<{
              additional_camera?: unknown;
              entity_id?: string;
              group_name?: string;
              title?: string;
            }>;
          };
        }
      )._config;
      return config?.cameras;
    }),
  ).toEqual([
    expect.objectContaining({
      additional_camera: {
        entity_id: "camera.driveway",
        layout: "stacked",
      },
      entity_id: "camera.porch",
      group_name: "Entry Pair",
      title: "Porch",
    }),
    expect.objectContaining({
      connection: "frigate_go2rtc",
      entity_id: "camera.driveway",
      frigate_fallback: "hls",
      title: "Street View",
    }),
    expect.objectContaining({
      entity_id: "camera.back",
      title: "Back",
    }),
  ]);
  await expect(editor.locator("wzc-sortable-tile")).toHaveCount(2);
  await expect(
    editor.locator("wzc-sortable-tile .camera-tile-copy span"),
  ).toHaveText(["Entry Pair", "Back"]);
  await expect(
    editor.locator("wzc-sortable-tile .camera-tile-copy small").first(),
  ).toContainText("A: Porch · B: Street View");
  const secondaryTile = editor.locator(".secondary-camera-tile");
  await expect(secondaryTile).toHaveCount(1);
  await expect(secondaryTile.locator(".secondary-camera-copy")).toHaveText(
    "Street View · Grouped with Entry Pair",
  );
  await expect(editor.locator(".camera-list-heading")).toContainText(
    "3 of 12 configured",
  );
  await secondaryTile.locator('[title="Edit Camera"]').click();
  await expect(editor.locator(".camera-editor-dialog")).toBeVisible();
  await expect(editor.locator(".camera-title-field ha-input")).toHaveJSProperty(
    "value",
    "Street View",
  );
  await expect(
    editor.locator('ha-selector[label="Connection"]'),
  ).toHaveJSProperty("value", "frigate_go2rtc");
  await expect(editor.locator(".camera-group-name-field")).toHaveCount(0);
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
      __wzcTestHlsConnectionCount: number;
      __wzcTestHass: unknown;
      __wzcTestRetainedVideo?: HTMLVideoElement;
    }

    const testWindow = window as unknown as TestWindow;
    testWindow.__wzcTestConnectionCount = 0;
    testWindow.__wzcTestHlsConnectionCount = 0;

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
          testWindow.__wzcTestHlsConnectionCount += 1;
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
  await expect(page.locator("wzc-camera .fallback-host")).toHaveCSS(
    "opacity",
    "0",
  );

  const initialVideo = page.locator("wzc-camera video.webrtc");
  await initialVideo.evaluate((element) => {
    Object.defineProperties(element, {
      videoHeight: { configurable: true, value: 90 },
      videoWidth: { configurable: true, value: 160 },
    });
    element.dispatchEvent(new Event("loadeddata"));
  });
  await expect(page.locator("wzc-camera .source-indicator")).toHaveText(
    "WebRTC",
  );
  await initialVideo.evaluate((element) => {
    (
      window as typeof window & {
        __wzcTestRetainedVideo?: HTMLVideoElement;
      }
    ).__wzcTestRetainedVideo = element as HTMLVideoElement;
  });

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
  expect(
    await video.evaluate(
      (element) =>
        element ===
        (
          window as typeof window & {
            __wzcTestRetainedVideo?: HTMLVideoElement;
          }
        ).__wzcTestRetainedVideo,
    ),
  ).toBe(true);
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
  await expect(video).toBeVisible();
  await expect(connectionIndicator).toHaveText("WebRTC");
  await expect(connectionIndicator.locator(".connection-spinner")).toHaveCount(
    0,
  );
  await expect(connectionIndicator).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __wzcTestHlsConnectionCount: number;
          }
        ).__wzcTestHlsConnectionCount,
    ),
  ).toBeLessThanOrEqual(1);
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
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  const dispatchLiveTouchTap = (): Promise<boolean> =>
    mediaSurface.evaluate((element) => {
      const pointerId = Number(element.dataset.testTouchPointer ?? "40") + 1;
      element.dataset.testTouchPointer = String(pointerId);
      let pointerDownAccepted = true;
      for (const type of ["pointerdown", "pointerup"] as const) {
        const accepted = element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: 120,
            clientY: 80,
            composed: true,
            pointerId,
            pointerType: "touch",
          }),
        );
        if (type === "pointerdown") pointerDownAccepted = accepted;
      }
      return pointerDownAccepted;
    });
  expect(await dispatchLiveTouchTap()).toBe(false);
  await expect(controls.first()).toBeVisible();
  await page.waitForTimeout(500);
  await dispatchLiveTouchTap();
  await dispatchLiveTouchTap();
  await expect(mediaSurface).toHaveAttribute("style", /scale\(2\)/);
  await expect(controls.first()).toBeVisible();
  await dispatchLiveTouchTap();
  await dispatchLiveTouchTap();
  await expect(mediaSurface).toHaveAttribute("style", /scale\(1\)/);
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
  await liveViewport.hover();
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
  const mediaControlGroup = page.locator(
    "wzc-camera wzc-camera-controls wzc-media-controls .control-group",
  );
  const [
    cameraStageBox,
    rightRailBox,
    mediaControlGroupBox,
    sourceIndicatorBox,
  ] = await Promise.all([
    cameraStage.boundingBox(),
    page.locator("wzc-camera wzc-camera-controls").boundingBox(),
    mediaControlGroup.boundingBox(),
    connectionIndicator.boundingBox(),
  ]);
  expect(cameraStageBox).not.toBeNull();
  expect(rightRailBox).not.toBeNull();
  expect(mediaControlGroupBox).not.toBeNull();
  expect(sourceIndicatorBox).not.toBeNull();
  if (
    cameraStageBox &&
    rightRailBox &&
    mediaControlGroupBox &&
    sourceIndicatorBox
  ) {
    expect(
      mediaControlGroupBox.y + mediaControlGroupBox.height / 2,
    ).toBeCloseTo(cameraStageBox.y + cameraStageBox.height / 2, 1);
    const sourceOverlapsControls =
      sourceIndicatorBox.x <
        mediaControlGroupBox.x + mediaControlGroupBox.width &&
      sourceIndicatorBox.x + sourceIndicatorBox.width >
        mediaControlGroupBox.x &&
      sourceIndicatorBox.y <
        mediaControlGroupBox.y + mediaControlGroupBox.height &&
      sourceIndicatorBox.y + sourceIndicatorBox.height > mediaControlGroupBox.y;
    expect(sourceOverlapsControls).toBe(false);
    expect(
      await connectionIndicator.evaluate((element) => {
        const badge = element.shadowRoot?.querySelector<HTMLElement>(".badge");
        return badge ? badge.scrollWidth <= badge.clientWidth : false;
      }),
    ).toBe(true);
  }
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
  await expect(
    page.locator(
      'wzc-camera wzc-camera-controls [data-control="picture_in_picture"]',
    ),
  ).toHaveCount(1);
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
  await viewport.dispatchEvent("pointerup", {
    isPrimary: true,
    pointerId: 1,
    pointerType: "touch",
  });
  await expect(controls.first()).toBeVisible();
  await expect(controls.first()).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await expect(mediaControlGroup).toHaveCSS("pointer-events", "none");
  const hiddenRightRailHit = await mute.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    let target = document.elementFromPoint(x, y);
    while (target?.shadowRoot) {
      const nested = target.shadowRoot.elementFromPoint(x, y);
      if (!nested || nested === target) break;
      target = nested;
    }
    return Boolean(target?.closest("[data-control]"));
  });
  expect(hiddenRightRailHit).toBe(false);
  await expect(connectionIndicator).toHaveText("WebRTC");
  await page
    .locator("wzc-camera-navigation button")
    .first()
    .dispatchEvent("pointerdown", {
      isPrimary: true,
      pointerId: 20,
      pointerType: "touch",
    });
  await expect(controls.first()).toBeHidden();
  await page.waitForTimeout(400);
  await viewport.dispatchEvent("pointerdown", {
    isPrimary: true,
    pointerId: 21,
    pointerType: "touch",
  });
  await viewport.dispatchEvent("pointerup", {
    isPrimary: true,
    pointerId: 21,
    pointerType: "touch",
  });
  await expect(controls.first()).toBeVisible();
  await page.locator("body").dispatchEvent("pointerdown", {
    isPrimary: true,
    pointerId: 22,
    pointerType: "mouse",
  });
  await expect(controls.first()).toBeVisible();
  await page.waitForTimeout(400);
  await viewport.evaluate((element) => {
    (
      (element.getRootNode() as ShadowRoot).host as HTMLElement & {
        revealOverlay(): void;
      }
    ).revealOverlay();
  });
  await expect(controls.first()).toBeVisible();
  await page.waitForTimeout(400);
  await viewport.dispatchEvent("pointerdown", {
    isPrimary: true,
    pointerId: 2,
    pointerType: "touch",
  });
  await viewport.dispatchEvent("pointerup", {
    isPrimary: true,
    pointerId: 2,
    pointerType: "touch",
  });
  await expect(controls.first()).toBeVisible();

  await page.waitForTimeout(400);
  await viewport.dispatchEvent("pointerdown", {
    isPrimary: true,
    pointerId: 3,
    pointerType: "touch",
  });
  await viewport.dispatchEvent("pointerup", {
    isPrimary: true,
    pointerId: 3,
    pointerType: "touch",
  });
  await expect(controls.first()).toBeVisible();
  await expect(controls.first()).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await expect(connectionIndicator).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });

  await viewport.dispatchEvent("pointerdown", {
    isPrimary: true,
    pointerId: 4,
    pointerType: "touch",
  });
  await viewport.dispatchEvent("pointerup", {
    isPrimary: true,
    pointerId: 4,
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

  await page.waitForTimeout(400);
  await viewport.dispatchEvent("pointerdown", {
    clientX: 120,
    clientY: 80,
    isPrimary: true,
    pointerId: 5,
    pointerType: "touch",
  });
  await expect(controls.first()).toBeVisible();
  await expect(controls.first()).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await viewport.dispatchEvent("pointercancel", {
    clientX: 120,
    clientY: 80,
    isPrimary: true,
    pointerId: 5,
    pointerType: "touch",
  });

  expect(
    await page.evaluate(
      () =>
        window.wzc
          ?.getLiveStartupTimings()
          .find(({ key }) => key.includes(":webrtc:"))?.phases,
    ),
  ).toMatchObject({
    adapter_imported: expect.any(Number),
    client_config_received: expect.any(Number),
    video_track_received: expect.any(Number),
  });
});
