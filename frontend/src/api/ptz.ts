import { INTEGRATION_ID } from "../core/constants";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";

export type PtzDirection = "down" | "left" | "right" | "up";
export type PtzProviderId = "home_assistant" | "frigate_go2rtc";

export interface PtzCapability {
  readonly supported: boolean;
  readonly pan: boolean;
  readonly tilt: boolean;
  readonly zoom: boolean;
  readonly focus: boolean;
  readonly presets: readonly string[];
}

const CAPABILITY_COMMAND = `${INTEGRATION_ID}/ptz/capability`;
const MOVE_COMMAND = `${INTEGRATION_ID}/ptz/move`;

export function getPtzCapability(
  api: HomeAssistantApi,
  provider: PtzProviderId,
  entityId: string,
): Promise<PtzCapability> {
  return api.callWS({
    type: CAPABILITY_COMMAND,
    provider,
    entity_id: entityId,
  });
}

export function startPtzMotion(
  api: HomeAssistantApi,
  provider: PtzProviderId,
  entityId: string,
  direction: PtzDirection,
): Promise<HomeAssistantUnsubscribe> {
  return api.subscribeMessage(() => undefined, {
    type: MOVE_COMMAND,
    provider,
    entity_id: entityId,
    direction,
  });
}
