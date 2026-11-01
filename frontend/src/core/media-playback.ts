export function playMediaElement(media: HTMLMediaElement): Promise<void> {
  try {
    return Promise.resolve(media.play());
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("Unable to play media"),
    );
  }
}

export function setMediaElementMuted(
  media: HTMLMediaElement,
  muted: boolean,
): void {
  setMediaElementDefaultMuted(media, muted);
  setMediaElementRuntimeMuted(media, muted);
}

export function setMediaElementDefaultMuted(
  media: HTMLMediaElement,
  muted: boolean,
): void {
  media.defaultMuted = muted;
}

/** Applies current output state without rewriting retained autoplay intent. */
export function setMediaElementRuntimeMuted(
  media: HTMLMediaElement,
  muted: boolean,
): void {
  media.muted = muted;
  if (!muted) media.volume = 1;
}
