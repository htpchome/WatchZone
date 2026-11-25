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
import type {
  CompanionLandscapeGeometry,
  CompanionRotationSettlement,
} from "./companion-rotation-settlement";
import { ViewportFitController } from "./viewport-fit.controller";

export { HomeAssistantLayoutBridge } from "./home-assistant-layout-bridge";
export { ViewportFitController } from "./viewport-fit.controller";

interface CardLayoutHost extends ReactiveControllerHost, HTMLElement {
  readonly preview?: boolean;
  readonly renderRoot: DocumentFragment | HTMLElement;
}

const IMMERSIVE_GEOMETRY_PROPERTIES = [
  "--wzc-immersive-safe-bottom",
  "--wzc-immersive-safe-left",
  "--wzc-immersive-safe-right",
  "--wzc-immersive-safe-top",
  "--wzc-immersive-viewport-height",
  "--wzc-immersive-viewport-left",
  "--wzc-immersive-viewport-top",
  "--wzc-immersive-viewport-width",
] as const;

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
  private _committedCompanionPortrait?: boolean;
  private _immersiveEligible = false;
  private _companionLandscapePending = false;
  private _companionSettlement?: Promise<CompanionRotationSettlement>;
  private _companionTransaction = 0;
  private _stageDialog?: HTMLDialogElement;
  private _stageDialogModal = false;
  private _dialogWarningReported = false;
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
    const wasImmersiveEligible = this._immersiveEligible;
    this._immersiveEligible = config.stage_type === "full";

    this._host.classList.toggle("mobile-edge-to-edge", edgeToEdge);
    this._host.classList.toggle(
      "companion-edge-to-edge-fit-viewport",
      companionFitViewport,
    );
    this._haLayout.configure(edgeToEdge);
    this._viewportFit.configure(fitViewport, browserEdgeToEdge);
    if (!this._immersiveEligible) {
      this._releaseCompanionTopLayer();
    } else if (
      !wasImmersiveEligible &&
      this._committedCompanionPortrait === false
    ) {
      this._beginCompanionLandscapeSettlement();
    }
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
    const stageDialog =
      this._host.renderRoot.querySelector<HTMLDialogElement>(
        ".companion-stage-dialog",
      ) ?? undefined;
    if (stageDialog !== this._stageDialog) {
      this._stageDialog?.removeEventListener(
        "cancel",
        this._preventDialogClose,
      );
      this._stageDialog = stageDialog;
      this._stageDialog?.addEventListener("cancel", this._preventDialogClose);
      if (
        this._stageDialog &&
        (this._companionLandscapePending ||
          this._committedCompanionPortrait === false) &&
        this._canUseCompanionTopLayer()
      ) {
        this._enterCompanionTopLayer();
      }
    }
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
    this._stageDialog?.removeEventListener("cancel", this._preventDialogClose);
    if (this._stageDialog?.open) this._stageDialog.close();
    this._stageDialog = undefined;
    this._stageDialogModal = false;
    if (this._resizeFrame !== undefined)
      cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = undefined;
    this._cancelCompanionLandscapeSettlement();
    this._releaseCompanionTopLayer();
    this._haLayout.release();
  }

  private readonly _handleCompanionOrientationChange = (
    event: MediaQueryListEvent,
  ): void => {
    if (event.matches) {
      this._cancelCompanionLandscapeSettlement();
      if (this._stageDialogModal)
        this._host.classList.add("companion-rotation-settling");
      this._commitCompanionProfile(true);
    } else {
      this._beginCompanionLandscapeSettlement();
    }
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
      if (this._companionPortraitQuery) {
        // A stale landscape media query must never leave the two-column Stage
        // inside a card that has already become physically narrow.
        if (
          this._companionPortraitQuery.matches ||
          bounds.width <= PHONE_STAGE_MAX_INLINE_SIZE
        ) {
          this._cancelCompanionLandscapeSettlement();
          if (this._committedCompanionPortrait !== true)
            this._commitCompanionProfile(true);
        } else if (
          !this._companionLandscapePending &&
          this._committedCompanionPortrait !== false
        ) {
          this._beginCompanionLandscapeSettlement();
        }
        return;
      }
      this._setLayoutProfile(
        stageLayoutProfile(
          bounds.width,
          availableBlockSize,
          STAGE_LAYOUT_CLIENT_MODE,
        ),
      );
    });
  };

  private _beginCompanionLandscapeSettlement(): void {
    this._companionLandscapePending = true;
    if (this._canUseCompanionTopLayer()) {
      this._host.classList.add(
        "companion-landscape-immersive",
        "companion-rotation-settling",
      );
      this._enterCompanionTopLayer();
    }
    const settlement = (this._companionSettlement ??=
      import("./companion-rotation-settlement").then(
        ({ CompanionRotationSettlement }) =>
          new CompanionRotationSettlement(this._host, CLIENT_PROFILE.isAndroid),
      ));
    void settlement.then((controller) => {
      const boundary = this._sizeBoundary;
      if (!boundary || this._companionPortraitQuery?.matches) {
        this._companionLandscapePending = false;
        return;
      }
      controller.start(boundary, (geometry) => {
        this._companionLandscapePending = false;
        if (this._companionPortraitQuery?.matches) return;
        this._commitCompanionProfile(false, geometry);
      });
    });
  }

  private _commitCompanionProfile(
    portrait: boolean,
    geometry?: CompanionLandscapeGeometry,
  ): void {
    const immersive =
      !portrait && Boolean(geometry) && this._canUseCompanionTopLayer();
    const transaction = ++this._companionTransaction;
    if (immersive && geometry) this._applyCompanionImmersiveGeometry(geometry);
    this._committedCompanionPortrait = portrait;
    this._setLayoutProfile(companionStageLayoutProfile(portrait));
    void this._finishCompanionProfileCommit(transaction, immersive);
  }

  private async _finishCompanionProfileCommit(
    transaction: number,
    immersive: boolean,
  ): Promise<void> {
    await this._host.updateComplete;
    if (transaction !== this._companionTransaction) return;
    if (!immersive) this._releaseCompanionTopLayer();
    this._host.classList.remove("companion-rotation-settling");
    this._scheduleMeasure();
  }

  private _canUseCompanionTopLayer(): boolean {
    return (
      this._immersiveEligible &&
      !this._host.classList.contains("card-picker-preview-host") &&
      this._host.preview !== true
    );
  }

  private _applyCompanionImmersiveGeometry(
    geometry: CompanionLandscapeGeometry,
  ): void {
    const values: Readonly<
      Record<(typeof IMMERSIVE_GEOMETRY_PROPERTIES)[number], number>
    > = {
      "--wzc-immersive-safe-bottom": geometry.safeBottom,
      "--wzc-immersive-safe-left": geometry.safeLeft,
      "--wzc-immersive-safe-right": geometry.safeRight,
      "--wzc-immersive-safe-top": geometry.safeTop,
      "--wzc-immersive-viewport-height": geometry.viewportHeight,
      "--wzc-immersive-viewport-left": geometry.viewportLeft,
      "--wzc-immersive-viewport-top": geometry.viewportTop,
      "--wzc-immersive-viewport-width": geometry.viewportWidth,
    };
    for (const property of IMMERSIVE_GEOMETRY_PROPERTIES) {
      this._host.style.setProperty(property, `${values[property]}px`);
    }
  }

  private _releaseCompanionTopLayer(): void {
    ++this._companionTransaction;
    this._host.classList.remove(
      "companion-landscape-immersive",
      "companion-rotation-settling",
    );
    for (const property of IMMERSIVE_GEOMETRY_PROPERTIES) {
      this._host.style.removeProperty(property);
    }
    this._leaveCompanionTopLayer();
  }

  private _cancelCompanionLandscapeSettlement(): void {
    this._companionLandscapePending = false;
    void this._companionSettlement?.then((controller) => controller.cancel());
  }

  private readonly _preventDialogClose = (event: Event): void => {
    event.preventDefault();
  };

  private _enterCompanionTopLayer(): void {
    const dialog = this._stageDialog;
    if (!dialog || this._stageDialogModal) return;
    try {
      if (dialog.open) dialog.close();
      dialog.showModal();
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("role", "dialog");
      this._stageDialogModal = true;
    } catch (error) {
      if (!dialog.open && dialog.isConnected) dialog.show();
      if (!this._dialogWarningReported) {
        this._dialogWarningReported = true;
        console.warn(
          "CameraOptics could not enter the Companion Stage top layer.",
          error,
        );
      }
    }
  }

  private _leaveCompanionTopLayer(): void {
    const dialog = this._stageDialog;
    if (!dialog) return;
    if (dialog.open) dialog.close();
    if (dialog.isConnected) dialog.show();
    dialog.removeAttribute("aria-modal");
    dialog.setAttribute("role", "region");
    this._stageDialogModal = false;
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
