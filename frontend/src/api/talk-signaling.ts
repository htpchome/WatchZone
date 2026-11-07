import { INTEGRATION_ID } from "../core/constants";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";
import type { LiveOfferEvent } from "./live-signaling";
import type { LiveConnectionType } from "../core/config";

const CAPABILITY_COMMAND = `${INTEGRATION_ID}/talk/capability`;
const OFFER_COMMAND = `${INTEGRATION_ID}/talk/webrtc/offer`;
const CANDIDATE_COMMAND = `${INTEGRATION_ID}/talk/webrtc/candidate`;

export async function getTalkCapability(
  api: HomeAssistantApi,
  provider: LiveConnectionType,
  entityId: string,
): Promise<boolean> {
  const result = await api.callWS<{
    readonly supported: boolean;
  }>({
    type: CAPABILITY_COMMAND,
    entity_id: entityId,
    provider,
  });
  return result.supported;
}

export function subscribeTalkOffer(
  api: HomeAssistantApi,
  provider: LiveConnectionType,
  entityId: string,
  offer: string,
  forceStandard: boolean,
  callback: (event: LiveOfferEvent) => void,
  capabilityProbe = false,
): Promise<HomeAssistantUnsubscribe> {
  return api.subscribeMessage(callback, {
    type: OFFER_COMMAND,
    entity_id: entityId,
    provider,
    force_standard: forceStandard,
    capability_probe: capabilityProbe,
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
