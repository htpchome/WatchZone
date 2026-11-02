import type { ReactiveController, ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TOAST_TRANSITION_DURATION_MS,
  TOAST_VISIBLE_DURATION_MS,
} from "../src/core/constants";
import { ToastManager } from "../src/ui/toast-manager";
import type { ToastRegion } from "../src/ui/toast-region";
import "../src/ui/toast-region";

class TestHost implements ReactiveControllerHost {
  public readonly requestUpdate = vi.fn<() => void>();
  public readonly updateComplete = Promise.resolve(true);

  public addController(controller: ReactiveController): void {
    void controller;
  }

  public removeController(controller: ReactiveController): void {
    void controller;
  }
}

describe("toast system", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("renders success, warning, and error notices through one region", async () => {
    const region = document.createElement("wzc-toast-region") as ToastRegion;
    region.notices = [
      {
        dismissing: false,
        id: "success",
        message: "Saved",
        severity: "success",
      },
      {
        dismissing: false,
        id: "warning",
        message: "Playback blocked",
        severity: "warning",
      },
      {
        dismissing: false,
        id: "error",
        message: "Unable to connect",
        severity: "error",
      },
    ];
    document.body.append(region);
    await region.updateComplete;

    expect(
      [...(region.shadowRoot?.querySelectorAll(".toast") ?? [])].map((toast) =>
        toast.getAttribute("data-severity"),
      ),
    ).toEqual(["success", "warning", "error"]);
    expect(region.shadowRoot?.textContent).toContain("Playback blocked");
  });

  it("replaces keyed notices and fades them out on the shared timer", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const manager = new ToastManager(host);

    manager.warning("First", { key: "audio" });
    manager.warning("Updated", { key: "audio" });
    expect(manager.notices).toHaveLength(1);
    expect(manager.notices[0]).toMatchObject({
      dismissing: false,
      message: "Updated",
      severity: "warning",
    });

    vi.advanceTimersByTime(TOAST_VISIBLE_DURATION_MS);
    expect(manager.notices[0]?.dismissing).toBe(true);
    vi.advanceTimersByTime(TOAST_TRANSITION_DURATION_MS);
    expect(manager.notices).toHaveLength(0);
  });

  it("cleans up notices and timers with its host lifecycle", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const manager = new ToastManager(host);
    manager.success("Saved");
    manager.error("Failed");

    manager.hostDisconnected();
    vi.runAllTimers();
    expect(manager.notices).toHaveLength(0);
  });
});
