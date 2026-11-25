import type { ReactiveController, ReactiveControllerHost } from "lit";

import { CLIENT_PROFILE } from "../../core/client-profile";
import {
  activeCardHeightMode,
  type CardConfig,
  type CardHeightMode,
} from "../../core/config";
import {
  companionStageLayoutProfile,
  PHONE_STAGE_MAX_INLINE_SIZE,
  STAGE_LAYOUT_COMPANION_MOBILE,
  STAGE_LAYOUT_CONTAINER,
  STAGE_LAYOUT_PHONE_BROWSER,
  stageLayoutProfile,
  type StageLayoutProfile,
} from "../../stage/layout";
import { HomeAssistantLayoutBridge } from "./home-assistant-layout-bridge";
import { ViewportFitController } from "./viewport-fit.controller";

export { HomeAssistantLayoutBridge } from "./home-assistant-layout-bridge";
export { ViewportFitController } from "./viewport-fit.controller";

interface CardLayoutHost extends ReactiveControllerHost, HTMLElement {
  readonly renderRoot: DocumentFragment | HTMLElement;
}

const STAGE_LAYOUT_CLIENT_MODE =
  CLIENT_PROFILE.isCompanionApp && CLIENT_PROFILE.isMobile
    ? STAGE_LAYOUT_COMPANION_MOBILE
    : CLIENT_PROFILE.isPhone ||
        (CLIENT_PROFILE.hasTouch &&
          (screen.width <= PHONE_STAGE_MAX_INLINE_SIZE ||
            screen.height <= PHONE_STAGE_MAX_INLINE_SIZE))
      ? STAGE_LAYOUT_PHONE_BROWSER
      : STAGE_LAYOUT_CONTAINER;
export const USES_MOBILE_STAGE =
  STAGE_LAYOUT_CLIENT_MODE !== STAGE_LAYOUT_CONTAINER;
const USE_MOBILE_HEIGHT_MODE = USES_MOBILE_STAGE;

/** Owns card sizing and the feature-detected Home Assistant layout bridge. */
export class CardLayoutController implements ReactiveController {
  private readonly _companionPortraitQuery =
    STAGE_LAYOUT_CLIENT_MODE === STAGE_LAYOUT_COMPANION_MOBILE
      ? window.matchMedia("(orientation: portrait)")
      : undefined;
  private readonly _haLayout: HomeAssistantLayoutBridge;
  private _heightMode: CardHeightMode = "auto";
  private _resizeFrame?: number;
  private readonly _resizeObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => this._scheduleMeasure());
  private _sizeBoundary?: HTMLElement;
  private readonly _viewportFit: ViewportFitController;

  public constructor(
    private readonly _host: CardLayoutHost,
    private readonly _setLayoutProfile: (profile: StageLayoutProfile) => void,
  ) {
    this._haLayout = new HomeAssistantLayoutBridge(_host);
    this._viewportFit = new ViewportFitController(_host, this._scheduleMeasure);
    _host.addController(this);
  }

  public configure(config: CardConfig): void {
    const edgeToEdge = config.edge_to_edge_phone && CLIENT_PROFILE.isPhone;
    const mode = activeCardHeightMode(config, USE_MOBILE_HEIGHT_MODE);
    this._heightMode = mode;
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
    this._scheduleMeasure();
  }

  public hostConnected(): void {
    if (
      CLIENT_PROFILE.isAndroid &&
      STAGE_LAYOUT_CLIENT_MODE === STAGE_LAYOUT_COMPANION_MOBILE
    )
      this._host.classList.add("android-companion");
    this._companionPortraitQuery?.addEventListener(
      "change",
      this._handleCompanionOrientationChange,
    );
    window.addEventListener("resize", this._scheduleMeasure);
    window.visualViewport?.addEventListener("resize", this._scheduleMeasure);
  }

  public hostUpdated(): void {
    const boundary =
      this._host.renderRoot.querySelector<HTMLElement>(".shell") ?? undefined;
    if (!boundary || boundary === this._sizeBoundary) return;
    this._resizeObserver?.disconnect();
    this._sizeBoundary = boundary;
    this._resizeObserver?.observe(boundary);
    this._scheduleMeasure();
  }

  public hostDisconnected(): void {
    this._companionPortraitQuery?.removeEventListener(
      "change",
      this._handleCompanionOrientationChange,
    );
    window.removeEventListener("resize", this._scheduleMeasure);
    window.visualViewport?.removeEventListener("resize", this._scheduleMeasure);
    this._resizeObserver?.disconnect();
    this._sizeBoundary = undefined;
    if (this._resizeFrame !== undefined)
      cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = undefined;
    this._haLayout.release();
  }

  private readonly _handleCompanionOrientationChange = (
    event: MediaQueryListEvent,
  ): void => {
    this._setLayoutProfile(companionStageLayoutProfile(event.matches));
    this._scheduleMeasure();
  };

  private readonly _scheduleMeasure = (): void => {
    if (this._resizeFrame !== undefined)
      cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = requestAnimationFrame(() => {
      this._resizeFrame = undefined;
      const boundary = this._sizeBoundary;
      if (!boundary) return;
      const bounds = boundary.getBoundingClientRect();
      const viewportBlockSize =
        window.visualViewport?.height ?? window.innerHeight;
      const constrainedBlockSize =
        this._heightMode === "fit_viewport"
          ? this._viewportFit.blockSize
          : this._heightMode === "fill_container" && bounds.height > 0
            ? bounds.height
            : undefined;
      const availableBlockSize = Math.min(
        constrainedBlockSize ?? viewportBlockSize,
        viewportBlockSize,
      );
      if (bounds.width <= 0 || availableBlockSize <= 0) return;
      this._setLayoutProfile(
        this._companionPortraitQuery
          ? companionStageLayoutProfile(this._companionPortraitQuery.matches)
          : stageLayoutProfile(
              bounds.width,
              availableBlockSize,
              STAGE_LAYOUT_CLIENT_MODE,
            ),
      );
    });
  };
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
