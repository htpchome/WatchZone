import { css } from "lit";

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
      --text-primary-color,
      var(--primary-background-color, Canvas)
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

    --wzc-radius-card: var(
      --ha-card-border-radius,
      var(--ha-border-radius-lg, 12px)
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

    --wzc-card-background: var(--wzc-color-background);
    --wzc-card-radius: var(--wzc-radius-card);
    --wzc-card-border-color: var(--wzc-color-border);
    --wzc-card-border-width: var(--ha-card-border-width, 0);
    --wzc-card-padding: clamp(1rem, 3cqi, 2rem);
    --wzc-card-outer-shadow: var(--wzc-shadow-medium);
    --wzc-camera-stage: var(--ha-color-neutral-10, #202020);
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
    --wzc-live-radius: var(--wzc-radius-large);
    --wzc-live-shadow: var(--wzc-shadow-medium);
    --wzc-zoom-transition-duration: 180ms;
    --wzc-stage-resize-handle-opacity: 60%;
    --wzc-stage-resize-handle-active-opacity: 100%;

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
    --wzc-media-overlay-border-color: var(--ha-color-neutral-30, #4a4a4a);
    --wzc-media-overlay-radius: var(--wzc-radius-small);
    --wzc-media-overlay-shadow: var(--wzc-shadow-card);
    --wzc-media-overlay-transition-duration: 140ms;
    --wzc-carousel-navigation-opacity: 72%;
    --wzc-carousel-navigation-hover-opacity: 100%;

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
`;
