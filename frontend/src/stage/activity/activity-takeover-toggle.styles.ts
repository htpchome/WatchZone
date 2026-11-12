import { css } from "lit";

import { toolbarIconButtonStyles } from "../../ui/toolbar-icon-button.styles";

export const activityTakeoverToggleStyles = [
  toolbarIconButtonStyles,
  css`
    :host {
      --wzc-toolbar-icon-button-active-color: var(
        --wzc-stage-stack-button-hover-color
      );
      --wzc-toolbar-icon-button-color: var(--wzc-stage-stack-button-color);
      --wzc-toolbar-icon-button-icon-size: var(--wzc-stage-stack-icon-size);
      --wzc-toolbar-icon-button-size: var(--wzc-stage-stack-button-size);
      display: block;
    }
  `,
];
