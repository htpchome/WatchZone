import type { ReactiveController, ReactiveControllerHost } from "lit";

import { MAX_EVENT_HISTORY_DAYS } from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { openRecordedMedia } from "../../core/recorded-media";

const DEEP_LINK_PARAMETERS = ["camera", "event", "review", "media"] as const;
const claims = new Map<string, object>();

export interface DeepLinkTarget {
  readonly camera: string;
  readonly eventId?: string;
  readonly media: "snapshot" | "video";
  readonly reviewId?: string;
}

interface ResolvedDeepLinkTarget extends DeepLinkTarget {
  readonly cameraEntityId: string;
  readonly signature: string;
}

export interface DeepLinkContext {
  readonly api?: HomeAssistantApi;
  readonly cameraSelection?: {
    selectCamera(entityId: string): boolean;
  };
  readonly cameras: readonly DeepLinkCamera[];
  readonly enabled: boolean;
}

export interface DeepLinkCamera {
  readonly entityId: string;
  readonly title: string;
}

/** Consumes notification URL state without depending on any Stage module. */
export class DeepLinkController implements ReactiveController {
  private _generation = 0;
  private _mediaStarted = false;
  private _resolver?: { stop(): void };
  private _target?: ResolvedDeepLinkTarget;

  public constructor(
    private readonly _host: ReactiveControllerHost & EventTarget,
    private readonly _context: () => DeepLinkContext,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    window.addEventListener("hashchange", this._handleLocationChange);
    window.addEventListener("location-changed", this._handleLocationChange);
    window.addEventListener("popstate", this._handleLocationChange);
    this._readLocation();
    this._apply();
  }

  public hostUpdated(): void {
    this._readLocation();
    this._apply();
  }

  public hostDisconnected(): void {
    window.removeEventListener("hashchange", this._handleLocationChange);
    window.removeEventListener("location-changed", this._handleLocationChange);
    window.removeEventListener("popstate", this._handleLocationChange);
    this._reset();
  }

  private readonly _handleLocationChange = (): void => {
    this._readLocation();
    this._host.requestUpdate();
  };

  private _readLocation(): void {
    const context = this._context();
    if (!context.enabled) {
      if (this._target) this._reset();
      return;
    }
    const parsed = parseDeepLink(window.location);
    if (!parsed) {
      if (this._target) this._reset();
      return;
    }
    const signature = deepLinkSignature(parsed);
    if (signature === this._target?.signature) return;
    const cameraEntityId = resolveDeepLinkCamera(
      parsed.camera,
      context.cameras,
    );
    if (!cameraEntityId || !claim(signature, this)) return;
    this._reset();
    claims.set(signature, this);
    this._target = { ...parsed, cameraEntityId, signature };
  }

  private _apply(): void {
    const target = this._target;
    if (
      !target ||
      !this._context().cameraSelection?.selectCamera(target.cameraEntityId)
    )
      return;
    if (!target.eventId && !target.reviewId) {
      this._consume(target);
      return;
    }
    if (this._mediaStarted) return;
    const { api } = this._context();
    if (!api) return;
    this._mediaStarted = true;
    const generation = ++this._generation;
    void import("./resolver").then(({ ActivityDeepLinkResolver }) => {
      if (generation !== this._generation || target !== this._target) return;
      const resolver = new ActivityDeepLinkResolver({
        api,
        cameraEntityId: target.cameraEntityId,
        eventId: target.eventId,
        historyDays: MAX_EVENT_HISTORY_DAYS,
        media: target.media,
        onOpen: (request) => {
          if (generation !== this._generation || target !== this._target)
            return;
          openRecordedMedia(this._host, request);
          this._consume(target);
        },
        reviewId: target.reviewId,
      });
      this._resolver = resolver;
      resolver.start();
    });
  }

  private _consume(target: ResolvedDeepLinkTarget): void {
    if (
      deepLinkSignature(parseDeepLink(window.location)) === target.signature
    ) {
      removeDeepLinkParameters(window.location, window.history);
    }
    this._reset();
  }

  private _reset(): void {
    this._generation += 1;
    this._resolver?.stop();
    this._resolver = undefined;
    this._mediaStarted = false;
    const signature = this._target?.signature;
    if (signature && claims.get(signature) === this) claims.delete(signature);
    this._target = undefined;
  }
}

export function parseDeepLink(
  location: Pick<Location, "hash" | "search">,
): DeepLinkTarget | undefined {
  const search = new URLSearchParams(location.search);
  const hashQuery = location.hash.includes("?")
    ? new URLSearchParams(location.hash.slice(location.hash.indexOf("?") + 1))
    : new URLSearchParams();
  const parameter = (name: string): string | undefined => {
    const value = search.get(name) ?? hashQuery.get(name);
    return value?.trim() || undefined;
  };
  const camera = parameter("camera");
  if (!camera) return undefined;
  return {
    camera,
    eventId: parameter("event"),
    media: parameter("media") === "snapshot" ? "snapshot" : "video",
    reviewId: parameter("review"),
  };
}

export function resolveDeepLinkCamera(
  reference: string,
  cameras: readonly DeepLinkCamera[],
): string | undefined {
  const lowerReference = reference.toLocaleLowerCase();
  const exact = cameras.filter(({ entityId, title }) => {
    const objectId = entityId.slice(entityId.indexOf(".") + 1);
    return [entityId, objectId, title]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase() === lowerReference);
  });
  if (exact.length === 1) return exact[0]?.entityId;
  const normalizedReference = normalizeCameraReference(reference);
  const normalized = cameras.filter(({ entityId, title }) => {
    const objectId = entityId.slice(entityId.indexOf(".") + 1);
    return [objectId, title]
      .filter(Boolean)
      .some((value) => normalizeCameraReference(value) === normalizedReference);
  });
  return normalized.length === 1 ? normalized[0]?.entityId : undefined;
}

export function removeDeepLinkParameters(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState" | "state">,
): void {
  const search = new URLSearchParams(location.search);
  for (const parameter of DEEP_LINK_PARAMETERS) search.delete(parameter);
  let hash = location.hash;
  const queryIndex = hash.indexOf("?");
  if (queryIndex >= 0) {
    const hashPath = hash.slice(0, queryIndex);
    const hashSearch = new URLSearchParams(hash.slice(queryIndex + 1));
    for (const parameter of DEEP_LINK_PARAMETERS) hashSearch.delete(parameter);
    const remaining = hashSearch.toString();
    hash = `${hashPath}${remaining ? `?${remaining}` : ""}`;
  }
  const remainingSearch = search.toString();
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${remainingSearch ? `?${remainingSearch}` : ""}${hash}`,
  );
}

function claim(signature: string, owner: object): boolean {
  const current = claims.get(signature);
  return !current || current === owner;
}

function deepLinkSignature(target: DeepLinkTarget | undefined): string {
  return target
    ? [
        target.camera,
        target.eventId ?? "",
        target.reviewId ?? "",
        target.media,
      ].join("\u0000")
    : "";
}

function normalizeCameraReference(value: string): string {
  return value.toLocaleLowerCase().replaceAll(/[^a-z0-9]/g, "");
}
