import { html, type TemplateResult } from "lit";

import type {
  HomeAssistantMediaPresentation,
  HomeAssistantPresentationState,
} from "./presentation";

/** Catalyst owns one native-HLS surface and never creates a WebRTC element. */
export class CatalystHomeAssistantMediaPresentation implements HomeAssistantMediaPresentation {
  public render(state: HomeAssistantPresentationState): TemplateResult {
    return html`<div
      class="hls-host native-edge-isolation"
      ?hidden=${state.selected === "webrtc"}
    ></div>`;
  }
}
