import type { ReactiveController, ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimedVisibilityController } from "../src/ui/timed-visibility.controller";

class TestHost implements ReactiveControllerHost {
  public readonly controllers: ReactiveController[] = [];
  public readonly updateComplete = Promise.resolve(true);
  public readonly requestUpdate = vi.fn();

  public addController(controller: ReactiveController): void {
    this.controllers.push(controller);
  }

  public removeController(controller: ReactiveController): void {
    const index = this.controllers.indexOf(controller);
    if (index >= 0) this.controllers.splice(index, 1);
  }
}

describe("timed visibility controller", () => {
  afterEach(() => vi.useRealTimers());

  it("restarts one hide timer and updates only on visibility changes", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const visibility = new TimedVisibilityController(host, 2500);

    visibility.revealFor();
    vi.advanceTimersByTime(2499);
    visibility.revealFor();
    vi.advanceTimersByTime(2499);
    expect(visibility.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(visibility.visible).toBe(false);
    expect(host.requestUpdate).toHaveBeenCalledTimes(2);
  });

  it("clears pending work when its host disconnects", () => {
    vi.useFakeTimers();
    const host = new TestHost();
    const visibility = new TimedVisibilityController(host, 100);

    visibility.revealFor();
    visibility.hostDisconnected();
    vi.advanceTimersByTime(100);

    expect(visibility.visible).toBe(false);
    expect(host.requestUpdate).toHaveBeenCalledTimes(2);
  });
});
