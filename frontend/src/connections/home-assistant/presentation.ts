import { html, type TemplateResult } from "lit";

export interface HomeAssistantPresentationState {
  readonly muted: boolean;
  readonly onWebRtcLoadedData: (event: Event) => void;
  readonly selected?: "hls" | "webrtc";
}

export function renderHomeAssistantMediaPresentation(
  state: HomeAssistantPresentationState,
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
