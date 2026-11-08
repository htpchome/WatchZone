interface FullscreenDocument extends Document {
  webkitExitFullscreen?(): Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?(): Promise<void> | void;
}

interface FullscreenVideo extends HTMLVideoElement {
  readonly webkitDisplayingFullscreen?: boolean;
  webkitEnterFullScreen?(): void;
  webkitEnterFullscreen?(): void;
}

/** Shared browser fullscreen capability boundary for live and recorded media. */
export function isMediaFullscreenActive(video?: HTMLVideoElement): boolean {
  const documentObject = document as FullscreenDocument;
  return Boolean(
    document.fullscreenElement ||
    documentObject.webkitFullscreenElement ||
    (video as FullscreenVideo | undefined)?.webkitDisplayingFullscreen,
  );
}

export function mediaFullscreenSupported(
  target?: HTMLElement | null,
  video?: HTMLVideoElement,
): boolean {
  const fullscreenTarget = target as FullscreenElement | null | undefined;
  const fullscreenVideo = video as FullscreenVideo | undefined;
  return Boolean(
    fullscreenTarget?.requestFullscreen ||
    fullscreenTarget?.webkitRequestFullscreen ||
    fullscreenVideo?.webkitEnterFullscreen ||
    fullscreenVideo?.webkitEnterFullScreen,
  );
}

export async function toggleMediaFullscreen(
  target: HTMLElement | null | undefined,
  video?: HTMLVideoElement,
): Promise<boolean> {
  const documentObject = document as FullscreenDocument;
  const fullscreenTarget = target as FullscreenElement | null | undefined;
  if (document.fullscreenElement || documentObject.webkitFullscreenElement) {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await documentObject.webkitExitFullscreen?.();
    return false;
  }
  if (fullscreenTarget?.requestFullscreen) {
    await fullscreenTarget.requestFullscreen();
    return true;
  }
  if (fullscreenTarget?.webkitRequestFullscreen) {
    await fullscreenTarget.webkitRequestFullscreen();
    return true;
  }
  const fullscreenVideo = video as FullscreenVideo | undefined;
  const enter =
    fullscreenVideo?.webkitEnterFullscreen ??
    fullscreenVideo?.webkitEnterFullScreen;
  if (!fullscreenVideo || !enter) {
    throw new Error("Fullscreen is not supported on this device.");
  }
  enter.call(fullscreenVideo);
  return true;
}
