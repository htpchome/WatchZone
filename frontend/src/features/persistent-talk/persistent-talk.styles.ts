import { css } from "lit";

import { responsiveWidths } from "../../styles/responsive-widths";

export const persistentTalkStyles = css`
  :host {
    --wzc-control-size: 2.75rem;
    --wzc-control-icon-size: 1.65rem;
    display: contents;
    font-family: var(--wzc-font-family);
  }

  .persistent-talk {
    box-sizing: border-box;
    position: fixed;
    z-index: 2147483647;
    inset: auto auto max(0.5rem, var(--wzc-safe-area-inset-bottom)) 50%;
    margin: 0;
    inset-inline-start: 50%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
    inline-size: min(42rem, calc(100vw - 1rem));
    min-block-size: 4rem;
    padding: 0.45rem 0.65rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-surface-primary);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-shadow-medium);
    transform: translateX(-50%);
    overflow: visible;
  }

  .dismiss,
  .navigate {
    --wzc-round-button-background: var(--wzc-capability-control-background);
    --wzc-round-button-border-color: transparent;
    --wzc-round-button-color: var(--wzc-capability-control-color);
    --wzc-round-button-hover-background: var(
      --wzc-capability-control-hover-background
    );
  }

  .identity {
    min-inline-size: 0;
    max-inline-size: 10rem;
    line-height: 1.12;
  }

  .title,
  .camera-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    font-size: var(--wzc-font-size-medium);
    font-weight: var(--wzc-font-weight-medium);
  }

  .camera-name {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-medium);
  }

  .controls {
    display: grid;
    position: absolute;
    inset-inline-start: 50%;
    grid-template-columns: repeat(3, var(--wzc-control-size));
    align-items: center;
    color: var(--wzc-talk-panel-color);
    background: var(--wzc-talk-panel-background);
    border: 1px solid var(--wzc-talk-panel-border-color);
    border-radius: var(--wzc-radius-pill);
    transform: translateX(-50%);
  }

  .controls canvas {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    border-radius: inherit;
    pointer-events: none;
  }

  .controls .round-button {
    --wzc-round-button-color: var(--wzc-color-text-1);
    --wzc-round-button-background: transparent;
    --wzc-round-button-border-color: transparent;
    --wzc-round-button-hover-background: transparent;
  }

  .controls .center {
    transform: scale(1.18);
    --wzc-round-button-color: var(--wzc-color-text-reversed);
    --wzc-round-button-background: var(--wzc-talk-connected-color);
    --wzc-round-button-hover-background: var(--wzc-talk-connected-color);
    box-shadow: 0 0 0 2px var(--wzc-talk-panel-border-color);
  }

  .controls .center.muted {
    --wzc-round-button-color: var(--wzc-color-on-warning);
    --wzc-round-button-background: var(--wzc-talk-muted-color);
    --wzc-round-button-hover-background: var(--wzc-talk-muted-color);
  }

  .controls .center.ready {
    --wzc-round-button-color: var(--wzc-capability-control-color);
    --wzc-round-button-background: var(--wzc-capability-control-background);
    --wzc-round-button-hover-background: var(
      --wzc-capability-control-hover-background
    );
  }

  .connecting-spinner {
    position: absolute;
    inset: -0.35rem;
    border: 2px solid
      color-mix(in srgb, var(--wzc-talk-connecting-color) 30%, transparent);
    border-block-start-color: var(--wzc-talk-connecting-color);
    border-radius: 50%;
    pointer-events: none;
  }

  @media (max-width: ${responsiveWidths.compact}) {
    :host {
      --wzc-control-size: 2.5rem;
    }

    .persistent-talk {
      inline-size: 100vw;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.4rem;
      padding: 0.4rem 0.5rem;
      border-radius: var(--wzc-radius-large) var(--wzc-radius-large) 0 0;
      padding-inline: max(0.5rem, var(--wzc-safe-area-inset-left))
        max(0.5rem, var(--wzc-safe-area-inset-right));
    }

    .identity {
      grid-column: 2;
    }

    .controls {
      position: relative;
      inset-inline-start: auto;
      grid-column: 1 / 3;
      grid-row: 2;
      justify-self: center;
      transform: none;
    }

    .navigate {
      grid-column: 3;
      grid-row: 1 / 3;
    }
  }
`;
