import { html, type TemplateResult } from "lit";

export type PresentedSource = "hls" | "webrtc";
export type PresentedTransport = "hls_mse" | "hls_native" | "webrtc";

export interface MediaPresentationState {
  readonly muted: boolean;
  readonly onWebRtcLoadedData: (event: Event) => void;
  readonly selected?: PresentedSource;
}

/** Stateless DOM presentation for the source selected by the session controller. */
export function renderMediaPresentation(
  state: MediaPresentationState,
): TemplateResult {
  return html`
    <div class="hls-host" ?hidden=${state.selected === "webrtc"}></div>
    <video
      class="webrtc"
      autoplay
      playsinline
      .muted=${state.muted}
      aria-label="Live camera"
      ?hidden=${state.selected !== "webrtc"}
      @loadeddata=${state.onWebRtcLoadedData}
    ></video>
  `;
}
