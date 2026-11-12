import { css } from "lit";

export const HA_DIALOG_SURFACE_BACKGROUND_PROPERTY =
  "--ha-dialog-surface-background";
export const HA_DIALOG_SURFACE_BACKDROP_FILTER_PROPERTY =
  "--ha-dialog-surface-backdrop-filter";

/**
 * The only Home Assistant theme boundary in WatchZone.
 *
 * Components consume semantic --wzc-* tokens exclusively. Keeping HA token
 * aliases here makes theme changes and future design-system migrations local.
 */
export const themeTokens = css`
  :host {
    --wzc-color-primary: var(--primary-color, CanvasText);
    --wzc-color-primary-dark: var(
      --dark-primary-color,
      var(--wzc-color-primary)
    );
    --wzc-color-accent: var(--accent-color, var(--wzc-color-primary));

    --wzc-color-background: var(
      --ha-card-background,
      var(--card-background-color, var(--primary-background-color, Canvas))
    );
    --wzc-color-surface: var(
      --primary-background-color,
      var(--wzc-color-background)
    );
    --wzc-color-surface-secondary: var(
      --secondary-background-color,
      var(--wzc-color-surface)
    );
    --wzc-dialog-background: var(
      --ha-dialog-surface-background,
      var(
        --card-background-color,
        var(--ha-color-surface-default, var(--wzc-color-surface))
      )
    );
    --wzc-dialog-backdrop-filter: var(
      --ha-dialog-surface-backdrop-filter,
      none
    );
    --wzc-dialog-radius: var(
      --ha-dialog-border-radius,
      var(--ha-border-radius-3xl, var(--wzc-radius-large))
    );
    --wzc-dialog-shadow: var(
      --dialog-box-shadow,
      var(--wa-shadow-l, var(--wzc-shadow-medium))
    );
    --wzc-dialog-scrim-background: var(
      --mdc-dialog-scrim-color,
      color-mix(in srgb, black 55%, transparent)
    );
    --wzc-dialog-scrim-backdrop-filter: var(
      --ha-dialog-scrim-backdrop-filter,
      var(--dialog-backdrop-filter, none)
    );
    --wzc-editor-dialog-background: var(
      --ha-color-surface-default,
      var(--secondary-background-color, var(--wzc-color-surface))
    );
    --wzc-editor-dialog-backdrop-filter: none;
    --wzc-task-dialog-background: var(--wzc-color-surface);
    --wzc-task-dialog-backdrop-filter: none;
    --wzc-task-dialog-radius: var(--wzc-dialog-radius);
    --wzc-task-dialog-shadow: var(--wzc-dialog-shadow);
    --wzc-popover-background: var(--wzc-color-surface);
    --wzc-popover-backdrop-filter: none;
    --wzc-popover-radius: var(--wzc-radius-card);
    --wzc-popover-shadow: var(--wzc-shadow-medium);

    --wzc-color-text-1: var(
      --ha-color-text-primary,
      var(--primary-text-color, CanvasText)
    );
    --wzc-color-text-2: var(
      --ha-color-text-secondary,
      var(--secondary-text-color, var(--wzc-color-text-1))
    );
    --wzc-color-text-3: var(
      --disabled-text-color,
      color-mix(in srgb, var(--wzc-color-text-1) 50%, transparent)
    );
    --wzc-color-text-reversed: var(
      --ha-color-on-primary-loud,
      var(--text-primary-color, var(--white-color, #fff))
    );
    --wzc-color-on-primary: var(
      --ha-color-on-primary-normal,
      var(--wzc-color-text-reversed)
    );

    --wzc-color-error: var(
      --ha-color-text-error,
      var(--error-color, var(--wzc-color-text-1))
    );
    --wzc-color-warning: var(--warning-color, var(--wzc-color-accent));
    --wzc-color-success: var(--success-color, var(--wzc-color-primary));
    --wzc-color-on-error: var(
      --ha-color-on-danger-loud,
      var(--wzc-color-text-reversed)
    );
    --wzc-color-on-warning: var(
      --ha-color-on-warning-loud,
      var(--wzc-color-text-1)
    );
    --wzc-color-on-success: var(
      --ha-color-on-success-loud,
      var(--wzc-color-text-reversed)
    );
    --wzc-color-fill-error: var(
      --ha-color-fill-danger-loud-resting,
      var(--wzc-color-error)
    );
    --wzc-color-fill-error-quiet: var(
      --ha-color-fill-danger-quiet-resting,
      color-mix(in srgb, var(--wzc-color-error) 12%, transparent)
    );
    --wzc-color-fill-warning: var(
      --ha-color-fill-warning-loud-resting,
      var(--wzc-color-warning)
    );
    --wzc-color-fill-success: var(
      --ha-color-fill-success-loud-resting,
      var(--wzc-color-success)
    );
    --wzc-color-fill-success-quiet: var(
      --ha-color-fill-success-quiet-resting,
      color-mix(in srgb, var(--wzc-color-success) 12%, transparent)
    );
    --wzc-color-fill-warning-quiet: var(
      --ha-color-fill-warning-quiet-resting,
      color-mix(in srgb, var(--wzc-color-warning) 18%, transparent)
    );
    --wzc-color-warning-text: var(
      --ha-color-on-warning-quiet,
      var(--wzc-color-text-1)
    );
    --wzc-suspend-warning-color: color-mix(
      in srgb,
      var(--wzc-color-warning-text) 55%,
      var(--wzc-color-text-1)
    );
    --wzc-suspend-warning-background: color-mix(
      in srgb,
      var(--wzc-color-fill-warning-quiet) 55%,
      var(--wzc-task-dialog-background)
    );
    --wzc-suspend-warning-border-color: color-mix(
      in srgb,
      var(--wzc-color-border-warning) 45%,
      var(--wzc-color-border)
    );
    --wzc-color-border: var(
      --ha-card-border-color,
      var(--divider-color, color-mix(in srgb, CanvasText 24%, transparent))
    );
    --wzc-color-border-control: var(
      --ha-color-border-neutral-normal,
      var(--wzc-color-border)
    );
    --wzc-color-border-danger: var(
      --ha-color-border-danger-quiet,
      var(--wzc-color-error)
    );
    --wzc-color-border-warning: var(
      --ha-color-border-warning-normal,
      var(--wzc-color-warning)
    );
    --wzc-color-fill-primary: var(
      --ha-color-fill-primary-normal-resting,
      transparent
    );
    --wzc-control-disabled-opacity: var(--disabled-opacity, 0.55);
    --wzc-camera-activity-outline-width: 0.25rem;
    --wzc-camera-alert-outline-color: var(--wzc-color-error);
    --wzc-camera-detection-outline-color: var(--wzc-color-warning);

    --wzc-radius-card: var(
      --wzc-theme-card-radius,
      var(
        --restore-card-border-radius,
        var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px))
      )
    );
    --wzc-radius-large: var(--ha-border-radius-lg, 8px);
    --wzc-radius-medium: var(--ha-border-radius-md, 6px);
    --wzc-radius-small: var(--ha-border-radius-sm, 4px);
    --wzc-radius-button: var(--ha-border-radius-button, 999px);
    --wzc-radius-pill: var(--ha-border-radius-pill, 999px);

    --wzc-shadow-card: var(
      --ha-card-box-shadow,
      var(--ha-box-shadow-card, none)
    );
    --wzc-shadow-small: var(
      --ha-box-shadow-s,
      0 1px 2px color-mix(in srgb, var(--wzc-color-text-1) 18%, transparent)
    );
    --wzc-shadow-medium: var(
      --ha-box-shadow-m,
      0 2px 6px color-mix(in srgb, var(--wzc-color-text-1) 24%, transparent)
    );

    --wzc-font-family: var(--ha-font-family-body, inherit);
    --wzc-font-size-small: var(--ha-font-size-s, 0.75rem);
    --wzc-font-size-medium: var(--ha-font-size-m, 1rem);
    --wzc-font-weight-medium: var(--ha-font-weight-medium, 500);
    --wzc-font-weight-semibold: var(--ha-font-weight-semibold, 600);
    --wzc-line-height-condensed: var(--ha-line-height-condensed, 1.25);
    --wzc-line-height-normal: var(--ha-line-height-normal, 1.5);

    --wzc-card-background: var(--wzc-color-background);
    --wzc-card-radius: var(--wzc-radius-card);
    --wzc-card-border-color: var(--wzc-color-border);
    --wzc-card-border-width: var(--ha-card-border-width, 0);
    --wzc-card-padding: clamp(1rem, 3cqi, 2rem);
    --wzc-stage-module-gap: clamp(0.5rem, 1.5cqi, 1rem);
    --wzc-card-outer-shadow: var(--wzc-shadow-medium);
    --wzc-media-placeholder-background: #242424;
    --wzc-media-placeholder-color: #626262;
    --wzc-camera-stage: var(--wzc-media-placeholder-background);
    --wzc-camera-stage-aspect-ratio: 16 / 9;
    --wzc-camera-suspended-background: var(--ha-color-neutral-05, #111111);
    --wzc-camera-suspended-icon-color: var(--wzc-color-error);
    --wzc-camera-suspended-icon-border-color: var(
      --ha-color-neutral-30,
      #4a4a4a
    );
    --wzc-camera-suspended-resume-color: var(--wzc-color-success);
    --wzc-camera-suspended-resume-border-color: var(--wzc-color-success);
    --wzc-live-background: var(--wzc-color-surface-secondary);
    --wzc-live-radius: var(--wzc-radius-card);
    --wzc-live-shadow: var(--wzc-shadow-medium);
    --wzc-zoom-transition-duration: 180ms;
    --wzc-stage-resize-handle-opacity: 60%;
    --wzc-stage-resize-handle-active-opacity: 100%;
    --wzc-stage-resize-handle-block-size: 2.75rem;
    --wzc-stage-resize-handle-inline-size: clamp(6rem, 24%, 10rem);
    --wzc-stage-resize-handle-visual-inline-size: clamp(4rem, 18cqi, 7rem);
    --wzc-stage-resize-handle-visible-bottom-inset: 0.15rem;
    --wzc-activity-popover-background: var(--wzc-popover-background);
    --wzc-activity-popover-backdrop-filter: var(--wzc-popover-backdrop-filter);
    --wzc-activity-popover-border-color: var(--wzc-color-border);
    --wzc-activity-popover-radius: var(--wzc-popover-radius);
    --wzc-activity-popover-shadow: var(--wzc-popover-shadow);

    --wzc-media-overlay-color: var(--ha-color-neutral-90, #e6e6e6);
    --wzc-media-overlay-surface: var(--ha-color-neutral-05, #111111);
    --wzc-media-overlay-opacity: 72%;
    --wzc-media-overlay-hover-opacity: 84%;
    --wzc-media-overlay-background: color-mix(
      in srgb,
      var(--wzc-media-overlay-surface) var(--wzc-media-overlay-opacity),
      transparent
    );
    --wzc-media-overlay-hover-background: color-mix(
      in srgb,
      var(--wzc-color-primary) var(--wzc-media-overlay-hover-opacity),
      transparent
    );
    --wzc-neutral-control-hover-background: color-mix(
      in srgb,
      var(--ha-color-neutral-50, #737373) 84%,
      transparent
    );
    --wzc-media-overlay-border-color: var(--ha-color-neutral-30, #4a4a4a);
    --wzc-media-overlay-radius: var(--wzc-radius-small);
    --wzc-media-overlay-shadow: var(--wzc-shadow-card);
    --wzc-media-overlay-transition-duration: 140ms;
    --wzc-camera-control-size: 2.75rem;
    --wzc-camera-control-icon-size: 1.65rem;
    --wzc-overlay-control-min-size: 2.75rem;
    --wzc-round-button-size: var(--wzc-camera-control-size);
    --wzc-round-button-icon-size: 60%;
    --wzc-round-button-color: var(--wzc-media-overlay-color);
    --wzc-round-button-background: var(--wzc-media-overlay-background);
    --wzc-round-button-border-color: var(--wzc-media-overlay-border-color);
    --wzc-round-button-hover-background: var(
      --wzc-neutral-control-hover-background
    );
    --wzc-camera-control-inline-inset: 0.75rem;
    --wzc-camera-control-bottom-inset: 2.25rem;
    --wzc-camera-overlay-block-inset: 0.5rem;
    --wzc-camera-overlay-inline-inset: 0.75rem;
    --wzc-camera-overlay-trailing-clearance: calc(
      var(--wzc-camera-control-inline-inset) + var(--wzc-camera-control-size) +
        var(--wzc-control-dock-gap)
    );
    --wzc-control-dock-gap: 0.5rem;
    --wzc-carousel-navigation-opacity: 72%;
    --wzc-carousel-navigation-hover-opacity: 100%;
    --wzc-carousel-navigation-icon-size: 2.75rem;
    --wzc-carousel-navigation-control-gap: 0.75rem;
    --wzc-selection-bar-color: var(--wzc-color-text-1);
    --wzc-selection-bar-background: var(--wzc-color-surface-secondary);
    --wzc-selection-bar-active-color: var(--wzc-color-text-reversed);
    --wzc-selection-bar-active-background: var(--wzc-color-primary);
    --wzc-selection-bar-active-shadow: var(--wzc-shadow-small);
    --wzc-selection-bar-gap: 0.25rem;
    --wzc-selection-bar-padding: 0.25rem;
    --wzc-camera-navigation-color: var(--wzc-selection-bar-color);
    --wzc-camera-navigation-background: var(--wzc-selection-bar-background);
    --wzc-camera-navigation-active-color: var(--wzc-selection-bar-active-color);
    --wzc-camera-navigation-active-background: var(
      --wzc-selection-bar-active-background
    );
    --wzc-camera-navigation-shadow: var(--wzc-shadow-medium);
    --wzc-camera-navigation-active-shadow: var(
      --wzc-selection-bar-active-shadow
    );
    --wzc-camera-navigation-gap: var(--wzc-selection-bar-gap);
    --wzc-camera-navigation-padding: var(--wzc-selection-bar-padding);
    --wzc-camera-navigation-item-size: 2.25rem;
    --wzc-camera-navigation-block-size: calc(
      var(--wzc-camera-navigation-item-size) + 2 *
        var(--wzc-camera-navigation-padding)
    );
    --wzc-event-list-gap: 0.5rem;
    --wzc-event-list-padding: 0.25rem;
    --wzc-media-day-header-block-size: 1.75rem;
    --wzc-media-day-header-gap: 0.25rem;
    --wzc-media-day-navigation-size: 1.5rem;
    --wzc-media-day-header-background: transparent;
    --wzc-media-day-header-color: var(--wzc-color-text-2);
    --wzc-media-tile-background: var(--wzc-color-surface-secondary);
    --wzc-media-tile-hover-background: color-mix(
      in srgb,
      var(--wzc-media-tile-background) 92%,
      black
    );
    --wzc-event-tile-block-size: 7.2rem;
    --wzc-event-tile-background: var(--wzc-media-tile-background);
    --wzc-event-tile-hover-background: var(--wzc-media-tile-hover-background);
    --wzc-event-tile-border-color: var(--wzc-color-border);
    --wzc-event-tile-border-width: var(--ha-card-border-width, 0);
    --wzc-event-tile-radius: var(--wzc-radius-card);
    --wzc-event-tile-shadow: var(--wzc-shadow-small);
    --wzc-event-tile-gap: 0.65rem;
    --wzc-event-content-padding: 0.25rem;
    --wzc-event-metadata-column-size: 9.75rem;
    --wzc-event-thumbnail-inline-size: 12.8rem;
    --wzc-event-thumbnail-radius: var(--wzc-radius-card);
    --wzc-event-thumbnail-placeholder-background: var(
      --wzc-media-placeholder-background
    );
    --wzc-event-thumbnail-placeholder-color: var(--wzc-media-placeholder-color);
    --wzc-event-thumbnail-placeholder-icon-size: 2.75rem;
    --wzc-event-badge-font-size: 0.6875rem;
    --wzc-event-badge-padding: 0.08em 0.45em;
    --wzc-event-metadata-gap: 0.2rem;
    --wzc-event-metadata-row-gap: 0.1rem;
    --wzc-event-metadata-icon-size: 0.75rem;
    --wzc-event-secondary-color: var(--wzc-color-text-2);
    --wzc-event-duration-background: var(--wzc-media-overlay-background);
    --wzc-event-duration-color: var(--wzc-media-overlay-color);
    --wzc-event-action-background: var(--wzc-color-surface);
    --wzc-event-action-color: var(--wzc-color-text-2);
    --wzc-event-action-size: 2.25rem;
    --wzc-event-action-margin: 0.65rem;

    --wzc-recording-color: var(--wzc-color-text-1);
    --wzc-recording-secondary-color: var(--wzc-color-text-2);
    --wzc-recording-list-gap: 0.5rem;
    --wzc-recording-list-padding: 0.25rem;
    --wzc-recording-tile-block-size: 4rem;
    --wzc-recording-tile-background: var(--wzc-media-tile-background);
    --wzc-recording-tile-hover-background: var(
      --wzc-media-tile-hover-background
    );
    --wzc-recording-tile-border-color: var(--wzc-color-border);
    --wzc-recording-tile-border-width: var(--ha-card-border-width, 0);
    --wzc-recording-tile-radius: var(--wzc-radius-card);
    --wzc-recording-tile-shadow: var(--wzc-shadow-small);
    --wzc-recording-icon-column-size: 4rem;
    --wzc-recording-icon-background: color-mix(
      in srgb,
      var(--wzc-color-primary) 25%,
      var(--wzc-color-surface-secondary)
    );
    --wzc-recording-icon-color: var(--wzc-color-primary);
    --wzc-recording-icon-size: 1.15rem;
    --wzc-recording-content-padding: 0.5rem;
    --wzc-recording-action-size: 2.25rem;
    --wzc-recording-action-margin: 0.65rem;
    --wzc-recording-action-background: var(--wzc-color-surface);
    --wzc-recording-action-border-color: var(--wzc-color-border-control);
    --wzc-recording-action-color: var(--wzc-color-text-2);
    --wzc-recording-action-hover-color: var(--wzc-color-primary);
    --wzc-recording-skeleton-color: var(--wzc-color-text-3);
    --wzc-activity-thumbnail-outline-width: 2px;
    --wzc-recorded-media-background: var(--wzc-camera-stage);
    --wzc-recorded-media-max-block-size: calc(90dvh - 3rem);
    --wzc-recorded-media-dialog-border: 1px solid var(--wzc-color-border);
    --wzc-recorded-media-dialog-radius: var(--wzc-radius-card);
    --wzc-recorded-media-dialog-shadow: var(--wzc-shadow-medium);
    --wzc-recorded-media-dialog-padding: 0.75rem;
    --wzc-recorded-media-dialog-bottom-padding: 1.25rem;
    --wzc-recorded-media-dialog-min-inline-size: min(16rem, calc(100vw - 1rem));
    --wzc-recorded-media-dialog-min-block-size: min(10rem, calc(100dvh - 1rem));
    --wzc-recorded-media-resize-handle-size: 1.5rem;
    --wzc-recorded-media-header-background: var(--wzc-color-surface-secondary);
    --wzc-recorded-media-close-size: 2.75rem;
    --wzc-recorded-media-close-background: transparent;
    --wzc-recorded-media-close-hover-background: color-mix(
      in srgb,
      var(--wzc-color-text-1) 8%,
      transparent
    );
    --wzc-recorded-media-close-color: var(--wzc-color-text-1);
    --wzc-recorded-media-control-hover-background: var(
      --wzc-color-fill-primary
    );
    --wzc-recorded-transport-background: color-mix(
      in srgb,
      var(--wzc-media-overlay-surface) 82%,
      transparent
    );
    --wzc-recorded-transport-color: var(--wzc-media-overlay-color);
    --wzc-recorded-transport-accent: var(--wzc-color-primary);
    --wzc-recorded-transport-track: color-mix(
      in srgb,
      var(--wzc-media-overlay-color) 45%,
      transparent
    );
    --wzc-recorded-transport-icon-color: #e5e5e5;
    --wzc-recorded-transport-icon-hover-color: #ffffff;
    --wzc-recorded-transport-gap: 0.4rem;
    --wzc-recorded-transport-padding: 0.25rem 0.35rem;
    --wzc-recorded-transport-control-size: 2rem;
    --wzc-recorded-transport-icon-size: 1.35rem;
    --wzc-recording-scrubber-surface: var(
      --wzc-recorded-media-header-background
    );
    --wzc-recording-scrubber-text: var(--wzc-color-text-1);
    --wzc-recording-scrubber-control-border: var(--wzc-color-border-control);
    --wzc-recording-scrubber-focus: var(--wzc-color-primary);
    --wzc-recording-scrubber-hover: var(--wzc-color-fill-primary);
    --wzc-recording-scrubber-preview-surface: var(--wzc-color-surface);
    --wzc-recording-scrubber-preview-border: var(--wzc-color-border);
    --wzc-recording-scrubber-preview-shadow: var(--wzc-shadow-medium);
    --wzc-recording-scrubber-track: #b9efbd;
    --wzc-recording-scrubber-gap: #dddddd;
    --wzc-recording-scrubber-gap-stripe: #b93745;
    --wzc-recording-scrubber-alert: #ff9500;
    --wzc-recording-scrubber-detection: #ffb000;
    --wzc-recording-scrubber-pointer: #ffffff;
    --wzc-recording-scrubber-pointer-outline: #6b6b6b;
    --wzc-recording-scrubber-pointer-text: #252525;
    --wzc-recording-scrubber-tick: rgb(37 37 37 / 22%);
    --wzc-recording-scrubber-radius: 0.45rem;
    --wzc-recording-scrubber-track-block-size: 2rem;
    --wzc-recording-segment-excluded: #d9ad91;
    --wzc-recording-segment-selected: #83df9a;
    --wzc-recording-segment-handle: #ef5555;
    --wzc-recording-segment-handle-outline: #9b2323;
    --wzc-recording-segment-handle-accent: #0097d5;
    --wzc-recording-segment-handle-accent-outline: #ffffff;
    --wzc-recording-segment-panel: color-mix(
      in srgb,
      var(--wzc-recording-scrubber-text) 5%,
      var(--wzc-recording-scrubber-surface)
    );
    --wzc-recording-segment-panel-border: var(--wzc-color-border);
    --wzc-recording-segment-button: color-mix(
      in srgb,
      var(--wzc-recording-scrubber-text) 8%,
      var(--wzc-recording-scrubber-surface)
    );
    --wzc-recording-segment-button-border: var(--wzc-color-border-control);
    --wzc-recording-segment-primary: var(--wzc-color-primary);
    --wzc-recording-segment-primary-text: var(--wzc-color-text-reversed);
    --wzc-recording-segment-cancel: var(--wzc-color-error);
    --wzc-stage-stack-navigation-gap: 0.35rem;
    --wzc-stage-stack-navigation-padding: 0.25rem;
    --wzc-stage-stack-button-size: 2.75rem;
    --wzc-stage-stack-button-color: var(--wzc-color-text-2);
    --wzc-stage-stack-button-hover-color: var(--wzc-color-primary);
    --wzc-stage-stack-button-background: var(--wzc-color-surface-secondary);
    --wzc-stage-stack-button-active-color: var(--wzc-color-text-reversed);
    --wzc-stage-stack-button-active-background: var(--wzc-color-primary);
    --wzc-stage-stack-icon-size: 1.35rem;
    --wzc-camera-navigation-item-padding: 1rem;
    --wzc-talk-connected-color: var(--ha-color-green-50, #34d399);
    --wzc-talk-connecting-color: var(--ha-color-blue-50, #3b82f6);
    --wzc-talk-panel-background: color-mix(
      in srgb,
      var(--wzc-media-overlay-surface) 80%,
      transparent
    );
    --wzc-talk-panel-border-color: var(--ha-color-purple-50, #a78bfa);
    --wzc-talk-wave-incoming-color: var(--ha-color-blue-40, #60a5fa);
    --wzc-talk-wave-outgoing-color: var(--ha-color-purple-40, #c084fc);
    --wzc-ptz-cell-size: clamp(1.15rem, 4.5cqi, 1.7rem);
    --wzc-ptz-button-size: calc(
      var(--wzc-ptz-cell-size) + var(--wzc-ptz-panel-padding) +
        var(--wzc-ptz-panel-padding) + 2px
    );
    --wzc-ptz-icon-size: 42%;
    --wzc-ptz-panel-padding: 0.18rem;
    --wzc-ptz-panel-background: color-mix(
      in srgb,
      var(--wzc-media-overlay-surface) var(--wzc-media-overlay-opacity),
      transparent
    );
    --wzc-light-control-gap: 0.5rem;
    --wzc-light-fill-color: var(--wzc-color-primary);
    --wzc-light-panel-background: var(--wzc-popover-background);
    --wzc-light-panel-backdrop-filter: var(--wzc-popover-backdrop-filter);
    --wzc-light-panel-border-color: var(--wzc-color-border);
    --wzc-light-panel-color: var(--wzc-color-text-1);
    --wzc-light-panel-radius: var(--wzc-popover-radius);
    --wzc-light-panel-shadow: var(--wzc-popover-shadow);
    --wzc-light-panel-inline-size: clamp(6.5rem, 24cqi, 8rem);
    --wzc-light-power-active-color: var(--wzc-color-primary);
    --wzc-light-slider-background: var(--ha-color-neutral-90, #e6e6e6);
    --wzc-light-slider-block-size: clamp(7rem, 28cqi, 10rem);
    --wzc-light-slider-thickness: clamp(2.75rem, 11cqi, 3.5rem);
    --wzc-light-transition-duration: 160ms;

    --wzc-accordion-background: var(--wzc-color-background);
    --wzc-accordion-header-color: var(--wzc-color-text-1);
    --wzc-accordion-header-open-color: var(--wzc-color-primary);
    --wzc-accordion-header-open-background: var(--wzc-color-surface-secondary);
    --wzc-accordion-header-hover-background: var(--wzc-color-fill-primary);
    --wzc-accordion-border-color: var(--wzc-color-border-control);
    --wzc-accordion-radius: var(--wzc-radius-large);

    --wzc-sortable-gap: 0.5rem;
    --wzc-sortable-color: var(--wzc-color-text-1);
    --wzc-sortable-background: var(--wzc-color-surface-secondary);
    --wzc-sortable-border-color: var(--wzc-color-border-control);
    --wzc-sortable-accent-color: var(--wzc-color-primary);
    --wzc-sortable-handle-color: var(--wzc-color-text-2);
    --wzc-sortable-handle-background: var(--wzc-color-background);
    --wzc-sortable-radius: var(--wzc-radius-large);
    --wzc-sortable-shadow: none;

    --wzc-badge-neutral-background: var(--ha-color-neutral-60, #777777);
    --wzc-badge-neutral-color: var(--ha-color-neutral-95, #f5f5f5);
    --wzc-badge-blue-background: var(--ha-color-blue-60, #3b82f6);
    --wzc-badge-blue-color: var(--ha-color-neutral-100, #ffffff);
    --wzc-badge-green-background: var(--ha-color-green-60, #10b981);
    --wzc-badge-green-color: var(--ha-color-neutral-100, #ffffff);
    --wzc-badge-amber-background: var(--ha-color-amber-60, #f59e0b);
    --wzc-badge-amber-color: var(--ha-color-neutral-05, #111111);
    --wzc-badge-warning-background: var(--wzc-color-warning);
    --wzc-badge-warning-color: var(--wzc-color-on-warning);
    --wzc-badge-red-background: var(--ha-color-red-60, #ef4444);
    --wzc-badge-red-color: var(--ha-color-neutral-100, #ffffff);
    --wzc-badge-cyan-background: var(--ha-color-cyan-60, #22d3ee);
    --wzc-badge-cyan-color: var(--ha-color-neutral-05, #111111);
    --wzc-badge-emerald-background: var(--ha-color-green-50, #34d399);
    --wzc-badge-emerald-color: var(--ha-color-neutral-05, #111111);
    --wzc-badge-indigo-background: var(--ha-color-indigo-50, #818cf8);
    --wzc-badge-indigo-color: var(--ha-color-neutral-05, #111111);
    --wzc-badge-orange-background: var(--ha-color-orange-60, #f97316);
    --wzc-badge-orange-color: var(--ha-color-neutral-100, #ffffff);
    --wzc-badge-pink-background: var(--ha-color-pink-50, #f472b6);
    --wzc-badge-pink-color: var(--ha-color-neutral-05, #111111);
    --wzc-badge-purple-background: var(--ha-color-purple-60, #a855f7);
    --wzc-badge-purple-color: var(--ha-color-neutral-100, #ffffff);
    --wzc-badge-rose-background: var(--ha-color-red-40, #fb7185);
    --wzc-badge-rose-color: var(--ha-color-neutral-05, #111111);
    --wzc-badge-yellow-background: var(--ha-color-yellow-60, #eab308);
    --wzc-badge-yellow-color: var(--ha-color-neutral-05, #111111);

    --wzc-toast-opacity: 78%;
    --wzc-toast-highlight-color: color-mix(
      in srgb,
      var(--wzc-color-background) 34%,
      transparent
    );
    --wzc-toast-error-color: var(--wzc-color-on-error);
    --wzc-toast-error-background: color-mix(
      in srgb,
      var(--wzc-color-fill-error) var(--wzc-toast-opacity),
      transparent
    );
    --wzc-toast-warning-color: var(--wzc-color-on-warning);
    --wzc-toast-warning-background: color-mix(
      in srgb,
      var(--wzc-color-fill-warning) var(--wzc-toast-opacity),
      transparent
    );
    --wzc-toast-success-color: var(--wzc-color-on-success);
    --wzc-toast-success-background: color-mix(
      in srgb,
      var(--wzc-color-fill-success) var(--wzc-toast-opacity),
      transparent
    );
    --wzc-toast-radius: var(--wzc-radius-pill);
    --wzc-toast-shadow: var(--wzc-shadow-small);
  }

  :host([data-theme-mode="dark"]) {
    --wzc-editor-dialog-background: var(
      --primary-background-color,
      var(--ha-color-surface-default, var(--wzc-color-surface))
    );
    color-scheme: dark;
  }

  :host([data-theme-mode="light"]) {
    color-scheme: light;
  }
`;
