import {
  playMediaElement,
  setMediaElementRuntimeMuted,
} from "../../core/media-playback";

/**
 * Catalyst recovery for configured audible startup.
 *
 * Start the retained native element muted, then retry audible playback only
 * after WKWebView confirms that the same element is playing.
 */
export async function recoverCatalystAudibleAutoplay(
  video: HTMLVideoElement,
): Promise<boolean> {
  setMediaElementRuntimeMuted(video, true);
  try {
    await playMediaElement(video);
  } catch {
    return false;
  }

  setMediaElementRuntimeMuted(video, false);
  try {
    await playMediaElement(video);
    return true;
  } catch {
    setMediaElementRuntimeMuted(video, true);
    try {
      await playMediaElement(video);
    } catch {
      // The connection/session layer owns transport failure reporting.
    }
    return false;
  }
}
