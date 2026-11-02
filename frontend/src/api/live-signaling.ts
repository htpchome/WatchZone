import { INTEGRATION_ID } from "../core/constants";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";

export type LiveOfferEvent =
  | {
      readonly type: "session";
      readonly session_id: string;
      readonly signaling_path: string;
    }
  | { readonly type: "answer"; readonly answer: string }
  | { readonly type: "candidate"; readonly candidate: RTCIceCandidateInit }
  | { readonly type: "error"; readonly message: string };

const OFFER_COMMAND = `${INTEGRATION_ID}/live/webrtc/offer`;
const CANDIDATE_COMMAND = `${INTEGRATION_ID}/live/webrtc/candidate`;

export function subscribeLiveOffer(
  api: HomeAssistantApi,
  entityId: string,
  offer: string,
  callback: (event: LiveOfferEvent) => void,
): Promise<HomeAssistantUnsubscribe> {
  return api.subscribeMessage(callback, {
    type: OFFER_COMMAND,
    entity_id: entityId,
    offer,
  });
}

export function sendLiveCandidate(
  api: HomeAssistantApi,
  entityId: string,
  sessionId: string,
  candidate: RTCIceCandidateInit,
): Promise<unknown> {
  return api.callWS({
    type: CANDIDATE_COMMAND,
    entity_id: entityId,
    session_id: sessionId,
    candidate,
  });
}
