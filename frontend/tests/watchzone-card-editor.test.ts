import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardCard } from "../src/card/watchzone-card";
import { normalizeCardConfig, type CardConfig } from "../src/core/config";
import type { HomeAssistantMessage } from "../src/core/home-assistant";
import {
  ACCORDION_ITEM_TAG,
  CARD_TYPE,
  EDITOR_DIRTY_STATE_KEY,
  EDITOR_TEXT_PREVIEW_DELAY_MS,
} from "../src/core/constants";
import type { AccordionItem } from "../src/ui/accordion";
import type { ToastRegion } from "../src/ui/toast-region";
import { iconPath } from "../src/ui/icons";
import type { CardEditor } from "../src/editor/watchzone-card-editor";

interface ContextRequest extends Event {
  callback?: (context: {
    setState(config: CardConfig, key: string): void;
  }) => void;
  context?: string;
  subscribe?: boolean;
}

interface InputElement extends HTMLElement {
  value: string;
}

interface TestBooleanSelector extends HTMLElement {
  value: boolean;
}

interface TestEditCardDialog extends HTMLElement {
  _cardConfig?: CardConfig;
  _updateDirtyState?: (config: CardConfig) => void;
}

function inputTitle(editor: CardEditor, title: string): InputElement {
  const input = editor.shadowRoot?.querySelector("ha-input") as InputElement;
  input.value = title;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  return input;
}

function setBooleanSelector(
  editor: CardEditor,
  selector: string,
  checked: boolean,
): TestBooleanSelector {
  const control = editor.shadowRoot?.querySelector(
    selector,
  ) as TestBooleanSelector;
  control.value = checked;
  control.dispatchEvent(
    new CustomEvent("value-changed", {
      detail: { value: checked },
      bubbles: true,
      composed: true,
    }),
  );
  return control;
}

describe("watchzone-card-editor", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    HTMLDialogElement.prototype.showModal ??= function (): void {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (): void {
      this.removeAttribute("open");
    };
    await import("../src/main");
    await import("../src/editor/watchzone-card-editor");
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("groups settings into closed accordions and reports draft status", async () => {
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Original" });
    document.body.append(editor);
    await editor.updateComplete;

    const items = [
      ...(editor.shadowRoot?.querySelectorAll<AccordionItem>(
        ACCORDION_ITEM_TAG,
      ) ?? []),
    ];
    expect(items.map((item) => item.heading)).toEqual([
      "Camera Settings",
      "General Settings",
      "Layout Settings",
    ]);
    expect(items.every((item) => !item.open)).toBe(true);
    const status = editor.shadowRoot?.querySelector(
      "wzc-toast-region",
    ) as ToastRegion;
    expect(status.notices[0]).toMatchObject({
      message: "No pending changes.",
      severity: "success",
    });

    inputTitle(editor, "Changed");
    await editor.updateComplete;
    expect(status.notices).toHaveLength(1);
    expect(status.notices[0]).toMatchObject({
      severity: "warning",
    });
  });

  it("uses a compact camera accordion and saves a sanitized camera title", async () => {
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.setConfig({
      type: CARD_TYPE,
      cameras: [{ entity_id: "camera.front" }],
    });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    document.body.append(editor);
    await editor.updateComplete;

    (
      editor.shadowRoot?.querySelector(
        '[aria-label="Edit camera: front"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;

    const accordion = editor.shadowRoot?.querySelector(
      ".camera-dialog-accordion",
    );
    const items = [
      ...(accordion?.querySelectorAll<AccordionItem>(ACCORDION_ITEM_TAG) ?? []),
    ];
    await Promise.all(items.map((item) => item.updateComplete));
    expect(items.map((item) => item.heading)).toEqual([
      "Camera",
      "Connection Source",
      "Additional Camera",
      "Lights",
      "Options and Controls",
    ]);
    expect(
      items.every((item) => item.getAttribute("density") === "compact"),
    ).toBe(true);
    expect(items[0]?.open).toBe(true);
    expect(items[1]?.summaryText).toBe("Home Assistant");
    expect(items[2]?.summaryText).toBe("Not configured");
    expect(
      editor.shadowRoot?.querySelectorAll("[data-camera-config-key]").length,
    ).toBe(5);
    expect(
      (
        editor.shadowRoot?.querySelector("ha-icon-button.dialog-close") as
          (HTMLElement & { path?: string }) | null
      )?.path,
    ).toBe(iconPath("close"));

    const input = editor.shadowRoot?.querySelector(
      ".camera-title-field ha-input",
    ) as InputElement;
    expect(input.getAttribute("label")).toBe("Camera Name");
    expect(input.getAttribute("placeholder")).toBe("Display name (optional)");
    expect(input.querySelector('.character-count[slot="end"]')).not.toBeNull();
    input.value = "  Front!  Door @12345678901234567890";
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await editor.updateComplete;

    expect(input.value).toBe("Front Door 1234567890123");
    expect(
      editor.shadowRoot?.querySelector(".character-count")?.textContent?.trim(),
    ).toBe("24/24");
    (
      editor.shadowRoot?.querySelector(
        'ha-button[appearance="accent"][variant="brand"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;

    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].detail.config.cameras[0].title).toBe(
      "Front Door 1234567890123",
    );
    expect(
      editor.shadowRoot?.querySelector(".camera-tile-copy span")?.textContent,
    ).toBe("Front Door 1234567890123");
  });

  it("confirms camera removal and exposes accessible edit and remove names", async () => {
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.setConfig({
      type: CARD_TYPE,
      cameras: [{ entity_id: "camera.front" }, { entity_id: "camera.back" }],
    });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    document.body.append(editor);
    await editor.updateComplete;

    const edit = editor.shadowRoot?.querySelector('[title="Edit Camera"]');
    const remove = editor.shadowRoot?.querySelector(
      '[title="Remove camera"]',
    ) as HTMLElement;
    expect(edit?.getAttribute("aria-label")).toBe("Edit camera: front");
    expect(remove.getAttribute("aria-label")).toBe("Remove camera: front");

    remove.click();
    await editor.updateComplete;
    const dialog = editor.shadowRoot?.querySelector(
      ".remove-camera-dialog",
    ) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain(
      "Are you sure you want to remove “front” from this card?",
    );
    (
      dialog.querySelector('ha-button[variant="neutral"]') as HTMLElement
    ).click();
    await editor.updateComplete;
    expect(dialog.open).toBe(false);
    expect(changed).not.toHaveBeenCalled();

    remove.click();
    await editor.updateComplete;
    (
      dialog.querySelector('ha-button[variant="danger"]') as HTMLElement
    ).click();
    await editor.updateComplete;
    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].detail.config.cameras).toEqual([
      { entity_id: "camera.back" },
    ]);
  });

  it("adds, cancels, limits, and removes linked Home Assistant lights", async () => {
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
        "light.porch": {
          entity_id: "light.porch",
          state: "off",
          attributes: { friendly_name: "Porch" },
        },
        "light.driveway": {
          entity_id: "light.driveway",
          state: "on",
          attributes: { friendly_name: "Driveway" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      callService: async () => undefined,
      callWS: async () => undefined,
      hassUrl: (path: string) => path,
    };
    editor.setConfig({
      type: CARD_TYPE,
      cameras: [{ entity_id: "camera.front" }],
    });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    document.body.append(editor);
    await editor.updateComplete;
    (
      editor.shadowRoot?.querySelector(
        '[aria-label="Edit camera: Front"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;

    const selectLight = async (entityId: string): Promise<void> => {
      (editor.shadowRoot?.querySelector(".add-light") as HTMLElement).click();
      await editor.updateComplete;
      editor.shadowRoot
        ?.querySelector(".pending-light-selector")
        ?.dispatchEvent(
          new CustomEvent("value-changed", {
            bubbles: true,
            composed: true,
            detail: { value: entityId },
          }),
        );
      await editor.updateComplete;
    };

    await selectLight("light.porch");
    expect(
      (
        editor.shadowRoot?.querySelector(".pending-light-icon-selector") as
          (HTMLElement & { required?: boolean; value?: string }) | null
      )?.value,
    ).toBe("mdi:lightbulb");
    expect(
      (
        editor.shadowRoot?.querySelector(".pending-light-icon-selector") as
          (HTMLElement & { required?: boolean }) | null
      )?.required,
    ).toBe(false);
    editor.shadowRoot
      ?.querySelector(".pending-light-icon-selector")
      ?.dispatchEvent(
        new CustomEvent("value-changed", {
          bubbles: true,
          composed: true,
          detail: { value: "" },
        }),
      );
    await editor.updateComplete;
    expect(
      (
        editor.shadowRoot?.querySelector(".pending-light-icon-selector") as
          (HTMLElement & { value?: string }) | null
      )?.value,
    ).toBe("mdi:lightbulb");
    editor.shadowRoot
      ?.querySelector(".pending-light-icon-selector")
      ?.dispatchEvent(
        new CustomEvent("value-changed", {
          bubbles: true,
          composed: true,
          detail: { value: "mdi:coach-lamp" },
        }),
      );
    await editor.updateComplete;
    (
      editor.shadowRoot?.querySelector(
        '.add-light-form ha-button[variant="brand"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;
    expect(
      editor.shadowRoot?.querySelectorAll(".linked-light-row"),
    ).toHaveLength(1);
    expect(
      editor.shadowRoot?.querySelector(".remove-light")?.getAttribute("title"),
    ).toBe("Remove light");
    expect(
      editor.shadowRoot?.querySelector(".remove-light path")?.getAttribute("d"),
    ).toBe(iconPath("remove"));
    expect(
      editor.shadowRoot
        ?.querySelector(".linked-light-row")
        ?.contains(editor.shadowRoot.querySelector(".light-icon-selector")!),
    ).toBe(true);
    expect(
      (
        editor.shadowRoot?.querySelector(".light-icon-selector") as
          (HTMLElement & { required?: boolean }) | null
      )?.required,
    ).toBe(false);
    expect(
      (
        editor.shadowRoot?.querySelector(".linked-light-row > ha-icon") as
          (HTMLElement & { icon?: string }) | null
      )?.icon,
    ).toBe("mdi:coach-lamp");
    editor.shadowRoot?.querySelector(".light-icon-selector")?.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        composed: true,
        detail: { value: "" },
      }),
    );
    await editor.updateComplete;
    expect(
      (
        editor.shadowRoot?.querySelector(".linked-light-row > ha-icon") as
          (HTMLElement & { icon?: string }) | null
      )?.icon,
    ).toBe("mdi:lightbulb");

    await selectLight("light.porch");
    expect(
      editor.shadowRoot?.querySelector(".add-light-feedback")?.textContent,
    ).toContain("already linked");
    expect(
      (
        editor.shadowRoot?.querySelector(
          '.add-light-form ha-button[variant="brand"]',
        ) as HTMLElement & { disabled?: boolean }
      ).disabled,
    ).toBe(true);
    (
      editor.shadowRoot?.querySelector(
        '.add-light-form ha-button[variant="neutral"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;

    await selectLight("light.driveway");
    (
      editor.shadowRoot?.querySelector(
        '.add-light-form ha-button[variant="neutral"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;
    expect(
      editor.shadowRoot?.querySelectorAll(".linked-light-row"),
    ).toHaveLength(1);

    await selectLight("light.driveway");
    (
      editor.shadowRoot?.querySelector(
        '.add-light-form ha-button[variant="brand"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;
    expect(
      editor.shadowRoot?.querySelectorAll(".linked-light-row"),
    ).toHaveLength(2);
    expect(editor.shadowRoot?.querySelector(".add-light")).toBeNull();

    editor.shadowRoot
      ?.querySelectorAll(".light-icon-selector")[1]
      ?.dispatchEvent(
        new CustomEvent("value-changed", {
          bubbles: true,
          composed: true,
          detail: { value: "mdi:coach-lamp" },
        }),
      );
    await editor.updateComplete;

    (
      editor.shadowRoot?.querySelectorAll<HTMLElement>(".remove-light")[0] as
        HTMLElement | undefined
    )?.click();
    await editor.updateComplete;
    (
      editor.shadowRoot?.querySelector(
        '.camera-editor-dialog ha-button[appearance="accent"][variant="brand"][size="m"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;

    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].detail.config.cameras[0]).toEqual({
      entity_id: "camera.front",
      lights: [{ entity_id: "light.driveway", icon: "mdi:coach-lamp" }],
    });
  });

  it("uses dirtyState and soft preview without config-changed while typing", async () => {
    const states: Array<{ config: CardConfig; key: string }> = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      if (request.context === "dirtyState") {
        request.callback?.({
          setState: (config, key) => states.push({ config, key }),
        });
      }
    };
    document.addEventListener("context-request", contextHandler);

    const card = document.createElement("watchzone-card") as DashboardCard;
    card.preview = true;
    card.setConfig({ type: CARD_TYPE, title: "Original" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
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
    expect(
      card.shadowRoot?.querySelector(".shell")?.getAttribute("aria-label"),
    ).toBe("Draft title");
    expect(card.shadowRoot?.querySelector("ha-card")).toBe(originalCard);

    editor.remove();
    await card.updateComplete;
    expect(
      card.shadowRoot?.querySelector(".shell")?.getAttribute("aria-label"),
    ).toBe("Original");
    expect(card.shadowRoot?.querySelector("ha-card")).toBe(originalCard);
    document.removeEventListener("context-request", contextHandler);
  });

  it("uses one committed compatibility event when dirtyState is unavailable", async () => {
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
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

  it("exposes and saves Mobile Data Saving", async () => {
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Camera" });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    document.body.append(editor);
    await editor.updateComplete;
    const selector = editor.shadowRoot?.querySelector(
      '[data-config-key="mobile_data_saving"]',
    ) as TestBooleanSelector | null;
    expect(selector?.value).toBe(false);

    setBooleanSelector(editor, '[data-config-key="mobile_data_saving"]', true);
    expect(changed.mock.calls.at(-1)?.[0].detail.config).toEqual({
      type: CARD_TYPE,
      title: "Camera",
      mobile_data_saving: true,
    });
  });

  it("exposes and saves the event history day range", async () => {
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Camera" });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    document.body.append(editor);
    await editor.updateComplete;

    const selector = editor.shadowRoot?.querySelector<
      HTMLElement & { value: number }
    >('ha-selector[label="Event History Days"]');
    expect(selector?.value).toBe(5);
    selector?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: 12 },
        bubbles: true,
        composed: true,
      }),
    );

    expect(changed.mock.calls.at(-1)?.[0].detail.config).toEqual({
      type: CARD_TYPE,
      title: "Camera",
      event_history_days: 12,
    });
  });

  it("previews, saves, and restores a selected camera", async () => {
    const states: CardConfig[] = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      request.callback?.({
        setState: (config) => states.push(config),
      });
    };
    document.addEventListener("context-request", contextHandler);
    const card = document.createElement("watchzone-card") as DashboardCard;
    card.preview = true;
    card.setConfig({ type: CARD_TYPE, title: "Camera" });
    const dialog = document.createElement(
      "hui-dialog-edit-card",
    ) as TestEditCardDialog;
    dialog._cardConfig = normalizeCardConfig({
      type: CARD_TYPE,
      title: "Camera",
      cameras: [],
    });
    dialog._updateDirtyState = vi.fn();
    const dialogRoot = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Camera" });
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    const save = document.createElement("button");
    save.slot = "primaryAction";
    let configSeenBySave: CardConfig | undefined;
    save.addEventListener("click", () => {
      configSeenBySave = dialog._cardConfig;
    });
    dialogRoot.append(editor, save);
    document.body.append(card, dialog);
    await Promise.all([card.updateComplete, editor.updateComplete]);
    (editor.shadowRoot?.querySelector(".add-camera") as HTMLElement).click();
    await editor.updateComplete;
    const selector = editor.shadowRoot?.querySelector(
      ".camera-editor-dialog ha-selector",
    );

    selector?.dispatchEvent(
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
    await card.updateComplete;

    expect(changed).not.toHaveBeenCalled();
    expect(card.shadowRoot?.textContent).not.toContain(
      "Select a camera in the card editor.",
    );
    expect(states.at(-1)).toMatchObject({
      cameras: [{ entity_id: "camera.front" }],
    });

    save.click();
    expect(configSeenBySave).toMatchObject({
      cameras: [{ entity_id: "camera.front" }],
    });
    expect(dialog._updateDirtyState).toHaveBeenCalledWith(configSeenBySave);

    const reopened = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    reopened.setConfig(configSeenBySave);
    document.body.append(reopened);
    await reopened.updateComplete;
    expect(
      reopened.shadowRoot?.querySelectorAll("wzc-sortable-tile"),
    ).toHaveLength(1);
    document.removeEventListener("context-request", contextHandler);
  });

  it("previews, saves, and restores default-on toggles", async () => {
    const states: CardConfig[] = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      request.callback?.({ setState: (config) => states.push(config) });
    };
    document.addEventListener("context-request", contextHandler);
    const card = document.createElement("watchzone-card") as DashboardCard;
    card.preview = true;
    card.setConfig({ type: CARD_TYPE, title: "Camera" });
    const dialog = document.createElement(
      "hui-dialog-edit-card",
    ) as TestEditCardDialog;
    dialog._cardConfig = normalizeCardConfig({
      type: CARD_TYPE,
      title: "Camera",
      cameras: [],
    });
    dialog._updateDirtyState = vi.fn();
    const dialogRoot = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
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
      "camera_bar_shadows",
    ]) {
      setBooleanSelector(editor, `[data-config-key="${key}"]`, false);
      await card.updateComplete;
    }

    expect(states.at(-1)).toMatchObject({
      rounded_outer_corners: false,
      outer_shadows: false,
      outer_padding: false,
      camera_rounded_corners: false,
      camera_shadows: false,
      camera_bar_shadows: false,
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
      camera_bar_shadows: false,
    });
    const reopened = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    reopened.setConfig(dialog._cardConfig);
    document.body.append(reopened);
    await reopened.updateComplete;
    for (const key of [
      "rounded_outer_corners",
      "outer_shadows",
      "outer_padding",
      "camera_rounded_corners",
      "camera_shadows",
      "camera_bar_shadows",
    ]) {
      expect(
        (
          reopened.shadowRoot?.querySelector(
            `[data-config-key="${key}"]`,
          ) as TestBooleanSelector
        ).value,
      ).toBe(false);
    }

    document.removeEventListener("context-request", contextHandler);
  });

  it("round-trips default-on toggles back to their defaults before Save", async () => {
    const states: CardConfig[] = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      request.callback?.({ setState: (config) => states.push(config) });
    };
    document.addEventListener("context-request", contextHandler);

    const baseline = normalizeCardConfig({
      type: CARD_TYPE,
      title: "Camera",
      cameras: [],
    });
    const card = document.createElement("watchzone-card") as DashboardCard;
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
    ) as CardEditor;
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
      "camera_bar_shadows",
    ] as const) {
      setBooleanSelector(editor, `[data-config-key="${key}"]`, false);
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

      setBooleanSelector(editor, `[data-config-key="${key}"]`, true);
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
    ) as CardEditor;
    reopened.setConfig(dialog._cardConfig);
    document.body.append(reopened);
    await reopened.updateComplete;
    for (const key of [
      "rounded_outer_corners",
      "outer_shadows",
      "outer_padding",
      "camera_rounded_corners",
      "camera_shadows",
      "camera_bar_shadows",
    ]) {
      expect(
        (
          reopened.shadowRoot?.querySelector(
            `[data-config-key="${key}"]`,
          ) as TestBooleanSelector
        ).value,
      ).toBe(true);
    }

    document.removeEventListener("context-request", contextHandler);
  });

  it("edits per-camera audio defaults inside the camera dialog", async () => {
    const states: CardConfig[] = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      request.callback?.({ setState: (config) => states.push(config) });
    };
    document.addEventListener("context-request", contextHandler);
    const dialog = document.createElement(
      "hui-dialog-edit-card",
    ) as TestEditCardDialog;
    dialog._cardConfig = normalizeCardConfig({
      type: CARD_TYPE,
      title: "Camera",
      cameras: [
        {
          entity_id: "camera.front",
          low_latency_hls: true,
          ptz_enabled: false,
          start_live_unmuted_pc_tablet: false,
          start_live_unmuted_phone: false,
          two_way_talk_enabled: false,
        },
      ],
    });
    dialog._updateDirtyState = vi.fn();
    const root = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.setConfig(dialog._cardConfig);
    const save = document.createElement("button");
    save.slot = "primaryAction";
    root.append(editor, save);
    document.body.append(dialog);
    await editor.updateComplete;

    (
      editor.shadowRoot?.querySelector(
        '[aria-label="Edit camera: front"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;

    for (const key of [
      "start_live_unmuted_pc_tablet",
      "start_live_unmuted_phone",
    ] as const) {
      const selector = editor.shadowRoot?.querySelector(
        `[data-camera-config-key="${key}"]`,
      ) as TestBooleanSelector;
      expect(selector.value).toBe(false);
      setBooleanSelector(editor, `[data-camera-config-key="${key}"]`, true);
    }

    editor.shadowRoot
      ?.querySelector(".camera-editor-dialog form")
      ?.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true }),
      );
    expect(states.at(-1)).toMatchObject({
      cameras: [
        {
          entity_id: "camera.front",
          start_live_unmuted_pc_tablet: true,
          start_live_unmuted_phone: true,
        },
      ],
    });

    save.click();
    expect(dialog._cardConfig).toMatchObject({
      cameras: [
        {
          start_live_unmuted_pc_tablet: true,
          start_live_unmuted_phone: true,
        },
      ],
    });

    const reopened = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    reopened.setConfig(dialog._cardConfig);
    document.body.append(reopened);
    await reopened.updateComplete;
    (
      reopened.shadowRoot?.querySelector(
        '[aria-label="Edit camera: front"]',
      ) as HTMLElement
    ).click();
    await reopened.updateComplete;
    for (const key of [
      "start_live_unmuted_pc_tablet",
      "start_live_unmuted_phone",
    ] as const) {
      const selector = reopened.shadowRoot?.querySelector(
        `[data-camera-config-key="${key}"]`,
      ) as TestBooleanSelector;
      expect(selector.value).toBe(true);
    }
    document.removeEventListener("context-request", contextHandler);
  });

  it("enables Update only for a valid changed camera draft", async () => {
    const states: CardConfig[] = [];
    const contextHandler = (event: Event) => {
      const request = event as ContextRequest;
      request.callback?.({ setState: (config) => states.push(config) });
    };
    document.addEventListener("context-request", contextHandler);
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.setConfig({
      type: CARD_TYPE,
      cameras: [{ entity_id: "camera.front" }],
    });
    document.body.append(editor);
    await editor.updateComplete;

    (
      editor.shadowRoot?.querySelector(
        '[aria-label="Edit camera: front"]',
      ) as HTMLElement
    ).click();
    await editor.updateComplete;
    const update = editor.shadowRoot?.querySelector(
      'ha-button[appearance="accent"][variant="brand"]',
    ) as HTMLElement & { disabled: boolean };
    expect(update.disabled).toBe(true);

    setBooleanSelector(
      editor,
      '[data-camera-config-key="low_latency_hls"]',
      false,
    );
    await editor.updateComplete;
    expect(update.disabled).toBe(false);

    setBooleanSelector(
      editor,
      '[data-camera-config-key="low_latency_hls"]',
      true,
    );
    await editor.updateComplete;
    expect(update.disabled).toBe(true);

    setBooleanSelector(
      editor,
      '[data-camera-config-key="low_latency_hls"]',
      false,
    );
    await editor.updateComplete;
    update.click();
    await editor.updateComplete;
    expect(states.at(-1)).toMatchObject({
      cameras: [{ entity_id: "camera.front", low_latency_hls: false }],
    });
    expect(
      editor.shadowRoot
        ?.querySelector(".camera-editor-dialog")
        ?.hasAttribute("open"),
    ).toBe(false);

    document.removeEventListener("context-request", contextHandler);
  });

  it("retains HA and capability choices while switching connection types", async () => {
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "streaming",
          attributes: { friendly_name: "Front" },
        },
      },
      connection: { subscribeMessage: async () => () => undefined },
      callService: async () => undefined,
      callWS: async <T>(message: HomeAssistantMessage): Promise<T> => {
        if (message.type.endsWith("/live/source")) {
          return {
            id: "frigate_go2rtc:entry-front:front",
            type: "frigate_go2rtc",
            frigate_instance_id: "frigate",
            stream_name: "front",
          } as T;
        }
        if (message.type.endsWith("/talk/capability")) {
          return { supported: true } as T;
        }
        return {
          supported: true,
          pan: true,
          tilt: true,
          zoom: false,
          focus: false,
          presets: [],
        } as T;
      },
      hassUrl: (path: string) => path,
    };
    editor.setConfig({
      type: CARD_TYPE,
      cameras: [
        {
          entity_id: "camera.front",
          low_latency_hls: false,
          ptz_enabled: true,
          two_way_talk_enabled: true,
        },
      ],
    });
    document.body.append(editor);
    await editor.updateComplete;
    (
      editor.shadowRoot?.querySelector(
        '[aria-label="Edit camera: Front"]',
      ) as HTMLElement
    ).click();
    await vi.waitFor(() =>
      expect(
        editor.shadowRoot?.querySelector('ha-selector[label="Connection"]'),
      ).not.toBeNull(),
    );

    const connection = editor.shadowRoot?.querySelector(
      'ha-selector[label="Connection"]',
    ) as TestBooleanSelector;
    connection.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: "frigate_go2rtc" },
      }),
    );
    await editor.updateComplete;
    expect(
      editor.shadowRoot?.querySelector(
        '[data-camera-config-key="low_latency_hls"]',
      ),
    ).toBeNull();
    const fallback = editor.shadowRoot?.querySelector(
      '[data-camera-config-key="frigate_fallback"]',
    ) as TestBooleanSelector;
    expect(fallback.value).toBe("mse");
    fallback.dispatchEvent(
      new CustomEvent("value-changed", { detail: { value: "hls" } }),
    );
    await editor.updateComplete;
    expect(
      (
        editor.shadowRoot?.querySelector(
          '[data-camera-config-key="two_way_talk_enabled"]',
        ) as TestBooleanSelector
      ).value,
    ).toBe(true);
    expect(
      (
        editor.shadowRoot?.querySelector(
          '[data-camera-config-key="ptz_enabled"]',
        ) as TestBooleanSelector
      ).value,
    ).toBe(true);

    connection.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: "home_assistant" },
      }),
    );
    await editor.updateComplete;
    expect(
      (
        editor.shadowRoot?.querySelector(
          '[data-camera-config-key="low_latency_hls"]',
        ) as TestBooleanSelector
      ).value,
    ).toBe(false);

    connection.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: "frigate_go2rtc" },
      }),
    );
    await editor.updateComplete;
    expect(
      (
        editor.shadowRoot?.querySelector(
          '[data-camera-config-key="frigate_fallback"]',
        ) as TestBooleanSelector
      ).value,
    ).toBe("hls");
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
    ) as CardEditor;
    editor.setConfig({ type: CARD_TYPE, title: "Camera" });
    document.body.append(editor);
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

    expect(stateWrites).toBe(2);
    expect(subscribed).toBe(false);
    document.removeEventListener("context-request", contextHandler);
  });

  it("widens every HA editor tab until the dialog closes", async () => {
    const dialog = document.createElement("hui-dialog-edit-card");
    dialog.style.setProperty(
      "--ha-view-sections-column-max-width",
      "480px",
      "important",
    );
    const root = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    root.append(editor);
    document.body.append(dialog);
    await editor.updateComplete;

    expect(
      dialog.style
        .getPropertyValue("--ha-view-sections-column-max-width")
        .trim(),
    ).toBe("100%");
    expect(
      dialog.style.getPropertyPriority("--ha-view-sections-column-max-width"),
    ).toBe("important");

    editor.remove();
    expect(
      dialog.style
        .getPropertyValue("--ha-view-sections-column-max-width")
        .trim(),
    ).toBe("100%");
    expect(
      dialog.style.getPropertyPriority("--ha-view-sections-column-max-width"),
    ).toBe("important");

    root.append(editor);
    await editor.updateComplete;
    editor.remove();
    expect(
      dialog.style
        .getPropertyValue("--ha-view-sections-column-max-width")
        .trim(),
    ).toBe("100%");

    dialog.dispatchEvent(new CustomEvent("dialog-closed"));
    expect(
      dialog.style
        .getPropertyValue("--ha-view-sections-column-max-width")
        .trim(),
    ).toBe("480px");
    expect(
      dialog.style.getPropertyPriority("--ha-view-sections-column-max-width"),
    ).toBe("important");
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
    dialog._cardConfig = normalizeCardConfig({
      type: CARD_TYPE,
      title: "Original",
      cameras: [],
      grid_options: { columns: 8 },
    });
    dialog._updateDirtyState = vi.fn();
    const root = dialog.attachShadow({ mode: "open" });
    const editor = document.createElement(
      "watchzone-card-editor",
    ) as CardEditor;
    editor.setConfig({
      type: CARD_TYPE,
      title: "Original",
      cameras: [],
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
