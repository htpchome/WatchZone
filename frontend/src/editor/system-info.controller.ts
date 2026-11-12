import type { ReactiveController, ReactiveControllerHost } from "lit";

import { getSystemInfo, type SystemInfo } from "../api/system-info";
import type { HomeAssistantApi } from "../core/home-assistant";

/** Owns the editor's one-shot, connection-scoped environment snapshot. */
export class SystemInfoController implements ReactiveController {
  public info?: SystemInfo;
  public pending = false;
  public unavailable = false;

  private _generation = 0;
  private _identity?: HomeAssistantApi["identity"];

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public sync(api: HomeAssistantApi): void {
    if (this._identity === api.identity) return;
    this._identity = api.identity;
    const generation = ++this._generation;
    this.info = undefined;
    this.pending = true;
    this.unavailable = false;
    this._host.requestUpdate();
    void getSystemInfo(api)
      .then((info) => {
        if (generation !== this._generation) return;
        this.info = info;
      })
      .catch(() => {
        if (generation !== this._generation) return;
        this.unavailable = true;
      })
      .finally(() => {
        if (generation !== this._generation) return;
        this.pending = false;
        this._host.requestUpdate();
      });
  }

  public hostDisconnected(): void {
    this._generation += 1;
    this._identity = undefined;
    this.info = undefined;
    this.pending = false;
    this.unavailable = false;
  }
}
