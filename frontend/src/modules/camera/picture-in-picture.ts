type WebKitPresentationMode = "inline" | "picture-in-picture";

interface PictureInPictureVideo extends HTMLVideoElement {
  webkitPresentationMode?: WebKitPresentationMode;
  webkitSetPresentationMode?(mode: WebKitPresentationMode): void;
  webkitSupportsPresentationMode?(mode: WebKitPresentationMode): boolean;
}

interface PictureInPictureDocument extends Document {
  webkitExitFullscreen?(): Promise<void> | void;
}

interface PictureInPictureRoot extends Node {
  pictureInPictureElement?: Element | null;
}

export type PictureInPictureMethod = "standard" | "webkit";

function suppressNativeControl(video: HTMLVideoElement): void {
  const controls = new Set(
    (video.getAttribute("controlslist") ?? "").split(/\s+/).filter(Boolean),
  );
  controls.add("nopictureinpicture");
  video.setAttribute("controlslist", [...controls].join(" "));
}

function ownerDocument(video: HTMLVideoElement): PictureInPictureDocument {
  return video.ownerDocument as PictureInPictureDocument;
}

export function pictureInPictureMethod(
  video?: HTMLVideoElement,
): PictureInPictureMethod | undefined {
  if (!video) {
    return undefined;
  }
  const documentObject = ownerDocument(video);
  if (
    typeof video.requestPictureInPicture === "function" &&
    documentObject.pictureInPictureEnabled !== false
  ) {
    return "standard";
  }
  const webkitVideo = video as PictureInPictureVideo;
  if (typeof webkitVideo.webkitSetPresentationMode !== "function") {
    return undefined;
  }
  try {
    return typeof webkitVideo.webkitSupportsPresentationMode !== "function" ||
      webkitVideo.webkitSupportsPresentationMode("picture-in-picture")
      ? "webkit"
      : undefined;
  } catch {
    return undefined;
  }
}

export function isPictureInPictureActive(video?: HTMLVideoElement): boolean {
  if (!video) {
    return false;
  }
  const webkitVideo = video as PictureInPictureVideo;
  if (webkitVideo.webkitPresentationMode === "picture-in-picture") {
    return true;
  }
  const root = video.getRootNode() as PictureInPictureRoot;
  return (
    root.pictureInPictureElement === video ||
    ownerDocument(video).pictureInPictureElement === video
  );
}

export function suppressNativePictureInPicture(video?: HTMLVideoElement): void {
  if (!video) {
    return;
  }
  video.disablePictureInPicture = true;
  video.setAttribute("disablepictureinpicture", "");
  suppressNativeControl(video);
}

function restoreAfterPictureInPicture(video: HTMLVideoElement): void {
  suppressNativePictureInPicture(video);
  if (video.paused) {
    void video.play().catch(() => undefined);
  }

  const width = video.getBoundingClientRect().width;
  if (width <= 1) {
    return;
  }
  const previousWidth = video.style.getPropertyValue("width");
  const previousPriority = video.style.getPropertyPriority("width");
  const temporaryWidth = `${Math.round(width) - 1}px`;
  video.style.setProperty("width", temporaryWidth, "important");
  video.getBoundingClientRect();
  requestAnimationFrame(() => {
    if (video.style.getPropertyValue("width") !== temporaryWidth) {
      return;
    }
    if (previousWidth) {
      video.style.setProperty("width", previousWidth, previousPriority);
    } else {
      video.style.removeProperty("width");
    }
  });
}

export async function togglePictureInPicture(
  video: HTMLVideoElement,
): Promise<boolean> {
  const method = pictureInPictureMethod(video);
  if (!method) {
    throw new Error("Picture-in-Picture is not supported on this device.");
  }

  if (method === "webkit") {
    const webkitVideo = video as PictureInPictureVideo;
    const active = isPictureInPictureActive(video);
    if (active) {
      webkitVideo.webkitSetPresentationMode?.("inline");
      restoreAfterPictureInPicture(video);
    } else {
      video.disablePictureInPicture = false;
      video.removeAttribute("disablepictureinpicture");
      try {
        webkitVideo.webkitSetPresentationMode?.("picture-in-picture");
      } catch (error) {
        suppressNativePictureInPicture(video);
        throw error;
      }
    }
    return !active;
  }

  const documentObject = ownerDocument(video);
  if (isPictureInPictureActive(video)) {
    await documentObject.exitPictureInPicture?.();
    return false;
  }

  video.disablePictureInPicture = false;
  video.removeAttribute("disablepictureinpicture");
  const restore = (): void => restoreAfterPictureInPicture(video);
  video.addEventListener("leavepictureinpicture", restore, { once: true });
  try {
    await video.requestPictureInPicture();
    return true;
  } catch (error) {
    video.removeEventListener("leavepictureinpicture", restore);
    suppressNativePictureInPicture(video);
    throw error;
  }
}
