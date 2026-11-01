import { html, type TemplateResult } from "lit";

import type {
  HomeAssistantMediaPresentation,
  HomeAssistantPresentationState,
} from "./presentation";

/** Proven Browser/Companion HLS hedge with an autoplaying WebRTC candidate. */
export class OrdinaryHomeAssistantMediaPresentation implements HomeAssistantMediaPresentation {
  public readonly ownsAutomaticPlayback = false;

  public render(state: HomeAssistantPresentationState): TemplateResult {
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
}
