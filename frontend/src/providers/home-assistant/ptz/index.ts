import {
  getPtzCapability,
  startPtzMotion,
  type PtzCapability,
  type PtzDirection,
} from "../../../api/ptz";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../../../core/home-assistant";

const capabilityCache = new WeakMap<
  HomeAssistantApi["identity"],
  Map<string, Promise<PtzCapability>>
>();

/** PTZ operations exposed by WatchZone's Home Assistant backend adapter. */
export class HomeAssistantPtzProvider {
  public capability(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<PtzCapability> {
    let cameras = capabilityCache.get(api.identity);
    if (!cameras) {
      cameras = new Map();
      capabilityCache.set(api.identity, cameras);
    }
    const existing = cameras.get(entityId);
    if (existing) return existing;
    const request = getPtzCapability(api, "home_assistant", entityId).catch(
      (error: unknown) => {
        cameras?.delete(entityId);
        throw error;
      },
    );
    cameras.set(entityId, request);
    return request;
  }

  public start(
    api: HomeAssistantApi,
    entityId: string,
    direction: PtzDirection,
  ): Promise<HomeAssistantUnsubscribe> {
    return startPtzMotion(api, "home_assistant", entityId, direction);
  }
}
