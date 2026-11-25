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

/** Observe one newly presented frame whose media timestamp advances. */
export function observeMediaElementAdvance(
  media: HTMLVideoElement,
  onAdvance: () => void,
  allowReadinessFallback = false,
): () => void {
  const initialTime = media.currentTime;
  let frameRequest: number | undefined;
  let active = true;
  const advanced = (mediaTime = media.currentTime): boolean =>
    mediaTime > initialTime + MEDIA_TIME_EPSILON_SECONDS;
  const cancel = (): void => {
    if (!active) return;
    active = false;
    media.removeEventListener("timeupdate", handleTimeUpdate);
    for (const eventName of ["canplay", "loadeddata", "playing"]) {
      media.removeEventListener(eventName, finish);
    }
    if (frameRequest !== undefined) {
      media.cancelVideoFrameCallback?.(frameRequest);
      frameRequest = undefined;
    }
  };
  const finish = (): void => {
    if (!active) return;
    cancel();
    onAdvance();
  };
  const handleTimeUpdate = (): void => {
    if (advanced()) finish();
  };
  const requestFrame = (): void => {
    frameRequest = media.requestVideoFrameCallback?.((_now, metadata) => {
      frameRequest = undefined;
      if (advanced(metadata.mediaTime)) finish();
      else if (active) requestFrame();
    });
  };

  media.addEventListener("timeupdate", handleTimeUpdate);
  if (typeof media.requestVideoFrameCallback === "function") requestFrame();
  if (allowReadinessFallback) {
    for (const eventName of ["canplay", "loadeddata", "playing"]) {
      media.addEventListener(eventName, finish, { once: true });
    }
  }
  return cancel;
}

/** Resume a retained player and prove that newly decoded media is advancing. */
export function resumeMediaElement(
  media: HTMLVideoElement,
  timeoutMs = FRESH_FRAME_TIMEOUT_MS,
): Promise<void> {
  void playMediaElement(media).catch(() => undefined);

  return new Promise((resolve, reject) => {
    let settled = false;
    let cancelAdvance = (): void => undefined;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cancelAdvance();
      if (error) reject(error);
      else resolve();
    };
    const timeout = window.setTimeout(
      () => finish(new Error("Retained media did not resume")),
      timeoutMs,
    );
    cancelAdvance = observeMediaElementAdvance(media, () => finish());
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
