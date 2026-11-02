import type { HomeAssistantApi } from "../core/home-assistant";
import { INTEGRATION_ID } from "../core/constants";

export interface CameraRuntimeSnapshot {
  readonly available: boolean;
  readonly entity_id: string;
  readonly provider: string | null;
  readonly resume_at: string | null;
  readonly supported: boolean;
  readonly suspended: boolean;
}

export function subscribeCameraRuntime(
  api: HomeAssistantApi,
  entityId: string,
  callback: (snapshot: CameraRuntimeSnapshot) => void,
): Promise<() => void> {
  return api.subscribeMessage(callback, {
    type: `${INTEGRATION_ID}/camera/runtime/subscribe`,
    entity_id: entityId,
  });
}

export function setCameraSuspended(
  api: HomeAssistantApi,
  entityId: string,
  suspended: boolean,
  resumeAfterSeconds?: number,
): Promise<CameraRuntimeSnapshot> {
  return api.callWS<CameraRuntimeSnapshot>({
    type: `${INTEGRATION_ID}/camera/runtime/set`,
    entity_id: entityId,
    suspended,
    ...(resumeAfterSeconds === undefined
      ? {}
      : { resume_after_seconds: resumeAfterSeconds }),
  });
}
