import { INTEGRATION_ID } from "../core/constants";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";
import type { LiveConnectionType } from "../core/config";

export type LiveOfferEvent =
  | {
      readonly type: "session";
      readonly session_id: string;
      readonly signaling_path: string;
      readonly signaling_fallback_reason: string | null;
    }
  | { readonly type: "answer"; readonly answer: string }
  | { readonly type: "candidate"; readonly candidate: RTCIceCandidateInit }
  | { readonly type: "error"; readonly message: string };

const OFFER_COMMAND = `${INTEGRATION_ID}/live/webrtc/offer`;
const CANDIDATE_COMMAND = `${INTEGRATION_ID}/live/webrtc/candidate`;
const CAMERA_READY_COMMAND = `${INTEGRATION_ID}/live/camera/ready`;
const pendingCameraReadiness = new WeakMap<
  HomeAssistantApi["identity"],
  Map<string, Promise<boolean>>
>();

export function waitForHomeAssistantCameraReady(
  api: HomeAssistantApi,
  entityId: string,
): Promise<boolean> {
  let connectionRequests = pendingCameraReadiness.get(api.identity);
  if (!connectionRequests) {
    connectionRequests = new Map();
    pendingCameraReadiness.set(api.identity, connectionRequests);
  }
  const existing = connectionRequests.get(entityId);
  if (existing) return existing;

  const request = api
    .callWS<{ readonly ready: boolean }>({
      type: CAMERA_READY_COMMAND,
      entity_id: entityId,
    })
    .then(({ ready }) => ready)
    .finally(() => connectionRequests?.delete(entityId));
  connectionRequests.set(entityId, request);
  return request;
}

export function subscribeLiveOffer(
  api: HomeAssistantApi,
  entityId: string,
  offer: string,
  callback: (event: LiveOfferEvent) => void,
  provider: LiveConnectionType = "home_assistant",
): Promise<HomeAssistantUnsubscribe> {
  return api.subscribeMessage(callback, {
    type: OFFER_COMMAND,
    entity_id: entityId,
    offer,
    provider,
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
