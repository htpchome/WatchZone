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
  media.defaultMuted = muted;
  media.muted = muted;
  if (!muted) media.volume = 1;
}
