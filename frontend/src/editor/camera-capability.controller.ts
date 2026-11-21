import {
  html,
  type ReactiveController,
  type ReactiveControllerHost,
} from "lit";

import {
  listLiveSources,
  resolveLiveSource,
  type LiveSourceOption,
} from "../api/live-source";
import type { PtzCapability } from "../api/ptz";
import type { LiveConnectionType } from "../core/config";
import type { HomeAssistantApi } from "../core/home-assistant";
import { PtzSourceResolver } from "../providers/ptz-source-resolver";
import { TalkSourceResolver } from "../providers/talk-source-resolver";

/** Owns cancellable capability probes for the camera currently edited. */
export class CameraCapabilityController implements ReactiveController {
  public talk?: boolean;
  public talkPending = false;
  public ptz?: PtzCapability;
  public ptzPending = false;
  public frigateAvailable = false;
  public frigatePending = false;
  public frigateStreams: readonly LiveSourceOption[] = [];

  private _talkGeneration = 0;
  private _ptzGeneration = 0;
  private _frigateGeneration = 0;
  private readonly _talkResolver = new TalkSourceResolver();
  private readonly _ptzResolver = new PtzSourceResolver();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _api: () => HomeAssistantApi | undefined,
  ) {
    _host.addController(this);
  }

  public hostDisconnected(): void {
    this.reset();
  }

  public check(entityId: string, connection: LiveConnectionType): void {
    this.checkConnection(entityId);
    this.checkTalk(entityId, connection);
    this.checkPtz(entityId, connection);
  }

  public renderStreamSelector(
    hass: unknown,
    value: string | undefined,
    labels: readonly [field: string, main: string, help: string],
    onChange: unknown,
  ) {
    const options = [
      { label: labels[1], value: "" },
      ...this.frigateStreams.map(({ key, label }) => ({ label, value: key })),
    ];
    return html`<ha-selector
        label=${labels[0]}
        .hass=${hass}
        .selector=${{ select: { mode: "dropdown", options } }}
        .value=${value ?? ""}
        .disabled=${this.frigatePending}
        @value-changed=${onChange}
      ></ha-selector>
      <small class="capability-status">${labels[2]}</small>`;
  }

  public checkTalk(entityId: string, connection: LiveConnectionType): void {
    const generation = ++this._talkGeneration;
    this.talk = undefined;
    const api = this._validApi(entityId);
    if (!api) {
      this.talkPending = false;
      this._host.requestUpdate();
      return;
    }
    this.talkPending = true;
    this._host.requestUpdate();
    void this._talkResolver
      .supports(api, connection, entityId)
      .catch(() => false)
      .then((supported) => {
        if (generation !== this._talkGeneration) return;
        this.talk = supported;
        this.talkPending = false;
        this._host.requestUpdate();
      });
  }

  public checkPtz(entityId: string, connection: LiveConnectionType): void {
    const generation = ++this._ptzGeneration;
    this.ptz = undefined;
    const api = this._validApi(entityId);
    if (!api) {
      this.ptzPending = false;
      this._host.requestUpdate();
      return;
    }
    this.ptzPending = true;
    this._host.requestUpdate();
    void this._ptzResolver
      .capability(api, connection, entityId)
      .catch(() => undefined)
      .then((capability) => {
        if (generation !== this._ptzGeneration) return;
        this.ptz = capability;
        this.ptzPending = false;
        this._host.requestUpdate();
      });
  }

  public checkConnection(entityId: string): void {
    const generation = ++this._frigateGeneration;
    this.frigateAvailable = false;
    this.frigateStreams = [];
    const api = this._validApi(entityId);
    if (!api) {
      this.frigatePending = false;
      this._host.requestUpdate();
      return;
    }
    this.frigatePending = true;
    this._host.requestUpdate();
    void resolveLiveSource(api, "frigate_go2rtc", entityId)
      .then(() =>
        listLiveSources(api, "frigate_go2rtc", entityId).catch(() => []),
      )
      .then((streams) => ({ available: true, streams }))
      .catch(() => ({ available: false, streams: [] }))
      .then(({ available, streams }) => {
        if (generation !== this._frigateGeneration) return;
        this.frigateAvailable = available;
        this.frigateStreams = Array.isArray(streams) ? streams : [];
        this.frigatePending = false;
        this._host.requestUpdate();
      });
  }

  public reset(): void {
    this._talkGeneration += 1;
    this._ptzGeneration += 1;
    this._frigateGeneration += 1;
    this.talk = undefined;
    this.talkPending = false;
    this.ptz = undefined;
    this.ptzPending = false;
    this.frigateAvailable = false;
    this.frigatePending = false;
    this.frigateStreams = [];
  }

  private _validApi(entityId: string): HomeAssistantApi | undefined {
    return entityId.startsWith("camera.") ? this._api() : undefined;
  }
}
