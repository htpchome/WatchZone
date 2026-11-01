import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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
        message.includes("v0.0.4-dev.2 (local)"),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.watchZone)).toMatchObject({
    activeCardVersion: "0.0.4-dev.2",
    build: "local",
    version: "0.0.4-dev.2",
  });
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

  const stateWrites = await page.evaluate(async () => {
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
    const editor = await cardConstructor.getConfigElement();
    editor.setConfig({
      type: "custom:watchzone-card",
      title: "Camera",
    });
    document.body.append(editor);
    await editor.updateComplete;
    editor.shadowRoot?.querySelector("ha-selector")?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: "camera.front" },
        bubbles: true,
        composed: true,
      }),
    );

    document.removeEventListener("context-request", handleContext);
    return { subscribed, writes };
  });

  expect(stateWrites).toEqual({ subscribed: false, writes: 2 });
});

test("retains one live connection while the card presentation is replaced", async ({
  page,
}) => {
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
          attributes: { friendly_name: "Front" },
        },
      },
      connection,
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

  await expect(page.locator("watchzone-card-live video")).toBeVisible();
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
});
