import { APP_NAME } from "../core/constants";
import { getMediaSessionManager } from "../core/media-session-manager";
import type {
  HomeAssistantApi,
  HomeAssistantConnection,
  HomeAssistantMessage,
  HomeAssistantSubscriptionOptions,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";

export type BackendRecoveryKind =
  "incompatible_settings" | "load_failed" | "setup_required";

export interface BackendAvailabilityIncident {
  readonly backendVersion?: string;
  readonly checking: boolean;
  readonly kind: BackendRecoveryKind;
  readonly savedSettingsVersion?: number;
  readonly supportedSettingsVersion?: number;
}

type AvailabilityListener = (
  incident: BackendAvailabilityIncident | undefined,
) => void;

interface ConnectionAvailability {
  incident?: BackendAvailabilityIncident;
  readonly listeners: Set<AvailabilityListener>;
}

export function isBackendUnavailableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    readonly code?: unknown;
    readonly message?: unknown;
  };
  return (
    candidate.code === "unknown_command" ||
    (typeof candidate.message === "string" &&
      candidate.message.trim().toLocaleLowerCase() ===
        `${APP_NAME.toLocaleLowerCase()} is not configured`)
  );
}

/** One circuit per Home Assistant connection, shared by every card instance. */
export class BackendAvailabilityManager {
  private readonly _connections = new WeakMap<
    HomeAssistantConnection,
    ConnectionAvailability
  >();

  public guard(api: HomeAssistantApi): HomeAssistantApi {
    return {
      ...api,
      callWS: <T>(message: HomeAssistantMessage): Promise<T> =>
        this._call(api, () => api.callWS<T>(message)),
      subscribeMessage: <T>(
        callback: (message: T) => void,
        message: HomeAssistantMessage,
        options?: HomeAssistantSubscriptionOptions,
      ): Promise<HomeAssistantUnsubscribe> =>
        this._call(api, () => api.subscribeMessage(callback, message, options)),
    };
  }

  public reportSetupRequired(api: HomeAssistantApi): void {
    const availability = this._availability(api.identity);
    if (availability.incident?.kind === "setup_required") return;
    this._setIncident(api.identity, {
      checking: false,
      kind: "setup_required",
    });
    getMediaSessionManager().invalidateAll();
  }

  public snapshot(
    api: HomeAssistantApi,
  ): BackendAvailabilityIncident | undefined {
    return this._availability(api.identity).incident;
  }

  public subscribe(
    api: HomeAssistantApi,
    listener: AvailabilityListener,
  ): () => void {
    const availability = this._availability(api.identity);
    availability.listeners.add(listener);
    listener(availability.incident);
    return () => availability.listeners.delete(listener);
  }

  public async retry(api: HomeAssistantApi): Promise<void> {
    const current = this._availability(api.identity).incident;
    this._setIncident(api.identity, {
      ...(current ?? { kind: "setup_required" as const }),
      checking: true,
    });
    try {
      const { diagnoseBackend } = await import("./backend-diagnosis");
      this._setIncident(api.identity, await diagnoseBackend(api));
    } catch {
      this._setIncident(api.identity, {
        checking: false,
        kind: "setup_required",
      });
    }
  }

  private _availability(
    identity: HomeAssistantConnection,
  ): ConnectionAvailability {
    let availability = this._connections.get(identity);
    if (!availability) {
      availability = { listeners: new Set() };
      this._connections.set(identity, availability);
    }
    return availability;
  }

  private async _call<T>(
    api: HomeAssistantApi,
    request: () => Promise<T>,
  ): Promise<T> {
    if (this._availability(api.identity).incident) {
      throw new Error(`${APP_NAME} is waiting for setup or recovery.`);
    }
    try {
      return await request();
    } catch (error) {
      this._reportFailure(api, error);
      throw error;
    }
  }

  private _reportFailure(api: HomeAssistantApi, error: unknown): void {
    if (!isBackendUnavailableError(error)) return;
    const availability = this._availability(api.identity);
    if (availability.incident) return;
    this._setIncident(api.identity, {
      checking: true,
      kind: "setup_required",
    });
    getMediaSessionManager().invalidateAll();
    void import("./backend-diagnosis")
      .then(({ diagnoseBackend }) => diagnoseBackend(api))
      .then((incident) => {
        this._setIncident(api.identity, incident);
      })
      .catch(() => {
        this._setIncident(api.identity, {
          checking: false,
          kind: "setup_required",
        });
      });
  }

  private _setIncident(
    identity: HomeAssistantConnection,
    incident: BackendAvailabilityIncident | undefined,
  ): void {
    const availability = this._availability(identity);
    availability.incident = incident;
    for (const listener of availability.listeners) listener(incident);
  }
}

export const backendAvailability = new BackendAvailabilityManager();
