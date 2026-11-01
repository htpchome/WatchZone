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

  it("hands the complete draft to Home Assistant immediately before Save", async () => {
    const dialog = document.createElement(
      "hui-dialog-edit-card",
    ) as HTMLElement & {
      _cardConfig?: WatchZoneCardConfig;
    };
    const root = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as WatchZoneCardEditor;
    editor.setConfig({
      type: CARD_TYPE,
      title: "Original",
      grid_options: { columns: 8 },
    });
    const save = document.createElement("button");
    save.slot = "primaryAction";
    root.append(editor, save);
    document.body.append(dialog);
    await editor.updateComplete;

    inputTitle(editor, "Saved draft");
    save.click();

    expect(dialog._cardConfig).toEqual({
      type: CARD_TYPE,
      title: "Saved draft",
      grid_options: { columns: 8 },
    });
  });
});
