import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WatchZoneCard } from "../src/card/watchzone-card";
import type { WatchZoneCardConfig } from "../src/core/config";
import {
  CARD_TYPE,
  EDITOR_DIRTY_STATE_KEY,
  EDITOR_TEXT_PREVIEW_DELAY_MS,
} from "../src/core/constants";
import type { WatchZoneCardEditor } from "../src/editor/watchzone-card-editor";

interface ContextRequest extends Event {
  callback?: (context: {
    setState(config: WatchZoneCardConfig, key: string): void;
  }) => void;
  context?: string;
  subscribe?: boolean;
}

interface InputElement extends HTMLElement {
  value: string;
}

interface TestEditCardDialog extends HTMLElement {
  _cardConfig?: WatchZoneCardConfig;
  _updateDirtyState?: (config: WatchZoneCardConfig) => void;
}

function inputTitle(editor: WatchZoneCardEditor, title: string): InputElement {
  const input = editor.shadowRoot?.querySelector("ha-input") as InputElement;
  input.value = title;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  return input;
}

describe("watchzone-card-editor", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await import("../src/main");
    await import("../src/editor/watchzone-card-editor");
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("uses dirtyState and soft preview without config-changed while typing", async () => {
    const states: Array<{ config: WatchZoneCardConfig; key: string }> = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      if (request.context === "dirtyState") {
        request.callback?.({
          setState: (config, key) => states.push({ config, key }),
        });
      }
    };
    document.addEventListener("context-request", contextHandler);

    const card = document.createElement("watchzone-card") as WatchZoneCard;
    card.preview = true;
    card.setConfig({ type: CARD_TYPE, title: "Original" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Original" });
    const configChanged = vi.fn();
    editor.addEventListener("config-changed", configChanged);
    document.body.append(card, editor);
    await Promise.all([card.updateComplete, editor.updateComplete]);
    const originalCard = card.shadowRoot?.querySelector("ha-card");

    inputTitle(editor, "Draft title");
    await vi.advanceTimersByTimeAsync(EDITOR_TEXT_PREVIEW_DELAY_MS);
    await card.updateComplete;

    expect(configChanged).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({
      config: { type: CARD_TYPE, title: "Draft title" },
      key: EDITOR_DIRTY_STATE_KEY,
    });
    expect(card.shadowRoot?.textContent).toContain("Draft title");
    expect(card.shadowRoot?.querySelector("ha-card")).toBe(originalCard);

    editor.remove();
    await card.updateComplete;
    expect(card.shadowRoot?.textContent).toContain("Original");
    expect(card.shadowRoot?.querySelector("ha-card")).toBe(originalCard);
    document.removeEventListener("context-request", contextHandler);
  });

  it("uses one committed compatibility event when dirtyState is unavailable", async () => {
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Original" });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    document.body.append(editor);
    await editor.updateComplete;

    const input = inputTitle(editor, "Compatible draft");
    expect(changed).not.toHaveBeenCalled();
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].detail.config).toEqual({
      type: CARD_TYPE,
      title: "Compatible draft",
    });
  });

  it("previews, saves, and restores a selected camera", async () => {
    const states: WatchZoneCardConfig[] = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      request.callback?.({
        setState: (config) => states.push(config),
      });
    };
    document.addEventListener("context-request", contextHandler);
    const card = document.createElement("watchzone-card") as WatchZoneCard;
    card.preview = true;
    card.setConfig({ type: CARD_TYPE, title: "Camera" });
    const dialog = document.createElement(
      "hui-dialog-edit-card",
    ) as TestEditCardDialog;
    dialog._cardConfig = { type: CARD_TYPE, title: "Camera" };
    dialog._updateDirtyState = vi.fn();
    const dialogRoot = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Camera" });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    const save = document.createElement("button");
    save.slot = "primaryAction";
    let configSeenBySave: WatchZoneCardConfig | undefined;
    save.addEventListener("click", () => {
      configSeenBySave = dialog._cardConfig;
    });
    dialogRoot.append(editor, save);
    document.body.append(card, dialog);
    await Promise.all([card.updateComplete, editor.updateComplete]);
    const selector = editor.shadowRoot?.querySelector("ha-selector");

    selector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: "camera.front" },
        bubbles: true,
        composed: true,
      }),
    );
    await card.updateComplete;

    expect(changed).not.toHaveBeenCalled();
    expect(card.shadowRoot?.textContent).not.toContain(
      "Select a camera in the card editor.",
    );
    expect(states.at(-1)).toMatchObject({ camera_entity: "camera.front" });

    save.click();
    expect(configSeenBySave).toMatchObject({
      camera_entity: "camera.front",
    });
    expect(dialog._updateDirtyState).toHaveBeenCalledWith(configSeenBySave);

    const reopened = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    reopened.setConfig(configSeenBySave);
    document.body.append(reopened);
    await reopened.updateComplete;
    expect(
      (reopened.shadowRoot?.querySelector("ha-selector") as { value?: string })
        .value,
    ).toBe("camera.front");
    document.removeEventListener("context-request", contextHandler);
  });

  it("previews, saves, and restores card and camera appearance toggles", async () => {
    const states: WatchZoneCardConfig[] = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      request.callback?.({ setState: (config) => states.push(config) });
    };
    document.addEventListener("context-request", contextHandler);
    const card = document.createElement("watchzone-card") as WatchZoneCard;
    card.preview = true;
    card.setConfig({ type: CARD_TYPE, title: "Camera" });
    const dialog = document.createElement(
      "hui-dialog-edit-card",
    ) as TestEditCardDialog;
    dialog._cardConfig = { type: CARD_TYPE, title: "Camera" };
    dialog._updateDirtyState = vi.fn();
    const dialogRoot = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Camera" });
    const save = document.createElement("button");
    save.slot = "primaryAction";
    dialogRoot.append(editor, save);
    document.body.append(card, dialog);
    await Promise.all([card.updateComplete, editor.updateComplete]);

    for (const key of [
      "rounded_outer_corners",
      "outer_shadows",
      "outer_padding",
      "camera_rounded_corners",
      "camera_shadows",
    ]) {
      editor.shadowRoot
        ?.querySelector(`[data-config-key="${key}"]`)
        ?.dispatchEvent(
          new CustomEvent("value-changed", {
            detail: { value: false },
            bubbles: true,
            composed: true,
          }),
        );
      await card.updateComplete;
    }

    expect(states.at(-1)).toMatchObject({
      rounded_outer_corners: false,
      outer_shadows: false,
      outer_padding: false,
      camera_rounded_corners: false,
      camera_shadows: false,
    });
    const previewShell = card.shadowRoot?.querySelector("ha-card");
    expect(previewShell?.classList.contains("square-outer-corners")).toBe(true);
    expect(previewShell?.classList.contains("no-outer-shadow")).toBe(true);
    expect(previewShell?.classList.contains("no-outer-padding")).toBe(true);

    save.click();
    expect(dialog._cardConfig).toMatchObject({
      rounded_outer_corners: false,
      outer_shadows: false,
      outer_padding: false,
      camera_rounded_corners: false,
      camera_shadows: false,
    });
    const reopened = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    reopened.setConfig(dialog._cardConfig);
    document.body.append(reopened);
    await reopened.updateComplete;
    for (const key of [
      "rounded_outer_corners",
      "outer_shadows",
      "outer_padding",
      "camera_rounded_corners",
      "camera_shadows",
    ]) {
      expect(
        (
          reopened.shadowRoot?.querySelector(`[data-config-key="${key}"]`) as {
            value?: boolean;
          }
        ).value,
      ).toBe(false);
    }

    document.removeEventListener("context-request", contextHandler);
  });

  it("round-trips appearance toggles back to their defaults before Save", async () => {
    const states: WatchZoneCardConfig[] = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      request.callback?.({ setState: (config) => states.push(config) });
    };
    document.addEventListener("context-request", contextHandler);

    const baseline = { type: CARD_TYPE, title: "Camera" } as const;
    const card = document.createElement("watchzone-card") as WatchZoneCard;
    card.preview = true;
    card.setConfig(baseline);
    const dialog = document.createElement(
      "hui-dialog-edit-card",
    ) as TestEditCardDialog;
    dialog._cardConfig = baseline;
    dialog._updateDirtyState = vi.fn();
    const dialogRoot = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    editor.setConfig(baseline);
    const save = document.createElement("button");
    save.slot = "primaryAction";
    dialogRoot.append(editor, save);
    document.body.append(card, dialog);
    await Promise.all([card.updateComplete, editor.updateComplete]);

    for (const key of [
      "rounded_outer_corners",
      "outer_shadows",
      "outer_padding",
      "camera_rounded_corners",
      "camera_shadows",
    ] as const) {
      const selector = editor.shadowRoot?.querySelector(
        `[data-config-key="${key}"]`,
      );
      selector?.dispatchEvent(
        new CustomEvent("value-changed", {
          detail: { value: false },
          bubbles: true,
          composed: true,
        }),
      );
      await card.updateComplete;
      const outerClass =
        key === "rounded_outer_corners"
          ? "square-outer-corners"
          : key === "outer_shadows"
            ? "no-outer-shadow"
            : key === "outer_padding"
              ? "no-outer-padding"
              : undefined;
      if (outerClass) {
        expect(card.shadowRoot?.querySelector("ha-card")?.className).toContain(
          outerClass,
        );
      }

      selector?.dispatchEvent(
        new CustomEvent("value-changed", {
          detail: { value: true },
          bubbles: true,
          composed: true,
        }),
      );
      await card.updateComplete;
      if (outerClass) {
        expect(
          card.shadowRoot?.querySelector("ha-card")?.className,
        ).not.toContain(outerClass);
      }
      expect(states.at(-1)?.[key]).toBeUndefined();
    }

    save.click();
    expect(dialog._cardConfig).toEqual({
      type: CARD_TYPE,
      title: "Camera",
    });
    expect(dialog._updateDirtyState).toHaveBeenCalledWith(dialog._cardConfig);

    const reopened = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    reopened.setConfig(dialog._cardConfig);
    document.body.append(reopened);
    await reopened.updateComplete;
    for (const key of [
      "rounded_outer_corners",
      "outer_shadows",
      "outer_padding",
      "camera_rounded_corners",
      "camera_shadows",
    ]) {
      expect(
        (
          reopened.shadowRoot?.querySelector(`[data-config-key="${key}"]`) as {
            value?: boolean;
          }
        ).value,
      ).toBe(true);
    }

    document.removeEventListener("context-request", contextHandler);
  });

  it("uses a one-time dirty-state writer without subscribing", async () => {
    let publishContext: ContextRequest["callback"];
    let subscribed = false;
    let stateWrites = 0;
    const setState = (): void => {
      stateWrites += 1;
      if (subscribed) {
        publishContext?.({ setState });
      }
    };
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      subscribed = request.subscribe === true;
      publishContext = request.callback;
      request.callback?.({ setState });
    };
    document.addEventListener("context-request", contextHandler);
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Camera" });
    document.body.append(editor);
    await editor.updateComplete;

    editor.shadowRoot?.querySelector("ha-selector")?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: "camera.front" },
        bubbles: true,
        composed: true,
      }),
    );

    expect(stateWrites).toBe(2);
    expect(subscribed).toBe(false);
    document.removeEventListener("context-request", contextHandler);
  });

  it("commits the complete draft to Home Assistant immediately before Save", async () => {
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      request.callback?.({ setState: vi.fn() });
    };
    document.addEventListener("context-request", contextHandler);
    const dialog = document.createElement(
      "hui-dialog-edit-card",
    ) as TestEditCardDialog;
    dialog._cardConfig = {
      type: CARD_TYPE,
      title: "Original",
      grid_options: { columns: 8 },
    };
    dialog._updateDirtyState = vi.fn();
    const root = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    editor.setConfig({
      type: CARD_TYPE,
      title: "Original",
      grid_options: { columns: 8 },
    });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    const save = document.createElement("button");
    save.slot = "primaryAction";
    root.append(editor, save);
    document.body.append(dialog);
    await editor.updateComplete;

    const input = inputTitle(editor, "Saved draft");
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    save.click();

    expect(changed).not.toHaveBeenCalled();
    expect(dialog._cardConfig).toEqual({
      type: CARD_TYPE,
      title: "Saved draft",
      grid_options: { columns: 8 },
    });
    expect(dialog._updateDirtyState).toHaveBeenCalledWith(dialog._cardConfig);
    document.removeEventListener("context-request", contextHandler);
  });
});
