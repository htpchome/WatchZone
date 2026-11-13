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
    display: grid;
    grid-template-areas:
      "top top top top top"
      "left media media media right"
      "left lower lower lower right"
      "metadata metadata metadata metadata metadata";
    grid-template-columns: var(--wzc-camera-overlay-grid-columns);
    grid-template-rows: var(--wzc-camera-overlay-grid-rows);
    overflow: hidden;
    background: var(--wzc-camera-stage);
    border-radius: var(--wzc-live-radius);
    box-shadow: var(--wzc-live-shadow);
  }

  .camera-carousel::after {
    position: absolute;
    z-index: 5;
    inset: 0;
    box-sizing: border-box;
    border: var(--wzc-camera-activity-outline-width) solid transparent;
    border-radius: inherit;
    content: "";
    pointer-events: none;
  }

  .camera-carousel.activity-alert::after {
    border-color: var(--wzc-camera-alert-outline-color);
  }

  .camera-carousel.activity-detection::after {
    border-color: var(--wzc-camera-detection-outline-color);
  }

  .camera-carousel.square-camera-corners {
    --wzc-live-radius: 0px;
  }

  .camera-carousel.camera-shadow-small {
    box-shadow: var(--wzc-shadow-small);
  }

  .camera-carousel.camera-shadow-none {
    box-shadow: none;
  }

  .camera-carousel.camera-carousel-interactive {
    touch-action: pan-y;
  }

  .swiper-wrapper {
    grid-column: 1 / -1;
    grid-row: 1 / -1;
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

  .camera-carousel.swiper-fade .swiper-slide {
    transition-property: opacity;
  }

  .camera-carousel:not(.camera-carousel-interactive) .swiper-slide {
    inline-size: 100% !important;
  }

  .carousel-navigation {
    grid-area: media;
    z-index: 4;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: 2.75rem;
    block-size: var(--wzc-carousel-navigation-icon-size);
    padding: 0;
    color: var(--wzc-media-overlay-color);
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    opacity: 0;
    visibility: hidden;
    cursor: pointer;
    pointer-events: none;
    transition:
      opacity var(--wzc-media-overlay-transition-duration) ease,
      visibility 0s linear var(--wzc-media-overlay-transition-duration);
    -webkit-tap-highlight-color: transparent;
  }

  .carousel-navigation.previous {
    align-self: center;
    justify-self: start;
  }

  .carousel-navigation.next {
    align-self: center;
    justify-self: end;
  }

  .carousel-navigation svg {
    display: block;
    inline-size: var(--wzc-carousel-navigation-icon-size);
    block-size: var(--wzc-carousel-navigation-icon-size);
    pointer-events: none;
  }

  .carousel-navigation.visible {
    opacity: var(--wzc-carousel-navigation-opacity);
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
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
      opacity: var(--wzc-carousel-navigation-hover-opacity);
    }
  }
`;
