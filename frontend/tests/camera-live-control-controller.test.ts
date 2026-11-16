import type { ReactiveController, ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { englishLocalize } from "../src/core/localization";
import { CameraLiveControlController } from "../src/stage/camera-presentation/live/control.controller";

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

function createController(
  captureFrame = vi.fn(() => Promise.resolve(new Blob())),
) {
  const host = new TestHost();
  const onMuteToggle = vi.fn();
  const onSuspendToggle = vi.fn();
  const requestToast = vi.fn();
  const controller = new CameraLiveControlController(host, {
    captureFrame,
    getFullscreenTarget: () => undefined,
    getLocalize: () => englishLocalize,
    getSnapshotKey: () => "camera.front",
    onMuteToggle,
    onSuspendToggle,
    requestToast,
  });
  return {
    controller,
    host,
    onMuteToggle,
    onSuspendToggle,
    requestToast,
  };
}

describe("camera live control controller", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("transfers active-video listeners and removes lifecycle listeners", () => {
    const { controller } = createController();
    const first = document.createElement("video");
    const second = document.createElement("video");
    const firstAdd = vi.spyOn(first, "addEventListener");
    const firstRemove = vi.spyOn(first, "removeEventListener");
    const secondAdd = vi.spyOn(second, "addEventListener");
    const secondRemove = vi.spyOn(second, "removeEventListener");
    const documentAdd = vi.spyOn(document, "addEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");

    controller.hostConnected();
    controller.setActiveVideo(first);
    controller.setActiveVideo(second);
    controller.hostDisconnected();

    for (const eventName of [
      "enterpictureinpicture",
      "leavepictureinpicture",
      "webkitpresentationmodechanged",
      "webkitbeginfullscreen",
      "webkitendfullscreen",
    ]) {
      expect(firstAdd).toHaveBeenCalledWith(eventName, expect.any(Function));
      expect(firstRemove).toHaveBeenCalledWith(eventName, expect.any(Function));
      expect(secondAdd).toHaveBeenCalledWith(eventName, expect.any(Function));
      expect(secondRemove).toHaveBeenCalledWith(
        eventName,
        expect.any(Function),
      );
    }
    expect(documentAdd).toHaveBeenCalledWith(
      "fullscreenchange",
      expect.any(Function),
    );
    expect(documentRemove).toHaveBeenCalledWith(
      "fullscreenchange",
      expect.any(Function),
    );
  });

  it("routes parent-owned mute and suspension intents without duplicating policy", () => {
    const { controller, onMuteToggle, onSuspendToggle } = createController();

    controller.perform("mute");
    controller.perform("suspend");

    expect(onMuteToggle).toHaveBeenCalledOnce();
    expect(onSuspendToggle).toHaveBeenCalledOnce();
  });

  it("uses the presentation's current video after retained navigation", async () => {
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    const { controller } = createController();
    const beforeNavigation = document.createElement("video");
    const afterNavigation = document.createElement("video");
    const staleRequest = vi.fn();
    const currentRequest = vi.fn(async () => ({}) as PictureInPictureWindow);
    Object.defineProperty(beforeNavigation, "requestPictureInPicture", {
      configurable: true,
      value: staleRequest,
    });
    Object.defineProperty(afterNavigation, "requestPictureInPicture", {
      configurable: true,
      value: currentRequest,
    });
    controller.setActiveVideo(beforeNavigation);

    controller.perform("picture_in_picture", afterNavigation);

    await vi.waitFor(() => expect(currentRequest).toHaveBeenCalledOnce());
    expect(staleRequest).not.toHaveBeenCalled();
  });

  it("clears snapshot pending state and translates failures once", async () => {
    const captureFrame = vi.fn(() => Promise.reject(new Error("Frame failed")));
    const { controller, host, requestToast } = createController(captureFrame);
    controller.setActiveVideo(document.createElement("video"));

    controller.perform("snapshot");
    expect(controller.snapshotPending).toBe(true);
    await vi.waitFor(() => expect(controller.snapshotPending).toBe(false));

    expect(captureFrame).toHaveBeenCalledOnce();
    expect(requestToast).toHaveBeenCalledWith(
      "error",
      "Frame failed",
      "camera-snapshot",
    );
    expect(host.requestUpdate).toHaveBeenCalledTimes(2);
  });
});
