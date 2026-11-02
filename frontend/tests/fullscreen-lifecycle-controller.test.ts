import type { ReactiveController, ReactiveControllerHost } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FullscreenLifecycleController } from "../src/modules/camera/live/fullscreen-lifecycle.controller";
import { NATIVE_FULLSCREEN_EXIT_RECOVERY_MS } from "../src/modules/camera/live/constants";

class TestHost implements ReactiveControllerHost {
  public readonly controllers: ReactiveController[] = [];
  public readonly updateComplete = Promise.resolve(true);
  public requestUpdate(): void {}
  public addController(controller: ReactiveController): void {
    this.controllers.push(controller);
  }
  public removeController(controller: ReactiveController): void {
    const index = this.controllers.indexOf(controller);
    if (index >= 0) this.controllers.splice(index, 1);
  }
}

describe("fullscreen lifecycle controller", () => {
  let frameId: number;
  let frames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    vi.useFakeTimers();
    frameId = 0;
    frames = new Map();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  function flushInlineRestore(): void {
    for (let count = 0; count < 2; count += 1) {
      const next = frames.entries().next().value as
        [number, FrameRequestCallback] | undefined;
      if (!next) return;
      frames.delete(next[0]);
      next[1](performance.now());
    }
  }

  it("resumes after native exit and after WebKit's final inline pause", () => {
    const video = document.createElement("video");
    document.body.append(video);
    const resumePlayback = vi.fn(async () => undefined);
    const controller = new FullscreenLifecycleController(new TestHost(), {
      getCurrentVideo: () => video,
      onExit: vi.fn(),
      resumePlayback,
    });

    controller.beginNativeFullscreen(video);
    expect(resumePlayback).toHaveBeenCalledOnce();

    video.dispatchEvent(new Event("webkitendfullscreen"));
    flushInlineRestore();
    expect(resumePlayback).toHaveBeenCalledTimes(2);

    video.dispatchEvent(new Event("pause"));
    vi.advanceTimersByTime(0);
    expect(resumePlayback).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(NATIVE_FULLSCREEN_EXIT_RECOVERY_MS);
    video.dispatchEvent(new Event("pause"));
    vi.advanceTimersByTime(0);
    expect(resumePlayback).toHaveBeenCalledTimes(3);
  });

  it("resumes a document-fullscreen session only after a real exit", () => {
    const video = document.createElement("video");
    document.body.append(video);
    const resumePlayback = vi.fn(async () => undefined);
    const controller = new FullscreenLifecycleController(new TestHost(), {
      getCurrentVideo: () => video,
      onExit: vi.fn(),
      resumePlayback,
    });

    controller.beginDocumentFullscreen(video);
    controller.handleDocumentFullscreenChange(null);
    expect(frames.size).toBe(0);

    controller.handleDocumentFullscreenChange(document.body);
    controller.handleDocumentFullscreenChange(null);
    flushInlineRestore();
    expect(resumePlayback).toHaveBeenCalledOnce();
  });

  it("cancels deferred recovery when the presentation disconnects", () => {
    const video = document.createElement("video");
    document.body.append(video);
    const resumePlayback = vi.fn(async () => undefined);
    const controller = new FullscreenLifecycleController(new TestHost(), {
      getCurrentVideo: () => video,
      onExit: vi.fn(),
      resumePlayback,
    });

    controller.beginNativeFullscreen(video);
    video.dispatchEvent(new Event("webkitendfullscreen"));
    controller.hostDisconnected();
    flushInlineRestore();
    vi.runAllTimers();
    expect(resumePlayback).toHaveBeenCalledOnce();
  });
});
