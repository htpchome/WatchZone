import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
const expectedBuild = process.env.GITHUB_SHA?.slice(0, 7) ?? "local";
const expectedVersion = packageJson.version;
const pageErrors = new WeakMap<Page, string[]>();

async function waitForWatchZoneDefinition(page: Page): Promise<void> {
  await page.waitForFunction(
    () => customElements.get("watchzone-card") !== undefined,
  );
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

  await expect(page.locator("watchzone-card")).toContainText("WatchZone");
  await expect(page.locator("watchzone-card ha-card")).toBeVisible();
  expect(
    consoleMessages.some(
      (message) =>
        message.includes("WatchZone") &&
        message.includes("CURRENT") &&
        message.includes(`v${expectedVersion} (${expectedBuild})`),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.watchZone)).toMatchObject({
    activeCardVersion: expectedVersion,
    build: expectedBuild,
    version: expectedVersion,
  });
  expect(
    await page.evaluate(() => typeof window.watchZone?.getLiveStartupTimings),
  ).toBe("function");
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
    editor.shadowRoot?.querySelector("ha-selector")?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: "camera.front" },
        bubbles: true,
        composed: true,
      }),
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
    const reopenedCamera = (
      reopened.shadowRoot?.querySelector("ha-selector") as HTMLElement & {
        value?: string;
      }
    ).value;

    document.removeEventListener("context-request", handleContext);
    return {
      previewUpdated,
      reopenedCamera,
      savedCamera: dialog._cardConfig?.camera_entity,
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
      __watchZoneTestConnectionCount: number;
      __watchZoneTestHass: unknown;
    }

    const testWindow = window as unknown as TestWindow;
    testWindow.__watchZoneTestConnectionCount = 0;

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
    const connection = {
      subscribeMessage: async () => () => undefined,
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
      callWS: async (message: { type: string }) => {
        if (message.type === "camera/webrtc/get_client_config") {
          testWindow.__watchZoneTestConnectionCount += 1;
          return { configuration: { iceServers: [] } };
        }
        return undefined;
      },
    };
    testWindow.__watchZoneTestHass = hass;

    const first = document.querySelector("watchzone-card") as TestCard;
    first.setConfig({
      type: "custom:watchzone-card",
      title: "Front",
      camera_entity: "camera.front",
    });
    first.hass = hass;
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const testWindow = window as unknown as Window & {
          __watchZoneTestConnectionCount: number;
        };
        return testWindow.__watchZoneTestConnectionCount;
      }),
    )
    .toBe(1);

  const poster = page.locator("watchzone-camera img.poster");
  await expect(poster).toHaveAttribute(
    "src",
    "/api/camera_proxy/camera.front?token=poster-token",
  );
  await expect(
    page.locator("watchzone-camera .generic-fallback"),
  ).toBeVisible();

  await page.evaluate(() => {
    const testWindow = window as unknown as Window & {
      __watchZoneTestHass: unknown;
    };
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
    });
    replacement.hass = testWindow.__watchZoneTestHass;
    document.body.append(replacement);
  });

  const video = page.locator("watchzone-camera video.webrtc");
  await video.evaluate((element) =>
    element.dispatchEvent(new Event("loadeddata")),
  );
  await expect(video).toBeVisible();
  await expect(page.locator("watchzone-camera .source-indicator")).toHaveText(
    "WebRTC",
  );
  const controls = page.locator(
    "watchzone-camera watchzone-camera-controls .control-button",
  );
  await expect(controls).toHaveCount(5);
  const controlPresentation = await controls.evaluateAll((buttons) => {
    const group = buttons[0]?.parentElement;
    const rectangles = buttons.map((button) => button.getBoundingClientRect());
    return {
      backgrounds: buttons.map(
        (button) => getComputedStyle(button).backgroundColor,
      ),
      gaps: rectangles.slice(1).map((rectangle, index) => {
        return rectangle.top - rectangles[index].bottom;
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
  await expect(
    page.locator(
      'watchzone-camera watchzone-camera-controls [data-control="snapshot"]',
    ),
  ).toBeDisabled();
  await expect(
    page.locator(
      'watchzone-camera watchzone-camera-controls [data-control="suspend"]',
    ),
  ).toBeDisabled();
  const mute = page.locator(
    'watchzone-camera watchzone-camera-controls [data-control="mute"]',
  );
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "false");
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
          __watchZoneTestConnectionCount: number;
        };
        return testWindow.__watchZoneTestConnectionCount;
      }),
    )
    .toBe(1);

  expect(
    await page.evaluate(
      () => window.watchZone?.getLiveStartupTimings()[0]?.phases,
    ),
  ).toMatchObject({
    adapter_imported: expect.any(Number),
    client_config_received: expect.any(Number),
    video_track_received: expect.any(Number),
  });
});
