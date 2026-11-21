import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { MEDIA_OVERLAY_HIDE_DELAY_MS } from "../../src/ui/media-overlay/visibility.controller";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
const expectedBuild = process.env.GITHUB_SHA?.slice(0, 7) ?? "local";
const expectedVersion = packageJson.version;
const THUMBNAIL_LONG_PRESS_WAIT_MS = 500;
const pageErrors = new WeakMap<Page, string[]>();

function cssAlpha(color: string): number {
  const modern = color.match(/\/\s*([\d.]+)\s*\)$/);
  if (modern) return Number(modern[1]);
  const legacy = color.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/);
  return legacy ? Number(legacy[1]) : 1;
}

async function waitForCameraOpticsDefinition(page: Page): Promise<void> {
  await page.waitForFunction(
    () => customElements.get("camera-optics-card") !== undefined,
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

test("loads the responsive CameraOptics card shell", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

  await expect(page.locator("camera-optics-card .shell")).toHaveAttribute(
    "aria-label",
    "CameraOptics",
  );
  await expect(page.locator("camera-optics-card ha-card")).toBeVisible();
  expect(
    consoleMessages.some(
      (message) =>
        message.includes("CameraOptics") &&
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

test("presents recorded media in the configured card-width bottom drawer", async ({
  page,
}) => {
  await page.route("**/recording.mp4", (route) =>
    route.fulfill({ body: "", contentType: "video/mp4" }),
  );
  await page.route("**/snapshot.svg", (route) =>
    route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"/>',
      contentType: "image/svg+xml",
    }),
  );
  await page.setViewportSize({ height: 1_000, width: 1_280 });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
      recorded_media_player_type: "bottom_drawer",
    });
    element.style.inlineSize = "500px";
    element.style.marginInline = "auto";
    const underlying = document.createElement("button");
    underlying.dataset.drawerUnderlying = "true";
    underlying.dataset.clicks = "0";
    underlying.style.cssText =
      "position:fixed;inset:0 auto auto 0;width:48px;height:48px;z-index:999999";
    underlying.addEventListener("click", () => {
      underlying.dataset.clicks = String(
        Number(underlying.dataset.clicks ?? "0") + 1,
      );
    });
    document.body.append(underlying);
  });

  const openDrawer = async (): Promise<void> => {
    await page.locator("camera-optics-card").evaluate((element) => {
      element.dispatchEvent(
        new CustomEvent("wzc-recorded-media-open", {
          bubbles: true,
          composed: true,
          detail: {
            id: "review:drawer-video",
            kind: "video",
            presentation: "review",
            preferredTransport: "file",
            sources: [
              {
                content_type: "video/mp4",
                transport: "file",
                url: "/recording.mp4",
              },
            ],
            title: "Drawer video",
          },
        }),
      );
    });
    await expect(
      page.locator("wzc-recorded-media-bottom-drawer dialog"),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator("wzc-recorded-media-bottom-drawer dialog")
          .evaluate((dialog) => dialog.style.transform),
      )
      .toBe("translateY(0px)");
    await page
      .locator(
        "wzc-recorded-media-bottom-drawer wzc-recorded-video-player video",
      )
      .evaluate((video) => {
        Object.defineProperties(video, {
          videoHeight: { configurable: true, value: 900 },
          videoWidth: { configurable: true, value: 1200 },
        });
        video.dispatchEvent(new Event("loadedmetadata"));
      });
  };

  await openDrawer();
  const drawer = page.locator("wzc-recorded-media-bottom-drawer dialog");
  const cardBox = await page.locator("camera-optics-card").boundingBox();
  const drawerBox = await drawer.boundingBox();
  expect(drawerBox?.width).toBeCloseTo(768, 0);
  expect((drawerBox?.x ?? 0) + (drawerBox?.width ?? 0) / 2).toBeCloseTo(
    (cardBox?.x ?? 0) + (cardBox?.width ?? 0) / 2,
    0,
  );
  expect(drawerBox?.height ?? 0).toBeGreaterThan(
    (page.viewportSize()?.height ?? 0) * 0.78,
  );
  const initialFooterBox = await page
    .locator("wzc-recorded-media-bottom-drawer .footer-actions")
    .boundingBox();
  expect(
    (initialFooterBox?.y ?? 0) + (initialFooterBox?.height ?? 0),
  ).toBeCloseTo((drawerBox?.y ?? 0) + (drawerBox?.height ?? 0), 0);
  await expect(
    page.locator("wzc-recorded-media-bottom-drawer .resize-handle"),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator("wzc-recorded-media-bottom-drawer")
        .evaluate((element) => element.shadowRoot?.activeElement?.localName),
    )
    .toBe("dialog");
  expect(
    await drawer.evaluate(
      (dialog) => getComputedStyle(dialog, "::backdrop").backgroundColor,
    ),
  ).toBe("rgba(0, 0, 0, 0)");

  await page.keyboard.press("Escape");
  await expect(drawer).toBeVisible();
  await page.mouse.click(24, 24);
  await expect(drawer).toBeVisible();
  await expect(page.locator('[data-drawer-underlying="true"]')).toHaveAttribute(
    "data-clicks",
    "1",
  );

  const mediaPlayer = page.locator(
    "wzc-recorded-media-bottom-drawer wzc-recorded-video-player .viewport",
  );
  const mediaPlayerHost = page.locator(
    "wzc-recorded-media-bottom-drawer wzc-recorded-video-player",
  );
  await expect(mediaPlayerHost).toHaveCSS("aspect-ratio", "auto");
  const recordedVideoSurface = mediaPlayerHost.locator("video");
  const mediaResizeHandle = page.locator(
    "wzc-recorded-media-bottom-drawer .media-resize-handle",
  );
  const initialMediaBox = await mediaPlayer.boundingBox();
  const mediaResizeBox = await mediaResizeHandle.boundingBox();
  if (!initialMediaBox || !mediaResizeBox) {
    throw new Error("Recorded media resize handle was not rendered");
  }
  expect(initialMediaBox.height / initialMediaBox.width).toBeCloseTo(9 / 16, 2);
  expect(mediaResizeBox.y).toBeCloseTo(
    initialMediaBox.y + initialMediaBox.height,
    0,
  );
  const mediaResizeX = mediaResizeBox.x + mediaResizeBox.width / 2;
  const mediaResizeY = mediaResizeBox.y + mediaResizeBox.height / 2;
  await page.mouse.move(mediaResizeX, mediaResizeY);
  await page.mouse.down();
  await page.mouse.move(mediaResizeX, mediaResizeY + 60);
  await page.mouse.up();
  await expect
    .poll(async () => (await mediaPlayer.boundingBox())?.height ?? 0)
    .toBeGreaterThan(initialMediaBox.height);
  const resizedMediaBox = await mediaPlayer.boundingBox();
  const resizedHandleBox = await mediaResizeHandle.boundingBox();
  expect(resizedHandleBox?.y).toBeCloseTo(
    (resizedMediaBox?.y ?? 0) + (resizedMediaBox?.height ?? 0),
    0,
  );

  const videoFooterActions = page.locator(
    "wzc-recorded-media-bottom-drawer .footer-actions",
  );
  if (!resizedHandleBox) {
    throw new Error("Resized video handle geometry was not rendered");
  }
  const videoBoundaryX = resizedHandleBox.x + resizedHandleBox.width / 2;
  const videoBoundaryY = resizedHandleBox.y + resizedHandleBox.height / 2;
  const viewportBottom = (page.viewportSize()?.height ?? 720) - 2;
  const sampledVideoHeights = [resizedMediaBox?.height ?? 0];
  const sampleVideoGeometry = async () =>
    recordedVideoSurface.evaluate((surface) => {
      const target = surface as HTMLElement;
      const viewport = target.closest<HTMLElement>(".viewport");
      const mediaHost = target.parentElement;
      if (!viewport || !mediaHost) {
        throw new Error("Recorded video presentation was not rendered");
      }
      const style = getComputedStyle(target);
      const matrix = new DOMMatrixReadOnly(style.transform);
      const surfaceRect = target.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      return {
        justifyItems: getComputedStyle(viewport).justifyItems,
        surfaceLeft: surfaceRect.left,
        surfaceCenterOffset:
          surfaceRect.left +
          surfaceRect.width / 2 -
          (viewportRect.left + viewportRect.width / 2),
        surfaceWidth: surfaceRect.width,
        surfaceOffsetWidth: target.offsetWidth,
        scale: matrix.a,
        transformOrigin: style.transformOrigin,
        translateX: matrix.e,
        translateY: matrix.f,
        mediaHostOffsetWidth: mediaHost.offsetWidth,
        mediaHostComputedWidth: getComputedStyle(mediaHost).width,
        viewportLeft: viewportRect.left,
        viewportWidth: viewportRect.width,
      };
    });
  const sampledVideoGeometry = [await sampleVideoGeometry()];
  await page.mouse.move(videoBoundaryX, videoBoundaryY);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(
      videoBoundaryX,
      Math.min(viewportBottom, videoBoundaryY + step * 80),
    );
    sampledVideoHeights.push((await mediaPlayer.boundingBox())?.height ?? 0);
    sampledVideoGeometry.push(await sampleVideoGeometry());
  }
  await page.mouse.up();
  for (let index = 1; index < sampledVideoHeights.length; index += 1) {
    expect(sampledVideoHeights[index]).toBeGreaterThanOrEqual(
      (sampledVideoHeights[index - 1] ?? 0) - 1,
    );
  }
  for (let index = 0; index < sampledVideoGeometry.length; index += 1) {
    const geometry = sampledVideoGeometry[index];
    const height = sampledVideoHeights[index] ?? 0;
    const origin = geometry?.transformOrigin.split(" ").map(Number.parseFloat);
    expect(
      Math.abs(geometry?.surfaceCenterOffset ?? Number.POSITIVE_INFINITY),
      JSON.stringify(geometry),
    ).toBeLessThanOrEqual(1);
    expect(geometry?.translateX).toBeCloseTo(0, 3);
    expect(geometry?.translateY).toBeCloseTo(0, 3);
    const stageRatio = height / (geometry?.viewportWidth ?? 1);
    expect(geometry?.scale).toBeCloseTo(
      stageRatio > 3 / 4 + 0.005 ? stageRatio / (3 / 4) : 1,
      3,
    );
    expect(origin?.[1]).toBeCloseTo(height / 2, 0);
    if (index > 0) {
      expect(geometry?.surfaceWidth ?? 0).toBeGreaterThanOrEqual(
        (sampledVideoGeometry[index - 1]?.surfaceWidth ?? 0) - 1,
      );
    }
  }
  const maximumVideoBox = await mediaPlayer.boundingBox();
  const maximumVideoHandleBox = await mediaResizeHandle.boundingBox();
  const videoFooterActionsBox = await videoFooterActions.boundingBox();
  if (!maximumVideoBox || !maximumVideoHandleBox || !videoFooterActionsBox) {
    throw new Error("Video maximum resize geometry was not rendered");
  }
  expect(
    maximumVideoHandleBox.y + maximumVideoHandleBox.height,
  ).toBeLessThanOrEqual(videoFooterActionsBox.y + 1);
  const stoppedVideoHandleX =
    maximumVideoHandleBox.x + maximumVideoHandleBox.width / 2;
  const stoppedVideoHandleY =
    maximumVideoHandleBox.y + maximumVideoHandleBox.height / 2;
  await page.mouse.move(stoppedVideoHandleX, stoppedVideoHandleY);
  await page.mouse.down();
  await page.mouse.move(
    stoppedVideoHandleX,
    Math.min(viewportBottom, stoppedVideoHandleY + 80),
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await mediaPlayer.boundingBox())?.height ?? 0)
    .toBeCloseTo(maximumVideoBox.height, 0);
  await mediaResizeHandle.dblclick();

  const handle = page.locator(
    "wzc-recorded-media-bottom-drawer .drawer-handle",
  );
  let handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Drawer handle was not rendered");
  const handleX = handleBox.x + handleBox.width / 2;
  const handleY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX, handleY + 30);
  await page.mouse.up();
  await expect(drawer).toBeVisible();
  await expect
    .poll(() => drawer.evaluate((dialog) => dialog.style.transform))
    .toBe("translateY(0px)");

  handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Drawer handle was not rendered");
  const settledHandleX = handleBox.x + handleBox.width / 2;
  const settledHandleY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(settledHandleX, settledHandleY);
  await page.mouse.down();
  await page.mouse.move(settledHandleX, settledHandleY + 220);
  await page.mouse.up();
  await expect(drawer).toHaveCount(0);

  await openDrawer();
  await page.locator("wzc-recorded-media-bottom-drawer .close").click();
  await expect(
    page.locator("wzc-recorded-media-bottom-drawer dialog"),
  ).toHaveCount(0);

  await page.locator("camera-optics-card").evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("wzc-recorded-media-open", {
        bubbles: true,
        composed: true,
        detail: {
          id: "review:drawer-snapshot",
          kind: "snapshot",
          presentation: "review",
          preferredTransport: "file",
          sources: [
            {
              content_type: "image/svg+xml",
              transport: "file",
              url: "/snapshot.svg",
            },
          ],
          title: "Drawer snapshot",
        },
      }),
    );
  });
  await expect(drawer).toBeVisible();
  await expect
    .poll(() => drawer.evaluate((dialog) => dialog.style.transform))
    .toBe("translateY(0px)");

  const snapshot = page.locator("wzc-recorded-media-bottom-drawer .snapshot");
  const snapshotSurface = page.locator(
    "wzc-recorded-media-bottom-drawer wzc-recorded-snapshot-player .snapshot",
  );
  const snapshotViewport = page.locator(
    "wzc-recorded-media-bottom-drawer wzc-recorded-snapshot-player .viewport",
  );
  const snapshotResizeHandle = page.locator(
    "wzc-recorded-media-bottom-drawer .media-resize-handle",
  );
  const initialSnapshotBox = await snapshot.boundingBox();
  const initialSnapshotHandleBox = await snapshotResizeHandle.boundingBox();
  if (!initialSnapshotBox || !initialSnapshotHandleBox) {
    throw new Error("Snapshot resize geometry was not rendered");
  }
  expect(initialSnapshotBox.height / initialSnapshotBox.width).toBeCloseTo(
    9 / 16,
    2,
  );
  expect(initialSnapshotHandleBox.y).toBeCloseTo(
    initialSnapshotBox.y + initialSnapshotBox.height,
    0,
  );
  await snapshotViewport.dblclick();
  await expect
    .poll(() =>
      snapshotSurface.evaluate(
        (surface) =>
          new DOMMatrixReadOnly(getComputedStyle(surface).transform).a,
      ),
    )
    .toBeGreaterThan(1);
  const zoomedSnapshotTransform = await snapshotSurface.evaluate(
    (surface) => getComputedStyle(surface).transform,
  );
  const snapshotViewportBox = await snapshotViewport.boundingBox();
  if (!snapshotViewportBox) {
    throw new Error("Snapshot zoom viewport was not rendered");
  }
  const snapshotPanX = snapshotViewportBox.x + snapshotViewportBox.width / 2;
  const snapshotPanY = snapshotViewportBox.y + snapshotViewportBox.height / 2;
  await page.mouse.move(snapshotPanX, snapshotPanY);
  await page.mouse.down();
  await page.mouse.move(snapshotPanX + 40, snapshotPanY);
  await page.mouse.up();
  await expect
    .poll(() =>
      snapshotSurface.evaluate(
        (surface) => getComputedStyle(surface).transform,
      ),
    )
    .not.toBe(zoomedSnapshotTransform);
  await snapshotViewport.press("0");
  const snapshotResizeX =
    initialSnapshotHandleBox.x + initialSnapshotHandleBox.width / 2;
  const snapshotResizeY =
    initialSnapshotHandleBox.y + initialSnapshotHandleBox.height / 2;
  await page.mouse.move(snapshotResizeX, snapshotResizeY);
  await page.mouse.down();
  await page.mouse.move(snapshotResizeX, snapshotResizeY + 40);
  await page.mouse.up();
  await expect
    .poll(async () => (await snapshot.boundingBox())?.height ?? 0)
    .toBeGreaterThan(initialSnapshotBox.height);

  await page.locator("wzc-recorded-media-bottom-drawer .header").dblclick();
  await expect
    .poll(async () => (await drawer.boundingBox())?.width ?? 0)
    .toBeCloseTo(1280, 0);
  await page.locator("wzc-recorded-media-bottom-drawer .header").dblclick();
  await expect
    .poll(async () => (await drawer.boundingBox())?.width ?? 0)
    .toBeCloseTo(768, 0);

  const footerActions = page.locator(
    "wzc-recorded-media-bottom-drawer .footer-actions",
  );
  const boundedHandleBox = await snapshotResizeHandle.boundingBox();
  const boundedViewportBox = await snapshotViewport.boundingBox();
  const boundedFooterBox = await footerActions.boundingBox();
  if (!boundedHandleBox || !boundedViewportBox || !boundedFooterBox) {
    throw new Error("Snapshot resize handle boundary was not rendered");
  }
  const boundedHandleX = boundedHandleBox.x + boundedHandleBox.width / 2;
  const boundedHandleY = boundedHandleBox.y + boundedHandleBox.height / 2;
  await page.mouse.move(boundedHandleX, boundedHandleY);
  await page.mouse.down();
  await page.mouse.move(boundedHandleX, viewportBottom, { steps: 12 });
  await page.mouse.up();
  const maximumSnapshotBox = await snapshot.boundingBox();
  const maximumHandleBox = await snapshotResizeHandle.boundingBox();
  const footerActionsBox = await footerActions.boundingBox();
  if (!maximumSnapshotBox || !maximumHandleBox || !footerActionsBox) {
    throw new Error("Snapshot maximum resize geometry was not rendered");
  }
  expect(
    maximumHandleBox.y + maximumHandleBox.height,
    JSON.stringify({
      boundedFooterBox,
      boundedHandleBox,
      boundedViewportBox,
      footerActionsBox,
      maximumHandleBox,
      maximumSnapshotBox,
    }),
  ).toBeLessThanOrEqual(footerActionsBox.y + 1);
  const maximumHandleX = maximumHandleBox.x + maximumHandleBox.width / 2;
  const maximumHandleY = maximumHandleBox.y + maximumHandleBox.height / 2;
  await page.mouse.move(maximumHandleX, maximumHandleY);
  await page.mouse.down();
  await page.mouse.move(
    maximumHandleX,
    Math.min(viewportBottom, maximumHandleY + 80),
    { steps: 6 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await snapshot.boundingBox())?.height ?? 0)
    .toBeCloseTo(maximumSnapshotBox.height, 0);
  await page.locator("wzc-recorded-media-bottom-drawer .close").click();
  await expect(drawer).toHaveCount(0);

  await page.locator("camera-optics-card").evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("wzc-recorded-media-open", {
        bubbles: true,
        composed: true,
        detail: {
          id: "recording:drawer-video",
          kind: "video",
          presentation: "recording",
          preferredTransport: "file",
          sources: [
            {
              content_type: "video/mp4",
              transport: "file",
              url: "/recording.mp4",
            },
          ],
          timeline: {
            availableEndTime: 3600,
            availableStartTime: 0,
            camera: "front",
            endTime: 3600,
            entityId: "camera.front",
            markers: [],
            selectionEndTime: 3600,
            selectionSpans: [{ endTime: 3600, startTime: 0 }],
            selectionStartTime: 0,
            spans: [{ endTime: 3600, mediaOffset: 0, startTime: 0 }],
            startTime: 0,
          },
          title: "Drawer recording",
        },
      }),
    );
  });
  await expect(drawer).toBeVisible();
  await expect
    .poll(() => drawer.evaluate((dialog) => dialog.style.transform))
    .toBe("translateY(0px)");
  const recordingViewport = page.locator(
    "wzc-recorded-media-bottom-drawer wzc-recorded-video-player .viewport",
  );
  const recordingResizeHandle = page.locator(
    "wzc-recorded-media-bottom-drawer .media-resize-handle",
  );
  const recordingScrubber = page.locator(
    "wzc-recorded-media-bottom-drawer wzc-recording-scrubber",
  );
  const recordingViewportBox = await recordingViewport.boundingBox();
  const recordingHandleBox = await recordingResizeHandle.boundingBox();
  const recordingScrubberBox = await recordingScrubber.boundingBox();
  if (!recordingViewportBox || !recordingHandleBox || !recordingScrubberBox) {
    throw new Error("Recording drawer geometry was not rendered");
  }
  expect(recordingHandleBox.y).toBeCloseTo(
    recordingViewportBox.y + recordingViewportBox.height,
    0,
  );
  expect(recordingScrubberBox.y).toBeGreaterThanOrEqual(
    recordingHandleBox.y + recordingHandleBox.height - 1,
  );
  await page.locator("wzc-recorded-media-bottom-drawer .close").click();
  await expect(drawer).toHaveCount(0);

  await page.setViewportSize({ height: 844, width: 390 });
  await openDrawer();
  const phoneDrawerBox = await drawer.boundingBox();
  const phoneMediaBox = await mediaPlayer.boundingBox();
  const phoneHandleBox = await mediaResizeHandle.boundingBox();
  const phoneFooterBox = await videoFooterActions.boundingBox();
  if (!phoneDrawerBox || !phoneMediaBox || !phoneHandleBox || !phoneFooterBox) {
    throw new Error("Phone drawer resize geometry was not rendered");
  }
  expect(phoneFooterBox.y + phoneFooterBox.height).toBeCloseTo(
    phoneDrawerBox.y + phoneDrawerBox.height,
    0,
  );
  const phoneHandleX = phoneHandleBox.x + phoneHandleBox.width / 2;
  const phoneHandleY = phoneHandleBox.y + phoneHandleBox.height / 2;
  await page.mouse.move(phoneHandleX, phoneHandleY);
  await page.mouse.down();
  await page.mouse.move(phoneHandleX, 842, { steps: 12 });
  await page.mouse.up();
  const expandedPhoneMediaBox = await mediaPlayer.boundingBox();
  const stoppedPhoneHandleBox = await mediaResizeHandle.boundingBox();
  const stoppedPhoneFooterBox = await videoFooterActions.boundingBox();
  if (
    !expandedPhoneMediaBox ||
    !stoppedPhoneHandleBox ||
    !stoppedPhoneFooterBox
  ) {
    throw new Error("Expanded phone drawer geometry was not rendered");
  }
  expect(expandedPhoneMediaBox.height).toBeGreaterThan(
    phoneMediaBox.height + 80,
  );
  expect(
    stoppedPhoneHandleBox.y + stoppedPhoneHandleBox.height,
  ).toBeLessThanOrEqual(stoppedPhoneFooterBox.y + 1);
  await page.locator("wzc-recorded-media-bottom-drawer .close").click();
  await expect(drawer).toHaveCount(0);
});

test("renders the fixed zero-network community card picker preview", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

  const stub = await page.evaluate(() => {
    const hass = {
      states: {
        "camera.porch": {
          entity_id: "camera.porch",
          state: "idle",
          attributes: { friendly_name: "Porch" },
        },
        "camera.entry": {
          entity_id: "camera.entry",
          state: "idle",
          attributes: { friendly_name: "Front Door" },
        },
      },
      connection: {
        subscribeMessage: async () => () => undefined,
      },
      locale: { language: "en" },
      callService: async () => undefined,
      callWS: async () => undefined,
      hassUrl: (path: string) => path,
    };
    const Card = customElements.get(
      "camera-optics-card",
    ) as CustomElementConstructor & {
      getStubConfig(value: unknown): unknown;
    };
    const config = Card.getStubConfig(hass) as Record<string, unknown>;
    const picker = document.createElement("hui-card-picker");
    picker.style.display = "block";
    picker.style.inlineSize = "18rem";
    picker.style.blockSize = "45rem";
    const root = picker.attachShadow({ mode: "open" });
    const card = document.createElement("camera-optics-card") as HTMLElement & {
      hass: unknown;
      setConfig(value: unknown): void;
    };
    card.style.inlineSize = "100%";
    card.style.blockSize = "100%";
    card.setConfig({ type: "custom:camera-optics-card", ...config });
    root.append(card);
    document.body.replaceChildren(picker);
    card.hass = hass;
    return config;
  });

  expect(stub).toEqual({ cameras: [{ entity_id: "camera.entry" }] });
  const preview = page.locator("wzc-card-picker-preview");
  await expect(preview).toBeVisible();
  await expect(preview.locator(".brand")).toHaveText("CameraOptics");
  await expect(preview.locator(".camera-name")).toHaveCount(2);
  await expect(preview.locator(".module-controls .control")).toHaveCount(3);
  await expect(preview.locator(".accessories .control")).toHaveCount(4);
  await expect(preview.locator(".tile")).toHaveCount(3);
  await expect(page.locator("camera-optics-card .shell")).toHaveCount(0);
  const presentation = await preview.evaluate((element) => {
    const root = element.shadowRoot;
    const live = root?.querySelector(".live");
    const cameraIcon = root?.querySelector(".camera-icon");
    const thumbnail = root?.querySelector(".thumbnail");
    const thumbnailIcon = thumbnail?.querySelector("svg");
    const active = root?.querySelector(".control.active");
    const activeIcon = active?.querySelector("svg");
    return {
      activeColor: active ? getComputedStyle(active).color : "",
      activeIconFill: activeIcon ? getComputedStyle(activeIcon).fill : "",
      cameraIconOpacity: cameraIcon ? getComputedStyle(cameraIcon).opacity : "",
      cameraIconColor: live ? getComputedStyle(live).color : "",
      liveBackground: live ? getComputedStyle(live).backgroundColor : "",
      thumbnailBackground: thumbnail
        ? getComputedStyle(thumbnail).backgroundColor
        : "",
      thumbnailIconOpacity: thumbnailIcon
        ? getComputedStyle(thumbnailIcon).opacity
        : "",
    };
  });
  expect(presentation.liveBackground).toBe("rgb(36, 36, 36)");
  expect(presentation.cameraIconColor).toBe("rgb(98, 98, 98)");
  expect(presentation.cameraIconOpacity).toBe("0.55");
  expect(presentation.thumbnailBackground).toBe(presentation.liveBackground);
  expect(presentation.thumbnailIconOpacity).toBe(
    presentation.cameraIconOpacity,
  );
  expect(presentation.activeIconFill).toBe(presentation.activeColor);
  const liveRatio = await preview.locator(".live").evaluate((element) => {
    const { height, width } = element.getBoundingClientRect();
    return width / height;
  });
  expect(liveRatio).toBeCloseTo(16 / 9, 2);
  const geometry = await page
    .locator("camera-optics-card")
    .evaluate((element) => {
      const root = element.shadowRoot;
      const shell = root?.querySelector("ha-card")?.getBoundingClientRect();
      const previewElement = root?.querySelector(
        "wzc-card-picker-preview",
      ) as HTMLElement | null;
      const previewRoot = previewElement?.shadowRoot;
      const previewRect = previewRoot
        ?.querySelector(".preview")
        ?.getBoundingClientRect();
      const liveRect = previewRoot
        ?.querySelector(".live")
        ?.getBoundingClientRect();
      const cameraBarRect = previewRoot
        ?.querySelector(".camera-bar")
        ?.getBoundingClientRect();
      const tilesRect = previewRoot
        ?.querySelector(".tiles")
        ?.getBoundingClientRect();
      const tileRects = [...(previewRoot?.querySelectorAll(".tile") ?? [])].map(
        (tile) => tile.getBoundingClientRect(),
      );
      const pickerRect = (
        element.getRootNode() as ShadowRoot
      ).host?.getBoundingClientRect();
      return {
        shellBottom: shell?.bottom ?? 0,
        shellHeight: shell?.height ?? 0,
        previewBottom: previewRect?.bottom ?? 0,
        previewHeight: previewRect?.height ?? 0,
        pickerBottom: pickerRect?.bottom ?? 0,
        liveBottom: liveRect?.bottom ?? 0,
        cameraBarTop: cameraBarRect?.top ?? 0,
        tilesBottom: tilesRect?.bottom ?? 0,
        thirdTileTop: tileRects[2]?.top ?? 0,
        thirdTileHeight: tileRects[2]?.height ?? 0,
      };
    });
  expect(geometry.shellHeight).toBeCloseTo(geometry.previewHeight, 0);
  expect(geometry.shellBottom).toBeCloseTo(geometry.previewBottom, 0);
  expect(geometry.pickerBottom - geometry.shellBottom).toBeGreaterThan(100);
  expect(geometry.cameraBarTop).toBeGreaterThan(geometry.liveBottom);
  expect(
    (geometry.tilesBottom - geometry.thirdTileTop) / geometry.thirdTileHeight,
  ).toBeCloseTo(0.5, 1);
  const heights = await page
    .locator("camera-optics-card")
    .evaluate(async (element) => {
      const card = element.shadowRoot?.querySelector("ha-card");
      const before = Math.round(card?.getBoundingClientRect().height ?? 0);
      (element as HTMLElement).style.inlineSize = "17rem";
      await new Promise(requestAnimationFrame);
      return [before, Math.round(card?.getBoundingClientRect().height ?? 0)];
    });
  expect(heights[0]).toBeGreaterThan(300);
  expect(heights[1]).toBeGreaterThan(300);
  expect(heights[1]).toBeLessThan(heights[0]);
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
    await waitForCameraOpticsDefinition(touchPage);
    const card = touchPage.locator("camera-optics-card");
    await card.evaluate((element) => {
      const cardElement = element as HTMLElement & {
        hass: unknown;
        setConfig(config: unknown): void;
      };
      cardElement.setConfig({
        type: "custom:camera-optics-card",
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
          message.type === "camera_optics/reviews/list"
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
    await expect(slideshow).toHaveAttribute("inert", "");
    await expect(card.locator("wzc-camera-switcher .switcher")).toHaveAttribute(
      "inert",
      "",
    );
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
    await expect(slideshow).not.toHaveAttribute("inert", "");
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

    const viewportBox = await viewport.boundingBox();
    expect(viewportBox).not.toBeNull();
    if (!viewportBox) return;
    const mediaSurface = card.locator("wzc-camera-live .media-surface").first();
    const zoomX = viewportBox.x + viewportBox.width / 2;
    const zoomY = viewportBox.y + viewportBox.height / 2;
    await touchPage.touchscreen.tap(zoomX, zoomY);
    await touchPage.touchscreen.tap(zoomX, zoomY);
    await expect(mediaSurface).toHaveAttribute("style", /scale\(2\)/);
    await touchPage.touchscreen.tap(zoomX, zoomY);
    await touchPage.touchscreen.tap(zoomX, zoomY);
    await expect(mediaSurface).toHaveAttribute("style", /scale\(1\)/);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("does not load camera code for a camera-free layout", async ({ page }) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

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
  await expect(page.locator("camera-optics-card")).toContainText(
    "No modules are configured.",
  );
});

test("omits Events code and data work from the built-in Stages", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    const requests: string[] = [];
    (
      window as Window & { camera_opticsRequests?: string[] }
    ).camera_opticsRequests = requests;
    card.setConfig({
      type: "custom:camera-optics-card",
      camera_entity: "camera.front",
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
      },
      connection: {
        subscribeMessage: async () => () => undefined,
      },
      hassUrl: (path: string) => path,
      callWS: async (message: { type: string }) => {
        requests.push(message.type);
        if (message.type === "camera_optics/reviews/list") return { items: [] };
        if (message.type === "camera_optics/live/camera/ready") {
          return { ready: false };
        }
        return undefined;
      },
    };
  });

  await expect(page.locator(".stage-stack-button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Events" })).toHaveCount(0);
  await expect(page.locator("wzc-events")).toHaveCount(0);
  const overhead = await page.evaluate(() => ({
    eventsDataRequests: (
      (window as Window & { camera_opticsRequests?: string[] })
        .camera_opticsRequests ?? []
    ).filter((type) => type.startsWith("camera_optics/events/")),
    eventsModules: performance
      .getEntriesByType("resource")
      .map(({ name }) => name)
      .filter((name) => name.includes("/stage/modules/events/")),
  }));
  expect(overhead).toEqual({ eventsDataRequests: [], eventsModules: [] });
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:camera-optics-card",
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
        if (message.type === "camera_optics/events/list") {
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
        if (message.type === "camera_optics/reviews/list") return { items: [] };
        if (message.type === "camera_optics/live/camera/ready") {
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:camera-optics-card",
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
        message.type === "camera_optics/reviews/list"
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
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    const host = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    host.setConfig({
      type: "custom:camera-optics-card",
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
        if (message.type === "camera_optics/reviews/list") {
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await page.locator("camera-optics-card").evaluate((element) => {
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
  await expect(navigation.locator(".items .segmented-control")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(navigation.locator(".items .segmented-control")).toHaveCSS(
    "box-shadow",
    "none",
  );
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
  const carouselGap = await page
    .locator("wzc-camera .camera-carousel")
    .evaluate((element) => {
      const slides = element.querySelectorAll<HTMLElement>(".swiper-slide");
      const first = slides[0]?.getBoundingClientRect();
      const second = slides[1]?.getBoundingClientRect();
      const swiper = (
        element as HTMLElement & {
          swiper?: { params: { spaceBetween?: number | string } };
        }
      ).swiper;
      return {
        background: getComputedStyle(element).backgroundColor,
        gap: first && second ? second.left - first.right : 0,
        slideBackground: slides[0]
          ? getComputedStyle(slides[0]).backgroundColor
          : "",
        spaceBetween: swiper?.params.spaceBetween,
      };
    });
  expect(carouselGap).toMatchObject({
    gap: 40,
    slideBackground: "rgba(0, 0, 0, 0)",
    spaceBetween: 40,
  });
  expect(carouselGap.background).not.toBe("rgba(0, 0, 0, 0)");

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

  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  const groupPresentations = group.locator("wzc-camera-live");
  await groupPresentations.evaluateAll((presentations) => {
    for (const presentation of presentations) {
      const live = presentation as HTMLElement & {
        posterUrl?: string;
        requestUpdate(): void;
      };
      live.posterUrl =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90'/%3E";
      live.requestUpdate();
    }
  });
  await expect(group.locator(".fallback-image")).toHaveCount(2);
  const sideBySideHandle = group.locator(".stage-resize-handle:visible");
  await sideBySideHandle.press("End");
  await expect(sideBySideHandle).toHaveAttribute("aria-valuenow", "100");
  await expect
    .poll(() =>
      group.locator(".media-surface").evaluateAll((surfaces) =>
        surfaces.every((surface) => {
          const transform = getComputedStyle(surface).transform;
          const scale = Number.parseFloat(transform.split("(")[1] ?? "1");
          return scale > 1.7 && scale < 1.8;
        }),
      ),
    )
    .toBe(true);
  await sideBySideHandle.press("Home");
  await expect(sideBySideHandle).toHaveAttribute("aria-valuenow", "56");
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

test("keeps selected PC side-by-side and stacked groups combined", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
      cameras: [
        { entity_id: "camera.hall", title: "Hall" },
        {
          additional_camera: {
            entity_id: "camera.driveway",
            layout: "side_by_side",
          },
          entity_id: "camera.porch",
          title: "Side Pair",
        },
        { entity_id: "camera.driveway", title: "Driveway" },
        {
          additional_camera: {
            entity_id: "camera.garage",
            layout: "stacked",
          },
          entity_id: "camera.back",
          title: "Stack Pair",
        },
        { entity_id: "camera.garage", title: "Garage" },
      ],
    });
  });

  const activeGroup = card.locator(
    "wzc-camera .swiper-slide-active wzc-camera-group-view",
  );
  const carouselSlides = card.locator("wzc-camera .swiper-slide");
  const hallButton = card
    .locator("wzc-camera-navigation button")
    .filter({ hasText: "Hall" });
  const sideButton = card
    .locator("wzc-camera-navigation button")
    .filter({ hasText: "Side Pair" });
  await expect(carouselSlides).toHaveCount(3);
  await sideButton.click();
  await expect(activeGroup.locator(".feeds")).toHaveClass(/side-by-side/);
  await expect(activeGroup.locator(".feed:not(.hidden)")).toHaveCount(2);

  await sideButton.click();
  await expect(activeGroup.locator(".feed:not(.hidden)")).toHaveCount(1);
  await expect(sideButton.locator(".option-leading-icon")).toHaveAttribute(
    "data-icon",
    "arrowLeft",
  );
  await hallButton.click();
  await sideButton.click();
  await expect(activeGroup.locator(".feed:not(.hidden)")).toHaveCount(1);
  await expect(sideButton.locator(".option-leading-icon")).toHaveAttribute(
    "data-icon",
    "arrowLeft",
  );

  await card
    .locator("wzc-camera-navigation button")
    .filter({ hasText: "Stack Pair" })
    .click();
  await expect(activeGroup.locator(".feeds")).toHaveClass(/stacked/);
  await expect(activeGroup.locator(".feed:not(.hidden)")).toHaveCount(2);
});

test("keeps both grouped phone cameras in the physical swipe sequence", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 500 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1",
    });
  });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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

  const carousel = card.locator("wzc-camera .camera-carousel");
  const views = card.locator("wzc-camera wzc-camera-view");
  const button = card
    .locator("wzc-camera-navigation button")
    .filter({ hasText: "Group A/B" });
  const leadingIcon = button.locator(".option-leading-icon");
  await expect(carousel.locator(".swiper-slide")).toHaveCount(3);
  await expect(card.locator("wzc-camera-group-view")).toHaveCount(0);
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowLeft");
  await expect
    .poll(() =>
      views.evaluateAll((items) =>
        items.map(
          (item) => (item as HTMLElement & { connect: boolean }).connect,
        ),
      ),
    )
    .toEqual([true, false, false]);

  await button.click();
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowRight");
  await expect
    .poll(() =>
      views.evaluateAll((items) =>
        items.map(
          (item) => (item as HTMLElement & { connect: boolean }).connect,
        ),
      ),
    )
    .toEqual([false, true, false]);

  await page.setViewportSize({ height: 500, width: 1_200 });
  await expect(carousel.locator(".swiper-slide")).toHaveCount(3);
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowRight");

  await carousel.evaluate((element) =>
    (
      element as HTMLElement & {
        swiper: { slideTo(index: number, speed: number): void };
      }
    ).swiper.slideTo(0, 0),
  );
  await expect(leadingIcon).toHaveAttribute("data-icon", "arrowLeft");
});

test("releases grouped overlay and resize interaction before selecting another camera", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await expect
    .poll(() =>
      group.locator(".media-surface").evaluateAll((surfaces) =>
        surfaces.every((surface) => {
          const transform = getComputedStyle(surface).transform;
          return Number.parseFloat(transform.split("(")[1] ?? "1") === 1;
        }),
      ),
    )
    .toBe(true);

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
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    const cardElement = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    const connection = {
      subscribeMessage: async (
        callback: (payload: unknown) => void,
        message: { entity_id?: string; type: string },
      ) => {
        if (message.type === "camera_optics/activity/subscribe") {
          const target = window as unknown as {
            reviewNotifications?: Array<(payload: unknown) => void>;
          };
          target.reviewNotifications ??= [];
          target.reviewNotifications.push((value) => {
            const payload =
              typeof value === "string" ? JSON.parse(value) : value;
            const activity = payload.after ?? payload.before;
            if (activity?.camera !== message.entity_id?.replace("camera.", ""))
              return;
            const phase =
              typeof activity?.end_time === "number" ? "end" : payload.type;
            callback({
              cameraName: activity?.camera,
              classification: activity?.severity,
              id: activity?.id,
              phase,
              review:
                typeof activity?.start_time === "number"
                  ? {
                      analysis_description: null,
                      analysis_concerns: [],
                      analysis_score: null,
                      analysis_title: null,
                      camera: activity.camera,
                      classification: activity.severity,
                      clip_url: null,
                      download_url: null,
                      end_time: activity.end_time ?? null,
                      id: `frigate-main:${activity.id}`,
                      labels: activity.data?.objects ?? [],
                      media_end_time: activity.end_time ?? Date.now() / 1000,
                      media_start_time: activity.start_time,
                      playback_sources: [],
                      preferred_transport: "file",
                      preview_url: null,
                      related_event_ids: [],
                      reviewed: false,
                      revision: `push:${phase}`,
                      score: null,
                      snapshot_url: null,
                      start_time: activity.start_time,
                      sub_labels: activity.data?.sub_labels ?? [],
                      thumbnail_url: null,
                      zones: activity.data?.zones ?? [],
                    }
                  : undefined,
              topic: "reviews",
            });
          });
        }
        return () => undefined;
      },
    };
    cardElement.setConfig({
      type: "custom:camera-optics-card",
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
        if (message.type === "camera_optics/live/camera/ready") {
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
  await expect
    .poll(() =>
      card
        .locator("wzc-camera .camera-carousel")
        .evaluate(
          (element) =>
            (element as HTMLElement & { swiper?: { activeIndex: number } })
              .swiper?.activeIndex,
        ),
    )
    .toBe(1);
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const testWindow = window as typeof window & {
      __wzcReviewCalls?: string[];
    };
    testWindow.__wzcReviewCalls = [];
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:camera-optics-card",
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
        if (message.type === "camera_optics/reviews/list") {
          testWindow.__wzcReviewCalls?.push(message.entity_id ?? "");
          return { items: [] };
        }
        if (message.type === "camera_optics/events/list") return { items: [] };
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

  await page
    .locator('wzc-camera-navigation button[data-value="camera.back"]')
    .click();
  await page.waitForTimeout(75);

  await expect(carousel).toHaveClass(/camera-carousel-transitioning/);
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
  await expect(carousel).not.toHaveClass(/camera-carousel-transitioning/);
});

test("applies configured camera carousel transitions to swipe and arrow navigation", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const setTransition = (transition: "fade" | "none") =>
    page.locator("camera-optics-card").evaluate((element, slideTransition) => {
      (
        element as HTMLElement & {
          setConfig(config: unknown): void;
        }
      ).setConfig({
        type: "custom:camera-optics-card",
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
            swiper?: {
              params: {
                effect?: string;
                loop?: boolean;
                rewind?: boolean;
                spaceBetween?: number | string;
                speed?: number;
              };
            };
          }
        ).swiper;
        return {
          effect: swiper?.params.effect,
          loop: swiper?.params.loop,
          rewind: swiper?.params.rewind,
          spaceBetween: swiper?.params.spaceBetween,
          speed: swiper?.params.speed,
        };
      }),
    )
    .toEqual({
      effect: "fade",
      loop: false,
      rewind: false,
      // Swiper's fade effect overlays slides and normalizes its inactive gap.
      spaceBetween: 0,
      speed: 0,
    });

  await page
    .locator('wzc-camera-navigation button[data-value="camera.back"]')
    .click();
  await page.waitForTimeout(75);
  await expect(carousel).toHaveClass(/camera-carousel-transitioning/);
  await expect(carousel).not.toHaveClass(/camera-carousel-transitioning/);

  await page
    .locator('wzc-camera-navigation button[data-value="camera.front"]')
    .click();
  await expect
    .poll(() =>
      carousel.evaluate(
        (element) =>
          (element as HTMLElement & { swiper?: { realIndex: number } }).swiper
            ?.realIndex,
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
            swiper?: {
              params: {
                effect?: string;
                loop?: boolean;
                rewind?: boolean;
                spaceBetween?: number | string;
                speed?: number;
              };
            };
          }
        ).swiper;
        return {
          effect: swiper?.params.effect,
          loop: swiper?.params.loop,
          rewind: swiper?.params.rewind,
          spaceBetween: swiper?.params.spaceBetween,
          speed: swiper?.params.speed,
        };
      }),
    )
    .toEqual({
      effect: "slide",
      loop: false,
      rewind: false,
      spaceBetween: 40,
      speed: 0,
    });

  const front = page.locator(
    'wzc-camera-navigation button[data-value="camera.front"]',
  );
  const back = page.locator(
    'wzc-camera-navigation button[data-value="camera.back"]',
  );
  await expect(front).toHaveAttribute("aria-selected", "true");

  const releaseBoundarySwipe = (
    direction: "next" | "prev",
    difference: number,
  ) =>
    carousel.evaluate(
      (element, gesture) => {
        const swiper = (
          element as HTMLElement & {
            swiper: {
              emit(eventName: string, instance: unknown): void;
              swipeDirection?: "next" | "prev";
              touches: { diff: number };
            };
          }
        ).swiper;
        swiper.touches.diff = gesture.difference;
        swiper.swipeDirection = gesture.direction;
        swiper.emit("touchEnd", swiper);
      },
      { difference, direction },
    );
  await releaseBoundarySwipe("prev", 180);
  await expect(back).toHaveAttribute("aria-selected", "true");
  await releaseBoundarySwipe("next", -180);
  await expect(front).toHaveAttribute("aria-selected", "true");

  await carousel
    .locator(".carousel-navigation.previous")
    .click({ force: true });
  await expect(back).toHaveAttribute("aria-selected", "true");
  await carousel.locator(".carousel-navigation.next").click({ force: true });
  await expect(front).toHaveAttribute("aria-selected", "true");
});

test("uses readable camera navigation labels before HA state is available", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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

test("centers the slideshow icon inside its compact overlay button", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
      camera_switcher_overlay: true,
      cameras: [
        { entity_id: "camera.front", title: "Front" },
        { entity_id: "camera.back", title: "Back" },
      ],
    });
  });

  await expect(page.locator("wzc-slideshow button")).toHaveCount(1);
  await expect(page.locator("wzc-camera-switcher")).toHaveCount(1);
  await page.locator("camera-optics-card").evaluate((element) => {
    (element as HTMLElement).style.inlineSize = "320px";
  });
  const [slideshowBox, iconBox] = await Promise.all([
    page.locator("wzc-slideshow button").boundingBox(),
    page.locator("wzc-slideshow button svg").boundingBox(),
  ]);
  expect(
    Math.abs(
      (iconBox?.x ?? 0) +
        (iconBox?.width ?? 0) / 2 -
        ((slideshowBox?.x ?? 0) + (slideshowBox?.width ?? 0) / 2),
    ),
  ).toBeLessThan(0.5);
});

test("filters live-video highlights by review classification", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    const connection = {
      subscribeMessage: async (
        callback: (payload: unknown) => void,
        message: { entity_id?: string; type: string },
      ) => {
        if (message.type === "camera_optics/activity/subscribe") {
          const target = window as unknown as {
            reviewNotifications?: Array<(payload: unknown) => void>;
          };
          target.reviewNotifications ??= [];
          target.reviewNotifications.push((value) => {
            const payload =
              typeof value === "string" ? JSON.parse(value) : value;
            const activity = payload.after ?? payload.before;
            if (activity?.camera !== message.entity_id?.replace("camera.", ""))
              return;
            const phase =
              typeof activity?.end_time === "number" ? "end" : payload.type;
            callback({
              cameraName: activity?.camera,
              classification: activity?.severity,
              id: activity?.id,
              phase,
              review:
                typeof activity?.start_time === "number"
                  ? {
                      analysis_description: null,
                      analysis_concerns: [],
                      analysis_score: null,
                      analysis_title: null,
                      camera: activity.camera,
                      classification: activity.severity,
                      clip_url: null,
                      download_url: null,
                      end_time: activity.end_time ?? null,
                      id: `frigate-main:${activity.id}`,
                      labels: activity.data?.objects ?? [],
                      media_end_time: activity.end_time ?? Date.now() / 1000,
                      media_start_time: activity.start_time,
                      playback_sources: [],
                      preferred_transport: "file",
                      preview_url: null,
                      related_event_ids: [],
                      reviewed: false,
                      revision: `push:${phase}`,
                      score: null,
                      snapshot_url: null,
                      start_time: activity.start_time,
                      sub_labels: activity.data?.sub_labels ?? [],
                      thumbnail_url: null,
                      zones: activity.data?.zones ?? [],
                    }
                  : undefined,
              topic: "reviews",
            });
          });
        }
        return () => undefined;
      },
    };
    card.setConfig({
      type: "custom:camera-optics-card",
      alert_detection_highlight: "alerts",
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
        if (message.type === "camera_optics/live/camera/ready") {
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
  await expect(carousel).not.toHaveClass(/activity-(alert|detection)/);

  const cameraButtons = page.locator("wzc-camera-navigation button");
  await expect(
    cameraButtons.nth(0).locator(".option-indicator.warning"),
  ).toHaveCount(0);
  await cameraButtons.nth(1).click();
  await expect(carousel).not.toHaveClass(/activity-(alert|detection)/);
  await cameraButtons.nth(0).click();
  await expect(carousel).not.toHaveClass(/activity-(alert|detection)/);

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
  await page.locator("camera-optics-card").evaluate((element) => {
    const parent = element.parentNode;
    if (!parent) throw new Error("CameraOptics card has no parent");
    const marker = document.createComment("dashboard-navigation");
    parent.insertBefore(marker, element);
    element.remove();
    parent.insertBefore(element, marker);
    marker.remove();
  });
  await expect(cameraButtons.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(
    cameraButtons.nth(1).locator(".option-indicator.warning"),
  ).toHaveCount(0);
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

test("keeps minimal camera actions and media controls independent", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const target = window as unknown as {
      minimalMoreInfoCount?: number;
      minimalPipCount?: number;
      minimalFullscreenCount?: number;
    };
    target.minimalMoreInfoCount = 0;
    target.minimalPipCount = 0;
    target.minimalFullscreenCount = 0;
    element.addEventListener("hass-more-info", () => {
      target.minimalMoreInfoCount = (target.minimalMoreInfoCount ?? 0) + 1;
    });
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:camera-optics-card",
      stage_type: "minimal_camera_only",
      cameras: [{ entity_id: "camera.front", title: "Front" }],
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
      },
      connection: {
        subscribeMessage: async (
          callback: (message: unknown) => void,
          message: { type: string },
        ) => {
          if (message.type.endsWith("/camera/runtime/subscribe")) {
            callback({
              available: true,
              entity_id: "camera.front",
              provider: "frigate",
              resume_at: null,
              supported: true,
              suspended: false,
            });
          }
          return () => undefined;
        },
      },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { type: string }) =>
        message.type === "camera_optics/live/camera/ready"
          ? { ready: false }
          : undefined,
    };
  });

  const minimal = page.locator("wzc-minimal-camera");
  await expect(minimal).toBeVisible();
  await minimal.evaluate((element) => {
    element.style.setProperty("--wzc-camera-control-size", "1.875rem");
  });
  const inlineControlSize = await minimal
    .getByRole("button", { name: "Camera controls" })
    .evaluate((element) => element.getBoundingClientRect().width);
  await minimal.evaluate((element) => {
    const camera = element as HTMLElement & {
      _session: { _transport?: "mse" };
      requestUpdate(): void;
    };
    camera._session._transport = "mse";
    camera.requestUpdate();
  });
  await minimal.locator(".interaction-surface").click();
  const liveDialog = minimal.locator(".live-dialog");
  await expect(liveDialog).toBeVisible();
  const dialogControlSize = await liveDialog
    .getByRole("button", { name: "Camera controls" })
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(dialogControlSize).toBeGreaterThan(inlineControlSize);
  await liveDialog.getByRole("button", { name: "Camera controls" }).click();
  const dialogFullscreen = liveDialog.getByRole("button", {
    name: "Enter fullscreen",
  });
  const dialogAudio = liveDialog.locator(".audio-control");
  const dialogUnmute = liveDialog.getByRole("button", { name: "Unmute" });
  const dialogSource = liveDialog.locator(".source-control");
  await expect(dialogSource).toBeVisible();
  const [fullscreenBox, audioBox, unmuteBox] = await Promise.all([
    dialogFullscreen.boundingBox(),
    dialogAudio.boundingBox(),
    dialogUnmute.boundingBox(),
  ]);
  expect(audioBox?.height).toBe(fullscreenBox?.height);
  expect(audioBox?.width).toBe(fullscreenBox?.width);
  expect(unmuteBox?.height).toBe(fullscreenBox?.height);
  expect(unmuteBox?.width).toBe(fullscreenBox?.width);
  const [dialogButtonSurface, dialogSourceSurface] = await Promise.all([
    dialogFullscreen.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        color: style.color,
      };
    }),
    dialogSource.evaluate((element) => {
      const badge = element.shadowRoot?.querySelector(".badge");
      if (!badge) throw new Error("Minimal Camera source surface is missing");
      const style = getComputedStyle(badge);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        color: style.color,
      };
    }),
  ]);
  expect(dialogSourceSurface).toEqual(dialogButtonSurface);
  await liveDialog.getByRole("button", { name: "Camera controls" }).click();
  await liveDialog
    .getByRole("button", { name: "Resize video player" })
    .press("ArrowLeft");
  await expect(liveDialog).toHaveAttribute("style", /width:/);
  await expect(
    liveDialog.locator(".live-dialog-footer ha-button"),
  ).toContainText("Download Snapshot");
  const closeIcon = liveDialog.locator(".dialog-close ha-icon");
  await closeIcon.dispatchEvent("pointerdown", { button: 0, pointerId: 1 });
  await closeIcon.dispatchEvent("pointerup", { button: 0, pointerId: 1 });
  await closeIcon.dispatchEvent("click");
  await expect(liveDialog).toBeHidden();

  const controlMenu = minimal.getByRole("button", { name: "Camera controls" });
  await expect(controlMenu).toHaveClass(/control-button/);
  await expect(controlMenu).toHaveCSS("border-radius", "50%");
  await controlMenu.click();

  const audioControl = minimal.locator(
    ".viewport > .control-menu .audio-control",
  );
  const mutedAudioWidth = await audioControl.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const mute = minimal.getByRole("button", { name: "Unmute" });
  await mute.click();
  expect(
    await audioControl.evaluate(
      (element) => element.getAnimations({ subtree: true }).length,
    ),
  ).toBeGreaterThan(0);
  await expect(minimal.getByRole("button", { name: "Mute" })).toBeVisible();
  await expect(audioControl).toHaveClass(/expanded/);
  await expect(
    minimal.getByRole("slider", { name: "Camera volume" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      audioControl.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeGreaterThan(mutedAudioWidth);
  expect(
    await audioControl.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe("0s");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { minimalMoreInfoCount?: number })
          .minimalMoreInfoCount,
    ),
  ).toBe(0);

  await minimal.locator(".viewport").evaluate((element) => {
    element.requestFullscreen = async () => {
      (
        window as unknown as { minimalFullscreenCount?: number }
      ).minimalFullscreenCount =
        ((window as unknown as { minimalFullscreenCount?: number })
          .minimalFullscreenCount ?? 0) + 1;
    };
  });
  await minimal.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { minimalFullscreenCount?: number })
            .minimalFullscreenCount,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { minimalMoreInfoCount?: number })
          .minimalMoreInfoCount,
    ),
  ).toBe(0);

  await minimal.evaluate((element) => {
    const video = document.createElement("video");
    video.requestPictureInPicture = async () => {
      (window as unknown as { minimalPipCount?: number }).minimalPipCount =
        ((window as unknown as { minimalPipCount?: number }).minimalPipCount ??
          0) + 1;
      return {} as PictureInPictureWindow;
    };
    const camera = element as HTMLElement & {
      _activeVideo?: HTMLVideoElement;
      requestUpdate(): void;
    };
    camera._activeVideo = video;
    camera.requestUpdate();
  });
  await minimal
    .getByRole("button", { name: "Enter Picture-in-Picture" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { minimalPipCount?: number }).minimalPipCount,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { minimalMoreInfoCount?: number })
          .minimalMoreInfoCount,
    ),
  ).toBe(0);
});

test("blocks suspended Frigate playback in the minimal camera stage", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const target = window as unknown as { minimalLiveSourceCalls?: number };
    target.minimalLiveSourceCalls = 0;
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:camera-optics-card",
      stage_type: "minimal_camera_only",
      cameras: [
        {
          connection: "frigate_go2rtc",
          entity_id: "camera.deck",
          title: "Deck",
        },
      ],
    });
    card.hass = {
      states: {
        "camera.deck": {
          entity_id: "camera.deck",
          state: "idle",
          attributes: { camera_name: "deck", friendly_name: "Deck" },
        },
      },
      connection: {
        subscribeMessage: async (
          callback: (message: unknown) => void,
          message: { type: string },
        ) => {
          if (message.type.endsWith("/camera/runtime/subscribe")) {
            callback({
              available: true,
              entity_id: "camera.deck",
              provider: "frigate",
              resume_at: null,
              supported: true,
              suspended: true,
            });
          }
          return () => undefined;
        },
      },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { type: string }) => {
        if (message.type.endsWith("/live/source")) {
          target.minimalLiveSourceCalls =
            (target.minimalLiveSourceCalls ?? 0) + 1;
        }
        return undefined;
      },
    };
  });

  const minimal = page.locator("wzc-minimal-camera");
  await expect(minimal.getByRole("status")).toContainText("Camera suspended");
  await expect(minimal.getByRole("status")).toContainText(
    "Resume this camera to restore live video.",
  );
  await expect(minimal.locator(".interaction-surface")).toHaveCount(0);
  await expect(minimal.locator(".control-menu")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { minimalLiveSourceCalls?: number })
          .minimalLiveSourceCalls,
    ),
  ).toBe(0);
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
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
          score: 0.88 - index * 0.01,
          snapshot_url: index === 3 ? null : "/thumbnail.svg",
          start_time: start,
          sub_label: index === 0 ? "Resident" : null,
          thumbnail_url: index === 3 ? null : "/thumbnail.svg",
          zones: [camera === "back" ? "back_yard" : "driveway"],
        };
      });
    let firstReviewReviewed = false;
    card.setConfig({
      type: "custom:camera-optics-card",
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
        reviewed?: boolean;
        type: string;
      }) => {
        if (message.type === "camera_optics/live/camera/ready") {
          return { ready: false };
        }
        if (message.type === "camera_optics/events/list") {
          return {
            items: events(
              message.entity_id === "camera.back" ? "back" : "front",
            ),
          };
        }
        if (message.type === "camera_optics/reviews/set_reviewed") {
          firstReviewReviewed = message.reviewed === true;
          return { reviewed: firstReviewReviewed };
        }
        if (message.type === "camera_optics/reviews/list") {
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
              labels:
                index === 0
                  ? [event.label, "car", "package", "dog"]
                  : [event.label],
              media_end_time: event.end_time + 5,
              media_start_time: event.start_time - 5,
              playback_sources: event.playback_sources,
              preferred_transport: "hls",
              preview_url: "/review-preview.gif",
              revision: event.revision,
              related_event_ids: [event.id],
              reviewed: index === 0 ? firstReviewReviewed : false,
              score: event.score,
              snapshot_url: event.snapshot_url,
              start_time: event.start_time,
              sub_labels: event.sub_label ? [event.sub_label] : [],
              thumbnail_url: event.thumbnail_url,
              zones: event.zones,
            })),
          };
        }
        if (message.type === "camera_optics/reviews/tracking_details") {
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
                  ...Array.from({ length: 12 }, (_, index) => ({
                    area: 43_000 - index * 100,
                    area_percentage: 8.3 - index * 0.1,
                    kind: "entered_zone",
                    ratio: 0.7,
                    score: 0.8,
                    timestamp: 1_700_000_004 + index,
                    zones: ["garage"],
                  })),
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
        if (message.type === "camera_optics/exports/prepare") {
          return {
            name: "front 2026-11-10 15:59:55 2026-11-10 16:00:29",
          };
        }
        if (message.type === "camera_optics/exports/create") {
          const requests = ((
            window as Window & {
              reviewExportRequests?: unknown[];
            }
          ).reviewExportRequests ??= []);
          requests.push(message);
          return { export_id: "front-export", success: true };
        }
        if (message.type === "camera_optics/exports/list") {
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
  await expect(stackButtons).toHaveCount(3);
  const reviewTiles = page.locator("wzc-reviews .tile");
  await expect(reviewTiles).toHaveCount(6);
  const activityStatusColors = await Promise.all(
    [
      reviewTiles.first().locator(".thumbnail-wrap.alert"),
      reviewTiles.nth(1).locator(".thumbnail-wrap.detection"),
    ].map((thumbnail) =>
      thumbnail.evaluate(
        (element) => getComputedStyle(element, "::after").borderTopColor,
      ),
    ),
  );
  expect(activityStatusColors).toEqual([
    "rgb(219, 68, 55)",
    "rgb(255, 166, 0)",
  ]);
  await expect(
    page.locator('wzc-reviews wzc-badge[variant="alert"] .badge').first(),
  ).toHaveCSS("background-color", "rgb(219, 68, 55)");
  await expect(
    page.locator('wzc-reviews wzc-badge[variant="detection"] .badge').first(),
  ).toHaveCSS("background-color", "rgb(255, 166, 0)");
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
  const neutralReviewActionColors = await Promise.all(
    [analysisTitle, page.locator("wzc-reviews .review-info").first()].map(
      (control) =>
        control.evaluate((element) => getComputedStyle(element).color),
    ),
  );
  expect(neutralReviewActionColors).not.toContain("rgb(219, 68, 55)");
  expect(neutralReviewActionColors).not.toContain("rgb(255, 166, 0)");
  expect(neutralReviewActionColors).not.toContain("rgb(67, 160, 71)");
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
      analysisStart: analysisBounds.left - detailBounds.left,
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
  const originalActivityViewport = page.viewportSize();
  await page.setViewportSize({ height: 844, width: 940 });
  const fluidTitleLayout = await analysisTitle.evaluate((element) => {
    const tile = element.closest<HTMLElement>(".tile");
    const details = tile?.querySelector<HTMLElement>(".details");
    const list = (element.getRootNode() as ShadowRoot).host;
    if (!tile || !details || !list) {
      throw new Error("Expected the fluid activity-title grid.");
    }
    return {
      analysisStart:
        element.getBoundingClientRect().left -
        details.getBoundingClientRect().left,
      containerWidth: list.getBoundingClientRect().width,
    };
  });
  expect(fluidTitleLayout.containerWidth).toBeGreaterThan(768);
  expect(fluidTitleLayout.containerWidth).toBeLessThanOrEqual(1024);
  expect(fluidTitleLayout.analysisStart).toBeLessThan(
    standardTileLayout.analysisStart,
  );

  await page.setViewportSize({ height: 844, width: 780 });
  const mediumTileLayout = await analysisTitle.evaluate((element) => {
    const tile = element.closest(".tile");
    const badges = tile?.querySelector<HTMLElement>(".badges");
    const actions = tile?.querySelector<HTMLElement>(".actions");
    const details = tile?.querySelector<HTMLElement>(".details");
    const list = (element.getRootNode() as ShadowRoot).host;
    if (!tile || !badges || !actions || !details || !list) {
      throw new Error("Expected the complete medium activity-tile grid.");
    }
    const tileBounds = tile.getBoundingClientRect();
    const badgeBounds = badges.getBoundingClientRect();
    const actionBounds = actions.getBoundingClientRect();
    return {
      actionCenterDelta: Math.abs(
        actionBounds.top +
          actionBounds.height / 2 -
          (tileBounds.top + tileBounds.height / 2),
      ),
      analysisStart:
        element.getBoundingClientRect().left -
        details.getBoundingClientRect().left,
      actionsBelowBadges: actionBounds.top >= badgeBounds.bottom,
      badgesBeforeActions: badgeBounds.right <= actionBounds.left,
      badgeEndPadding: Number.parseFloat(
        getComputedStyle(badges).paddingInlineEnd,
      ),
      badgeWrap: getComputedStyle(badges).flexWrap,
      containerWidth: list.getBoundingClientRect().width,
      height: tileBounds.height,
      titleVisible: getComputedStyle(element.querySelector("span")!).display,
    };
  });
  expect(mediumTileLayout.containerWidth).toBeGreaterThan(600);
  expect(mediumTileLayout.containerWidth).toBeLessThanOrEqual(768);
  expect(mediumTileLayout.analysisStart).toBeLessThan(
    fluidTitleLayout.analysisStart,
  );
  expect(mediumTileLayout.actionCenterDelta).toBeLessThanOrEqual(1);
  expect(mediumTileLayout.actionsBelowBadges).toBe(true);
  expect(mediumTileLayout.badgesBeforeActions).toBe(true);
  expect(mediumTileLayout.badgeEndPadding).toBeGreaterThanOrEqual(9);
  expect(mediumTileLayout.badgeEndPadding).toBeLessThanOrEqual(12);
  expect(mediumTileLayout.badgeWrap).toBe("nowrap");
  expect(mediumTileLayout.titleVisible).not.toBe("none");

  await page.setViewportSize({ height: 844, width: 615 });
  const narrowTileLayout = await analysisTitle.evaluate((element) => {
    const tile = element.closest(".tile");
    const actions = tile?.querySelector<HTMLElement>(".actions");
    const information = tile?.querySelector<HTMLElement>(".review-info");
    const list = (element.getRootNode() as ShadowRoot).host;
    const analysisIcon = element.querySelector<HTMLElement>("ha-icon");
    const informationIcon = information?.querySelector<HTMLElement>("svg");
    if (
      !tile ||
      !actions ||
      !information ||
      !analysisIcon ||
      !informationIcon ||
      !list
    ) {
      throw new Error("Expected the complete narrow activity-tile grid.");
    }
    const style = getComputedStyle(element);
    return {
      actionDisplay: getComputedStyle(actions).display,
      analysisIconSize:
        getComputedStyle(analysisIcon).getPropertyValue("--mdc-icon-size"),
      background: style.backgroundColor,
      borderWidth: style.borderTopWidth,
      containerWidth: list.getBoundingClientRect().width,
      height: tile.getBoundingClientRect().height,
      informationIconSize: informationIcon.getBoundingClientRect().width,
      informationWidth: information.getBoundingClientRect().width,
      titleDisplay: getComputedStyle(element.querySelector("span")!).display,
      width: element.getBoundingClientRect().width,
    };
  });
  expect(narrowTileLayout.containerWidth).toBeGreaterThan(480);
  expect(narrowTileLayout.containerWidth).toBeLessThanOrEqual(600);
  expect(narrowTileLayout.actionDisplay).toBe("flex");
  expect(narrowTileLayout.background).toBe("rgba(0, 0, 0, 0)");
  expect(narrowTileLayout.borderWidth).toBe("0px");
  expect(narrowTileLayout.analysisIconSize).toBe("1.25rem");
  expect(narrowTileLayout.informationIconSize).toBeCloseTo(20, 0);
  expect(narrowTileLayout.informationWidth).toBeCloseTo(
    narrowTileLayout.width,
    0,
  );
  expect(narrowTileLayout.titleDisplay).toBe("none");
  expect(narrowTileLayout.width).toBeCloseTo(24, 0);
  expect(narrowTileLayout.height).toBeCloseTo(mediumTileLayout.height, 0);

  await page.setViewportSize({ height: 844, width: 495 });
  await expect(
    page.locator("wzc-reviews .badges .badge-summary:not([hidden])").first(),
  ).toContainText("more");
  const compactTileLayout = await analysisTitle.evaluate((element) => {
    const tile = element.closest(".tile");
    const actions = tile?.querySelector<HTMLElement>(".actions");
    const badges = tile?.querySelector<HTMLElement>(".badges");
    const details = tile?.querySelector<HTMLElement>(".details");
    const list = (element.getRootNode() as ShadowRoot).host;
    const summary = badges?.querySelector<HTMLElement>(
      ".badge-summary:not([hidden])",
    );
    if (!tile || !actions || !badges || !details || !list || !summary) {
      throw new Error("Expected the complete compact activity-tile grid.");
    }
    const primaryBadges = [
      ...badges.querySelectorAll<HTMLElement>("wzc-badge[data-badge-index]"),
    ];
    const visiblePrimary = primaryBadges.filter((badge) => !badge.hidden);
    const collapsedCount = Number(summary.textContent?.match(/\d+/)?.[0] ?? 0);
    const metadata = [...details.querySelectorAll<HTMLElement>(".metadata")];
    const reviewState = details.querySelector<HTMLElement>(".review-state");
    return {
      actionDisplay: getComputedStyle(actions).display,
      allocatedBadgeCount: visiblePrimary.length + collapsedCount,
      badgeLaneFits: badges.scrollWidth <= badges.clientWidth + 1,
      containerWidth: list.getBoundingClientRect().width,
      detailsUnclipped:
        metadata.every((row) => row.scrollWidth <= row.clientWidth + 1) &&
        (!reviewState ||
          reviewState.scrollWidth <= reviewState.clientWidth + 1),
      height: tile.getBoundingClientRect().height,
      primaryBadgeCount: visiblePrimary.length,
      summaryText: summary.textContent?.trim(),
      summaryVariant: summary.getAttribute("variant"),
      titleDisplay: getComputedStyle(element.querySelector("span")!).display,
      totalBadgeCount: primaryBadges.length,
    };
  });
  expect(compactTileLayout.containerWidth).toBeLessThanOrEqual(480);
  expect(compactTileLayout.actionDisplay).toBe("none");
  expect(compactTileLayout.primaryBadgeCount).toBeGreaterThan(0);
  expect(compactTileLayout.allocatedBadgeCount).toBe(
    compactTileLayout.totalBadgeCount,
  );
  expect(compactTileLayout.badgeLaneFits).toBe(true);
  expect(compactTileLayout.summaryText).toMatch(/^\+\d+ more$/);
  expect(compactTileLayout.summaryVariant).toBe("neutral");
  expect(compactTileLayout.detailsUnclipped).toBe(true);
  expect(compactTileLayout.titleDisplay).toBe("none");
  expect(compactTileLayout.height).toBeCloseTo(mediumTileLayout.height, 0);
  for (const targetWidth of [390, 375, 300]) {
    await analysisTitle.evaluate((element, width) => {
      const activityList = (element.getRootNode() as ShadowRoot)
        .host as HTMLElement;
      activityList.style.inlineSize = `${width}px`;
    }, targetWidth);
    await expect
      .poll(() =>
        analysisTitle.evaluate(
          (element) =>
            (element.getRootNode() as ShadowRoot).host.getBoundingClientRect()
              .width,
        ),
      )
      .toBeCloseTo(targetWidth, 0);
    await expect
      .poll(() =>
        analysisTitle.evaluate((element) => {
          const badges = element
            .closest(".tile")
            ?.querySelector<HTMLElement>(".badges");
          return Boolean(
            badges && badges.scrollWidth <= badges.clientWidth + 1,
          );
        }),
      )
      .toBe(true);
    const phoneLayout = await analysisTitle.evaluate((element) => {
      const tile = element.closest<HTMLElement>(".tile");
      const activityList = (element.getRootNode() as ShadowRoot)
        .host as HTMLElement;
      const scroller = tile?.closest<HTMLElement>(".scroller");
      const badges = tile?.querySelector<HTMLElement>(".badges");
      const details = tile?.querySelector<HTMLElement>(".details");
      const summary = badges?.querySelector<HTMLElement>(
        ".badge-summary:not([hidden])",
      );
      if (!tile || !scroller || !badges || !details || !summary) {
        throw new Error("Expected the complete phone activity-tile grid.");
      }
      const primary = [
        ...badges.querySelectorAll<HTMLElement>("wzc-badge[data-badge-index]"),
      ];
      const visiblePrimary = primary.filter((badge) => !badge.hidden);
      const collapsed = Number(summary.textContent?.match(/\d+/)?.[0] ?? 0);
      const metadata = [...details.querySelectorAll<HTMLElement>(".metadata")];
      const reviewState = details.querySelector<HTMLElement>(".review-state");
      const tileBounds = tile.getBoundingClientRect();
      const scrollerBounds = scroller.getBoundingClientRect();
      return {
        allocated: visiblePrimary.length + collapsed,
        badgeLaneFits: badges.scrollWidth <= badges.clientWidth + 1,
        containerWidth: activityList.getBoundingClientRect().width,
        fixedHeight: tileBounds.height,
        metadataUnclipped:
          metadata.every((row) => row.scrollWidth <= row.clientWidth + 1) &&
          (!reviewState ||
            reviewState.scrollWidth <= reviewState.clientWidth + 1),
        noHorizontalScroll: scroller.scrollWidth <= scroller.clientWidth + 1,
        primaryNowrap: getComputedStyle(badges).flexWrap,
        tileInsideScroller: tileBounds.right <= scrollerBounds.right + 1,
        total: primary.length,
      };
    });
    expect(phoneLayout.containerWidth).toBeCloseTo(targetWidth, 0);
    expect(phoneLayout.allocated).toBe(phoneLayout.total);
    expect(phoneLayout.badgeLaneFits).toBe(true);
    expect(phoneLayout.fixedHeight).toBeCloseTo(mediumTileLayout.height, 0);
    expect(phoneLayout.metadataUnclipped).toBe(true);
    expect(phoneLayout.noHorizontalScroll).toBe(true);
    expect(phoneLayout.primaryNowrap).toBe("nowrap");
    expect(phoneLayout.tileInsideScroller).toBe(true);
  }
  await analysisTitle.evaluate((element) => {
    const activityList = (element.getRootNode() as ShadowRoot)
      .host as HTMLElement;
    activityList.style.removeProperty("inline-size");
  });
  if (originalActivityViewport) {
    await page.setViewportSize(originalActivityViewport);
  }
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
  await expect(trackingDialog.locator(".badges wzc-badge")).toHaveText([
    "Person",
    "Car",
    "Package",
    "Dog",
    "Resident",
    "Alert",
  ]);
  const trackingBadgePlacement = await trackingDialog.evaluate((dialog) => {
    const badges = dialog.querySelector<HTMLElement>(".badges");
    const summary = dialog.querySelector<HTMLElement>(".summary");
    if (!badges || !summary) throw new Error("Expected tracking badges.");
    const badgeBounds = badges.getBoundingClientRect();
    const summaryBounds = summary.getBoundingClientRect();
    return {
      aboveSummary: badgeBounds.bottom <= summaryBounds.top,
      insideDialog:
        badgeBounds.left >= dialog.getBoundingClientRect().left &&
        badgeBounds.right <= dialog.getBoundingClientRect().right,
    };
  });
  expect(trackingBadgePlacement).toEqual({
    aboveSummary: true,
    insideDialog: true,
  });
  const trackingEvent = trackingDialog.locator(".lifecycle-event").first();
  await trackingEvent.hover();
  const trackingMetrics = trackingDialog.locator(".event-metrics");
  await expect(trackingMetrics).toBeVisible();
  await expect(trackingMetrics).toContainText("56%");
  await expect(trackingMetrics).toContainText("0.74");
  await expect(trackingMetrics).toContainText("37,742px");
  const trackingObjects = trackingDialog.locator(".objects");
  await trackingObjects.evaluate(
    (objects) =>
      new Promise<void>((resolve) => {
        objects.scrollTop = objects.scrollHeight;
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await trackingDialog
    .locator(".lifecycle-event")
    .last()
    .evaluate((event) => event.focus({ preventScroll: true }));
  await expect(trackingMetrics).toBeVisible();
  const containedMetrics = await trackingDialog.evaluate((dialog) => {
    const metrics = dialog.querySelector<HTMLElement>(".event-metrics");
    if (!metrics) throw new Error("Expected tracking metrics in the dialog.");
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
  const trackingViewport = page.viewportSize();
  await page.setViewportSize({
    height: 600,
    width: trackingViewport?.width ?? 1280,
  });
  const trackingOverflow = await trackingObjects.evaluate((objects) => {
    const style = getComputedStyle(objects);
    const dialog = objects.closest("dialog");
    if (!dialog) throw new Error("Expected tracking dialog.");
    const dialogBounds = dialog.getBoundingClientRect();
    return {
      horizontallyContained: dialog.scrollWidth <= dialog.clientWidth,
      overflowY: style.overflowY,
      scrollable: objects.scrollHeight > objects.clientHeight,
      touchAction: style.touchAction,
      viewportContained:
        dialogBounds.top >= 0 && dialogBounds.bottom <= window.innerHeight,
    };
  });
  expect(trackingOverflow).toEqual({
    horizontallyContained: true,
    overflowY: "auto",
    scrollable: true,
    touchAction: "pan-y",
    viewportContained: true,
  });
  await trackingObjects.evaluate((objects) => {
    objects.scrollTop = 0;
  });
  await trackingObjects.hover();
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => trackingObjects.evaluate((objects) => objects.scrollTop))
    .toBeGreaterThan(0);
  await trackingDialog
    .locator('button[aria-label="Close tracking details"]')
    .click();
  await expect(trackingDialog).not.toBeVisible();
  if (trackingViewport) await page.setViewportSize(trackingViewport);
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
  const analysisSurface = await analysisDialog.evaluate((dialog) => {
    const style = getComputedStyle(dialog);
    return {
      backdropFilter: style.backdropFilter,
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
    };
  });
  const dialogPosition = await analysisDialog.evaluate((dialogElement) => {
    let current: Element | null = dialogElement;
    let card: HTMLElement | null = null;
    while (current) {
      if (
        current instanceof HTMLElement &&
        current.matches("camera-optics-card")
      ) {
        card = current;
        break;
      }
      const root = current.getRootNode();
      current = root instanceof ShadowRoot ? root.host : current.parentElement;
    }
    if (!card)
      throw new Error("Expected analysis dialog inside CameraOptics card.");
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
  expect(unreviewedPresentation.color).toBe("rgb(255, 166, 0)");
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
  const firstReviewTile = page.locator("wzc-reviews .tile").first();
  await firstReviewTile.evaluate(async (tile, waitMs) => {
    const thumbnail = tile.querySelector(".thumbnail-wrap");
    if (!(thumbnail instanceof HTMLElement))
      throw new Error("Review thumbnail was not rendered");
    const bounds = thumbnail.getBoundingClientRect();
    tile.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: bounds.left + 10,
        clientY: bounds.top + 10,
        isPrimary: true,
        pointerId: 41,
        pointerType: "touch",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }, THUMBNAIL_LONG_PRESS_WAIT_MS);
  await expect(page.locator("wzc-reviews .hover-preview")).toHaveCount(1);
  const mediaDialogCount = await page
    .locator("wzc-review-media-dialog dialog")
    .count();
  await firstReviewTile.evaluate((tile) => {
    const thumbnail = tile.querySelector(".thumbnail-wrap");
    if (!(thumbnail instanceof HTMLElement))
      throw new Error("Review thumbnail was not rendered");
    const bounds = thumbnail.getBoundingClientRect();
    tile.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: bounds.left + 10,
        clientY: bounds.top + 10,
        isPrimary: true,
        pointerId: 41,
        pointerType: "touch",
      }),
    );
    tile.querySelector<HTMLElement>(".tile-player")?.click();
  });
  await expect(page.locator("wzc-reviews .hover-preview")).toHaveCount(0);
  await expect(page.locator("wzc-review-media-dialog dialog")).toHaveCount(
    mediaDialogCount,
  );
  const themedCard = page.locator("camera-optics-card").first();
  await themedCard.evaluate((card) => {
    card.style.setProperty("--ha-card-background", "rgba(10, 20, 30, 0.5)");
    card.style.setProperty("--ha-card-backdrop-filter", "blur(2px)");
  });
  const cardGlass = await themedCard.locator("ha-card").evaluate((card) => {
    const style = getComputedStyle(card);
    return {
      background: style.backgroundColor,
    };
  });
  const safeAreaPresentation = await page
    .locator("wzc-reviews wzc-activity-list")
    .evaluate((list) => {
      const viewport = list.shadowRoot?.querySelector(".viewport");
      const scroller = list.shadowRoot?.querySelector(".scroller");
      const topControl = list.shadowRoot?.querySelector("wzc-scroll-top");
      if (
        !(viewport instanceof HTMLElement) ||
        !(scroller instanceof HTMLElement) ||
        !(topControl instanceof HTMLElement)
      )
        throw new Error("Activity viewport was not rendered");
      list.style.setProperty("--wzc-media-safe-area-underlap", "0px");
      const basePadding = Number.parseFloat(
        getComputedStyle(scroller).paddingBottom,
      );
      const baseTopOffset = Number.parseFloat(
        getComputedStyle(topControl).bottom,
      );
      list.style.setProperty("--wzc-media-safe-area-underlap", "36px");
      const veil = getComputedStyle(viewport, "::after");
      const result = {
        veilContent: veil.content,
        scrollPaddingAdded:
          Number.parseFloat(getComputedStyle(scroller).paddingBottom) -
          basePadding,
        topOffsetAdded:
          Number.parseFloat(getComputedStyle(topControl).bottom) -
          baseTopOffset,
      };
      list.style.removeProperty("--wzc-media-safe-area-underlap");
      return result;
    });
  await themedCard.evaluate((card) => {
    card.style.removeProperty("--ha-card-background");
    card.style.removeProperty("--ha-card-backdrop-filter");
  });
  expect(cardGlass).toEqual({
    background: "rgba(10, 20, 30, 0.5)",
  });
  expect(safeAreaPresentation).toEqual({
    scrollPaddingAdded: 36,
    topOffsetAdded: 36,
    veilContent: "none",
  });
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
    .toBe("rgb(67, 160, 71)");
  expect(
    await Promise.all(
      [analysisTitle, page.locator("wzc-reviews .review-info").first()].map(
        (control) =>
          control.evaluate((element) => getComputedStyle(element).color),
      ),
    ),
  ).toEqual(neutralReviewActionColors);
  const alertList = page.locator("wzc-reviews wzc-activity-list");
  const reviewsModule = page.locator("wzc-reviews");
  await reviewsModule.evaluate(async (element) => {
    const module = element as HTMLElement & {
      _resolvePlayback: () => Promise<unknown>;
      requestUpdate(): void;
      restorePlaybackResolver?: () => void;
      updateComplete: Promise<boolean>;
    };
    await module.updateComplete;
    const originalResolver = module._resolvePlayback;
    const originalRequestUpdate = module.requestUpdate.bind(module);
    module._resolvePlayback = () => new Promise(() => undefined);
    module.requestUpdate = () => undefined;
    module.restorePlaybackResolver = () => {
      module._resolvePlayback = originalResolver;
      module.requestUpdate = originalRequestUpdate;
    };
  });
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
  await reviewsModule.evaluate((element) => {
    const module = element as HTMLElement & {
      restorePlaybackResolver?: () => void;
    };
    module.restorePlaybackResolver?.();
    delete module.restorePlaybackResolver;
  });
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
  const activityList = page.locator("wzc-reviews");
  const viewport = activityList.locator(".scroller");
  await expect(activityList.locator(".tile")).toHaveCount(6);
  await expect(viewport).toHaveCSS("overscroll-behavior-y", "auto");
  await page.locator("camera-optics-card").evaluate((element) => {
    element.style.setProperty(
      "--wzc-media-tile-background",
      "rgb(200, 200, 200)",
    );
    element.style.setProperty(
      "--wzc-media-tile-hover-background",
      "rgb(180, 180, 180)",
    );
  });
  const activityTile = activityList.locator(".tile").first();
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
  const activityHeaderOffset = await activityList
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
  const actionInset = await activityList
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
  await expect(activityList.locator(".actions").first()).toHaveCSS(
    "gap",
    "8px",
  );
  const tileActionRadius = await activityList
    .locator(".wzc-activity-action")
    .first()
    .evaluate((button) => {
      const style = getComputedStyle(button);
      return {
        button: style.borderRadius,
        overlay: style.getPropertyValue("--wzc-media-action-radius").trim(),
      };
    });
  expect(tileActionRadius.button).toBe(tileActionRadius.overlay);
  await expect(page.locator("camera-optics-card ha-card")).toHaveCSS(
    "border-radius",
    "21px",
  );
  await expect(page.locator("wzc-camera .camera-carousel")).toHaveCSS(
    "border-radius",
    "21px",
  );
  await expect(activityList.locator(".tile").first()).toHaveCSS(
    "border-radius",
    "21px",
  );
  await expect(activityList.locator(".placeholder svg")).toHaveCount(1);
  await expect(activityList).toContainText("back_yard");
  await expect(activityList).toContainText("5:13 PM");
  await expect(activityList.locator("wzc-badge").first()).toHaveText("Person");
  await page
    .locator('wzc-camera-navigation button[data-value="camera.front"]')
    .click();
  await expect(activityList).toContainText("driveway");
  const scrolling = await viewport.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }));
  expect(scrolling.scrollHeight).toBeGreaterThan(scrolling.clientHeight);
  const virtualized = await activityList
    .locator("wzc-activity-list")
    .evaluate(async (element) => {
      const list = element as HTMLElement & {
        items: Array<Record<string, unknown>>;
        updateComplete: Promise<boolean>;
      };
      const originalItems = list.items;
      const virtualizedItems = Array.from({ length: 100 }, (_, index) => ({
        ...originalItems[index % originalItems.length],
        id: `virtualized-${index}`,
        revision: `virtualized-${index}`,
        startTime:
          Number(originalItems[0]?.startTime ?? 0) -
          Math.floor(index / 20) * 86_400 -
          index,
      }));
      list.items = virtualizedItems;
      Object.defineProperty(list, "items", {
        configurable: true,
        get: () => virtualizedItems,
        set: () => undefined,
      });
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
      const topControl = list.shadowRoot?.querySelector("wzc-scroll-top");
      const topVisible = topControl?.hasAttribute("hidden") === false;
      topControl?.shadowRoot?.querySelector("button")?.click();
      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const waitForTop = () => {
          if (
            viewportElement.scrollTop === 0 ||
            performance.now() - startedAt >= 2_000
          ) {
            resolve();
            return;
          }
          requestAnimationFrame(waitForTop);
        };
        requestAnimationFrame(waitForTop);
      });
      const scrollAfterTop = viewportElement.scrollTop;
      delete (list as unknown as Record<string, unknown>).items;
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
        scrollAfterTop,
        topVisible,
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
  ).toBeLessThanOrEqual(1.1);
  expect(virtualized.scrollHeight).toBeGreaterThan(virtualized.visibleHeight);
  expect(virtualized.lastPosition).toBe(100);
  expect(virtualized.topVisible).toBe(true);
  expect(virtualized.scrollAfterTop).toBe(0);
  const constrained = await activityList
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
  const nonScrolling = await activityList
    .locator("wzc-activity-list")
    .evaluate(async (element) => {
      const list = element as HTMLElement & {
        items: readonly unknown[];
        updateComplete: Promise<boolean>;
      };
      const originalItems = list.items;
      list.items = list.items.slice(0, 1);
      await list.updateComplete;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
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
  expect(
    nonScrolling.offsetWidth - nonScrolling.clientWidth,
  ).toBeLessThanOrEqual(2);
  const tileGeometry = await activityList
    .locator(".tile")
    .evaluateAll((tiles) =>
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
  const thumbnailPresentation = await activityList
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
  await activityList.locator(".tile-player").first().click();
  const mediaDialog = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) dialog",
  );
  await expect(mediaDialog).toBeVisible();
  const mediaInformation = page.locator("wzc-recorded-media-information");
  await expect(mediaInformation).toBeVisible();
  const mediaSurface = await mediaDialog.evaluate((dialog) => {
    const style = getComputedStyle(dialog);
    return {
      backdropFilter: style.backdropFilter,
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
    };
  });
  expect(mediaSurface).toEqual(analysisSurface);
  await expect(mediaInformation.locator(".metadata")).toContainText("Camera");
  await expect(mediaInformation.locator(".metadata")).toContainText("Duration");
  await expect(mediaInformation.locator(".metadata")).toContainText("88%");
  const informationPresentation = await mediaInformation
    .locator(".information")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backdropFilter: style.backdropFilter,
        background: style.backgroundColor,
        borderStyle: style.borderStyle,
        padding: Number.parseFloat(style.paddingTop),
        radius: Number.parseFloat(style.borderRadius),
      };
    });
  expect(informationPresentation.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(informationPresentation.backdropFilter).toBe("none");
  expect(informationPresentation.borderStyle).toBe("none");
  expect(informationPresentation.padding).toBeGreaterThan(0);
  expect(informationPresentation.radius).toBeGreaterThan(0);
  const mediaBadge = mediaInformation.locator(".badges wzc-badge").first();
  const tileBadge = activityList.locator(".badges wzc-badge").first();
  const badgePresentations = await Promise.all(
    [mediaBadge, tileBadge].map((badge) =>
      badge.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: style.getPropertyValue("--wzc-badge-font-size").trim(),
          padding: style.getPropertyValue("--wzc-badge-padding").trim(),
          shape: element.getAttribute("shape"),
          size: element.getAttribute("size"),
        };
      }),
    ),
  );
  expect(badgePresentations[0]).toEqual(badgePresentations[1]);
  await expect(
    mediaDialog.getByRole("button", { name: "View Snapshot" }),
  ).toBeVisible();
  const activityAction = activityList.locator(".action").first();
  const mediaAction = mediaDialog.getByRole("button", {
    name: "View Snapshot",
  });
  const actionPresentations = await Promise.all(
    [activityAction, mediaAction].map((action) =>
      action.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          borderRadius: style.borderRadius,
          color: style.color,
          height: bounds.height,
          width: bounds.width,
        };
      }),
    ),
  );
  expect(actionPresentations[0]?.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(actionPresentations[1]?.background).toBe("rgba(0, 0, 0, 0)");
  expect(actionPresentations[1]?.borderRadius).toBe(
    actionPresentations[0]?.borderRadius,
  );
  expect(actionPresentations[1]?.color).toBe(actionPresentations[0]?.color);
  expect(actionPresentations[1]?.height).toBeGreaterThan(
    actionPresentations[0]?.height ?? 0,
  );
  expect(actionPresentations[1]?.width).toBeGreaterThan(
    actionPresentations[0]?.width ?? 0,
  );
  const mediaFooterBox = await mediaDialog
    .locator(".footer-actions")
    .boundingBox();
  expect(mediaFooterBox?.height).toBeGreaterThanOrEqual(56);
  const earlyMediaActionBox = await mediaAction.boundingBox();
  const earlyMediaDialogBox = await mediaDialog.boundingBox();
  expect(
    (earlyMediaActionBox?.y ?? 0) + (earlyMediaActionBox?.height ?? 0),
  ).toBeLessThanOrEqual(
    (earlyMediaDialogBox?.y ?? 0) + (earlyMediaDialogBox?.height ?? 0),
  );
  await mediaAction.hover();
  await expect
    .poll(() =>
      mediaAction.evaluate((element) => getComputedStyle(element).outlineStyle),
    )
    .toBe("solid");
  const hoveredAction = await mediaAction.evaluate((element) => {
    const icon = element.querySelector("ha-icon");
    const style = getComputedStyle(element);
    return {
      color: style.color,
      iconTransform: icon ? getComputedStyle(icon).transform : "none",
      outlineStyle: style.outlineStyle,
    };
  });
  expect(hoveredAction.outlineStyle).toBe("solid");
  expect(hoveredAction.color).not.toBe(actionPresentations[1]?.color);
  expect(hoveredAction.iconTransform).toBe("none");
  await page.mouse.move(0, 0);
  await expect
    .poll(() =>
      mediaAction.evaluate((element) => ({
        outlineStyle: getComputedStyle(element).outlineStyle,
        iconTransform: getComputedStyle(element.querySelector("ha-icon")!)
          .transform,
      })),
    )
    .toEqual({ outlineStyle: "none", iconTransform: "none" });
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
  await expect
    .poll(() =>
      mediaDialog.evaluate((dialog) => dialog.matches(":popover-open")),
    )
    .toBe(true);
  const topLayerGeometry = await page.evaluate(async () => {
    const card = document
      .querySelector("camera-optics-card")
      ?.shadowRoot?.querySelector<HTMLElement>("ha-card");
    const viewer = card?.querySelector("wzc-recorded-video-viewer");
    const presentation = viewer?.shadowRoot?.querySelector(
      "wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog",
    );
    const dialog =
      presentation?.shadowRoot?.querySelector<HTMLDialogElement>("dialog");
    if (!card || !dialog) throw new Error("Recorded viewer was not rendered");
    const cardStyle = card.getAttribute("style");
    const dialogStyle = dialog.getAttribute("style");
    const wasDragged = dialog.classList.contains("dragged");
    card.style.position = "relative";
    card.style.left = "96px";
    card.style.width = "calc(100% - 96px)";
    card.style.overflow = "clip";
    card.style.backdropFilter = "blur(2px)";
    dialog.classList.add("dragged");
    dialog.style.left = "0px";
    dialog.style.top = "0px";
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const left = dialog.getBoundingClientRect().left;
    dialog.style.left = `${window.innerWidth - dialog.getBoundingClientRect().width}px`;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const right = dialog.getBoundingClientRect().right;
    if (cardStyle === null) card.removeAttribute("style");
    else card.setAttribute("style", cardStyle);
    if (dialogStyle === null) dialog.removeAttribute("style");
    else dialog.setAttribute("style", dialogStyle);
    if (!wasDragged) dialog.classList.remove("dragged");
    return { left, right, viewportWidth: window.innerWidth };
  });
  expect(topLayerGeometry.left).toBeCloseTo(0, 0);
  expect(topLayerGeometry.right).toBeCloseTo(topLayerGeometry.viewportWidth, 0);
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
  const recordedViewport = page.locator("wzc-recorded-video-player .viewport");
  const recordedMediaTarget = recordedVideo;
  await expect(recordedVideo).not.toHaveAttribute("controls", "");
  await expect(recordedVideo).toHaveAttribute("autoplay", "");
  await expect(recordedVideo).toHaveAttribute("muted", "");
  await expect(recordedVideo).toHaveAttribute("playsinline", "");
  await expect(recordedVideo).toHaveCSS("pointer-events", "none");
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
  expect(mediaBodyPadding.bottom).toBe(0);
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
  const modalFrame = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog)",
  );
  const modalBackgrounds = {
    body: await modalFrame
      .locator(".body")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    dialog: await mediaDialog.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
    header: await modalFrame
      .locator(".header")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  };
  expect(modalBackgrounds.dialog).not.toBe("rgba(0, 0, 0, 0)");
  expect(modalBackgrounds.header).toBe("rgba(0, 0, 0, 0)");
  expect(modalBackgrounds.body).toBe("rgba(0, 0, 0, 0)");
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
  ).toHaveCount(1);
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
  await expect(recordedControls.first()).toHaveCSS("border-radius", "4px");
  await expect(mediaDialog.locator(".footer-actions")).toHaveCSS("gap", "8px");
  expect(
    await mediaDialog
      .locator(".footer-actions .wzc-activity-action")
      .first()
      .evaluate((button) => getComputedStyle(button).borderRadius),
  ).toBe(
    await recordedControls
      .first()
      .evaluate((button) => getComputedStyle(button).borderRadius),
  );
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
  await recordedVideo.evaluate((element) => {
    element.dispatchEvent(new Event("loadedmetadata"));
    Object.defineProperties(element, {
      videoHeight: { configurable: true, value: 480 },
      videoWidth: { configurable: true, value: 640 },
    });
    element.dispatchEvent(new Event("resize"));
  });
  expect(await dispatchRecordedDoubleClick()).toBe(true);
  await expect(recordedMediaTarget).toHaveAttribute("style", /scale\(2\)/);
  const recordedPresentationContract = await recordedMediaTarget.evaluate(
    (video) => {
      const surface = video.parentElement;
      const viewport = video.closest(".viewport");
      return {
        surfaceHeight: (surface as HTMLElement | null)?.offsetHeight ?? 0,
        surfaceWidth: (surface as HTMLElement | null)?.offsetWidth ?? 0,
        videoPosition: getComputedStyle(video).position,
        viewportHeight: viewport?.clientHeight ?? 0,
        viewportWidth: viewport?.clientWidth ?? 0,
      };
    },
  );
  expect(recordedPresentationContract.surfaceWidth).toBe(
    recordedPresentationContract.viewportWidth,
  );
  expect(recordedPresentationContract.surfaceHeight).toBe(
    recordedPresentationContract.viewportHeight,
  );
  expect(recordedPresentationContract.videoPosition).toBe("absolute");
  await expect(
    page.getByRole("button", { name: "Mute recorded video" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  const dialogBeforeManualResize = await mediaDialog.boundingBox();
  const playerBeforeManualResize = await page
    .locator("wzc-recorded-video-player")
    .boundingBox();
  const informationBeforeManualResize = await mediaInformation.boundingBox();
  const prePanResizeHandle = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .resize-handle",
  );
  const resizeHandleBox = await prePanResizeHandle.boundingBox();
  if (resizeHandleBox) {
    const resizeX = resizeHandleBox.x + resizeHandleBox.width / 2;
    const resizeY = resizeHandleBox.y + resizeHandleBox.height / 2;
    await page.mouse.move(resizeX, resizeY);
    await page.mouse.down();
    await page.mouse.move(resizeX - 48, resizeY - 27, { steps: 6 });
    await page.mouse.up();
  }
  const dialogAfterManualResize = await mediaDialog.boundingBox();
  const playerAfterManualResize = await page
    .locator("wzc-recorded-video-player")
    .boundingBox();
  const informationAfterManualResize = await mediaInformation.boundingBox();
  expect(dialogAfterManualResize?.width ?? 0).toBeLessThan(
    (dialogBeforeManualResize?.width ?? 0) - 10,
  );
  expect(playerAfterManualResize?.width ?? 0).toBeLessThan(
    (playerBeforeManualResize?.width ?? 0) - 10,
  );
  expect(informationAfterManualResize?.width ?? 0).toBeLessThan(
    (informationBeforeManualResize?.width ?? 0) - 10,
  );
  const dialogBeforePan = await mediaDialog.boundingBox();
  const viewportBeforePan = await page
    .locator("wzc-recorded-video-player .viewport")
    .boundingBox();
  const informationBeforePan = await mediaInformation.boundingBox();
  if (viewportBeforePan) {
    const startX = viewportBeforePan.x + viewportBeforePan.width / 2;
    const startY = viewportBeforePan.y + viewportBeforePan.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 400, startY + 250, { steps: 12 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }
  const dialogDuringPan = await mediaDialog.boundingBox();
  const viewportDuringPan = await page
    .locator("wzc-recorded-video-player .viewport")
    .boundingBox();
  const informationDuringPan = await mediaInformation.boundingBox();
  expect(dialogDuringPan?.width).toBeCloseTo(dialogBeforePan?.width ?? 0, 1);
  expect(dialogDuringPan?.height).toBeCloseTo(dialogBeforePan?.height ?? 0, 1);
  expect(viewportDuringPan?.width).toBeCloseTo(
    viewportBeforePan?.width ?? 0,
    1,
  );
  expect(viewportDuringPan?.height).toBeCloseTo(
    viewportBeforePan?.height ?? 0,
    1,
  );
  expect(informationDuringPan?.width).toBeCloseTo(
    informationBeforePan?.width ?? 0,
    1,
  );
  expect(informationDuringPan?.height).toBeCloseTo(
    informationBeforePan?.height ?? 0,
    1,
  );
  const recordedContentCoverage = await recordedMediaTarget.evaluate(
    (video) => {
      const viewport = video.closest(".viewport");
      if (!viewport) return undefined;
      const viewportRect = viewport.getBoundingClientRect();
      const contentRect = video.getBoundingClientRect();
      return {
        bottomGap: viewportRect.bottom - contentRect.bottom,
        leftGap: contentRect.left - viewportRect.left,
        rightGap: viewportRect.right - contentRect.right,
        topGap: contentRect.top - viewportRect.top,
      };
    },
  );
  expect(recordedContentCoverage).toBeDefined();
  expect(recordedContentCoverage?.leftGap ?? 1).toBeLessThanOrEqual(1);
  expect(recordedContentCoverage?.rightGap ?? 1).toBeLessThanOrEqual(1);
  expect(recordedContentCoverage?.topGap ?? 1).toBeLessThanOrEqual(1);
  expect(recordedContentCoverage?.bottomGap ?? 1).toBeLessThanOrEqual(1);
  await page.mouse.up();
  expect(await dispatchRecordedDoubleClick()).toBe(true);
  await expect(recordedMediaTarget).toHaveAttribute("style", /scale\(1\)/);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  const dispatchRecordedTouchTap = (): Promise<void> =>
    recordedViewport.evaluate((element) => {
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
      element.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 80,
          composed: true,
        }),
      );
    });
  await dispatchRecordedTouchTap();
  await dispatchRecordedTouchTap();
  await expect(recordedMediaTarget).toHaveAttribute("style", /scale\(2\)/);
  await expect(recordedMute).toBeVisible();
  await dispatchRecordedTouchTap();
  await dispatchRecordedTouchTap();
  await expect(recordedMediaTarget).toHaveAttribute("style", /scale\(1\)/);
  const resizeHandle = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .resize-handle",
  );
  await expect(resizeHandle).toHaveAttribute(
    "aria-label",
    "Resize video player",
  );
  await expect(resizeHandle.locator("svg")).toHaveCount(1);
  const initialDialogBox = await mediaDialog.boundingBox();
  const initialPlayerBox = await page
    .locator("wzc-recorded-video-player .viewport")
    .boundingBox();
  const resizeBox = await resizeHandle.boundingBox();
  const resizePresentation = await resizeHandle.evaluate((element) => {
    const icon = element.querySelector("svg");
    return {
      iconSize: icon ? Number.parseFloat(getComputedStyle(icon).width) : 0,
    };
  });
  const finalMediaActionBox = await mediaDialog
    .locator(".footer-actions .wzc-activity-action")
    .last()
    .boundingBox();
  const informationFooterLayout = await mediaDialog.evaluate((element) => {
    const information = element
      .querySelector("wzc-recorded-media-information")
      ?.shadowRoot?.querySelector(".information");
    const actions = element.querySelector(".footer-actions");
    return {
      actionsBottom: actions?.getBoundingClientRect().bottom ?? 0,
      bodyOwnedActions: Boolean(actions?.closest(".body")),
      dialogBottom: element.getBoundingClientRect().bottom,
      nestedActions: Boolean(information?.querySelector(".footer-actions")),
    };
  });
  expect(initialDialogBox).not.toBeNull();
  expect(resizeBox).not.toBeNull();
  expect(informationFooterLayout.nestedActions).toBe(false);
  expect(informationFooterLayout.bodyOwnedActions).toBe(false);
  expect(
    Math.abs(
      informationFooterLayout.actionsBottom -
        informationFooterLayout.dialogBottom,
    ),
  ).toBeLessThanOrEqual(1);
  expect(resizeBox?.width).toBeCloseTo(finalMediaActionBox?.width ?? 0, 1);
  expect(resizeBox?.height).toBeCloseTo(finalMediaActionBox?.height ?? 0, 1);
  expect(
    (resizeBox?.y ?? 0) - (finalMediaActionBox?.y ?? 0),
  ).toBeLessThanOrEqual(8);
  expect(resizePresentation.iconSize).toBeGreaterThanOrEqual(24);
  expect(finalMediaActionBox?.x).toBeLessThan(resizeBox?.x ?? 0);
  expect(
    (finalMediaActionBox?.x ?? 0) + (finalMediaActionBox?.width ?? 0),
  ).toBeLessThanOrEqual(resizeBox?.x ?? 0);
  expect(
    Math.abs(
      (resizeBox?.x ?? 0) -
        ((initialDialogBox?.x ?? 0) +
          (initialDialogBox?.width ?? 0) -
          (resizeBox?.width ?? 0)),
    ),
  ).toBeLessThanOrEqual(1.1);
  expect(
    Math.abs(
      (resizeBox?.y ?? 0) -
        ((initialDialogBox?.y ?? 0) +
          (initialDialogBox?.height ?? 0) -
          (resizeBox?.height ?? 0)),
    ),
  ).toBeLessThanOrEqual(1);
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
  const nextEventTile = activityList.locator(".tile-player").nth(1);
  await nextEventTile.scrollIntoViewIfNeeded();
  await nextEventTile.evaluate((button: HTMLButtonElement) => button.click());
  await expect(
    page.locator(
      ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) .title",
    ),
  ).toHaveText("Detection · Front · 5:12 PM · Mon, Nov 13");
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

  await activityList
    .locator('button[aria-label="View snapshot"]')
    .first()
    .click();
  await expect(mediaDialog).toBeVisible();
  const snapshot = page.locator(
    ":is(wzc-event-media-dialog, wzc-review-media-dialog, wzc-recording-media-dialog) img.snapshot",
  );
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toHaveAttribute("src", "/thumbnail.svg");
  await expect(snapshot).toHaveCSS("background-color", "rgb(36, 36, 36)");
  await expect(page.locator("wzc-recorded-video-player")).toHaveCount(0);
  await expect(
    mediaDialog.getByRole("button", { name: "View Review" }),
  ).toBeVisible();
  const desktopViewport = page.viewportSize();
  await page.setViewportSize({ height: 720, width: 600 });
  const mediumMetadataColumns = await mediaInformation.evaluate((element) => {
    const metadata = element.shadowRoot?.querySelector(".metadata");
    return metadata
      ? getComputedStyle(metadata).gridTemplateColumns.split(" ").length
      : 0;
  });
  expect(mediumMetadataColumns).toBe(3);
  await page.setViewportSize({ height: 568, width: 320 });
  const compactInformationLayout = await mediaInformation.evaluate(
    (element) => {
      const information = element.shadowRoot?.querySelector(".information");
      const metadata = element.shadowRoot?.querySelector(".metadata");
      return {
        informationInlinePadding: information
          ? Number.parseFloat(getComputedStyle(information).paddingInlineStart)
          : Number.POSITIVE_INFINITY,
        metadataColumns: metadata
          ? getComputedStyle(metadata).gridTemplateColumns.split(" ").length
          : 0,
        metadataRowGap: metadata
          ? Number.parseFloat(getComputedStyle(metadata).rowGap)
          : Number.POSITIVE_INFINITY,
      };
    },
  );
  await expect(mediaDialog.locator(".footer-actions")).toHaveCSS(
    "flex-direction",
    "row",
  );
  expect(
    compactInformationLayout.informationInlinePadding,
  ).toBeGreaterThanOrEqual(16);
  expect(compactInformationLayout.metadataColumns).toBe(3);
  expect(compactInformationLayout.metadataRowGap).toBeLessThanOrEqual(4);
  const compactDialogBox = await mediaDialog.boundingBox();
  expect(compactDialogBox?.x).toBeGreaterThanOrEqual(0);
  expect(compactDialogBox?.y).toBeGreaterThanOrEqual(0);
  expect(
    (compactDialogBox?.x ?? 0) + (compactDialogBox?.width ?? 0),
  ).toBeLessThanOrEqual(320);
  expect(
    (compactDialogBox?.y ?? 0) + (compactDialogBox?.height ?? 0),
  ).toBeLessThanOrEqual(568);
  if (desktopViewport) await page.setViewportSize(desktopViewport);
  await modalClose.click();
  await expect(mediaDialog).toBeHidden();

  await page
    .locator("wzc-camera-navigation button")
    .nth(1)
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(activityList).toContainText("back_yard");
  await expect(activityList).not.toContainText("driveway");
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await expect(activityList.locator(".tile")).toHaveCount(6);
  await expect(activityList.locator("wzc-badge")).toHaveCount(0);
  await expect(activityList).not.toContainText("back_yard");
  await expect(page.locator("camera-optics-card ha-card")).toHaveCSS(
    "border-radius",
    "0px",
  );
  await expect(page.locator("wzc-camera .camera-carousel")).toHaveCSS(
    "border-radius",
    "0px",
  );
  await expect(activityList.locator(".tile").first()).toHaveCSS(
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
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
      type: "custom:camera-optics-card",
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
        if (message.type === "camera_optics/live/camera/ready") {
          return { ready: false };
        }
        if (message.type === "camera_optics/reviews/list") {
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
        if (message.type === "camera_optics/events/list") {
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
        if (message.type === "camera_optics/recordings/list") {
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
        if (message.type === "camera_optics/recordings/segment") {
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
        if (message.type === "camera_optics/exports/prepare") {
          return { name: "Front selected recording" };
        }
        if (message.type === "camera_optics/exports/create") {
          return { export_id: "front-selected-recording" };
        }
        if (message.type === "camera_optics/exports/list") {
          return {
            items: [
              {
                entity_id: "camera.front",
                id: "front-selected-recording",
                in_progress: false,
              },
            ],
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

  await trigger.click();
  await expect(calendar.locator(".day.selected")).toHaveCount(1);
  await calendar.locator(".reset").click();
  await expect(page.locator("wzc-reviews .tile")).toHaveCount(2);

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
  await expect(page.locator("wzc-reviews .tile")).toHaveCount(1);
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
  await expect(page.locator("wzc-reviews .tile")).toHaveCount(1);
  await filter.locator(".reset").click();
  await expect(page.locator("wzc-reviews .tile")).toHaveCount(2);

  await navigation.locator(".stage-stack-button").nth(1).click();
  const recordings = page.locator("wzc-recordings");
  await expect(recordings.locator(".tile")).toHaveCount(8);
  await page.locator("camera-optics-card").evaluate((element) => {
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
  const recordingTop = recordings.locator("wzc-scroll-top");
  await expect(recordingTop).toBeHidden();
  await expect(recordingViewport).toHaveCSS("overscroll-behavior-y", "auto");
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
  await expect(recordingTop).toBeVisible();
  await recordings.getByRole("button", { name: "Top" }).click();
  await expect
    .poll(() => recordingViewport.evaluate((viewport) => viewport.scrollTop))
    .toBe(0);
  await expect(recordingTop).toBeHidden();
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
  const recordedPlayer = page.locator("wzc-recorded-video-player");
  const recordingDialog = page.locator("wzc-recording-media-dialog");
  const segmentAction = recordingDialog.getByRole("button", {
    name: "Select recording segment",
  });
  const recordingDownload = recordingDialog.getByRole("button", {
    name: "Download recording",
  });
  await expect(scrubber).toBeVisible();
  await expect(segmentAction).toBeVisible();
  await expect(segmentAction.locator("ha-icon")).toHaveAttribute(
    "icon",
    "mdi:filmstrip",
  );
  await expect(recordingDownload).toBeVisible();
  await expect(segmentAction).toHaveAttribute("aria-pressed", "false");
  const rateControl = page.locator("wzc-recorded-video-player .rate-control");
  const rateDropdown = rateControl.locator("ha-dropdown");
  await expect(rateControl).toBeVisible();
  await expect(
    page.locator("wzc-recorded-video-player .rate-label"),
  ).toHaveText("Playback speed");
  await expect(rateControl.locator(".rate-trigger")).toContainText("1×");
  await expect(rateControl.locator("ha-dropdown-item")).toHaveCount(7);
  const [scrubberBox, rateBox, playerBox] = await Promise.all([
    scrubber.boundingBox(),
    rateControl.boundingBox(),
    recordedPlayer.boundingBox(),
  ]);
  expect(scrubberBox).not.toBeNull();
  expect(rateBox).not.toBeNull();
  expect(playerBox).not.toBeNull();
  const initialRateWidth = rateBox?.width;
  if (scrubberBox && rateBox && playerBox) {
    expect(rateBox.width).toBeLessThanOrEqual(112);
    expect(rateBox.height).toBeLessThanOrEqual(34);
    expect(rateBox.y).toBeGreaterThanOrEqual(
      scrubberBox.y + scrubberBox.height - 1,
    );
    expect(
      playerBox.x + playerBox.width - rateBox.x - rateBox.width,
    ).toBeLessThanOrEqual(12);
  }
  await rateControl
    .getByRole("button", { name: "Increase playback speed" })
    .click();
  await expect(rateControl.locator(".rate-trigger")).toContainText("2×");
  await expect
    .poll(() =>
      page
        .locator("wzc-recorded-video-player video")
        .evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(2);
  await rateDropdown.evaluate((element) => {
    const item = element.querySelector<HTMLElement & { value?: string }>(
      'ha-dropdown-item[value="25"]',
    );
    if (!item) throw new Error("Expected 25× playback-rate item.");
    item.value = "25";
    element.dispatchEvent(new CustomEvent("wa-select", { detail: { item } }));
  });
  await expect(rateControl.locator(".rate-trigger")).toContainText("25×");
  expect((await rateControl.boundingBox())?.width).toBeCloseTo(
    initialRateWidth ?? 0,
    0,
  );
  await expect
    .poll(() =>
      page
        .locator("wzc-recorded-video-player video")
        .evaluate((video) =>
          [10, 25].includes((video as HTMLVideoElement).playbackRate),
        ),
    )
    .toBe(true);
  await rateDropdown.evaluate((element) => {
    const item = element.querySelector<HTMLElement & { value?: string }>(
      'ha-dropdown-item[value="0.25"]',
    );
    if (!item) throw new Error("Expected 0.25× playback-rate item.");
    item.value = "0.25";
    element.dispatchEvent(new CustomEvent("wa-select", { detail: { item } }));
  });
  await expect(rateControl.locator(".rate-trigger")).toContainText("0.25×");
  expect((await rateControl.boundingBox())?.width).toBeCloseTo(
    initialRateWidth ?? 0,
    0,
  );
  await page.locator("camera-optics-card").evaluate((element) => {
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
  await expect(recordedPlayer).toHaveCSS("background-color", "rgb(40, 41, 42)");
  await expect(scrubber).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
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
  await segmentAction.click();
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
  await expect(segmentAction).toHaveAttribute("aria-pressed", "true");
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
  const segmentCopyLayout = await segmentManager.evaluate((element) => {
    const copy = element.shadowRoot?.querySelector(".copy");
    if (!copy) return null;
    const style = getComputedStyle(copy);
    return {
      columnEnd: style.gridColumnEnd,
      columnStart: style.gridColumnStart,
    };
  });
  expect(segmentCopyLayout).toEqual({ columnEnd: "-1", columnStart: "1" });
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
    segmentManager.getByRole("button", { name: "Export Segment" }),
  ).toBeVisible();
  await expect(
    segmentManager
      .getByRole("button", { name: "Download Segment" })
      .locator("svg"),
  ).toHaveCSS("fill", "rgb(250, 251, 252)");
  await expect(segmentManager).toContainText("Select a recording segment");
  await page.locator("camera-optics-card").evaluate((element) => {
    const host = element as HTMLElement;
    host.style.setProperty(
      "--wzc-color-surface-secondary",
      "rgb(240, 241, 242)",
    );
    host.style.setProperty("--wzc-color-text-1", "rgb(20, 21, 22)");
  });
  await expect(recordedPlayer).toHaveCSS(
    "background-color",
    "rgb(240, 241, 242)",
  );
  await expect(scrubber).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
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
  await segmentManager.getByRole("button", { name: "Export Segment" }).click();
  const exportNameDialog = page.locator("wzc-export-name-dialog");
  await expect(exportNameDialog.locator("dialog")).toBeVisible();
  await expect(exportNameDialog.locator("input")).toHaveValue(
    "Front selected recording",
  );
  await exportNameDialog.locator("input").fill("Front porch visitor");
  await expect(exportNameDialog.locator("button.primary")).toBeEnabled();
  await exportNameDialog.locator("button.primary").click();
  await expect(exportNameDialog.locator("dialog")).toBeHidden();
  await expect(
    recordingDialog.locator("wzc-toast-region").getByText("Export started."),
  ).toBeVisible();
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
  await segmentAction.click();
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    card.setConfig({
      type: "custom:camera-optics-card",
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
        if (message.type === "camera_optics/live/camera/ready") {
          return { ready: false };
        }
        if (
          message.type === "camera_optics/reviews/list" ||
          message.type === "camera_optics/events/list"
        ) {
          return { items: [] };
        }
        if (message.type === "camera_optics/exports/list") {
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
  await page.mouse.move(0, 0);
  await expect(hoverPreview).toHaveCount(0);
  await exportTile.evaluate(async (tile, waitMs) => {
    const thumbnail = tile.querySelector(".thumbnail");
    if (!(thumbnail instanceof HTMLElement))
      throw new Error("Export thumbnail was not rendered");
    const bounds = thumbnail.getBoundingClientRect();
    tile.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: bounds.left + 10,
        clientY: bounds.top + 10,
        isPrimary: true,
        pointerId: 42,
        pointerType: "touch",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }, THUMBNAIL_LONG_PRESS_WAIT_MS);
  await expect(hoverPreview).toHaveCount(1);
  await exportTile.evaluate((tile) => {
    const thumbnail = tile.querySelector(".thumbnail");
    if (!(thumbnail instanceof HTMLElement))
      throw new Error("Export thumbnail was not rendered");
    const bounds = thumbnail.getBoundingClientRect();
    tile.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: bounds.left + 10,
        clientY: bounds.top + 10,
        isPrimary: true,
        pointerId: 42,
        pointerType: "touch",
      }),
    );
    tile.querySelector<HTMLElement>(".tile-player")?.click();
  });
  await expect(hoverPreview).toHaveCount(0);
  await expect(page.locator("wzc-export-media-dialog dialog")).toHaveCount(0);

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

  const exportViewport = exports.locator(".scroller");
  const exportTop = exports.locator("wzc-scroll-top");
  await expect(exportTop).toBeHidden();
  const scrollGeometry = await exportViewport.evaluate((node) => {
    const collection = node.querySelector(".collection");
    const tile = collection?.querySelector(".tile");
    if (!collection || !tile) throw new Error("Export list is incomplete");
    for (let index = 0; index < 6; index += 1) {
      collection.append(tile.cloneNode(true));
    }
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll"));
    return {
      clientHeight: node.clientHeight,
      overflowY: getComputedStyle(node).overflowY,
      overscrollBehaviorY: getComputedStyle(node).overscrollBehaviorY,
      scrollHeight: node.scrollHeight,
    };
  });
  expect(scrollGeometry.overflowY).toBe("auto");
  expect(scrollGeometry.overscrollBehaviorY).toBe("auto");
  expect(scrollGeometry.scrollHeight).toBeGreaterThan(
    scrollGeometry.clientHeight,
  );
  await expect(exportTop).toBeVisible();
  await exportTop.getByRole("button", { name: "Top" }).click();
  await expect
    .poll(() => exportViewport.evaluate((node) => node.scrollTop))
    .toBe(0);
  await expect(exportTop).toBeHidden();

  await exports.locator(".tile-player").first().click();
  await expect(page.locator("wzc-export-media-dialog dialog")).toBeVisible();
});

test("lets the camera navigation shadow paint into the card padding", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
      cameras: [
        { entity_id: "camera.front", title: "Front Door" },
        { entity_id: "camera.back", title: "Back Yard" },
      ],
    });
  });

  const card = page.locator("camera-optics-card");
  const navigation = card.locator("wzc-camera-navigation");
  await expect(navigation.locator("button")).toHaveCount(2);

  await card.evaluate((element) => {
    const parent = element.parentNode;
    if (!parent) throw new Error("CameraOptics card has no parent");
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
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
  await page.mouse.move(0, 0);
  await expect(previousNavigation).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await page.locator("wzc-camera-live .viewport").nth(1).hover();
  await expect(previousNavigation).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(previousNavigation).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
});

test("moves talk and light between the wide toolbar and resizing phone viewport", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installHaIconFixture(page);
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    const connection = {
      subscribeMessage: async () => () => undefined,
    };
    card.setConfig({
      type: "custom:camera-optics-card",
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
        if (message.type === "camera_optics/live/camera/ready") {
          return { ready: false };
        }
        if (message.type === "camera_optics/talk/capability") {
          return { supported: true };
        }
        if (message.type === "camera_optics/ptz/capability") {
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
  const activityNavigationComposition = page.locator(
    '.module-composition[data-module-type="activity-navigation"]',
  );
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
  const ptzCollapse = ptz.locator("button.center-toggle");
  const ptzTrigger = ptz.locator("button.ptz-trigger");
  const ptzRightButton = ptz.locator("button.right");
  const lightButton = lights.locator(".light-button");
  const talkIcon = talkButton.locator(":scope > svg");
  const lightIcon = lightButton.locator(":scope > ha-icon svg");
  await expect(talkButton).toBeVisible();
  await expect(talk).toHaveAttribute("presentation", "standard");
  await expect(lights).toHaveAttribute("presentation", "standard");
  await expect(
    activityNavigationComposition.locator("wzc-two-way-talk"),
  ).toHaveCount(1);
  await expect(
    activityNavigationComposition.locator("wzc-light-control"),
  ).toHaveCount(1);
  await expect(ptzTrigger).toBeVisible();
  await talk.evaluate((element) => {
    const testWindow = window as typeof window & {
      __wzcOriginalTalkStart?: () => Promise<void>;
      __wzcTalkTouchStarts?: number;
    };
    testWindow.__wzcTalkTouchStarts = 0;
    const session = (
      element as HTMLElement & {
        _session: { start(): Promise<void> };
      }
    )._session;
    testWindow.__wzcOriginalTalkStart = session.start.bind(session);
    session.start = () => {
      const testWindow = window as typeof window & {
        __wzcTalkTouchStarts?: number;
      };
      testWindow.__wzcTalkTouchStarts =
        (testWindow.__wzcTalkTouchStarts ?? 0) + 1;
      return Promise.resolve();
    };
  });
  await talkButton.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __wzcTalkTouchStarts?: number;
            }
          ).__wzcTalkTouchStarts,
      ),
    )
    .toBe(1);
  await talk.evaluate((element) => {
    const testWindow = window as typeof window & {
      __wzcOriginalTalkStart?: () => Promise<void>;
    };
    const original = testWindow.__wzcOriginalTalkStart;
    if (original) {
      (
        element as HTMLElement & {
          _session: { start(): Promise<void> };
        }
      )._session.start = original;
      delete testWindow.__wzcOriginalTalkStart;
    }
  });
  await expect(talkButton).toBeVisible();
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

  expect(cameraBox.width / cameraBox.height).toBeCloseTo(16 / 9, 1);
  expect(talkHostBox.height).toBeCloseTo(talkButtonBox.height, 0);
  expect(lightHostBox.height).toBeCloseTo(lightButtonBox.height, 0);
  expect(talkHostBox.y + talkHostBox.height).toBeCloseTo(
    lightHostBox.y + lightHostBox.height,
    0,
  );
  const activityNavigationBox =
    await activityNavigationComposition.boundingBox();
  const talkPlacementBox = await talk.locator("xpath=..").boundingBox();
  expect(activityNavigationBox).not.toBeNull();
  expect(talkPlacementBox).not.toBeNull();
  if (!activityNavigationBox || !talkPlacementBox) return;
  expect(talkPlacementBox.x + talkPlacementBox.width / 2).toBeCloseTo(
    activityNavigationBox.x + activityNavigationBox.width / 2,
    0,
  );
  expect(talkHostBox.x + talkHostBox.width / 2).toBeCloseTo(
    activityNavigationBox.x + activityNavigationBox.width / 2,
    0,
  );
  expect(lightHostBox.y).toBeGreaterThanOrEqual(activityNavigationBox.y);
  expect(talkHostBox.y + talkHostBox.height).toBeLessThanOrEqual(
    activityNavigationBox.y + activityNavigationBox.height,
  );
  expect(
    talkHostBox.x - (lightHostBox.x + lightHostBox.width),
  ).toBeGreaterThanOrEqual(8);

  await talk.evaluate((element) => {
    (
      window as typeof window & {
        __wzcTalkCloseCount?: number;
        __wzcTalkElement?: Element;
      }
    ).__wzcTalkCloseCount = 0;
    (
      window as typeof window & {
        __wzcTalkElement?: Element;
      }
    ).__wzcTalkElement = element;
    const talkElement = element as HTMLElement & {
      _session: {
        _manager: {
          _resolver: {
            connect(...args: unknown[]): Promise<{
              close(): void;
              localStream: MediaStream;
              setMicrophoneMuted(muted: boolean): void;
            }>;
          };
        };
      };
    };
    talkElement._session._manager._resolver = {
      connect: async () => ({
        close: () => {
          const testWindow = window as typeof window & {
            __wzcTalkCloseCount?: number;
          };
          testWindow.__wzcTalkCloseCount =
            (testWindow.__wzcTalkCloseCount ?? 0) + 1;
        },
        localStream: new MediaStream(),
        setMicrophoneMuted: () => undefined,
      }),
    };
  });
  const startedTalkState = await talk.evaluate(async (element) => {
    const session = (
      element as HTMLElement & {
        _session: {
          active: boolean;
          start(): Promise<void>;
          _manager: {
            snapshot: { status: string; target?: { entityId: string } };
          };
        };
      }
    )._session;
    await session.start();
    return {
      active: session.active,
      status: session._manager.snapshot.status,
      target: session._manager.snapshot.target?.entityId,
    };
  });
  expect(startedTalkState).toEqual({
    active: true,
    status: "connected",
    target: "camera.front",
  });
  const activeTalkCenter = talk.locator('button[data-talk-action="stop"]');
  const activeTalkMicrophone = talk.locator(
    'button[data-talk-action="microphone"]',
  );
  await expect(activeTalkCenter).toBeVisible();
  const activeTalkHostBox = await talk.boundingBox();
  expect(activeTalkHostBox).not.toBeNull();
  expect(activeTalkHostBox?.width).toBeCloseTo(talkHostBox.width, 0);
  expect(activeTalkHostBox?.x).toBeCloseTo(talkHostBox.x, 0);
  const [activeLightBox, activeTalkMicrophoneBox] = await Promise.all([
    lightButton.boundingBox(),
    activeTalkMicrophone.boundingBox(),
  ]);
  expect(activeLightBox?.x).toBeCloseTo(lightButtonBox.x, 0);
  expect(activeLightBox?.y).toBeCloseTo(lightButtonBox.y, 0);
  expect(
    (activeTalkMicrophoneBox?.x ?? 0) -
      ((activeLightBox?.x ?? 0) + (activeLightBox?.width ?? 0)),
  ).toBeGreaterThanOrEqual(8);
  const activeTalkPresentation = await talk
    .locator(".talk-controls")
    .evaluate((controls) => {
      const canvas = controls.querySelector("canvas");
      const sideButton = controls.querySelector<HTMLButtonElement>(
        'button[data-talk-action="microphone"]',
      );
      const panelProbe = document.createElement("span");
      const colorProbe = document.createElement("span");
      panelProbe.style.background = "var(--wzc-talk-panel-background)";
      colorProbe.style.color = "var(--wzc-talk-panel-color)";
      controls.append(panelProbe, colorProbe);
      const controlsBounds = controls.getBoundingClientRect();
      const buttonGeometry = [...controls.querySelectorAll("button")].map(
        (button) => {
          const bounds = button.getBoundingClientRect();
          return {
            height: bounds.height,
            relativeCenter: bounds.x + bounds.width / 2 - controlsBounds.x,
            width: bounds.width,
          };
        },
      );
      const result = {
        buttonGeometry,
        canvasDisplay: canvas ? getComputedStyle(canvas).display : "",
        height: controlsBounds.height,
        panel: getComputedStyle(controls).backgroundColor,
        panelExpected: getComputedStyle(panelProbe).backgroundColor,
        radius: getComputedStyle(controls).borderRadius,
        sideButton: sideButton
          ? getComputedStyle(sideButton).backgroundColor
          : "",
        sideButtonColor: sideButton ? getComputedStyle(sideButton).color : "",
        sideButtonColorExpected: getComputedStyle(colorProbe).color,
        width: controlsBounds.width,
      };
      panelProbe.remove();
      colorProbe.remove();
      return result;
    });
  expect(activeTalkPresentation).toMatchObject({
    canvasDisplay: "block",
    panel: activeTalkPresentation.panelExpected,
    sideButton: "rgba(0, 0, 0, 0)",
    sideButtonColor: activeTalkPresentation.sideButtonColorExpected,
  });
  const connectedColor = await activeTalkCenter.evaluate((button) => {
    const probe = document.createElement("span");
    probe.style.background = "var(--wzc-talk-connected-color)";
    button.append(probe);
    const result = {
      actual: getComputedStyle(button).backgroundColor,
      expected: getComputedStyle(probe).backgroundColor,
    };
    probe.remove();
    return result;
  });
  expect(connectedColor.actual).toBe(connectedColor.expected);
  await activeTalkCenter.hover();
  await expect(activeTalkCenter).toHaveCSS(
    "background-color",
    connectedColor.expected,
  );
  await activeTalkMicrophone.hover();
  await expect(activeTalkMicrophone).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await activeTalkMicrophone.click();
  await expect(activeTalkCenter).toHaveClass(/\bmuted\b/);
  const mutedColor = await activeTalkCenter.evaluate((button) => {
    const probe = document.createElement("span");
    probe.style.background = "var(--wzc-activity-detection-color)";
    button.append(probe);
    const result = {
      actual: getComputedStyle(button).backgroundColor,
      expected: getComputedStyle(probe).backgroundColor,
    };
    probe.remove();
    return result;
  });
  expect(mutedColor.actual).toBe(mutedColor.expected);
  await activeTalkCenter.hover();
  await expect(activeTalkCenter).toHaveCSS(
    "background-color",
    mutedColor.expected,
  );
  const desktopViewport = page.viewportSize();
  if (!desktopViewport) throw new Error("Expected a desktop viewport");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(talk).toHaveAttribute("presentation", "overlay");
  await expect(activeTalkCenter).toBeVisible();
  await expect(activeTalkCenter).toHaveClass(/\bmuted\b/);
  await activeTalkMicrophone.hover();
  await expect(activeTalkMicrophone).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  expect(
    await talk.evaluate(
      (element) =>
        element ===
        (
          window as typeof window & {
            __wzcTalkElement?: Element;
          }
        ).__wzcTalkElement,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __wzcTalkCloseCount?: number;
          }
        ).__wzcTalkCloseCount,
    ),
  ).toBe(0);
  await page.setViewportSize(desktopViewport);
  await expect(talk).toHaveAttribute("presentation", "standard");
  await expect(activeTalkCenter).toBeVisible();
  await expect(activeTalkCenter).toHaveClass(/\bmuted\b/);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __wzcTalkCloseCount?: number;
          }
        ).__wzcTalkCloseCount,
    ),
  ).toBe(0);
  const persistentTalk = page.locator("wzc-persistent-talk .persistent-talk");
  const cardHost = page.locator("camera-optics-card");
  const dashboardPanelBounds = await page.evaluate(() => {
    const main = document.createElement("home-assistant-main");
    main.style.cssText =
      "position:fixed;inset:0;display:block;pointer-events:none";
    const shadow = main.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent =
      "partial-panel-resolver{position:fixed;inset:0 0 0 240px;display:block}";
    const panel = document.createElement("partial-panel-resolver");
    shadow.append(style, panel);
    document.body.append(main);
    const bounds = panel.getBoundingClientRect();
    return { center: bounds.x + bounds.width / 2, width: bounds.width };
  });
  await cardHost.evaluate((element) => {
    history.pushState(null, "", "/lovelace/other");
    element.style.display = "none";
    window.dispatchEvent(new Event("location-changed"));
  });
  await expect(persistentTalk).toBeVisible();
  await cardHost.evaluate((element) => {
    history.replaceState(null, "", "/");
    element.style.display = "";
    window.dispatchEvent(new Event("location-changed"));
  });
  await expect(persistentTalk).toBeHidden();
  await page
    .locator("wzc-camera-navigation")
    .getByRole("tab", { name: "Doorbell" })
    .click();
  await expect(persistentTalk).toBeVisible();
  await expect(persistentTalk).toContainText("Two Way Talk");
  await expect(persistentTalk).toContainText("Front");
  expect(
    await persistentTalk.evaluate((element) =>
      element.matches(":popover-open"),
    ),
  ).toBe(true);
  const persistentGeometry = await persistentTalk.evaluate((element) => {
    const panel = element.getBoundingClientRect();
    const controls = element
      .querySelector<HTMLElement>(".controls")
      ?.getBoundingClientRect();
    const sharedControls = element.querySelector<HTMLElement>(".controls");
    const talkControls =
      sharedControls?.shadowRoot?.querySelector<HTMLElement>(".talk-controls");
    const talkControlsBounds = talkControls?.getBoundingClientRect();
    const sideButtons = [
      ...(sharedControls?.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        ".talk-controls button:not(.center)",
      ) ?? []),
    ];
    return {
      background: getComputedStyle(element).backgroundColor,
      buttonGeometry: [...(talkControls?.querySelectorAll("button") ?? [])].map(
        (button) => {
          const bounds = button.getBoundingClientRect();
          return {
            height: bounds.height,
            relativeCenter:
              bounds.x + bounds.width / 2 - (talkControlsBounds?.x ?? 0),
            width: bounds.width,
          };
        },
      ),
      controlsCenter: controls ? controls.x + controls.width / 2 : 0,
      controlsHeight: talkControlsBounds?.height ?? 0,
      controlsRadius: talkControls
        ? getComputedStyle(talkControls).borderRadius
        : "",
      controlsWidth: talkControlsBounds?.width ?? 0,
      panelCenter: panel.x + panel.width / 2,
      sideButtons: sideButtons.map((button) => ({
        color: getComputedStyle(button).color,
        iconVisible: Boolean(
          button.querySelector("svg")?.getBoundingClientRect().width,
        ),
      })),
    };
  });
  expect(persistentGeometry.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(persistentGeometry.controlsCenter).toBeCloseTo(
    persistentGeometry.panelCenter,
    0,
  );
  expect(persistentGeometry.panelCenter).toBeCloseTo(
    dashboardPanelBounds.center,
    0,
  );
  expect(persistentGeometry.sideButtons).toHaveLength(2);
  expect(persistentGeometry.controlsWidth).toBeCloseTo(
    activeTalkPresentation.width,
    0,
  );
  expect(persistentGeometry.controlsHeight).toBeCloseTo(
    activeTalkPresentation.height,
    0,
  );
  expect(persistentGeometry.controlsRadius).toBe(activeTalkPresentation.radius);
  for (const [index, geometry] of persistentGeometry.buttonGeometry.entries()) {
    const expected = activeTalkPresentation.buttonGeometry[index];
    expect(expected).toBeDefined();
    expect(geometry.width).toBeCloseTo(expected?.width ?? 0, 3);
    expect(geometry.height).toBeCloseTo(expected?.height ?? 0, 3);
    expect(geometry.relativeCenter).toBeCloseTo(
      expected?.relativeCenter ?? 0,
      3,
    );
  }
  expect(
    persistentGeometry.sideButtons.map(({ iconVisible }) => iconVisible),
  ).toEqual([true, true]);
  expect(persistentGeometry.sideButtons.map(({ color }) => color)).toEqual([
    activeTalkPresentation.sideButtonColor,
    activeTalkPresentation.sideButtonColor,
  ]);
  const persistentSharedControls = persistentTalk.locator(
    "wzc-two-way-talk-controls",
  );
  await expect(persistentSharedControls).toHaveAttribute(
    "presentation",
    "standard",
  );
  await expect(persistentSharedControls.locator("button")).toHaveCount(3);
  const connectedPersistentControlsBox =
    await persistentSharedControls.boundingBox();
  const persistentTalkStop = persistentTalk.locator("button.center");
  await persistentTalkStop.click();
  await expect(persistentTalk).toBeVisible();
  const persistentTalkRestart = persistentTalk.locator(
    'button[data-talk-action="connect"]',
  );
  await expect(persistentTalkRestart).toHaveAttribute(
    "title",
    "Restart two-way talk",
  );
  await expect(persistentSharedControls.locator("button")).toHaveCount(1);
  const readyPersistentControlsBox =
    await persistentSharedControls.boundingBox();
  expect(readyPersistentControlsBox?.width).toBeCloseTo(
    connectedPersistentControlsBox?.width ?? 0,
    0,
  );
  expect(readyPersistentControlsBox?.x).toBeCloseTo(
    connectedPersistentControlsBox?.x ?? 0,
    0,
  );
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __wzcTalkCloseCount?: number;
          }
        ).__wzcTalkCloseCount,
    ),
  ).toBe(1);
  await persistentTalkRestart.click();
  await expect(persistentSharedControls.locator("button")).toHaveCount(3);
  await expect(persistentTalkStop).toHaveAttribute(
    "title",
    "End two-way talk and keep this control available",
  );
  const desktopPersistentTalkBox = await persistentTalk.boundingBox();
  expect(desktopPersistentTalkBox).not.toBeNull();
  expect(desktopPersistentTalkBox?.width).toBeLessThan(desktopViewport.width);
  expect(desktopPersistentTalkBox?.width).toBeLessThanOrEqual(
    dashboardPanelBounds.width,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const box = await persistentTalk.boundingBox();
      return box ? { width: box.width, x: box.x } : undefined;
    })
    .toEqual({ width: 374, x: 8 });
  const compactPersistentGeometry = await persistentTalk.evaluate((element) => {
    const panel = element.getBoundingClientRect();
    const identity = element
      .querySelector<HTMLElement>(".identity")
      ?.getBoundingClientRect();
    const controls = element
      .querySelector<HTMLElement>(".controls")
      ?.getBoundingClientRect();
    const navigate = element
      .querySelector<HTMLElement>(".navigate")
      ?.getBoundingClientRect();
    return {
      bottom: panel.bottom,
      height: panel.height,
      identityRight: identity?.right ?? 0,
      controlsCenterX: controls ? controls.x + controls.width / 2 : 0,
      controlsLeft: controls?.left ?? 0,
      controlsRight: controls?.right ?? 0,
      navigateLeft: navigate?.left ?? 0,
    };
  });
  expect(compactPersistentGeometry.bottom).toBe(836);
  expect(compactPersistentGeometry.height).toBeLessThanOrEqual(65);
  expect(compactPersistentGeometry.controlsCenterX).toBeGreaterThanOrEqual(195);
  expect(compactPersistentGeometry.controlsLeft).toBeGreaterThan(
    compactPersistentGeometry.identityRight,
  );
  expect(compactPersistentGeometry.controlsRight).toBeLessThan(
    compactPersistentGeometry.navigateLeft,
  );
  await page.setViewportSize(desktopViewport);

  await persistentTalk.locator("button.navigate").click();
  await expect(persistentTalk).toBeHidden();
  await expect(activeTalkCenter).toBeVisible();
  await selectedLiveViewport.hover();
  await ptzTrigger.click();
  await expect(ptzControl).toHaveClass(/\bexpanded\b/);
  await activeTalkCenter.click();
  await expect(talkButton).toBeVisible();
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
      const styles = getComputedStyle(element);
      const control = element.closest(".ptz-control");
      if (!control) throw new Error("PTZ control is unavailable");
      const buttonRect = element.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      const controlStyles = getComputedStyle(control);
      return {
        clipPath: styles.clipPath,
        height: buttonRect.height,
        width: buttonRect.width,
        expectedDiameter:
          controlRect.width -
          Number.parseFloat(controlStyles.borderInlineStartWidth) -
          Number.parseFloat(controlStyles.borderInlineEndWidth),
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
  expect(ptzDirectionVisualGeometry.clipPath).not.toBe("none");
  expect(ptzRightIconBox.width).toBeCloseTo(ptzRightButtonBox.width * 0.18, 1);
  expect(ptzRightIconBox.height).toBeCloseTo(
    ptzRightButtonBox.height * 0.18,
    1,
  );
  await ptzRightButton.hover({
    position: {
      x: ptzRightButtonBox.width * 0.82,
      y: ptzRightButtonBox.height / 2,
    },
  });
  const ptzHoverLayers = await ptzRightButton.evaluate((element) => {
    const hoverProbe = document.createElement("span");
    hoverProbe.style.background = "var(--wzc-ptz-pad-hover-background)";
    element.append(hoverProbe);
    const result = {
      button: getComputedStyle(element).backgroundColor,
      expected: getComputedStyle(hoverProbe).backgroundColor,
    };
    hoverProbe.remove();
    return result;
  });
  expect(ptzHoverLayers.button).toBe(ptzHoverLayers.expected);
  expect(lightButtonBox.width).toBeCloseTo(talkButtonBox.width, 1);
  expect(lightButtonBox.height).toBeCloseTo(talkButtonBox.height, 1);
  const [talkButtonColor, lightButtonColor] = await Promise.all([
    talkButton.evaluate((element) => getComputedStyle(element).color),
    lightButton.evaluate((element) => getComputedStyle(element).color),
  ]);
  expect(talkButtonColor).toBe(lightButtonColor);
  const standardControlPresentation = await talkButton.evaluate((element) => {
    const backgroundProbe = document.createElement("span");
    const colorProbe = document.createElement("span");
    backgroundProbe.style.background =
      "var(--wzc-capability-control-background)";
    colorProbe.style.color = "var(--wzc-capability-control-color)";
    element.append(backgroundProbe, colorProbe);
    const styles = getComputedStyle(element);
    const result = {
      background: styles.backgroundColor,
      backgroundExpected: getComputedStyle(backgroundProbe).backgroundColor,
      borderWidth: styles.borderWidth,
      color: styles.color,
      colorExpected: getComputedStyle(colorProbe).color,
    };
    backgroundProbe.remove();
    colorProbe.remove();
    return result;
  });
  expect(standardControlPresentation).toMatchObject({
    background: standardControlPresentation.backgroundExpected,
    borderWidth: "0px",
    color: standardControlPresentation.colorExpected,
  });
  await talkButton.hover();
  const standardTalkHover = await talkButton.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--wzc-capability-control-hover-color)";
    element.append(probe);
    const result = {
      actual: getComputedStyle(element).color,
      expected: getComputedStyle(probe).color,
    };
    probe.remove();
    return result;
  });
  expect(standardTalkHover.actual).toBe(standardTalkHover.expected);
  await lightButton.hover();
  await expect(lightButton).toHaveCSS("color", standardTalkHover.expected);
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

  await lightButton.focus();
  await lightButton.press("ArrowUp");
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
  await expect(talk).toHaveAttribute("presentation", "overlay");
  await expect(lights).toHaveAttribute("presentation", "overlay");
  await expect(talk.locator("xpath=..")).toHaveAttribute(
    "data-control-region",
    "center",
  );
  await expect(lights.locator("xpath=..")).toHaveAttribute(
    "data-control-region",
    "leading",
  );
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
      await selectedLiveViewport.dispatchEvent("click");
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
      await selectedLiveViewport.dispatchEvent("click");
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

test("opens the PTZ panel and recalls a provider preset without a stop subscription", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 390 });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    const card = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    const presetMessages: unknown[] = [];
    (window as typeof window & { presetMessages?: unknown[] }).presetMessages =
      presetMessages;
    card.setConfig({
      type: "custom:camera-optics-card",
      cameras: [{ entity_id: "camera.front", ptz_enabled: true }],
    });
    card.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
      },
      connection: {
        subscribeMessage: async () => () => undefined,
      },
      hassUrl: (path: string) => path,
      callWS: async (message: { type: string }) => {
        presetMessages.push(message);
        if (message.type === "camera_optics/live/camera/ready") {
          return { ready: false };
        }
        if (message.type === "camera_optics/ptz/capability") {
          return {
            supported: true,
            pan: true,
            tilt: true,
            zoom: false,
            focus: false,
            presets: ["One", "Two", "Three", "Four", "Five", "Six", "Seven"],
          };
        }
        if (message.type.endsWith("/list")) return { items: [] };
        return undefined;
      },
    };
  });

  const ptzNavigation = page.locator(
    "wzc-activity-navigation button[title='PTZ']",
  );
  await expect(ptzNavigation).toBeVisible();
  await ptzNavigation.click();

  const panel = page.locator("wzc-ptz[presentation='panel']");
  await expect(panel).toBeVisible();
  const [navigationBox, panelModuleBox] = await Promise.all([
    page.locator("wzc-activity-navigation").boundingBox(),
    page.locator("wzc-ptz-panel").boundingBox(),
  ]);
  expect(navigationBox).not.toBeNull();
  expect(panelModuleBox).not.toBeNull();
  if (navigationBox && panelModuleBox) {
    expect(
      panelModuleBox.y - (navigationBox.y + navigationBox.height),
    ).toBeGreaterThan(0);
  }
  await expect(panel.locator("button.wedge")).toHaveCount(4);
  await expect(panel.locator("button.center-half")).toHaveCount(2);
  const padSeams = await panel.locator(".circle-pad").evaluate((pad) => {
    const wedge = pad.querySelector("button.wedge");
    const hub = pad.querySelector(".center-hub");
    const half = pad.querySelector("button.center-half");
    if (!wedge || !hub || !half)
      throw new Error("PTZ pad surfaces are unavailable");
    const padStyles = getComputedStyle(pad);
    const hubStyles = getComputedStyle(hub);
    return {
      backing: padStyles.backgroundColor,
      hubBorder: hubStyles.borderTopWidth,
      outerBorder: padStyles.borderTopWidth,
      wedge: getComputedStyle(wedge).backgroundColor,
      hubBacking: hubStyles.backgroundColor,
      half: getComputedStyle(half).backgroundColor,
    };
  });
  expect(padSeams.outerBorder).toBe("0px");
  expect(padSeams.hubBorder).toBe("0px");
  expect(padSeams.backing).not.toBe(padSeams.wedge);
  expect(padSeams.hubBacking).not.toBe(padSeams.half);
  const liveViewport = page.locator("wzc-camera-live .viewport");
  await expect(liveViewport).toHaveAttribute("aria-label", /100 percent/);
  await panel.locator("button.center-half").first().click();
  await expect(liveViewport).toHaveAttribute("aria-label", /125 percent/);
  const presetButtons = panel.locator("button.ptz-preset");
  await expect(presetButtons).toHaveCount(6);
  const presetRows = new Set(
    await Promise.all(
      (await presetButtons.all()).map(async (button) =>
        Math.round((await button.boundingBox())?.y ?? 0),
      ),
    ),
  );
  expect(presetRows.size).toBeGreaterThan(1);
  await presetButtons.first().click();

  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as typeof window & {
            presetMessages?: Array<{ type?: string }>;
          }
        ).presetMessages?.filter(
          ({ type }) => type === "camera_optics/ptz/preset",
        ),
      ),
    )
    .toEqual([
      expect.objectContaining({
        type: "camera_optics/ptz/preset",
        entity_id: "camera.front",
        preset: "One",
      }),
    ]);
  expect(
    await page.evaluate(() =>
      (
        window as typeof window & {
          presetMessages?: Array<{ type?: string }>;
        }
      ).presetMessages?.some(({ type }) => type === "camera_optics/ptz/move"),
    ),
  ).toBe(false);
});

test("aligns phone carousel controls and stage handle to the active stage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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

test("keeps the camera stage ratio below the overlay controls' intrinsic width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 220, height: 640 });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.locator("camera-optics-card").evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
      cameras: [{ entity_id: "camera.front" }],
    });
  });
  await expect(page.locator("wzc-camera-view")).toHaveCount(1);

  const camera = page.locator("wzc-camera");
  const carousel = page.locator("wzc-camera .camera-carousel");
  const view = page.locator("wzc-camera-view");
  const stage = page.locator("wzc-camera-view .camera");
  const live = page.locator("wzc-camera-live");
  const viewport = page.locator("wzc-camera-live .viewport");
  await expect(stage).toBeVisible();
  const [
    cameraBounds,
    carouselBounds,
    viewBounds,
    bounds,
    liveBounds,
    viewportBounds,
  ] = await Promise.all([
    camera.boundingBox(),
    carousel.boundingBox(),
    view.boundingBox(),
    stage.boundingBox(),
    live.boundingBox(),
    viewport.boundingBox(),
  ]);
  expect(bounds).not.toBeNull();
  expect(bounds?.width ?? 0).toBeLessThan(255);
  expect((bounds?.width ?? 0) / (bounds?.height ?? 1)).toBeCloseTo(16 / 9, 1);
  for (const containerBounds of [
    cameraBounds,
    carouselBounds,
    viewBounds,
    liveBounds,
    viewportBounds,
  ]) {
    expect(containerBounds?.height ?? 0).toBeCloseTo(bounds?.height ?? 0, 1);
  }
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
    await waitForCameraOpticsDefinition(page);
    await expect(page.locator("camera-optics-card ha-card")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("uses intrinsic card height in Home Assistant Panel view", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

  const result = await page
    .locator("camera-optics-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement & {
        setConfig(config: unknown): void;
        updateComplete: Promise<boolean>;
      };
      const panel = document.createElement("hui-panel-view");
      panel.style.display = "block";
      panel.style.width = "640px";
      panel.style.height = "900px";
      panel.append(card);
      document.body.replaceChildren(panel);
      card.setConfig({
        stage_type: "camera_only",
        type: "custom:camera-optics-card",
      });
      await card.updateComplete;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const panelResult = {
        cardHeight: card.getBoundingClientRect().height,
        naturalClass: card.classList.contains("panel-view-natural-height"),
        panelHeight: panel.getBoundingClientRect().height,
      };

      document.body.append(card);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      return {
        ...panelResult,
        classReleased: !card.classList.contains("panel-view-natural-height"),
      };
    });

  expect(result.naturalClass).toBe(true);
  expect(result.cardHeight).toBeGreaterThan(0);
  expect(result.cardHeight).toBeLessThan(result.panelHeight);
  expect(result.classReleased).toBe(true);
});

test("applies viewport and parent height modes without shrinking the Full Stage below its media minimum", async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 1000 });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    document.body.style.margin = "0";
    const wrapper = document.createElement("div");
    wrapper.id = "fit-viewport-layout-wrapper";
    wrapper.style.marginBlockStart = "56px";
    wrapper.style.paddingBlock = "24px";
    element.replaceWith(wrapper);
    wrapper.append(element);
    (element as HTMLElement & { setConfig(config: unknown): void }).setConfig({
      type: "custom:camera-optics-card",
      card_height_mode: "fit_viewport",
      cameras: [{ entity_id: "camera.front" }],
    });
  });
  await expect(card).toHaveClass(/height-mode-fit-viewport/);
  await expect(page.locator("wzc-activity-list .viewport")).toBeVisible();

  const fitBounds = await card.boundingBox();
  const headerHeight = await card.evaluate((element) =>
    Number.parseFloat(
      getComputedStyle(element).getPropertyValue("--header-height") || "56",
    ),
  );
  expect(fitBounds?.height).toBeCloseTo(1000 - 56 - 24 - 24, 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
  const fitListHeight = await page
    .locator("wzc-activity-list .viewport")
    .evaluate((element) => element.getBoundingClientRect().height);
  const threeTileMinimum = await page
    .locator("wzc-activity-list")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const number = (name: string) =>
        Number.parseFloat(style.getPropertyValue(name)) || 0;
      return (
        number("--wzc-media-day-header-block-size") +
        3 * number("--wzc-event-tile-block-size") +
        3 * number("--wzc-event-list-gap") +
        number("--wzc-media-day-header-gap") +
        number("--wzc-event-list-padding")
      );
    });
  expect(fitListHeight).toBeGreaterThanOrEqual(threeTileMinimum - 1);

  await page.locator("wzc-activity-list").evaluate(async (element) => {
    const list = element as HTMLElement & {
      items: Array<Record<string, unknown>>;
      updateComplete: Promise<boolean>;
    };
    list.items = Array.from({ length: 100 }, (_, index) => ({
      cameraLabel: "Front",
      clipUrl: null,
      endTime: 1_700_000_030 - index,
      id: `height-mode-${index}`,
      objectLabels: ["person"],
      playable: false,
      playbackSources: [],
      preferredTransport: "file",
      revision: `height-mode-${index}`,
      snapshotUrl: null,
      startTime: 1_700_000_000 - index,
      thumbnailUrl: null,
      zones: [],
    }));
    await list.updateComplete;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await list.updateComplete;
  });
  expect((await card.boundingBox())?.height).toBeCloseTo(
    fitBounds?.height ?? Number.NaN,
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 500, height: 500 });
  await expect
    .poll(async () => (await card.boundingBox())?.height ?? 0)
    .toBeGreaterThan(500 - headerHeight);
  expect((await card.boundingBox())?.height).toBeLessThan(
    fitBounds?.height ?? Number.POSITIVE_INFINITY,
  );
  await expect
    .poll(() =>
      page
        .locator("wzc-activity-list .viewport")
        .evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeGreaterThanOrEqual(threeTileMinimum - 1);

  await card.evaluate((element) => {
    const cardElement = element as HTMLElement & {
      setConfig(config: unknown): void;
    };
    const container = document.createElement("div");
    container.id = "height-mode-container";
    container.style.height = "1200px";
    element.replaceWith(container);
    container.append(element);
    cardElement.setConfig({
      type: "custom:camera-optics-card",
      card_height_mode: "fill_container",
      cameras: [{ entity_id: "camera.front" }],
    });
  });
  await expect(card).toHaveClass(/height-mode-fill-container/);
  await expect
    .poll(async () => (await card.boundingBox())?.height)
    .toBeCloseTo(1200, 0);
  const filledListHeight = await page
    .locator("wzc-activity-list .viewport")
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(filledListHeight).toBeGreaterThan(fitListHeight);
  await page.locator("wzc-activity-list").evaluate(async (element) => {
    const list = element as HTMLElement & {
      items: Array<Record<string, unknown>>;
      updateComplete: Promise<boolean>;
    };
    list.items = Array.from({ length: 100 }, (_, index) => ({
      cameraLabel: "Front",
      clipUrl: null,
      endTime: 1_700_000_030 - index,
      id: `fill-height-mode-${index}`,
      objectLabels: ["person"],
      playable: false,
      playbackSources: [],
      preferredTransport: "file",
      revision: `fill-height-mode-${index}`,
      snapshotUrl: null,
      startTime: 1_700_000_000 - index,
      thumbnailUrl: null,
      zones: [],
    }));
    await list.updateComplete;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  expect((await card.boundingBox())?.height).toBeCloseTo(1200, 0);
});

test("applies outer shell appearance toggles without changing card identity", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

  const result = await page
    .locator("camera-optics-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement & {
        setConfig(config: unknown): void;
        updateComplete: Promise<boolean>;
      };
      const shellBefore = card.shadowRoot?.querySelector("ha-card");
      card.style.setProperty("--ha-box-shadow-m", "rgb(1, 2, 3) 0px 4px 8px");
      card.setConfig({
        type: "custom:camera-optics-card",
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
        type: "custom:camera-optics-card",
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
  await expect(page.locator("camera-optics-card ha-card")).toHaveCSS(
    "isolation",
    "isolate",
  );
});

test("applies mobile edge-to-edge spacing to the Sections outer padding", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
  });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

  const result = await page
    .locator("camera-optics-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement & {
        setConfig(config: unknown): void;
        updateComplete: Promise<boolean>;
      };
      const sections = document.createElement("hui-sections-view");
      const wrapper = document.createElement("div");
      const container = document.createElement("div");
      wrapper.className = "wrapper";
      wrapper.style.padding = "0px 32px";
      container.className = "container";
      container.style.padding = "24px 0px";
      container.style.gap = "24px 8px";
      sections.style.setProperty("--ha-view-sections-row-gap", "8px");
      container.append(card);
      wrapper.append(container);
      sections.attachShadow({ mode: "open" }).append(wrapper);
      document.body.replaceChildren(sections);

      card.setConfig({
        stage_type: "minimal_camera_only",
        type: "custom:camera-optics-card",
      });
      await card.updateComplete;
      const minimalEdge = {
        containerPadding: container.style.padding,
        wrapperPadding: wrapper.style.padding,
      };

      card.setConfig({
        edge_to_edge_phone: false,
        stage_type: "minimal_camera_only",
        type: "custom:camera-optics-card",
      });
      await card.updateComplete;
      const minimalRestored = {
        containerPadding: container.style.padding,
        wrapperPadding: wrapper.style.padding,
      };

      document.documentElement.style.setProperty(
        "--safe-area-inset-bottom",
        "36px",
      );
      card.setConfig({
        card_height_mode_phone: "fit_viewport",
        type: "custom:camera-optics-card",
      });
      await card.updateComplete;
      card.style.setProperty("--wzc-fit-viewport-block-size", "400px");
      const cardSurface = card.shadowRoot?.querySelector("ha-card");
      if (!cardSurface) throw new Error("Card surface was not rendered");
      const edge = {
        fitViewportMinimum: getComputedStyle(cardSurface).minBlockSize,
        mediaSafeAreaUnderlap: getComputedStyle(card)
          .getPropertyValue("--wzc-media-safe-area-underlap")
          .trim(),
        gap: container.style.gap,
        hostClass: card.classList.contains("mobile-edge-to-edge"),
        containerPadding: container.style.padding,
        rowGap: sections.style.getPropertyValue("--ha-view-sections-row-gap"),
        wrapperPadding: wrapper.style.padding,
      };
      card.style.removeProperty("--wzc-fit-viewport-block-size");

      card.setConfig({
        edge_to_edge_phone: false,
        type: "custom:camera-optics-card",
      });
      await card.updateComplete;
      return {
        edge,
        minimalEdge,
        minimalRestored,
        restored: {
          hostClass: card.classList.contains("mobile-edge-to-edge"),
          containerPadding: container.style.padding,
          wrapperPadding: wrapper.style.padding,
        },
      };
    });

  expect(result).toEqual({
    edge: {
      fitViewportMinimum: "436px",
      mediaSafeAreaUnderlap: "36px",
      containerPadding: "0px",
      gap: "24px 8px",
      hostClass: true,
      rowGap: "8px",
      wrapperPadding: "0px",
    },
    minimalEdge: {
      containerPadding: "0px",
      wrapperPadding: "0px",
    },
    minimalRestored: {
      containerPadding: "24px 0px",
      wrapperPadding: "0px 32px",
    },
    restored: {
      containerPadding: "24px 0px",
      hostClass: false,
      wrapperPadding: "0px 32px",
    },
  });
});

test("keeps browser phone fit viewport stable across edge-to-edge spacing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 1200 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    });
  });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

  const result = await page
    .locator("camera-optics-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement & {
        setConfig(config: unknown): void;
        updateComplete: Promise<boolean>;
      };
      document.body.style.margin = "0";
      document.documentElement.style.setProperty("--header-height", "56px");
      document.documentElement.style.setProperty(
        "--safe-area-inset-bottom",
        "36px",
      );
      const sections = document.createElement("hui-sections-view");
      const wrapper = document.createElement("div");
      const container = document.createElement("div");
      wrapper.className = "wrapper";
      wrapper.style.padding = "56px 0px 0px";
      container.className = "container";
      container.append(card);
      wrapper.append(container);
      sections.attachShadow({ mode: "open" }).append(wrapper);
      document.body.replaceChildren(sections);

      const frame = () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      const measure = () => {
        const surface = card.shadowRoot?.querySelector("ha-card");
        if (!(surface instanceof HTMLElement))
          throw new Error("Card surface was not rendered");
        window.scrollTo(0, document.documentElement.scrollHeight);
        return {
          cardHeight: surface.getBoundingClientRect().height,
          cardTop: card.getBoundingClientRect().top,
          documentHeight: document.documentElement.scrollHeight,
          fitBlockSize: getComputedStyle(card)
            .getPropertyValue("--wzc-fit-viewport-block-size")
            .trim(),
          scrollY: window.scrollY,
          wrapperPadding: wrapper.style.padding,
        };
      };

      card.setConfig({
        card_height_mode_phone: "fit_viewport",
        edge_to_edge_phone: true,
        type: "custom:camera-optics-card",
      });
      await card.updateComplete;
      await frame();
      const edgeToEdge = measure();

      card.setConfig({
        card_height_mode_phone: "fit_viewport",
        edge_to_edge_phone: false,
        type: "custom:camera-optics-card",
      });
      await card.updateComplete;
      await frame();
      const contained = measure();

      return { contained, edgeToEdge, viewportHeight: window.innerHeight };
    });

  expect(result).toEqual({
    contained: {
      cardHeight: 1144,
      cardTop: 56,
      documentHeight: 1200,
      fitBlockSize: "1144px",
      scrollY: 0,
      wrapperPadding: "56px 0px 0px",
    },
    edgeToEdge: {
      cardHeight: 1144,
      cardTop: 0,
      documentHeight: 1200,
      fitBlockSize: "1108px",
      scrollY: 0,
      wrapperPadding: "0px",
    },
    viewportHeight: 1200,
  });
});

test("keeps Companion edge-to-edge fit viewport inside the outer window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 1200 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Home Assistant/2026.9 Mobile/HomeAssistant, like Safari",
    });
  });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

  const result = await page
    .locator("camera-optics-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement & {
        setConfig(config: unknown): void;
        updateComplete: Promise<boolean>;
      };
      document.body.style.margin = "0";
      document.documentElement.style.setProperty(
        "--safe-area-inset-bottom",
        "36px",
      );
      const view = document.createElement("div");
      view.style.paddingBlockEnd = "36px";
      element.replaceWith(view);
      view.append(element);
      card.setConfig({
        card_height_mode_phone: "fit_viewport",
        type: "custom:camera-optics-card",
      });
      await card.updateComplete;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const style = getComputedStyle(card);
      const surface = card.shadowRoot?.querySelector("ha-card");
      if (!(surface instanceof HTMLElement))
        throw new Error("Card surface was not rendered");
      return {
        cardHeight: surface.getBoundingClientRect().height,
        companionFitClass: card.classList.contains(
          "companion-edge-to-edge-fit-viewport",
        ),
        documentHeight: document.documentElement.scrollHeight,
        marginBlockEnd: style.marginBlockEnd,
        mediaSafeAreaUnderlap: style
          .getPropertyValue("--wzc-media-safe-area-underlap")
          .trim(),
        viewportHeightAddition: style
          .getPropertyValue("--wzc-mobile-bottom-underlap")
          .trim(),
        viewportHeight: window.innerHeight,
      };
    });

  expect(result).toEqual({
    cardHeight: 1200,
    companionFitClass: true,
    documentHeight: 1200,
    marginBlockEnd: "-36px",
    mediaSafeAreaUnderlap: "36px",
    viewportHeightAddition: "0px",
    viewportHeight: 1200,
  });
});

test("uses mobile viewport sizing without edge-to-edge on Companion tablets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1200 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Home Assistant/2026.9 Mobile/HomeAssistant, like Safari",
    });
  });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

  const result = await page
    .locator("camera-optics-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement & {
        setConfig(config: unknown): void;
        updateComplete: Promise<boolean>;
      };
      document.body.style.margin = "0";
      const sections = document.createElement("hui-sections-view");
      const wrapper = document.createElement("div");
      const container = document.createElement("div");
      wrapper.className = "wrapper";
      wrapper.style.padding = "56px 24px 36px";
      container.className = "container";
      container.append(card);
      wrapper.append(container);
      sections.attachShadow({ mode: "open" }).append(wrapper);
      document.body.replaceChildren(sections);

      card.setConfig({
        card_height_mode: "auto",
        card_height_mode_phone: "fit_viewport",
        edge_to_edge_phone: true,
        type: "custom:camera-optics-card",
      });
      await card.updateComplete;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const surface = card.shadowRoot?.querySelector("ha-card");
      if (!(surface instanceof HTMLElement))
        throw new Error("Card surface was not rendered");
      return {
        cardHeight: surface.getBoundingClientRect().height,
        edgeToEdge: card.classList.contains("mobile-edge-to-edge"),
        fitViewport: card.classList.contains("height-mode-fit-viewport"),
        wrapperPadding: wrapper.style.padding,
      };
    });

  expect(result).toEqual({
    cardHeight: 1108,
    edgeToEdge: false,
    fitViewport: true,
    wrapperPadding: "56px 24px 36px",
  });
});

test("applies configured Companion rotate actions to the retained Full Stage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Home Assistant/2026.9 Mobile/HomeAssistant, like Safari",
    });
  });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  const setRotateAction = async (
    action: "double_column" | "fullscreen_live_video" | "none",
  ) => {
    await card.evaluate((element, companionRotateAction) => {
      const host = element as HTMLElement & {
        hass: unknown;
        setConfig(config: unknown): void;
      };
      host.setConfig({
        cameras: [{ entity_id: "camera.front" }],
        card_height_mode_phone: "fit_viewport",
        companion_rotate_action: companionRotateAction,
        type: "custom:camera-optics-card",
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
        callWS: async (message: { type: string }) =>
          message.type === "camera_optics/reviews/list"
            ? { items: [] }
            : { ready: false },
      };
    }, action);
  };

  await setRotateAction("double_column");
  await expect(card.locator(".stage-grid")).toBeVisible();
  const cameraModule = card.locator("wzc-camera");
  await cameraModule.evaluate((element) => {
    element.dispatchEvent(
      new CustomEvent("wzc-camera-stage-size-change", {
        bubbles: true,
        composed: true,
        detail: { heightRatio: 0.9, resized: true, transient: false },
      }),
    );
  });
  await expect
    .poll(() => cameraModule.evaluate((element) => element.style.aspectRatio))
    .not.toBe("");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(card).toHaveClass(/companion-phone-landscape/);
  await expect(card).not.toHaveClass(/landscape-camera-overlay-active/);
  await expect(card).not.toHaveClass(
    /companion-phone-orientation-transitioning/,
  );
  await expect
    .poll(() => cameraModule.evaluate((element) => element.style.aspectRatio))
    .toBe("");
  const doubleColumnBounds = await card.evaluate((element) => {
    const root = element.shadowRoot;
    const navigation = root?.querySelector<HTMLElement>(
      '[data-layout-node$="default-camera-navigation-module"]',
    );
    if (!navigation) {
      throw new Error("Landscape camera surfaces were not rendered");
    }
    const navigationRect = navigation.getBoundingClientRect();
    return {
      navigationBottom: navigationRect.bottom,
    };
  });
  expect(doubleColumnBounds.navigationBottom).toBeLessThanOrEqual(390);
  const doubleColumnCameraContent = await card
    .locator("wzc-camera-view .camera")
    .first()
    .boundingBox();
  if (!doubleColumnCameraContent) {
    throw new Error("Landscape camera content bounds were unavailable");
  }
  expect(
    doubleColumnCameraContent.y + doubleColumnCameraContent.height,
  ).toBeLessThanOrEqual(390);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).not.toHaveClass(/companion-phone-landscape/);
  await setRotateAction("fullscreen_live_video");
  await card.evaluate((element) => {
    const host = element as HTMLElement;
    const surface = host.shadowRoot?.querySelector<HTMLElement>("ha-card");
    const grid = host.shadowRoot?.querySelector<HTMLElement>(".stage-grid");
    if (!surface || !grid) throw new Error("Stage surface was not rendered");
    surface.style.transform = "translateX(4px)";
    host.style.setProperty("--wzc-companion-landscape-inline-inset", "96px");
    const getSettledRect = grid.getBoundingClientRect.bind(grid);
    let staleLandscapeRectPending = true;
    const settleObserver = new MutationObserver(() => {
      if (!host.classList.contains("companion-phone-fullscreen-pending"))
        return;
      settleObserver.disconnect();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          staleLandscapeRectPending = false;
        });
      });
    });
    settleObserver.observe(host, { attributeFilter: ["class"] });
    grid.getBoundingClientRect = () => {
      const rect = getSettledRect();
      if (staleLandscapeRectPending) {
        return DOMRect.fromRect({
          height: rect.height,
          width: rect.width,
          x: 0,
          y: rect.y,
        });
      }
      return rect;
    };
  });

  await card.evaluate((element) => {
    const host = element as HTMLElement & {
      __firstFullscreenCameraBounds?: {
        height: number;
        left: number;
        top: number;
        width: number;
      };
      __rotateClassTimes?: { fullscreen?: number; landscape?: number };
    };
    const times: { fullscreen?: number; landscape?: number } = {};
    host.__rotateClassTimes = times;
    const observer = new MutationObserver(() => {
      const now = performance.now();
      if (
        host.classList.contains("companion-phone-landscape") &&
        times.landscape === undefined
      ) {
        times.landscape = now;
      }
      if (
        host.classList.contains("landscape-camera-overlay-expanded") &&
        !host.classList.contains("companion-phone-fullscreen-pending") &&
        times.fullscreen === undefined
      ) {
        times.fullscreen = now;
        const camera = host.shadowRoot?.querySelector<HTMLElement>(
          '.stage-placement[data-layout-node$="default-camera-module"]',
        );
        const rect = camera?.getBoundingClientRect();
        if (rect) {
          host.__firstFullscreenCameraBounds = {
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          };
        }
        observer.disconnect();
      }
    });
    observer.observe(host, { attributeFilter: ["class"] });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(card).toHaveClass(/companion-phone-landscape/);
  await expect(card).toHaveClass(/landscape-camera-overlay-expanded/);
  await expect(card).not.toHaveClass(/landscape-camera-overlay-settling/);
  await expect(
    card.locator('.stage-placement[data-layout-node$="default-camera-module"]'),
  ).toHaveCSS("position", "absolute");
  const fullscreenDelay = await card.evaluate((element) => {
    const times = (
      element as HTMLElement & {
        __rotateClassTimes?: { fullscreen?: number; landscape?: number };
      }
    ).__rotateClassTimes;
    if (times?.fullscreen === undefined || times.landscape === undefined) {
      throw new Error("Companion rotate class timing was not captured");
    }
    return times.fullscreen - times.landscape;
  });
  expect(fullscreenDelay).toBeLessThan(150);
  const firstFullscreenBounds = await card.evaluate(
    (element) =>
      (
        element as HTMLElement & {
          __firstFullscreenCameraBounds?: {
            height: number;
            left: number;
            top: number;
            width: number;
          };
        }
      ).__firstFullscreenCameraBounds,
  );
  expect(firstFullscreenBounds).toEqual({
    height: 390,
    left: 0,
    top: 0,
    width: 844,
  });
  const automaticFullscreenBounds = await Promise.all([
    card
      .locator('.stage-placement[data-layout-node$="default-camera-module"]')
      .boundingBox(),
    card.locator("wzc-camera-view .camera").first().boundingBox(),
  ]);
  for (const bounds of automaticFullscreenBounds) {
    if (!bounds)
      throw new Error("Automatic fullscreen bounds were unavailable");
    expect(bounds.x).toBeCloseTo(0, 0);
    expect(bounds.y).toBeCloseTo(0, 0);
    expect(bounds.width).toBeCloseTo(844, 0);
    expect(bounds.height).toBeCloseTo(390, 0);
  }
  const automaticFullscreenLeftEdge = await card.evaluate((element) => {
    const root = element.shadowRoot;
    const camera = root?.querySelector<HTMLElement>(
      '.stage-placement[data-layout-node$="default-camera-module"]',
    );
    const surface = root?.querySelector<HTMLElement>("ha-card");
    const hostBackground = getComputedStyle(element).backgroundColor;
    const hostRect = element.getBoundingClientRect();
    const surfaceBackground =
      surface && getComputedStyle(surface).backgroundColor;
    return {
      backdropsMatch: hostBackground === surfaceBackground,
      cameraPresent: Boolean(camera),
      hostLeft: hostRect.left,
      hostBackgroundIsTransparent: hostBackground === "rgba(0, 0, 0, 0)",
      hostWidth: hostRect.width,
      surfaceOverflow: surface && getComputedStyle(surface).overflow,
    };
  });
  expect(automaticFullscreenLeftEdge).toMatchObject({
    backdropsMatch: true,
    cameraPresent: true,
    hostLeft: 0,
    hostBackgroundIsTransparent: false,
    surfaceOverflow: "visible",
  });
  expect(automaticFullscreenLeftEdge.hostWidth).toBeCloseTo(844, 0);
  const automaticHandleBounds = await card
    .locator(".companion-camera-pull-handle")
    .boundingBox();
  if (!automaticHandleBounds) {
    throw new Error("Automatic fullscreen pull handle bounds were unavailable");
  }
  expect(automaticHandleBounds.x + automaticHandleBounds.width / 2).toBeCloseTo(
    844 - 52,
    0,
  );
  expect(
    automaticHandleBounds.y + automaticHandleBounds.height / 2,
  ).toBeCloseTo(390 / 2, 0);

  await expect(card).toHaveClass(/landscape-camera-overlay-covering/);
  await card.locator(".companion-camera-pull-handle").press("Home");
  await expect(card).not.toHaveClass(/landscape-camera-overlay-active/);
  await expect(card).not.toHaveClass(/landscape-camera-overlay-covering/);
  await expect
    .poll(() =>
      card.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe("rgba(0, 0, 0, 0)");
  await card.locator(".companion-camera-pull-handle").press("End");
  await expect(card).toHaveClass(/landscape-camera-overlay-covering/);

  await card.evaluate((element) => {
    const host = element as HTMLElement & { __portraitCameraMotion?: boolean };
    const camera = host.shadowRoot?.querySelector<HTMLElement>(
      '.stage-placement[data-layout-node$="default-camera-module"]',
    );
    if (!camera) throw new Error("Camera module was not rendered");
    host.__portraitCameraMotion = false;
    const observer = new MutationObserver(() => {
      if (!camera.style.transform) return;
      host.__portraitCameraMotion = true;
      observer.disconnect();
    });
    observer.observe(camera, { attributeFilter: ["style"] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      card.evaluate(
        (element) =>
          (element as HTMLElement & { __portraitCameraMotion?: boolean })
            .__portraitCameraMotion,
      ),
    )
    .toBe(true);
  await expect(card).not.toHaveClass(/companion-phone-landscape/);

  await setRotateAction("none");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(card).not.toHaveClass(/companion-phone-landscape/);
  await expect(card).not.toHaveClass(/landscape-camera-overlay-active/);
});

test("opens Minimal Camera Stage live video internally on Companion rotation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Home Assistant/2026.9 Mobile/HomeAssistant, like Safari",
    });
  });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    const host = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    host.setConfig({
      cameras: [{ entity_id: "camera.front" }],
      companion_rotate_action: "fullscreen_live_video",
      stage_type: "minimal_camera_only",
      type: "custom:camera-optics-card",
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
      callWS: async () => ({ ready: false }),
    };
  });

  const dialog = card.locator("wzc-minimal-camera .live-dialog");
  await expect(dialog).not.toHaveAttribute("open", "");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(dialog).toHaveAttribute("open", "");
  await expect(dialog).toHaveClass(/companion-rotate-fullscreen/);
  const bounds = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  expect(bounds.width).toBeCloseTo(844, 0);
  expect(bounds.height).toBeCloseTo(390, 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).not.toHaveAttribute("open", "");
});

test("restores the active Swiper video after WebKit native fullscreen exits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Home Assistant/2026.9 Mobile/HomeAssistant, like Safari",
    });
  });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    const host = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    host.setConfig({
      cameras: [
        { entity_id: "camera.front" },
        { entity_id: "camera.driveway" },
      ],
      companion_rotate_action: "double_column",
      type: "custom:camera-optics-card",
    });
    host.hass = {
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
      connection: { subscribeMessage: async () => () => undefined },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { type: string }) =>
        message.type === "camera_optics/reviews/list"
          ? { items: [] }
          : { ready: false },
    };
  });

  const live = card.locator("wzc-camera-live").first();
  await expect(live).toBeAttached();
  const playCountBeforeExit = await live.evaluate(async (element) => {
    const presentation = element as HTMLElement & {
      fallbackVideo?: HTMLVideoElement;
      selected?: "fallback" | "webrtc";
      updateComplete: Promise<boolean>;
    };
    const video = document.createElement("video");
    const state = { fullscreen: false, playCount: 0 };
    Object.defineProperty(video, "webkitDisplayingFullscreen", {
      configurable: true,
      get: () => state.fullscreen,
    });
    video.play = async () => {
      state.playCount += 1;
    };
    presentation.fallbackVideo = video;
    presentation.selected = "fallback";
    await presentation.updateComplete;
    (
      window as unknown as {
        nativeFullscreenTest?: {
          state: typeof state;
          video: HTMLVideoElement;
        };
      }
    ).nativeFullscreenTest = { state, video };
    state.fullscreen = true;
    video.dispatchEvent(new Event("webkitbeginfullscreen"));
    return state.playCount;
  });

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(card).not.toHaveClass(/companion-phone-landscape/);
  await page.setViewportSize({ width: 390, height: 844 });
  await live.evaluate(() => {
    const test = (
      window as unknown as {
        nativeFullscreenTest?: {
          state: { fullscreen: boolean; playCount: number };
          video: HTMLVideoElement;
        };
      }
    ).nativeFullscreenTest;
    if (!test) throw new Error("Native fullscreen test state was not created");
    test.state.fullscreen = false;
    test.video.dispatchEvent(new Event("webkitendfullscreen"));
  });
  await expect
    .poll(() =>
      live.evaluate(() => {
        const test = (
          window as unknown as {
            nativeFullscreenTest?: { state: { playCount: number } };
          }
        ).nativeFullscreenTest;
        return test?.state.playCount ?? 0;
      }),
    )
    .toBeGreaterThan(playCountBeforeExit);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(card).toHaveClass(/companion-phone-landscape/);
  expect(
    await live.evaluate((element) => {
      const test = (
        window as unknown as {
          nativeFullscreenTest?: { video: HTMLVideoElement };
        }
      ).nativeFullscreenTest;
      const video = test?.video;
      return {
        connected: video?.isConnected,
        retained:
          element.shadowRoot?.querySelector(".fallback-host video") === video,
      };
    }),
  ).toEqual({ connected: true, retained: true });
});

test("choreographs two Companion surfaces into 60/40 landscape columns", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Home Assistant/2026.9 Mobile/HomeAssistant, like Safari",
    });
  });
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate(async (element) => {
    const host = element as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
      updateComplete: Promise<boolean>;
    };
    document.body.style.margin = "0";
    const header = document.createElement("div");
    header.dataset.testHaHeader = "";
    header.style.cssText =
      "position:fixed;z-index:100;inset:0 0 auto;height:56px;background:rgb(1,2,3)";
    document.body.append(header);
    host.style.marginTop = "56px";
    host.setConfig({
      cameras: [
        {
          additional_camera: {
            entity_id: "camera.rear",
            layout: "side_by_side",
          },
          entity_id: "camera.front",
          title: "Front A/B",
        },
        { entity_id: "camera.rear", title: "Rear" },
        { entity_id: "camera.hall", title: "Hall" },
      ],
      card_height_mode_phone: "fit_viewport",
      camera_rounded_corners_phone: false,
      type: "custom:camera-optics-card",
    });
    host.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
        "camera.rear": {
          entity_id: "camera.rear",
          state: "streaming",
          attributes: { friendly_name: "Rear" },
        },
        "camera.hall": {
          entity_id: "camera.hall",
          state: "streaming",
          attributes: { friendly_name: "Hall" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      hassUrl: (path: string) => path,
      callService: async () => undefined,
      callWS: async (message: { type: string }) =>
        message.type === "camera_optics/reviews/list"
          ? {
              items: Array.from({ length: 5 }, (_, index) => ({
                analysis_description:
                  index === 0 ? "A person is standing near the door." : null,
                analysis_title: index === 0 ? "Person at door" : null,
                camera: "front",
                classification: "detection",
                clip_url: null,
                end_time: 1_700_000_020 - index,
                id: `landscape-review-${index}`,
                labels: ["person"],
                media_end_time: 1_700_000_025 - index,
                media_start_time: 1_699_999_995 - index,
                playback_sources: [
                  {
                    content_type: "video/mp4",
                    transport: "file",
                    url: `/landscape-review-${index}.mp4`,
                  },
                ],
                preferred_transport: "file",
                preview_url: null,
                revision: `landscape-revision-${index}`,
                related_event_ids: index === 0 ? ["landscape-event-0"] : [],
                reviewed: false,
                snapshot_url: null,
                start_time: 1_700_000_000 - index,
                sub_labels: [],
                thumbnail_url: null,
                zones: [],
              })),
            }
          : { ready: false },
    };
    await host.updateComplete;
    const camera = host.shadowRoot?.querySelector<HTMLElement>(
      '[data-layout-node$="default-camera-module"]',
    );
    if (!camera) throw new Error("Camera placement was not rendered");
    camera.dataset.landscapeIdentity = "stable";
  });

  const phoneCarousel = card.locator("wzc-camera .camera-carousel");
  const phoneViews = card.locator("wzc-camera wzc-camera-view");
  await expect(phoneCarousel.locator(".swiper-slide")).toHaveCount(3);
  await expect(card.locator("wzc-camera-group-view")).toHaveCount(0);
  await phoneCarousel.evaluate((element) =>
    (
      element as HTMLElement & {
        swiper: { slideTo(index: number, speed: number): void };
      }
    ).swiper.slideTo(1, 0),
  );
  await expect
    .poll(() =>
      phoneViews.evaluateAll((views) =>
        views.map(
          (view) => (view as HTMLElement & { connect: boolean }).connect,
        ),
      ),
    )
    .toEqual([false, true, false]);
  await phoneCarousel.evaluate((element) =>
    (
      element as HTMLElement & {
        swiper: { slideTo(index: number, speed: number): void };
      }
    ).swiper.slideTo(0, 0),
  );

  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-stage-variant",
    "phone",
  );
  const portraitSurfaces = await card.evaluate((element) => {
    const root = element.shadowRoot;
    const placement = (suffix: string) => {
      const value = root?.querySelector<HTMLElement>(
        `[data-layout-node$="${suffix}"]`,
      );
      if (!value) throw new Error(`${suffix} placement was not rendered`);
      return value.getBoundingClientRect();
    };
    const cameraSurface = placement("default-camera-surface");
    const toolbar = placement("default-activity-navigation-module");
    const activitySurface = placement("default-activity-surface");
    return {
      activityGap: Math.round(activitySurface.top - cameraSurface.bottom),
      cameraTrailingSpace: Math.round(cameraSurface.bottom - toolbar.bottom),
    };
  });
  expect(Math.abs(portraitSurfaces.cameraTrailingSpace)).toBeLessThanOrEqual(
    16,
  );
  expect(portraitSurfaces.activityGap).toBeGreaterThanOrEqual(0);
  expect(portraitSurfaces.activityGap).toBeLessThanOrEqual(16);
  await card.evaluate((element) => {
    element.style.setProperty("--wzc-companion-landscape-inline-inset", "42px");
  });
  await card.locator(".stage-grid").evaluate((stage) => {
    stage.dataset.testTransformMotions = "0";
    stage.dataset.testCenteredMotions = "0";
    stage.dataset.testOpacityMotions = "0";
    stage.dataset.testRotateMotions = "0";
    stage.dataset.testRotationStarts = "";
    const card = (stage.getRootNode() as ShadowRoot).host;
    new MutationObserver(() => {
      if (stage.dataset.stageVariant === "default") {
        stage.dataset.testLandscapeClassAtDefaultVariant = String(
          card.classList.contains("companion-phone-landscape"),
        );
      }
    }).observe(stage, { attributeFilter: ["data-stage-variant"] });
    for (const placement of stage.querySelectorAll<HTMLElement>(
      ".stage-placement[data-layout-node]",
    )) {
      const nativeAnimate = placement.animate.bind(placement);
      placement.animate = ((
        keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        options?: number | KeyframeAnimationOptions,
      ) => {
        const serialized = JSON.stringify(keyframes);
        if (
          serialized.includes("translate(") &&
          serialized.includes("scale(")
        ) {
          stage.dataset.testTransformMotions = String(
            Number(stage.dataset.testTransformMotions ?? "0") + 1,
          );
          stage.dataset.testHandlePresentAtMotionStart = String(
            Boolean(
              (stage.getRootNode() as ShadowRoot).querySelector(
                ".companion-camera-pull-handle",
              ),
            ),
          );
        }
        if (
          serialized.includes("transformOrigin") &&
          serialized.includes("50% 50%")
        ) {
          stage.dataset.testCenteredMotions = String(
            Number(stage.dataset.testCenteredMotions ?? "0") + 1,
          );
        }
        if (serialized.includes("opacity")) {
          stage.dataset.testOpacityMotions = String(
            Number(stage.dataset.testOpacityMotions ?? "0") + 1,
          );
        }
        if (serialized.includes("rotate(")) {
          stage.dataset.testRotateMotions = String(
            Number(stage.dataset.testRotateMotions ?? "0") + 1,
          );
          const start = serialized.match(/rotate\((-?90)deg\)/)?.[1];
          if (start) {
            stage.dataset.testRotationStarts = [
              stage.dataset.testRotationStarts,
              start,
            ]
              .filter(Boolean)
              .join(",");
          }
        }
        return nativeAnimate(keyframes, options);
      }) as typeof placement.animate;
    }
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(card).toHaveClass(/companion-phone-landscape/);
  expect(
    await page.evaluate(
      () =>
        document.elementFromPoint(10, 10) ===
        document.querySelector("[data-test-ha-header]"),
    ),
  ).toBe(false);
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-stage-variant",
    "default",
  );
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-test-landscape-class-at-default-variant",
    "true",
  );
  await expect
    .poll(() =>
      card.locator(".stage-grid").getAttribute("data-test-transform-motions"),
    )
    .toBe("2");
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-test-opacity-motions",
    "0",
  );
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-test-rotate-motions",
    "2",
  );
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-test-centered-motions",
    "2",
  );
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-test-rotation-starts",
    "-90,-90",
  );
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-test-handle-present-at-motion-start",
    "false",
  );
  await expect(card).not.toHaveClass(
    /companion-phone-orientation-transitioning/,
  );
  await expect(card.locator(".stage-grid")).toHaveCSS("transform", "none");
  expect(
    await card
      .locator(".stage-grid")
      .evaluate((stage) => stage.getAnimations().length),
  ).toBe(0);
  expect(
    await card
      .locator(".stage-placement[data-layout-node]")
      .evaluateAll((placements) =>
        placements.every((placement) => placement.getAnimations().length === 0),
      ),
  ).toBe(true);
  expect(
    await card
      .locator("ha-card")
      .evaluate((card) => card.getAnimations().length),
  ).toBe(0);
  const transitioningOutline = card
    .locator("wzc-reviews .thumbnail-wrap.detection")
    .first();
  expect(
    await transitioningOutline.evaluate(
      (element) => getComputedStyle(element, "::after").borderTopWidth,
    ),
  ).not.toBe("0px");
  const activityNavigation = card.locator("wzc-activity-navigation");
  await expect(activityNavigation.locator("button")).toHaveCount(7);
  const navigationButtonHeights = await activityNavigation
    .locator("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
  expect(navigationButtonHeights.every((height) => height >= 44)).toBe(true);
  expect(
    await card
      .locator("wzc-camera-view .stage-resize-handle")
      .evaluateAll((handles) =>
        handles.every(
          (handle) => getComputedStyle(handle).visibility === "hidden",
        ),
      ),
  ).toBe(true);
  await expect(card.locator("wzc-camera .camera-carousel")).not.toHaveCSS(
    "border-radius",
    "0px",
  );
  await expect(card.locator("wzc-reviews .tile")).toHaveCount(5);
  const firstLandscapeTile = card.locator("wzc-reviews .tile").first();
  const reviewState = firstLandscapeTile.locator(".review-state");
  await expect(reviewState.locator(".review-state-label")).toHaveCSS(
    "display",
    "none",
  );
  const footerControls = await Promise.all(
    [
      reviewState,
      firstLandscapeTile.locator(".analysis-title"),
      firstLandscapeTile.locator(".review-info"),
    ].map((control) => control.boundingBox()),
  );
  expect(footerControls.every((bounds) => bounds !== null)).toBe(true);
  const footerCenters = footerControls.map(
    (bounds) => (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
  );
  expect(
    Math.max(...footerCenters) - Math.min(...footerCenters),
  ).toBeLessThanOrEqual(1);
  expect(footerControls[0]?.width).toBeCloseTo(
    footerControls[0]?.height ?? 0,
    0,
  );
  const activityViewport = await card
    .locator("wzc-reviews .viewport")
    .boundingBox();
  const activityTiles = await card
    .locator("wzc-reviews .tile")
    .evaluateAll((tiles) =>
      tiles.map((tile) => {
        const rect = tile.getBoundingClientRect();
        return { bottom: rect.bottom, top: rect.top };
      }),
    );
  expect(activityViewport).not.toBeNull();
  expect(activityTiles[2]?.bottom).toBeLessThanOrEqual(
    (activityViewport?.y ?? 0) + (activityViewport?.height ?? 0) + 1,
  );
  expect(activityTiles[3]?.top).toBeGreaterThanOrEqual(
    (activityViewport?.y ?? 0) + (activityViewport?.height ?? 0) - 1,
  );
  const geometry = await card.evaluate((element) => {
    const host = element as HTMLElement;
    const root = host.shadowRoot;
    const placement = (suffix: string) => {
      const value = root?.querySelector<HTMLElement>(
        `[data-layout-node$="${suffix}"]`,
      );
      if (!value) throw new Error(`${suffix} placement was not rendered`);
      return value;
    };
    const camera = placement("default-camera-module");
    const cameraSurface = placement("default-camera-surface");
    const navigation = placement("default-camera-navigation-module");
    const activity = placement("default-activity-stack");
    const activitySurface = placement("default-activity-surface");
    const activityNavigation = placement("default-activity-navigation-module");
    const cameraRect = camera.getBoundingClientRect();
    const cameraSurfaceRect = cameraSurface.getBoundingClientRect();
    const navigationRect = navigation.getBoundingClientRect();
    const activityRect = activity.getBoundingClientRect();
    const activitySurfaceRect = activitySurface.getBoundingClientRect();
    const activityNavigationRect = activityNavigation.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    return {
      activityHeight: Math.round(activityRect.height),
      activityLeft: Math.round(activityRect.left),
      activityOverflow: getComputedStyle(activity).overflow,
      activityRight: Math.round(activityRect.right),
      activityTop: Math.round(activityRect.top),
      activitySurfaceBottom: Math.round(activitySurfaceRect.bottom),
      activitySurfaceLeft: Math.round(activitySurfaceRect.left),
      activitySurfaceTop: Math.round(activitySurfaceRect.top),
      activityNavigationBottom: Math.round(activityNavigationRect.bottom),
      activityNavigationHeight: Math.round(activityNavigationRect.height),
      activityNavigationLeft: Math.round(activityNavigationRect.left),
      activityNavigationRight: Math.round(activityNavigationRect.right),
      activityNavigationTop: Math.round(activityNavigationRect.top),
      cameraAspectRatio: cameraRect.width / cameraRect.height,
      cameraHeight: Math.round(navigationRect.bottom - cameraRect.top),
      cameraLeft: Math.round(cameraRect.left),
      cameraNavigationBottom: Math.round(navigationRect.bottom),
      cameraNavigationTop: Math.round(navigationRect.top),
      cameraRight: Math.round(cameraRect.right),
      cameraTop: Math.round(cameraRect.top),
      cameraSurfaceBottom: Math.round(cameraSurfaceRect.bottom),
      cameraSurfaceLeft: Math.round(cameraSurfaceRect.left),
      cameraSurfaceTop: Math.round(cameraSurfaceRect.top),
      columnRatio: cameraRect.width / activityRect.width,
      gutter: Math.round(activityRect.left - cameraRect.right),
      host: {
        height: Math.round(hostRect.height),
        left: Math.round(hostRect.left),
        top: Math.round(hostRect.top),
        width: Math.round(hostRect.width),
      },
      placementAnimations: Array.from(
        root?.querySelectorAll<HTMLElement>(
          ".stage-placement[data-layout-node]",
        ) ?? [],
      ).flatMap((placement) => placement.getAnimations()).length,
      navigationOverflow: getComputedStyle(navigation).overflow,
      stableCamera: camera.dataset.landscapeIdentity,
      surfaceMembership: {
        activityContainsStack: activitySurface.contains(activity),
        activityContainsToolbar: activitySurface.contains(activityNavigation),
        cameraContainsCamera: cameraSurface.contains(camera),
        cameraContainsNavigation: cameraSurface.contains(navigation),
        cameraContainsToolbar: cameraSurface.contains(activityNavigation),
      },
    };
  });
  const activityTitle = await card
    .locator("wzc-reviews wzc-media-day-header .label")
    .boundingBox();

  expect(geometry).toEqual({
    activityHeight: geometry.activityHeight,
    activityLeft: expect.any(Number),
    activityOverflow: "visible",
    activityRight: expect.any(Number),
    activityTop: expect.any(Number),
    activitySurfaceBottom: expect.any(Number),
    activitySurfaceLeft: expect.any(Number),
    activitySurfaceTop: expect.any(Number),
    activityNavigationBottom: expect.any(Number),
    activityNavigationHeight: expect.any(Number),
    activityNavigationLeft: expect.any(Number),
    activityNavigationRight: expect.any(Number),
    activityNavigationTop: expect.any(Number),
    cameraAspectRatio: geometry.cameraAspectRatio,
    cameraHeight: expect.any(Number),
    cameraLeft: expect.any(Number),
    cameraNavigationBottom: expect.any(Number),
    cameraNavigationTop: expect.any(Number),
    cameraRight: expect.any(Number),
    cameraTop: expect.any(Number),
    cameraSurfaceBottom: expect.any(Number),
    cameraSurfaceLeft: expect.any(Number),
    cameraSurfaceTop: expect.any(Number),
    columnRatio: geometry.columnRatio,
    gutter: expect.any(Number),
    host: { height: 390, left: 0, top: 0, width: 844 },
    navigationOverflow: "visible",
    placementAnimations: 0,
    stableCamera: "stable",
    surfaceMembership: {
      activityContainsStack: true,
      activityContainsToolbar: false,
      cameraContainsCamera: true,
      cameraContainsNavigation: true,
      cameraContainsToolbar: true,
    },
  });
  expect(geometry.activityLeft).toBeGreaterThan(geometry.cameraLeft);
  expect(geometry.activityRight).toBeLessThan(geometry.host.width);
  expect(activityTitle).not.toBeNull();
  expect(Math.abs((activityTitle?.y ?? 0) - geometry.activityTop)).toBeLessThan(
    8,
  );
  expect(activityTitle?.y).toBeCloseTo(geometry.cameraTop, 0);
  expect(geometry.activityNavigationLeft).toBeCloseTo(geometry.cameraLeft, 0);
  expect(
    Math.abs(geometry.activityNavigationRight - geometry.cameraRight),
  ).toBeLessThanOrEqual(3);
  expect(geometry.activityNavigationBottom).toBeCloseTo(
    geometry.host.height - 16,
    0,
  );
  expect(geometry.activityNavigationBottom).toBeLessThanOrEqual(
    geometry.host.height,
  );
  expect(geometry.activityNavigationTop).toBeGreaterThan(
    geometry.cameraNavigationTop,
  );
  expect(
    geometry.cameraNavigationBottom - geometry.activityNavigationTop,
  ).toBeLessThanOrEqual(8);
  expect(geometry.activityNavigationHeight).toBeGreaterThan(0);
  expect(geometry.cameraAspectRatio).toBeCloseTo(16 / 9, 2);
  expect(geometry.cameraLeft).toBeCloseTo(42, 0);
  expect(geometry.columnRatio).toBeCloseTo(3 / 2, 2);
  expect(geometry.gutter).toBeGreaterThanOrEqual(15);
  expect(geometry.cameraSurfaceTop).toBeCloseTo(geometry.activitySurfaceTop, 0);
  expect(geometry.cameraSurfaceBottom).toBeCloseTo(
    geometry.activitySurfaceBottom,
    0,
  );
  expect(geometry.activityHeight).toBeLessThanOrEqual(
    geometry.host.height + 32,
  );

  const pullHandle = card.locator(".companion-camera-pull-handle");
  const cameraPlacement = card.locator(
    '.stage-placement[data-layout-node$="default-camera-module"]',
  );
  const activityScroller = card.locator("wzc-reviews .scroller");
  const retainedScrollTop = await activityScroller.evaluate((element) => {
    element.scrollTop = 24;
    return element.scrollTop;
  });
  await expect(pullHandle).toHaveAttribute("role", "slider");
  await expect(pullHandle).toHaveAttribute("aria-valuenow", "0");
  const collapsedHandle = await pullHandle.boundingBox();
  expect(collapsedHandle).not.toBeNull();
  const collapsedHandleCenter =
    (collapsedHandle?.x ?? 0) + (collapsedHandle?.width ?? 0) / 2;
  expect(collapsedHandleCenter).toBeCloseTo(
    (geometry.cameraRight + geometry.activityLeft) / 2,
    0,
  );
  const handlePresentation = await pullHandle.evaluate((element) => {
    const style = getComputedStyle(element);
    const grip = getComputedStyle(element, "::before");
    return {
      secondaryText: style.getPropertyValue("--wzc-color-text-2").trim(),
      gripBorderWidth: Number.parseFloat(grip.borderWidth),
      color: style.color,
      gripColor: grip.backgroundColor,
      gripHeight: Number.parseFloat(grip.height),
      gripWidth: Number.parseFloat(grip.width),
    };
  });
  expect(handlePresentation.gripWidth).toBe(3);
  expect(handlePresentation.gripHeight).toBeGreaterThanOrEqual(128);
  expect(handlePresentation.gripBorderWidth).toBe(0);
  expect(handlePresentation.gripColor).toBe(handlePresentation.color);
  expect(handlePresentation.secondaryText).not.toBe("");
  const pullTravel =
    geometry.host.left + geometry.host.width - 52 - collapsedHandleCenter;
  const cameraCarousel = card.locator("wzc-camera .camera-carousel");
  await cameraCarousel.evaluate((element) =>
    element.classList.add("activity-alert"),
  );
  expect(
    await cameraCarousel.evaluate(
      (element) => getComputedStyle(element, "::after").borderTopWidth,
    ),
  ).not.toBe("0px");
  await page.mouse.move(
    collapsedHandleCenter,
    (collapsedHandle?.y ?? 0) + (collapsedHandle?.height ?? 0) / 2,
  );
  await page.mouse.down();
  expect(
    await cameraCarousel.evaluate(
      (element) => getComputedStyle(element, "::after").borderTopWidth,
    ),
  ).toBe("0px");
  const activeRowPositions = await card.evaluate((element) => {
    const root = element.shadowRoot;
    const top = (suffix: string) =>
      root
        ?.querySelector<HTMLElement>(`[data-layout-node$="${suffix}"]`)
        ?.getBoundingClientRect().top;
    return {
      activityNavigationTop: top("default-activity-navigation-module"),
      cameraNavigationTop: top("default-camera-navigation-module"),
    };
  });
  expect(activeRowPositions.activityNavigationTop).toBeCloseTo(
    geometry.activityNavigationTop,
    0,
  );
  expect(activeRowPositions.cameraNavigationTop).toBeCloseTo(
    geometry.cameraNavigationTop,
    0,
  );
  await page.mouse.move(
    (collapsedHandle?.x ?? 0) + pullTravel * 0.4,
    (collapsedHandle?.y ?? 0) + (collapsedHandle?.height ?? 0) / 2,
    { steps: 4 },
  );
  await expect
    .poll(() =>
      phoneViews.evaluateAll((views) =>
        views.map(
          (view) => (view as HTMLElement & { connect: boolean }).connect,
        ),
      ),
    )
    .toEqual([true, false, false]);
  await page.mouse.up();
  await expect(card).not.toHaveClass(/landscape-camera-overlay-active/);
  await expect(pullHandle).toHaveAttribute("aria-valuenow", "0");
  expect(
    await cameraCarousel.evaluate(
      (element) => getComputedStyle(element, "::after").borderTopWidth,
    ),
  ).not.toBe("0px");

  const resetHandle = await pullHandle.boundingBox();
  await page.mouse.move(
    (resetHandle?.x ?? 0) + (resetHandle?.width ?? 0) / 2,
    (resetHandle?.y ?? 0) + (resetHandle?.height ?? 0) / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    (resetHandle?.x ?? 0) + pullTravel * 0.65,
    (resetHandle?.y ?? 0) + (resetHandle?.height ?? 0) / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(card).toHaveClass(/landscape-camera-overlay-expanded/);
  await expect(pullHandle).toHaveAttribute("aria-valuenow", "100");
  await expect(card).not.toHaveClass(/landscape-camera-overlay-settling/);
  await expect(cameraPlacement).toHaveCSS("position", "absolute");
  const expandedCamera = await cameraPlacement.boundingBox();
  expect(expandedCamera?.x).toBeCloseTo(geometry.host.left, 0);
  expect(expandedCamera?.y).toBeCloseTo(geometry.host.top, 0);
  expect(expandedCamera?.width).toBeCloseTo(geometry.host.width, 0);
  expect(expandedCamera?.height).toBeCloseTo(geometry.host.height, 0);
  const expandedCameraContent = await cameraPlacement
    .locator("wzc-camera-view .camera")
    .first()
    .boundingBox();
  expect(expandedCameraContent?.x).toBeCloseTo(geometry.host.left, 0);
  expect(expandedCameraContent?.y).toBeCloseTo(geometry.host.top, 0);
  expect(expandedCameraContent?.width).toBeCloseTo(geometry.host.width, 0);
  expect(expandedCameraContent?.height).toBeCloseTo(geometry.host.height, 0);
  await expect(cameraPlacement).toHaveCSS("--wzc-live-fit", "contain");
  const expandedStacking = await card.evaluate((element) => {
    const root = element.shadowRoot;
    const camera = root?.querySelector<HTMLElement>(
      '[data-layout-node$="default-camera-module"]',
    );
    const cameraSurface = root?.querySelector<HTMLElement>(
      '[data-layout-node$="default-camera-surface"]',
    );
    const handle = root?.querySelector<HTMLElement>(
      ".companion-camera-pull-handle",
    );
    const toolbar = root?.querySelector<HTMLElement>(
      '[data-layout-node$="default-activity-navigation-module"]',
    );
    if (!camera || !cameraSurface || !handle || !toolbar) {
      throw new Error("Expanded camera stacking surfaces were not rendered");
    }
    const toolbarRect = toolbar.getBoundingClientRect();
    const topElement = root?.elementFromPoint(
      toolbarRect.left + 8,
      toolbarRect.top + toolbarRect.height / 2,
    );
    return {
      cameraSurfaceZ: getComputedStyle(cameraSurface).zIndex,
      cameraZ: getComputedStyle(camera).zIndex,
      handleZ: getComputedStyle(handle).zIndex,
      toolbarCovered: Boolean(topElement && camera.contains(topElement)),
    };
  });
  expect(expandedStacking).toEqual({
    cameraSurfaceZ: "30",
    cameraZ: "20",
    handleZ: "31",
    toolbarCovered: true,
  });
  await expect(cameraPlacement).toHaveAttribute(
    "data-landscape-identity",
    "stable",
  );
  expect(await cameraPlacement.locator("wzc-camera").count()).toBe(1);
  await expect
    .poll(() =>
      phoneViews.evaluateAll((views) =>
        views.map(
          (view) => (view as HTMLElement & { connect: boolean }).connect,
        ),
      ),
    )
    .toEqual([true, false, false]);
  expect(await activityScroller.evaluate((element) => element.scrollTop)).toBe(
    retainedScrollTop,
  );

  await pullHandle.press("Home");
  await expect(card).not.toHaveClass(/landscape-camera-overlay-active/);
  await expect(pullHandle).toHaveAttribute("aria-valuenow", "0");
  await card
    .locator("wzc-camera-navigation button")
    .filter({ hasText: "Front A/B" })
    .click();
  await expect
    .poll(() =>
      phoneViews.evaluateAll((views) =>
        views.map(
          (view) => (view as HTMLElement & { connect: boolean }).connect,
        ),
      ),
    )
    .toEqual([false, true, false]);

  await pullHandle.press("End");
  await expect(card).toHaveClass(/landscape-camera-overlay-expanded/);
  await expect
    .poll(() =>
      phoneViews.evaluateAll((views) =>
        views.map(
          (view) => (view as HTMLElement & { connect: boolean }).connect,
        ),
      ),
    )
    .toEqual([false, true, false]);
  await pullHandle.press("Home");
  await card
    .locator("wzc-camera-navigation button")
    .filter({ hasText: "Hall" })
    .click();
  await expect
    .poll(() =>
      phoneViews.evaluateAll((views) =>
        views.map(
          (view) => (view as HTMLElement & { connect: boolean }).connect,
        ),
      ),
    )
    .toEqual([false, false, true]);
  await pullHandle.press("End");
  await expect(card).toHaveClass(/landscape-camera-overlay-expanded/);
  await expect(phoneCarousel.locator(".swiper-slide")).toHaveCount(3);
  await expect
    .poll(() =>
      phoneViews.evaluateAll((views) =>
        views.map(
          (view) => (view as HTMLElement & { connect: boolean }).connect,
        ),
      ),
    )
    .toEqual([false, false, true]);
  await pullHandle.press("Home");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).not.toHaveClass(/companion-phone-landscape/);
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-stage-variant",
    "phone",
  );
  await expect
    .poll(() =>
      card.locator(".stage-grid").getAttribute("data-test-transform-motions"),
    )
    .toBe("4");
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-test-opacity-motions",
    "0",
  );
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-test-rotate-motions",
    "4",
  );
  await expect(card.locator(".stage-grid")).toHaveAttribute(
    "data-test-rotation-starts",
    "-90,-90,90,90",
  );
  await expect(card.locator(".stage-grid")).toHaveCSS("transform", "none");
  await expect(card).not.toHaveClass(
    /companion-phone-orientation-transitioning/,
  );
  const portraitGeometry = await card.evaluate((element) => {
    const root = element.shadowRoot;
    const placement = (suffix: string) => {
      const value = root?.querySelector<HTMLElement>(
        `[data-layout-node$="${suffix}"]`,
      );
      if (!value) throw new Error(`${suffix} placement was not rendered`);
      return value.getBoundingClientRect();
    };
    const cameraSurface = placement("default-camera-surface");
    const toolbar = placement("default-activity-navigation-module");
    const activitySurface = placement("default-activity-surface");
    return {
      activityGap: Math.round(activitySurface.top - cameraSurface.bottom),
      cameraTrailingSpace: Math.round(cameraSurface.bottom - toolbar.bottom),
      headerOnTop:
        document.elementFromPoint(10, 10) ===
        document.querySelector("[data-test-ha-header]"),
      top: element.getBoundingClientRect().top,
    };
  });
  expect(portraitGeometry).toEqual({
    activityGap: expect.any(Number),
    cameraTrailingSpace: expect.any(Number),
    headerOnTop: true,
    top: 56,
  });
  expect(Math.abs(portraitGeometry.cameraTrailingSpace)).toBeLessThanOrEqual(
    16,
  );
  expect(portraitGeometry.activityGap).toBeGreaterThanOrEqual(0);
  expect(portraitGeometry.activityGap).toBeLessThanOrEqual(16);
  expect(
    await card
      .locator(".stage-placement[data-layout-node]")
      .evaluateAll((placements) =>
        placements.every((placement) => placement.getAnimations().length === 0),
      ),
  ).toBe(true);
  const withoutHeader = await card.evaluate((element) => {
    document.querySelector("[data-test-ha-header]")?.remove();
    element.style.marginTop = "0";
    return element.getBoundingClientRect().top;
  });
  expect(withoutHeader).toBe(0);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(card).toHaveClass(/companion-phone-landscape/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).not.toHaveClass(/companion-phone-landscape/);
  await expect(card).not.toHaveClass(
    /companion-phone-orientation-transitioning/,
  );
  expect(
    await card
      .locator(".stage-grid")
      .evaluate((stage) => stage.getAnimations().length),
  ).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(card).toHaveClass(/companion-phone-landscape/);
  await expect(card).not.toHaveClass(
    /companion-phone-orientation-transitioning/,
  );
  expect(
    await card
      .locator(".stage-grid")
      .evaluate((stage) => stage.getAnimations().length),
  ).toBe(0);
  await expect(card.locator(".stage-grid")).toHaveCSS("transform", "none");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).not.toHaveClass(/companion-phone-landscape/);
});

test("exposes and honors the CameraOptics semantic theme-token contract", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
  await card.evaluate((element) => {
    (
      element as HTMLElement & {
        setConfig(config: unknown): void;
      }
    ).setConfig({
      type: "custom:camera-optics-card",
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
      "--wzc-color-info",
      "--wzc-color-success",
      "--wzc-activity-alert-color",
      "--wzc-activity-detection-color",
      "--wzc-review-reviewed-color",
      "--wzc-review-unreviewed-color",
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
    host.style.setProperty("--secondary-text-color", "rgb(70, 80, 90)");
    host.style.setProperty("--ha-color-text-secondary", "rgb(170, 180, 190)");
    host.style.setProperty("--error-color", "rgb(1, 2, 3)");
    host.style.setProperty("--warning-color", "rgb(4, 5, 6)");
    host.style.setProperty("--info-color", "rgb(7, 8, 9)");
    host.style.setProperty("--success-color", "rgb(10, 11, 12)");
    host.style.setProperty(
      "--ha-color-fill-danger-loud-resting",
      "rgb(13, 14, 15)",
    );
    host.style.setProperty(
      "--ha-color-fill-warning-loud-resting",
      "rgb(16, 17, 18)",
    );
    host.style.setProperty(
      "--ha-color-fill-success-loud-resting",
      "rgb(19, 20, 21)",
    );
    host.style.setProperty("--ha-color-border-danger-quiet", "rgb(22, 23, 24)");
    host.style.setProperty(
      "--ha-color-border-warning-normal",
      "rgb(25, 26, 27)",
    );
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
    const resolveColor = (token: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${token})`;
      host.shadowRoot?.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
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
      secondaryTextColor: resolveColor("--wzc-color-text-2"),
      errorColor: resolveColor("--wzc-color-error"),
      warningColor: resolveColor("--wzc-color-warning"),
      infoColor: resolveColor("--wzc-color-info"),
      successColor: resolveColor("--wzc-color-success"),
      activityAlertColor: resolveColor("--wzc-activity-alert-color"),
      activityDetectionColor: resolveColor("--wzc-activity-detection-color"),
      reviewedColor: resolveColor("--wzc-review-reviewed-color"),
      unreviewedColor: resolveColor("--wzc-review-unreviewed-color"),
      errorFill: resolveColor("--wzc-color-fill-error"),
      warningFill: resolveColor("--wzc-color-fill-warning"),
      successFill: resolveColor("--wzc-color-fill-success"),
      dangerBorder: resolveColor("--wzc-color-border-danger"),
      warningBorder: resolveColor("--wzc-color-border-warning"),
      popoverBackground: hostStyle
        .getPropertyValue("--wzc-popover-background")
        .trim(),
      popoverBackdropFilter: hostStyle
        .getPropertyValue("--wzc-popover-backdrop-filter")
        .trim(),
      popoverRadius: hostStyle.getPropertyValue("--wzc-popover-radius").trim(),
      popoverShadow: hostStyle.getPropertyValue("--wzc-popover-shadow").trim(),
      reversedTextColor,
      taskBackground: hostStyle
        .getPropertyValue("--wzc-task-dialog-background")
        .trim(),
      taskBackdropFilter: hostStyle
        .getPropertyValue("--wzc-task-dialog-backdrop-filter")
        .trim(),
      taskRadius: hostStyle.getPropertyValue("--wzc-task-dialog-radius").trim(),
      taskShadow: hostStyle.getPropertyValue("--wzc-task-dialog-shadow").trim(),
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
    secondaryTextColor: "rgb(70, 80, 90)",
    errorColor: "rgb(1, 2, 3)",
    warningColor: "rgb(4, 5, 6)",
    infoColor: "rgb(7, 8, 9)",
    successColor: "rgb(10, 11, 12)",
    activityAlertColor: "rgb(219, 68, 55)",
    activityDetectionColor: "rgb(255, 166, 0)",
    reviewedColor: "rgb(67, 160, 71)",
    unreviewedColor: "rgb(255, 166, 0)",
    errorFill: "rgb(13, 14, 15)",
    warningFill: "rgb(16, 17, 18)",
    successFill: "rgb(19, 20, 21)",
    dangerBorder: "rgb(22, 23, 24)",
    warningBorder: "rgb(25, 26, 27)",
    overriddenPlacementGaps: [7, 7, 0],
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
  expect(result.popoverBackground).toBe(result.taskBackground);
  expect(result.popoverBackdropFilter).toBe(result.taskBackdropFilter);
  expect(result.popoverRadius).toBe(result.taskRadius);
  expect(result.popoverShadow).toBe(result.taskShadow);
});

test("camera selection does not recursively republish dirty state", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

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
      "camera-optics-card",
    ) as TestCardConstructor;
    const previewCard = document.querySelector(
      "camera-optics-card",
    ) as PreviewCard;
    previewCard.preview = true;
    previewCard.setConfig({
      type: "custom:camera-optics-card",
      title: "Camera",
    });
    const editor = await cardConstructor.getConfigElement();
    editor.setConfig({
      type: "custom:camera-optics-card",
      title: "Camera",
    });
    const dialog = document.createElement("hui-dialog-edit-card") as TestDialog;
    dialog._cardConfig = {
      type: "custom:camera-optics-card",
      title: "Camera",
    };
    dialog._updateDirtyState = () => undefined;
    const root = dialog.attachShadow({ mode: "open" });
    const save = document.createElement("button");
    save.slot = "primaryAction";
    root.append(editor, save);
    document.body.append(dialog);
    await editor.updateComplete;
    const cameraSection = editor.shadowRoot?.querySelector(
      'wzc-accordion-item[item-key="camera"]',
    );
    const cameraDetails = cameraSection?.shadowRoot?.querySelector("details");
    if (cameraDetails) {
      cameraDetails.open = true;
      cameraDetails.dispatchEvent(new Event("toggle"));
    }
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
      .querySelector("camera-optics-card")
      ?.shadowRoot?.textContent?.includes(
        "Select a camera in the card editor.",
      );
    save.click();
    const writesBeforeReopen = writes;

    const reopened = await cardConstructor.getConfigElement();
    reopened.setConfig(dialog._cardConfig);
    document.body.append(reopened);
    await reopened.updateComplete;
    const reopenedCameraSection = reopened.shadowRoot?.querySelector(
      'wzc-accordion-item[item-key="camera"]',
    );
    const reopenedCameraDetails =
      reopenedCameraSection?.shadowRoot?.querySelector("details");
    if (reopenedCameraDetails) {
      reopenedCameraDetails.open = true;
      reopenedCameraDetails.dispatchEvent(new Event("toggle"));
    }
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
  await waitForCameraOpticsDefinition(page);
  await page.evaluate(async () => {
    const constructor = customElements.get(
      "camera-optics-card",
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
      type: "custom:camera-optics-card",
      title: "Accordion",
    });
    document.body.append(editor);
    await editor.updateComplete;
  });

  const editor = page.locator("#accordion-editor");
  const items = editor.locator("wzc-accordion-item");
  const stageManagement = editor.locator(
    'wzc-accordion-item[item-key="stage-management"]',
  );
  const liveMedia = editor.locator(
    'wzc-accordion-item[item-key="live-media-player"]',
  );
  const reviews = editor.locator('wzc-accordion-item[item-key="reviews"]');
  await expect(items).toHaveCount(8);
  await expect(items.locator("details[open]")).toHaveCount(0);
  await expect(
    items.locator("ha-selector, ha-input, wzc-segmented-control"),
  ).toHaveCount(0);
  await items.nth(0).locator("summary").click();
  await expect(items.nth(0).locator("details")).toHaveAttribute("open", "");
  await stageManagement.locator("summary").click();
  await expect(items.nth(0).locator("details")).not.toHaveAttribute("open", "");
  await expect(stageManagement.locator("details")).toHaveAttribute("open", "");
  const stageTypeInputs = stageManagement.locator('input[name="stage-type"]');
  await expect(stageTypeInputs).toHaveCount(3);
  await expect(stageTypeInputs.nth(0)).toBeEnabled();
  await expect(stageTypeInputs.nth(2)).toBeChecked();
  await expect(
    stageManagement.locator('input[data-stage-profile="default"]'),
  ).toBeChecked();
  await expect(stageManagement).toContainText("Default");
  await reviews.locator("summary").click();
  const reviewHistory = reviews.locator(
    'ha-selector[label="Days of Reviews to Display"]',
  );
  await expect(reviewHistory).toHaveCount(1);
  const reviewRows = reviews.locator(".review-settings-list > ha-selector");
  await expect(reviewRows).toHaveCount(5);
  await expect(
    reviews.locator('[data-config-key="display_object_badges"]'),
  ).toHaveCount(1);
  await expect(
    reviews.locator('[data-config-key="display_event_type_badges"]'),
  ).toHaveCount(1);
  await expect(reviews.locator('[data-config-key="display_zone"]')).toHaveCount(
    1,
  );
  await expect(reviewRows.nth(1)).toHaveCSS("border-top-style", "solid");
  const thumbnailOutline = reviews.locator(
    '[data-setting="alert-detection-thumbnail-outline"]',
  );
  await expect(thumbnailOutline).toHaveCount(1);
  await expect(thumbnailOutline.locator('[data-value="both"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    editor
      .locator('wzc-accordion-item[item-key="general"]')
      .locator('ha-selector[label="Days of Reviews to Display"]'),
  ).toHaveCount(0);
  expect(
    await reviewHistory.evaluate(
      (
        element: HTMLElement & {
          selector?: {
            number?: { mode?: string; slider_ticks?: boolean };
          };
        },
      ) => element.selector?.number,
    ),
  ).toMatchObject({ mode: "slider", slider_ticks: true });
  await liveMedia.locator("summary").click();
  const selectionBars = liveMedia.locator("wzc-segmented-control");
  await expect(selectionBars).toHaveCount(5);
  const activityHighlight = liveMedia.locator(
    '[data-setting="alert-detection-highlight"]',
  );
  await expect(
    activityHighlight.locator('[data-value="both"]'),
  ).toHaveAttribute("aria-checked", "true");
  const ptzBar = liveMedia.locator('[data-setting="ptz-overlay-control"]');
  const transitionBar = liveMedia.locator('[data-setting="slide-transition"]');
  const ptzSelection = ptzBar.locator('[data-value="start_open"]');
  const transitionSelection = transitionBar.locator('[data-value="slide"]');
  await expect(transitionSelection).toHaveAttribute("aria-checked", "true");
  await expect(transitionBar.locator(".segmented-control")).toHaveCSS(
    "border-style",
    "none",
  );
  expect(
    await transitionBar
      .locator(".segmented-control")
      .evaluate((bar) => getComputedStyle(bar).boxShadow),
  ).not.toBe("none");
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
  await expect(reviews.locator("ha-selector")).toHaveCount(0);

  const status = editor.locator(
    'wzc-toast-region .toast[data-severity="success"]',
  );
  await expect(status).toContainText("No pending changes.");
  await expect(status).toHaveCSS("backdrop-filter", "none");
  const general = editor.locator('wzc-accordion-item[item-key="general"]');
  await general.locator("summary").click();
  await expect(general.locator("ha-input")).toHaveCount(1);
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
  await expect(general).toHaveAttribute("pending", "");

  await stageManagement.locator("summary").click();
  await expect(general.locator("details")).not.toHaveAttribute("open", "");
  await expect(general).toHaveAttribute("pending", "");
  expect(
    await general
      .locator("summary")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe(
    await stageManagement
      .locator("summary")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  );
  await stageManagement.locator('input[value="minimal_camera_only"]').check();
  const interactions = editor.locator(
    'wzc-accordion-item[item-key="interactions"]',
  );
  await expect(interactions).toHaveCount(1);
  await interactions.locator("summary").click();
  const interactionForm = interactions.locator("ha-form.primary-interaction");
  await expect(interactionForm).toHaveCount(1);
  expect(
    await interactionForm.evaluate(
      (
        element: HTMLElement & {
          data?: { tap_action?: { action?: string } };
          schema?: Array<{
            selector?: { ui_action?: { actions?: string[] } };
          }>;
        },
      ) => ({
        actions: element.schema?.[0]?.selector?.ui_action?.actions,
        tapAction: element.data?.tap_action?.action,
      }),
    ),
  ).toEqual({
    actions: [
      "open-live-view",
      "toggle",
      "navigate",
      "url",
      "perform-action",
      "assist",
      "none",
    ],
    tapAction: "open-live-view",
  });
  const addInteraction = interactions.locator(".add-interaction > ha-button");
  await expect(addInteraction).toHaveCount(1);
  await addInteraction.click();
  await interactions
    .locator('.add-interaction-choices [data-interaction="double_tap_action"]')
    .click();
  const removeInteraction = interactions.locator(
    '.remove-interaction-action [data-interaction="double_tap_action"]',
  );
  await expect(removeInteraction).toContainText("Remove");
  expect(
    await interactions.locator(".optional-interaction ha-form").evaluate(
      (
        element: HTMLElement & {
          schema?: Array<{
            selector?: { ui_action?: { actions?: string[] } };
          }>;
        },
      ) => element.schema?.[0]?.selector?.ui_action?.actions,
    ),
  ).toContain("open-live-view");
  await interactions
    .locator(".optional-interaction ha-form")
    .evaluate((element) => {
      element.dispatchEvent(
        new CustomEvent("value-changed", {
          bubbles: true,
          composed: true,
          detail: {
            value: { double_tap_action: { action: "open-live-view" } },
          },
        }),
      );
    });
  await removeInteraction.click();
  await expect(removeInteraction).toHaveCount(0);
  const minimalConfiguration = editor.locator(
    'wzc-accordion-item[item-key="minimal-camera-configuration"]',
  );
  await minimalConfiguration.locator("summary").click();
  await expect(interactionForm).toHaveCount(0);
  await expect(
    minimalConfiguration.locator('ha-selector[label="Show Source Label"]'),
  ).toHaveCount(1);
});

test("keeps the editor shell uniform and nested tasks independently solid", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.evaluate(async () => {
    const card = document.querySelector("camera-optics-card") as HTMLElement & {
      setConfig(config: unknown): void;
    };
    card.style.setProperty("--ha-card-background", "rgba(255, 255, 255, 0.14)");
    card.setConfig({ type: "custom:camera-optics-card" });

    const constructor = customElements.get(
      "camera-optics-card",
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
    editor.setConfig({ type: "custom:camera-optics-card" });
    dialogRoot.append(editor);
    document.body.append(dialog);
    await editor.updateComplete;
  });

  const cardSurface = page.locator("camera-optics-card ha-card");
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
  await waitForCameraOpticsDefinition(page);
  const card = page.locator("camera-optics-card");
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
      type: "custom:camera-optics-card",
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
  await waitForCameraOpticsDefinition(page);
  await page.evaluate(async () => {
    const constructor = customElements.get(
      "camera-optics-card",
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
      type: "custom:camera-optics-card",
      cameras: [{ entity_id: "camera.front" }],
    });
    document.body.append(editor);
    await editor.updateComplete;
  });

  const editor = page.locator("#camera-config-editor");
  await editor.locator("wzc-accordion-item").first().locator("summary").click();
  await editor.locator('[aria-label="Edit camera: front"]').click();

  const cameraDialog = editor.locator(".camera-editor-dialog");
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
  await expect(items.nth(0).locator(".summary-text")).toHaveText("front");
  await expect(items.nth(1).locator(".summary-text")).toHaveText(
    "Home Assistant",
  );
  const initialDialogBounds = await cameraDialog.boundingBox();
  expect(initialDialogBounds).not.toBeNull();
  expect(initialDialogBounds?.height).toBeLessThanOrEqual(
    (page.viewportSize()?.height ?? 0) - 32,
  );
  const compactHeader = await items
    .nth(1)
    .locator("summary")
    .first()
    .boundingBox();
  expect(compactHeader?.height).toBeLessThanOrEqual(44);

  await items.nth(1).locator("summary").first().click();
  await expect(items.locator("details[open]")).toHaveCount(1);
  await expect(items.nth(0).locator("details")).not.toHaveAttribute("open", "");
  await expect(items.nth(1).locator("h3")).toHaveText("Connection Source");
  await items.nth(3).locator("summary").last().click();
  await expect(items.locator("details[open]")).toHaveCount(1);
  await expect(items.nth(0).locator("details")).not.toHaveAttribute("open", "");
  await expect(items.nth(3).locator("details")).toHaveAttribute("open", "");
  await items.nth(0).locator("summary").last().click();
  await expect(items.locator("details[open]")).toHaveCount(1);
  await expect(items.nth(0).locator("details")).toHaveAttribute("open", "");
  await expect(items.nth(3).locator("details")).not.toHaveAttribute("open", "");
  await items.nth(0).locator("summary").click();
  await expect(items.locator("details[open]")).toHaveCount(0);
  const collapsedDialogBounds = await cameraDialog.boundingBox();
  expect(collapsedDialogBounds?.y).toBeCloseTo(initialDialogBounds?.y ?? 0, 1);
  expect(collapsedDialogBounds?.height).toBeCloseTo(
    initialDialogBounds?.height ?? 0,
    1,
  );
  await items.nth(4).locator("summary").click();
  await expect(items.nth(4).locator("details")).toHaveAttribute("open", "");
  const optionsDialogBounds = await cameraDialog.boundingBox();
  expect(optionsDialogBounds?.y).toBeCloseTo(initialDialogBounds?.y ?? 0, 1);
  expect(optionsDialogBounds?.height).toBeCloseTo(
    initialDialogBounds?.height ?? 0,
    1,
  );
  await expect(cameraDialog.locator("footer")).toBeInViewport();
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
  await waitForCameraOpticsDefinition(page);
  await page.evaluate(async () => {
    const constructor = customElements.get(
      "camera-optics-card",
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
      type: "custom:camera-optics-card",
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
    "Porch",
  );
  const reopenedItems = editor.locator(
    ".camera-dialog-accordion > wzc-accordion-item",
  );
  await expect(reopenedItems.nth(0).locator("details")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(reopenedItems.nth(2).locator("details")).toHaveAttribute(
    "open",
    "",
  );
  await expect(reopenedItems.locator("details[open]")).toHaveCount(1);
  await expect(reopenedItems.nth(0).locator(".summary-text")).toHaveText(
    "Porch",
  );
  await expect(reopenedItems.nth(2).locator(".summary-text")).toHaveText(
    "Street View · Stacked · Frigate go2rtc",
  );
  await expect(reopenedItems.nth(4).locator(".summary-text")).toHaveText(
    "Muted",
  );
  await expect(
    reopenedItems.nth(2).locator('ha-selector[label="Second Camera"]'),
  ).toHaveJSProperty("value", "camera.driveway");
  await expect(
    reopenedItems.nth(2).locator(".secondary-connection-source"),
  ).toHaveJSProperty("value", "frigate_go2rtc");
  await expect(reopenedItems.nth(2).locator("h3")).toHaveText(
    "Connection Source",
  );
  const [layoutBox, connectionHeadingBox] = await Promise.all([
    reopenedItems.nth(2).locator("wzc-segmented-control").boundingBox(),
    reopenedItems.nth(2).locator("h3").boundingBox(),
  ]);
  expect(layoutBox).not.toBeNull();
  expect(connectionHeadingBox).not.toBeNull();
  expect(layoutBox?.y).toBeLessThan(connectionHeadingBox?.y ?? 0);
  await expect(
    editor.locator(".camera-group-name-field ha-input"),
  ).toHaveJSProperty("value", "Entry Pair");
});

test("editor camera drag handles reorder the configured cameras", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);
  await page.evaluate(async () => {
    const constructor = customElements.get(
      "camera-optics-card",
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
      type: "custom:camera-optics-card",
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
  await waitForCameraOpticsDefinition(page);

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
      type: "custom:camera-optics-card",
      title: "Appearance",
      cameras: [{ entity_id: "camera.front" }],
    };
    const card = document.querySelector("camera-optics-card") as TestCard;
    card.preview = true;
    card.setConfig(baseline);
    const constructor = customElements.get(
      "camera-optics-card",
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

    const openSection = async (key: string): Promise<void> => {
      const section = editor.shadowRoot?.querySelector(
        `wzc-accordion-item[item-key="${key}"]`,
      );
      const details = section?.shadowRoot?.querySelector("details");
      if (!details) throw new Error(`Editor section ${key} was not rendered`);
      if (!details.open) {
        details.open = true;
        details.dispatchEvent(new Event("toggle"));
      }
      await editor.updateComplete;
    };
    await openSection("camera");

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

    await openSection("layout");
    await customElements.whenDefined("wzc-editor-height-selector");
    const heightSettings = editor.shadowRoot?.querySelector(
      "wzc-editor-height-selector",
    ) as HTMLElement & { updateComplete: Promise<boolean> };
    await heightSettings.updateComplete;
    const selector = heightSettings.shadowRoot?.querySelector(
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
        heightSettings.shadowRoot?.querySelector(
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

test("restores controls after pre-editor and retains a replaced live connection", async ({
  page,
}) => {
  await page.route("**/api/camera_proxy/**", (route) =>
    route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>',
      contentType: "image/svg+xml",
    }),
  );
  await page.goto("/");
  await waitForCameraOpticsDefinition(page);

  await page.evaluate(async () => {
    interface TestCard extends HTMLElement {
      hass: unknown;
      setConfig(config: unknown): void;
    }

    interface TestWindow extends Window {
      __wzcTestConnectionCount: number;
      __wzcTestHlsConnectionCount: number;
      __wzcTestHass: unknown;
      __wzcTestPipCount: number;
      __wzcTestRetainedVideo?: HTMLVideoElement;
      __wzcTestWebRtcPauseCount: number;
      __wzcTestWebRtcRemoveCount: number;
    }

    const testWindow = window as unknown as TestWindow;
    testWindow.__wzcTestConnectionCount = 0;
    testWindow.__wzcTestHlsConnectionCount = 0;
    testWindow.__wzcTestPipCount = 0;
    testWindow.__wzcTestWebRtcPauseCount = 0;
    testWindow.__wzcTestWebRtcRemoveCount = 0;
    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      value: null,
      writable: true,
    });

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
        if (message.type === "camera_optics/camera/runtime/subscribe") {
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
        if (message.type === "camera_optics/live/camera/ready") {
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
        if (message.type === "camera_optics/camera/runtime/set") {
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

    const first = document.querySelector("camera-optics-card") as TestCard;
    first.setConfig({
      type: "custom:camera-optics-card",
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
    const testWindow = window as typeof window & {
      __wzcTestPipCount: number;
      __wzcTestRetainedVideo?: HTMLVideoElement;
      __wzcTestWebRtcPauseCount: number;
      __wzcTestWebRtcRemoveCount: number;
    };
    const video = element as HTMLVideoElement;
    const nativePause = video.pause.bind(video);
    const nativeRemove = video.remove.bind(video);
    video.pause = () => {
      testWindow.__wzcTestWebRtcPauseCount += 1;
      nativePause();
    };
    video.remove = () => {
      testWindow.__wzcTestWebRtcRemoveCount += 1;
      nativeRemove();
    };
    video.requestPictureInPicture = async () => {
      testWindow.__wzcTestPipCount += 1;
      (
        document as Document & {
          pictureInPictureElement: Element | null;
        }
      ).pictureInPictureElement = video;
      video.dispatchEvent(new Event("enterpictureinpicture"));
      return {} as PictureInPictureWindow;
    };
    (
      window as typeof window & { __wzcTestRetainedVideo?: HTMLVideoElement }
    ).__wzcTestRetainedVideo = video;
  });

  expect(
    await page.evaluate(async () => {
      const card = document.querySelector("camera-optics-card") as HTMLElement;
      const camera = card.shadowRoot?.querySelector("wzc-camera");
      const view = camera?.shadowRoot?.querySelector("wzc-camera-view");
      const presentation = view?.shadowRoot?.querySelector(
        "wzc-camera-live",
      ) as
        | (HTMLElement & {
            revealOverlay(): void;
            updateComplete: Promise<unknown>;
          })
        | null;
      const controls = presentation?.shadowRoot?.querySelector(
        "wzc-camera-controls",
      ) as (HTMLElement & { visible: boolean }) | null;
      if (!presentation || !controls) return false;

      presentation.revealOverlay();
      await presentation.updateComplete;
      const editWrapper = document.createElement("hui-section-edit-mode");
      card.replaceWith(editWrapper);
      editWrapper.append(card);
      await presentation.updateComplete;
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, composed: true }),
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      await presentation.updateComplete;
      const hiddenInPreview = controls.visible === false;
      editWrapper.replaceWith(card);
      return hiddenInPreview;
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __wzcTestWebRtcPauseCount: number })
          .__wzcTestWebRtcPauseCount,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __wzcTestWebRtcRemoveCount: number })
          .__wzcTestWebRtcRemoveCount,
    ),
  ).toBe(0);
  await expect(page.locator("wzc-camera wzc-camera-controls")).toHaveJSProperty(
    "visible",
    true,
  );
  expect(
    await initialVideo.evaluate(
      (element) =>
        element ===
        (
          window as typeof window & {
            __wzcTestRetainedVideo?: HTMLVideoElement;
          }
        ).__wzcTestRetainedVideo,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __wzcTestConnectionCount: number;
            }
          ).__wzcTestConnectionCount,
      ),
    )
    .toBe(1);

  await page.evaluate(() => {
    const testWindow = window as unknown as Window & {
      __wzcTestHass: unknown;
    };
    const routePageHide = new Event("pagehide");
    Object.defineProperty(routePageHide, "persisted", { value: false });
    window.dispatchEvent(routePageHide);
    const first = document.querySelector("camera-optics-card");
    first?.remove();
    const replacement = document.createElement(
      "camera-optics-card",
    ) as HTMLElement & {
      hass: unknown;
      setConfig(config: unknown): void;
    };
    replacement.setConfig({
      type: "custom:camera-optics-card",
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
  await video.evaluate((element) => {
    const retainedVideo = element as HTMLVideoElement;
    Object.defineProperty(retainedVideo, "currentTime", {
      configurable: true,
      value: retainedVideo.currentTime + 0.1,
    });
    retainedVideo.dispatchEvent(new Event("timeupdate"));
  });
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
  const pip = page.locator(
    'wzc-camera wzc-camera-controls [data-control="picture_in_picture"]',
  );
  await page.locator("wzc-camera wzc-camera-live .viewport").hover();
  await expect(pip).toBeVisible();
  await expect(pip).toBeEnabled();
  await pip.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __wzcTestPipCount: number })
            .__wzcTestPipCount,
      ),
    )
    .toBe(1);
  await expect(video).not.toHaveAttribute("disablepictureinpicture", "");
  expect(
    await video.evaluate(
      (element) => document.pictureInPictureElement === element,
    ),
  ).toBe(true);
  await page.mouse.move(0, 0);
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
    .locator("camera-optics-card")
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
  expect(layoutSizing.fixedHeight).toBeCloseTo(
    layoutSizing.naturalHeight ?? Number.NaN,
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
  const cardShell = page.locator("camera-optics-card ha-card");
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
        /translate3d\(0px, 0px, 0(?:px)?\) scale\(1\)/,
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
      element.dispatchEvent(
        new PointerEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId,
          pointerType: "touch",
        }),
      );
      return pointerDownAccepted;
    });
  expect(await dispatchLiveTouchTap()).toBe(true);
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
    .locator("camera-optics-card")
    .evaluate(async (element) => {
      const card = element as HTMLElement & {
        setConfig(config: unknown): void;
        updateComplete: Promise<boolean>;
      };
      const cameraBefore = card.shadowRoot?.querySelector("wzc-camera");
      card.setConfig({
        type: "custom:camera-optics-card",
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
  await page.locator("camera-optics-card").evaluate((element) => {
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

  await page.locator("camera-optics-card").evaluate((element) => {
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
  await viewport.dispatchEvent("click");
  await expect(controls.first()).toBeVisible();
  await expect(controls.first()).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await expect(mediaControlGroup).toHaveCSS("pointer-events", "none");
  await expect(mediaControlGroup).toHaveAttribute("inert", "");
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
  await viewport.dispatchEvent("click");
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
  await viewport.dispatchEvent("click");
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
  await viewport.dispatchEvent("click");
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
  await viewport.dispatchEvent("click");
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

  await expect(controls.first()).toBeHidden({
    timeout: MEDIA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
  await viewport.dispatchEvent("pointerdown", {
    clientX: 120,
    clientY: 80,
    isPrimary: true,
    pointerId: 5,
    pointerType: "touch",
  });
  await expect(controls.first()).toBeHidden();
  await viewport.dispatchEvent("pointercancel", {
    clientX: 120,
    clientY: 80,
    isPrimary: true,
    pointerId: 5,
    pointerType: "touch",
  });
  await expect(controls.first()).toBeHidden();

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
