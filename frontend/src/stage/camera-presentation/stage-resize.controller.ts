import type { ReactiveController, ReactiveControllerHost } from "lit";

import { CAMERA_STAGE_SIZE_CHANGE_EVENT } from "../../core/constants";
import {
  DEFAULT_MEDIA_STAGE_HEIGHT_RATIO,
  MediaStageResizeController,
  type MediaStageResizeInteraction,
  type MediaStageSize,
} from "../../ui/media-overlay/stage-resize.controller";

export const DEFAULT_CAMERA_STAGE_HEIGHT_RATIO =
  DEFAULT_MEDIA_STAGE_HEIGHT_RATIO;
const MAX_HEIGHT_RATIO = 1;
const STAGE_CONSTRAINT_TOLERANCE = 0.01;

export type CameraStageResizeInteraction = MediaStageResizeInteraction;
export type CameraStageSize = MediaStageSize;

export interface CameraStageSizeChangeDetail extends CameraStageSize {
  readonly transient?: boolean;
}

type CameraStageSizeEventHost = HTMLElement & ReactiveControllerHost;

/** Coalesces transient stage-size intents while preserving one final update. */
export class CameraStageSizeEventController implements ReactiveController {
  private _active = false;
  private _frame?: number;
  private _interactionUpdated = false;
  private _lastDetail?: CameraStageSizeChangeDetail;
  private _pending?: CameraStageSize;

  public constructor(private readonly _host: CameraStageSizeEventHost) {
    _host.addController(this);
  }

  public begin(): void {
    this._active = true;
    this._interactionUpdated = false;
  }

  public update(size: CameraStageSize): void {
    if (!this._active) {
      this._cancelPending();
      this._dispatch(size, false);
      return;
    }
    this._interactionUpdated = true;
    this._pending = size;
    this._frame ??= requestAnimationFrame(this._flush);
  }

  public end(size: CameraStageSize): void {
    const interactionUpdated = this._interactionUpdated;
    this._active = false;
    this._interactionUpdated = false;
    this._cancelPending();
    if (interactionUpdated) this._dispatch(size, false);
  }

  public hostDisconnected(): void {
    this._active = false;
    this._interactionUpdated = false;
    this._cancelPending();
    this._lastDetail = undefined;
  }

  private readonly _flush = (): void => {
    this._frame = undefined;
    const size = this._pending;
    this._pending = undefined;
    if (size) this._dispatch(size, true);
  };

  private _cancelPending(): void {
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
    this._pending = undefined;
  }

  private _dispatch(size: CameraStageSize, transient: boolean): void {
    const detail = { ...size, transient };
    if (
      detail.heightRatio === this._lastDetail?.heightRatio &&
      detail.resized === this._lastDetail.resized &&
      detail.transient === this._lastDetail.transient
    ) {
      return;
    }
    this._lastDetail = detail;
    this._host.dispatchEvent(
      new CustomEvent(CAMERA_STAGE_SIZE_CHANGE_EVENT, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }
}

/** Camera-specific adapter over the shared media-stage resize controller. */
export class CameraStageResizeController extends MediaStageResizeController {
  public constructor(
    host: ReactiveControllerHost,
    onInteraction?: (interaction: CameraStageResizeInteraction) => void,
    onMediaPresentationScaleChange?: (scale: number) => void,
    onSizeChange?: (size: CameraStageSize) => void,
  ) {
    super(host, {
      maximumHeightRatio: () => MAX_HEIGHT_RATIO,
      onInteraction,
      onMediaPresentationScaleChange,
      onSizeChange,
      presentationAspectRatioProperty:
        "--wzc-camera-stage-runtime-aspect-ratio",
      resizedClass: "stage-resized",
      stageIsConstrained: (rect, size) =>
        !size.resized &&
        rect.width > 0 &&
        Math.abs(rect.height / rect.width - DEFAULT_CAMERA_STAGE_HEIGHT_RATIO) >
          STAGE_CONSTRAINT_TOLERANCE,
    });
  }
}
