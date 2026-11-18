import { css } from "lit";

export const companionPhoneLandscapeStyles = css`
  :host(.companion-phone-landscape) {
    position: fixed !important;
    z-index: 1000;
    inset: 0 !important;
    inline-size: 100vw !important;
    block-size: 100dvh !important;
    margin: 0 !important;
  }

  :host(.companion-phone-landscape.height-mode-fit-viewport) {
    --wzc-media-safe-area-underlap: 0px;
    --wzc-stage-flex-track-min: 0px;
    --wzc-stage-flex-stack-min: 0px;
    --wzc-stage-flex-content-min: 0px;
  }

  :host(.companion-phone-landscape.height-mode-fit-viewport) ha-card {
    block-size: 100%;
    height: 100%;
    min-block-size: 0;
    padding-block: env(safe-area-inset-top, 0px)
      var(--wzc-safe-area-inset-bottom);
    padding-inline: max(
        0.5rem,
        env(safe-area-inset-left, 0px),
        env(safe-area-inset-right, 0px)
      )
      max(
        0.5rem,
        env(safe-area-inset-left, 0px),
        env(safe-area-inset-right, 0px)
      );
    border-radius: 0;
    box-shadow: none;
  }

  :host(.companion-phone-landscape.height-mode-fit-viewport) .shell {
    block-size: 100%;
    height: 100%;
    min-block-size: 0;
  }

  :host(.companion-phone-landscape) .stage-grid {
    align-self: start;
    block-size: 100%;
    column-gap: var(--wzc-stage-module-gap);
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    height: 100%;
  }

  :host(.companion-phone-landscape) .stage-placement {
    min-block-size: 0 !important;
  }

  :host(.companion-phone-landscape)
    .stage-placement[data-layout-node$="default-camera-module"] {
    margin-block-start: var(--wzc-stage-module-gap);
  }
`;
