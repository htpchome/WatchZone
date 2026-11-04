import { INTEGRATION_ID } from "../core/constants";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";
import type { LiveOfferEvent } from "./live-signaling";

const CAPABILITY_COMMAND = `${INTEGRATION_ID}/talk/capability`;
const OFFER_COMMAND = `${INTEGRATION_ID}/talk/webrtc/offer`;
const CANDIDATE_COMMAND = `${INTEGRATION_ID}/talk/webrtc/candidate`;

export async function getTalkCapability(
  api: HomeAssistantApi,
  entityId: string,
): Promise<boolean> {
  const result = await api.callWS<{ readonly supported: boolean }>({
    type: CAPABILITY_COMMAND,
    entity_id: entityId,
  });
  return result.supported;
}

export function subscribeTalkOffer(
  api: HomeAssistantApi,
  entityId: string,
  offer: string,
  forceStandard: boolean,
  callback: (event: LiveOfferEvent) => void,
): Promise<HomeAssistantUnsubscribe> {
  return api.subscribeMessage(callback, {
    type: OFFER_COMMAND,
    entity_id: entityId,
    force_standard: forceStandard,
    offer,
  });
}

export function sendTalkCandidate(
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
