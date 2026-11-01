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

  it("commits one complete camera draft through the public event", async () => {
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
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Camera" });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    document.body.append(card, editor);
    await Promise.all([card.updateComplete, editor.updateComplete]);
    const selector = editor.shadowRoot?.querySelector("ha-selector");

    selector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: "camera.front" },
        bubbles: true,
        composed: true,
      }),
    );
    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].detail.config).toMatchObject({
      camera_entity: "camera.front",
    });
    expect(states.at(-1)).toMatchObject({ camera_entity: "camera.front" });
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

  it("commits the complete draft through the public config event", async () => {
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
    document.body.append(editor);
    await editor.updateComplete;

    const input = inputTitle(editor, "Saved draft");
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].detail.config).toEqual({
      type: CARD_TYPE,
      title: "Saved draft",
      grid_options: { columns: 8 },
    });
  });
});
