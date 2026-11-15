import { css } from "lit";

export const cameraSuspendedPresentationStyles = css`
  .suspended-presentation {
    position: absolute;
    z-index: 1;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    gap: 0.5rem;
    padding: 1.5rem;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-camera-suspended-background);
    text-align: center;
  }

  .suspended-presentation > span:last-child {
    color: color-mix(in srgb, var(--wzc-media-overlay-color) 72%, transparent);
    font-size: var(--wzc-font-size-small);
  }

  .suspended-icon {
    display: grid;
    place-items: center;
    inline-size: 3rem;
    block-size: 3rem;
    color: var(--wzc-camera-suspended-icon-color);
    background: transparent;
    border: 1px solid var(--wzc-camera-suspended-icon-border-color);
    border-radius: 50%;
    font-size: 1.75rem;
  }

  .suspended-icon svg {
    inline-size: 1.75rem;
    block-size: 1.75rem;
  }

  .suspended-presentation strong {
    font-weight: var(--wzc-font-weight-semibold);
  }
`;
