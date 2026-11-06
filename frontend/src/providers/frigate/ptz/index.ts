import {
  getPtzCapability,
  startPtzMotion,
  type PtzDirection,
} from "../../../api/ptz";
import type { HomeAssistantApi } from "../../../core/home-assistant";

export class FrigatePtzProvider {
  public capability(api: HomeAssistantApi, entityId: string) {
    return getPtzCapability(api, "frigate", entityId);
  }

  public start(
    api: HomeAssistantApi,
    entityId: string,
    direction: PtzDirection,
  ) {
    return startPtzMotion(api, "frigate", entityId, direction);
  }
}
