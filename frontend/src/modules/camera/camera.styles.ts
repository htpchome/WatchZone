import { css } from "lit";

export const cameraStyles = css`
  :host,
  .camera-carousel,
  .swiper-wrapper,
  .swiper-slide,
  .camera-view {
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  :host,
  .camera-carousel,
  .camera-view {
    display: block;
  }

  .camera-carousel {
    position: relative;
    overflow: hidden;
    background: var(--wzc-camera-stage);
    border-radius: var(--wzc-live-radius);
  }

  .camera-carousel.camera-carousel-interactive {
    touch-action: pan-y;
  }

  .swiper-wrapper {
    position: relative;
    display: flex;
    box-sizing: content-box;
    block-size: 100%;
    transition-property: transform;
  }

  .swiper-slide {
    position: relative;
    flex-shrink: 0;
    block-size: 100%;
    transition-property: transform;
  }

  .camera-carousel:not(.camera-carousel-interactive) .swiper-slide {
    inline-size: 100% !important;
  }

  .carousel-navigation {
    position: absolute;
    z-index: 4;
    inset-block-start: 50%;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: 2.5rem;
    block-size: 2.5rem;
    padding: 0.45rem;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-media-overlay-shadow);
    transform: translateY(-50%);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .carousel-navigation.previous {
    inset-inline-start: max(0.5rem, env(safe-area-inset-left, 0px));
  }

  .carousel-navigation.next {
    inset-inline-end: max(0.5rem, env(safe-area-inset-right, 0px));
  }

  .carousel-navigation svg {
    display: block;
    inline-size: 100%;
    pointer-events: none;
  }

  .carousel-navigation:disabled {
    visibility: hidden;
    pointer-events: none;
  }

  .carousel-navigation:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .carousel-navigation:hover:not(:disabled) {
      background: var(--wzc-media-overlay-hover-background);
    }
  }

  @media (hover: none) {
    .carousel-navigation:hover:not(:disabled) {
      background: var(--wzc-media-overlay-background);
    }
  }
`;
