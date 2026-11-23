import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  MediaConnectionError,
  normalizeMediaConnectionError,
} from "../../core/media-connection-error";

export interface WebRtcClientConfiguration {
  readonly configuration: RTCConfiguration;
  readonly dataChannel?: string;
}

function abortError(): DOMException {
  return new DOMException("Connection cancelled", "AbortError");
}

/** Request HA's shared browser peer configuration through one bounded boundary. */
export function requestWebRtcClientConfiguration(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<WebRtcClientConfiguration> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = (): void => finish(() => reject(abortError()));
    const timeout = window.setTimeout(
      () =>
        finish(() =>
          reject(
            new MediaConnectionError(
              "configuration_timeout",
              "Timed out requesting Home Assistant WebRTC configuration",
            ),
          ),
        ),
      timeoutMs,
    );
    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) {
      handleAbort();
      return;
    }
    void api
      .callWS<WebRtcClientConfiguration>({
        type: "camera/webrtc/get_client_config",
        entity_id: entityId,
      })
      .then(
        (configuration) => finish(() => resolve(configuration)),
        (error: unknown) =>
          finish(() =>
            reject(
              normalizeMediaConnectionError(
                error,
                "signaling_failed",
                "Unable to request Home Assistant WebRTC configuration",
              ),
            ),
          ),
      );
  });
}
