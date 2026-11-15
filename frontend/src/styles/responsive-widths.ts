import { unsafeCSS } from "lit";

import { RESPONSIVE_WIDTHS } from "../core/responsive-widths";

function pixels(value: number) {
  return unsafeCSS(`${value}px`);
}

/** CSS-safe forms of the canonical responsive inline-size breakpoints. */
export const responsiveWidths = Object.freeze({
  compact: pixels(RESPONSIVE_WIDTHS.compact),
  narrow: pixels(RESPONSIVE_WIDTHS.narrow),
  medium: pixels(RESPONSIVE_WIDTHS.medium),
  wide: pixels(RESPONSIVE_WIDTHS.wide),
});
