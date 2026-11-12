import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SEGMENTED_CONTROL_TAG,
  SEGMENTED_CONTROL_VALUE_EVENT,
} from "../src/core/constants";
import type {
  SegmentedControl,
  SegmentedControlValueDetail,
} from "../src/ui/segmented-control";
import "../src/ui/segmented-control";

describe("segmented control", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("owns reusable single-selection semantics and emits typed values", async () => {
    const control = document.createElement(
      SEGMENTED_CONTROL_TAG,
    ) as SegmentedControl;
    control.label = "PTZ overlay control";
    control.options = [
      { label: "None", value: "none" },
      { label: "Start Closed", value: "start_closed" },
      { disabled: true, label: "Upcoming", value: "upcoming" },
    ];
    control.value = "none";
    const changed = vi.fn();
    control.addEventListener(SEGMENTED_CONTROL_VALUE_EVENT, (event) =>
      changed(event as CustomEvent<SegmentedControlValueDetail>),
    );
    document.body.append(control);
    await control.updateComplete;

    expect(
      control.shadowRoot
        ?.querySelector("[role='radiogroup']")
        ?.getAttribute("aria-label"),
    ).toBe("PTZ overlay control");
    expect(
      control.shadowRoot
        ?.querySelector('[data-value="none"]')
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      control.shadowRoot?.querySelector<HTMLButtonElement>(
        '[data-value="upcoming"]',
      )?.disabled,
    ).toBe(true);

    control.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-value="start_closed"]')
      ?.click();
    expect(changed).toHaveBeenCalledOnce();
    expect(
      (changed.mock.calls[0]?.[0] as CustomEvent<SegmentedControlValueDetail>)
        .detail,
    ).toEqual({
      value: "start_closed",
    });
  });

  it("provides tab semantics and skips disabled options with arrow keys", async () => {
    const control = document.createElement(
      SEGMENTED_CONTROL_TAG,
    ) as SegmentedControl;
    control.mode = "tab";
    control.label = "Camera navigation";
    control.options = [
      { label: "Hall", value: "hall" },
      { disabled: true, label: "Deck", value: "deck" },
      { label: "Driveway", value: "driveway" },
    ];
    control.value = "hall";
    const changed = vi.fn();
    control.addEventListener(SEGMENTED_CONTROL_VALUE_EVENT, (event) =>
      changed(event as CustomEvent<SegmentedControlValueDetail>),
    );
    document.body.append(control);
    await control.updateComplete;

    const hall = control.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-value="hall"]',
    );
    hall?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));

    expect(
      (changed.mock.calls[0]?.[0] as CustomEvent<SegmentedControlValueDetail>)
        .detail,
    ).toEqual({ value: "driveway" });
    expect(hall?.getAttribute("role")).toBe("tab");
    expect(hall?.getAttribute("aria-selected")).toBe("true");
    expect(hall?.hasAttribute("aria-checked")).toBe(false);
  });
});
