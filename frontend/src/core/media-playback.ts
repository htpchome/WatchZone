export function playMediaElement(media: HTMLMediaElement): Promise<void> {
  try {
    return Promise.resolve(media.play());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("Unable to play media"),
    );
  }
}

const FRESH_FRAME_TIMEOUT_MS = 4_000;
const MEDIA_TIME_EPSILON_SECONDS = 0.01;

/** Resume a retained player and prove that newly decoded media is advancing. */
export function resumeMediaElement(
  media: HTMLVideoElement,
  timeoutMs = FRESH_FRAME_TIMEOUT_MS,
): Promise<void> {
  const initialTime = media.currentTime;
  void playMediaElement(media).catch(() => undefined);

  return new Promise((resolve, reject) => {
    let frameRequest: number | undefined;
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      media.removeEventListener("timeupdate", handleTimeUpdate);
      if (frameRequest !== undefined) {
        media.cancelVideoFrameCallback?.(frameRequest);
      }
      if (error) reject(error);
      else resolve();
    };
    const advanced = (mediaTime = media.currentTime): boolean =>
      mediaTime > initialTime + MEDIA_TIME_EPSILON_SECONDS;
    const handleTimeUpdate = (): void => {
      if (advanced()) finish();
    };
    const requestFrame = (): void => {
      frameRequest = media.requestVideoFrameCallback?.((_now, metadata) => {
        frameRequest = undefined;
        if (advanced(metadata.mediaTime)) finish();
        else requestFrame();
      });
    };
    const timeout = window.setTimeout(
      () => finish(new Error("Retained media did not resume")),
      timeoutMs,
    );

    media.addEventListener("timeupdate", handleTimeUpdate);
    requestFrame();
  });
}

export function setMediaElementMuted(
  media: HTMLMediaElement,
  muted: boolean,
): void {
  media.defaultMuted = muted;
  media.muted = muted;
  if (!muted) media.volume = 1;
}
