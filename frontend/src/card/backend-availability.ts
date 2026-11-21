import {
  getBackendBootstrapStatus,
  type BackendBootstrapStatus,
} from "../api/bootstrap-status";
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
  diagnostic?: Promise<void>;
  incident?: BackendAvailabilityIncident;
  readonly listeners: Set<AvailabilityListener>;
}

class BackendCircuitOpenError extends Error {
  public constructor() {
    super(`${APP_NAME} is waiting for setup or recovery.`);
    this.name = "BackendCircuitOpenError";
  }
}

function errorDetails(error: unknown): { code?: string; message?: string } {
  if (typeof error !== "object" || error === null) return {};
  const candidate = error as {
    readonly code?: unknown;
    readonly message?: unknown;
  };
  return {
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
    ...(typeof candidate.message === "string"
      ? { message: candidate.message }
      : {}),
  };
}

export function isBackendUnavailableError(error: unknown): boolean {
  const { code, message } = errorDetails(error);
  if (code === "unknown_command") return true;
  return (
    message?.trim().toLocaleLowerCase() ===
    `${APP_NAME.toLocaleLowerCase()} is not configured`
  );
}

function incidentFromStatus(
  status: BackendBootstrapStatus,
  checking = false,
): BackendAvailabilityIncident | undefined {
  if (status.state === "ready") return undefined;
  const kind: BackendRecoveryKind =
    status.state === "incompatible_settings"
      ? "incompatible_settings"
      : status.state === "not_configured"
        ? "setup_required"
        : "load_failed";
  return {
    backendVersion: status.backend_version,
    checking,
    kind,
    ...(status.saved_settings_version === null
      ? {}
      : { savedSettingsVersion: status.saved_settings_version }),
    supportedSettingsVersion: status.supported_settings_version,
  };
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
      const status = await getBackendBootstrapStatus(api);
      this._setIncident(api.identity, incidentFromStatus(status));
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

  private _call<T>(
    api: HomeAssistantApi,
    request: () => Promise<T>,
  ): Promise<T> {
    if (this._availability(api.identity).incident) {
      return Promise.reject(new BackendCircuitOpenError());
    }
    try {
      return Promise.resolve(request()).catch((error: unknown) => {
        this._reportFailure(api, error);
        throw error;
      });
    } catch (error) {
      this._reportFailure(api, error);
      return Promise.reject(error);
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
    availability.diagnostic ??= getBackendBootstrapStatus(api)
      .then((status) => {
        this._setIncident(api.identity, incidentFromStatus(status));
      })
      .catch(() => {
        this._setIncident(api.identity, {
          checking: false,
          kind: "setup_required",
        });
      })
      .finally(() => {
        availability.diagnostic = undefined;
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
