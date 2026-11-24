import type { ReactiveController, ReactiveControllerHost } from "lit";

import { CLIENT_PROFILE } from "../../core/client-profile";
import { activeCardHeightMode, type CardConfig } from "../../core/config";
import { PHONE_STAGE_MAX_INLINE_SIZE } from "../../stage/layout";
import { HomeAssistantLayoutBridge } from "./home-assistant-layout-bridge";
import { ViewportFitController } from "./viewport-fit.controller";

export { HomeAssistantLayoutBridge } from "./home-assistant-layout-bridge";
export { ViewportFitController } from "./viewport-fit.controller";

interface CardLayoutHost extends ReactiveControllerHost, HTMLElement {
  readonly renderRoot: DocumentFragment | HTMLElement;
}

const USE_MOBILE_HEIGHT_MODE =
  CLIENT_PROFILE.isPhone ||
  (CLIENT_PROFILE.isCompanionApp && CLIENT_PROFILE.isTablet);

function stageInlineSize(inlineSize: number): number {
  return CLIENT_PROFILE.isPhone
    ? Math.min(inlineSize, PHONE_STAGE_MAX_INLINE_SIZE)
    : inlineSize;
}

/** Owns card sizing and the feature-detected Home Assistant layout bridge. */
export class CardLayoutController implements ReactiveController {
  private readonly _haLayout: HomeAssistantLayoutBridge;
  private _resizeFrame?: number;
  private readonly _resizeObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(([entry]) => {
          if (!entry) return;
          const contentBox = Array.isArray(entry.contentBoxSize)
            ? entry.contentBoxSize[0]
            : entry.contentBoxSize;
          const inlineSize = contentBox?.inlineSize ?? entry.contentRect.width;
          this._scheduleInlineSize(inlineSize);
        });
  private _sizeBoundary?: HTMLElement;
  private readonly _viewportFit: ViewportFitController;

  public constructor(
    private readonly _host: CardLayoutHost,
    private readonly _setInlineSize: (inlineSize: number) => void,
  ) {
    this._haLayout = new HomeAssistantLayoutBridge(_host);
    this._viewportFit = new ViewportFitController(_host);
    _host.addController(this);
  }

  public configure(config: CardConfig): void {
    const edgeToEdge = config.edge_to_edge_phone && CLIENT_PROFILE.isPhone;
    const mode = activeCardHeightMode(config, USE_MOBILE_HEIGHT_MODE);
    const fitViewport = mode === "fit_viewport";
    const companionFitViewport =
      edgeToEdge && CLIENT_PROFILE.isCompanionApp && fitViewport;
    const browserEdgeToEdge =
      fitViewport && edgeToEdge && CLIENT_PROFILE.application === "browser";

    this._host.classList.toggle("mobile-edge-to-edge", edgeToEdge);
    this._host.classList.toggle(
      "companion-edge-to-edge-fit-viewport",
      companionFitViewport,
    );
    this._haLayout.configure(edgeToEdge);
    this._viewportFit.configure(fitViewport, browserEdgeToEdge);
    for (const value of ["auto", "fit-viewport", "fill-container"]) {
      this._host.classList.toggle(
        `height-mode-${value}`,
        value === mode.replaceAll("_", "-"),
      );
    }
  }

  public hostUpdated(): void {
    const boundary =
      this._host.renderRoot.querySelector<HTMLElement>(".shell") ?? undefined;
    if (!boundary || boundary === this._sizeBoundary) return;
    this._resizeObserver?.disconnect();
    this._sizeBoundary = boundary;
    this._resizeObserver?.observe(boundary);
    this._scheduleInlineSize(boundary.getBoundingClientRect().width);
  }

  public hostDisconnected(): void {
    this._resizeObserver?.disconnect();
    this._sizeBoundary = undefined;
    if (this._resizeFrame !== undefined)
      cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = undefined;
    this._haLayout.release();
  }

  private _scheduleInlineSize(inlineSize: number): void {
    if (this._resizeFrame !== undefined)
      cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = requestAnimationFrame(() => {
      this._resizeFrame = undefined;
      this._setInlineSize(stageInlineSize(inlineSize));
    });
  }
}

/** Projects device-specific appearance onto the stable presentation fields. */
export function activeDeviceAppearanceConfig(
  config: CardConfig,
  isPhone: boolean,
): CardConfig {
  if (!isPhone) return config;
  return {
    ...config,
    camera_bar_rounded_corners: config.camera_bar_rounded_corners_phone,
    camera_bar_shadows: config.camera_bar_shadows_phone,
    camera_rounded_corners: config.camera_rounded_corners_phone,
    camera_shadows: config.camera_shadows_phone,
    event_rounded_corners: config.event_rounded_corners_phone,
    event_shadows: config.event_shadows_phone,
    outer_padding: config.outer_padding_phone,
    outer_shadows: config.outer_shadows_phone,
    rounded_outer_corners: config.rounded_outer_corners_phone,
  };
}
