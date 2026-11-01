import type { TemplateResult } from "lit";

import type { ClientHost } from "../../core/client-environment";
import { CatalystHomeAssistantMediaPresentation } from "./catalyst-presentation";
import { OrdinaryHomeAssistantMediaPresentation } from "./ordinary-presentation";

export interface HomeAssistantPresentationState {
  readonly muted: boolean;
  readonly onWebRtcLoadedData: (event: Event) => void;
  readonly selected?: "hls" | "webrtc";
}

export interface HomeAssistantMediaPresentation {
  readonly ownsAutomaticPlayback: boolean;
  render(state: HomeAssistantPresentationState): TemplateResult;
}

/** Selects one immutable host presentation policy for a live-view instance. */
export function createHomeAssistantMediaPresentation(
  host: ClientHost,
): HomeAssistantMediaPresentation {
  return host === "catalyst"
    ? new CatalystHomeAssistantMediaPresentation()
    : new OrdinaryHomeAssistantMediaPresentation();
}
