import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { CAMERA_OVERLAY_HIDE_DELAY_MS } from "../../src/modules/camera/constants";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };
const expectedBuild = process.env.GITHUB_SHA?.slice(0, 7) ?? "local";
const expectedVersion = packageJson.version;
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
        .filter((name) => name.includes("/modules/camera/")),
    })),
  ).toEqual({ cameraDefined: false, cameraResources: [] });
  await expect(page.locator("watchzone-card")).toContainText(
    "No modules are configured.",
  );
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
        padding: disabledShellPadding,
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
          padding: enabledShellPadding,
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
    padding: "0px",
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
  expect(result.enabled.padding).not.toBe("0px");
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

    const pcAudioSelector = editor.shadowRoot?.querySelector(
      '[data-config-key="start_live_unmuted_pc_tablet"]',
    );
    pcAudioSelector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: true },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    const pcAudioEnabled =
      latestDirtyState?.start_live_unmuted_pc_tablet === true;
    pcAudioSelector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: false },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    const pcAudioDefaultOmitted = !(
      "start_live_unmuted_pc_tablet" in (latestDirtyState ?? {})
    );

    const phoneAudioSelector = editor.shadowRoot?.querySelector(
      '[data-config-key="start_live_unmuted_phone"]',
    );
    phoneAudioSelector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: true },
        bubbles: true,
        composed: true,
      }),
    );
    await editor.updateComplete;
    const phoneAudioEnabled =
      latestDirtyState?.start_live_unmuted_phone === true;

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
      savedPhoneAudio: dialog._cardConfig?.start_live_unmuted_phone,
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
          testWindow.__wzcTestConnectionCount += 1;
          return { configuration: { iceServers: [] } };
        }
        if (message.type === "camera/stream") {
          // Keep the hedged HLS candidate in startup so WebRTC takeover must
          // cancel it without producing an unhandled browser rejection.
          return new Promise(() => undefined);
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
  await expect
    .poll(() =>
      video.evaluate((element) => ({
        defaultMuted: (element as HTMLVideoElement).defaultMuted,
        muted: (element as HTMLVideoElement).muted,
      })),
    )
    .toEqual({ defaultMuted: false, muted: false });
  const connectionIndicator = page.locator("wzc-camera .source-indicator");
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
      const viewport = card.shadowRoot
        ?.querySelector("wzc-camera")
        ?.shadowRoot?.querySelector("wzc-camera-live")
        ?.shadowRoot?.querySelector<HTMLElement>(".viewport");
      const shell = card.shadowRoot?.querySelector<HTMLElement>("ha-card");
      card.style.inlineSize = "640px";
      card.style.blockSize = "auto";
      await frame();
      const natural = viewport?.getBoundingClientRect();

      card.style.blockSize = "240px";
      await frame();
      const fixed = viewport?.getBoundingClientRect();
      const fixedCard = shell?.getBoundingClientRect();
      const result = {
        fixedHeight: fixed?.height,
        fixedWithinCard: Boolean(
          fixed &&
          fixedCard &&
          fixed.top >= fixedCard.top &&
          fixed.bottom <= fixedCard.bottom,
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
  await liveViewport.press("Escape");
  await expect(mediaSurface).toHaveAttribute("style", /scale\(1\)/);
  await liveViewport.evaluate((element) => (element as HTMLElement).blur());
  await page.mouse.move(0, 0);
  await expect(controls).toHaveCount(5);
  await expect(controls.first()).toBeHidden({
    timeout: CAMERA_OVERLAY_HIDE_DELAY_MS + 1_000,
  });
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
      cameraSurface.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .toContain("rgb(4, 5, 6)");
  await page.locator("wzc-camera").evaluate(async (element) => {
    const camera = element as HTMLElement & {
      shadowStyle: "medium" | "none" | "small";
      updateComplete: Promise<boolean>;
    };
    camera.shadowStyle = "small";
    await camera.updateComplete;
  });
  await expect
    .poll(() =>
      cameraSurface.evaluate((element) => getComputedStyle(element).boxShadow),
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
      cameraSurface.evaluate((element) => getComputedStyle(element).boxShadow),
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
      const style = getComputedStyle(element);
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
  expect(indicatorPresentation.borderRadius).not.toBe("999px");
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
  ).toBeDisabled();
  await expect(
    page.locator('wzc-camera wzc-camera-controls [data-control="suspend"]'),
  ).toBeDisabled();
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
    .toBe(1);

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
