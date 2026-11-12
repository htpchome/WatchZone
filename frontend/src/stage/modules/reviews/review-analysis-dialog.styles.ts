import { css } from "lit";

export const reviewAnalysisDialogStyles = css`
  section {
    display: grid;
    gap: 0.85rem;
    padding: 0.5rem 1.5rem 1.5rem;
  }

  .field {
    display: grid;
    gap: 0.3rem;
  }

  h3 {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-normal);
  }

  p {
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;
