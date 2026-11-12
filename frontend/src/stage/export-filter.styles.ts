import { css } from "lit";

import { filterPopoverStyles } from "../ui/filter-popover.styles";

export const exportFilterStyles = [
  filterPopoverStyles,
  css`
    :host {
      --wzc-toolbar-icon-button-color: var(--wzc-stage-stack-button-color);
      --wzc-toolbar-icon-button-active-color: var(
        --wzc-stage-stack-button-hover-color
      );
      --wzc-toolbar-icon-button-size: var(--wzc-stage-stack-button-size);
      --wzc-toolbar-icon-button-icon-size: var(--wzc-stage-stack-icon-size);
    }
  `,
];
