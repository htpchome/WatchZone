import { css } from "lit";

import { filterPopoverStyles } from "../ui/filter-popover.styles";

export const exportFilterStyles = [
  filterPopoverStyles,
  css`
    :host {
      --wzc-filter-trigger-color: var(--wzc-stage-stack-button-color);
      --wzc-filter-trigger-active-color: var(
        --wzc-stage-stack-button-hover-color
      );
      --wzc-filter-trigger-size: var(--wzc-stage-stack-button-size);
      --wzc-filter-trigger-icon-size: var(--wzc-stage-stack-icon-size);
    }
  `,
];
