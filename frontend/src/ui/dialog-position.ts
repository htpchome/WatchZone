/** Position a fixed modal over the center of the containing WatchZone card. */
export function centerDialogOnCard(
  owner: Element,
  dialog: HTMLDialogElement,
): void {
  const card = composedAncestor(owner, "watchzone-card");
  if (!card) return;
  const cardBounds = card.getBoundingClientRect();
  const dialogBounds = dialog.getBoundingClientRect();
  const inset = 8;
  const left = Math.min(
    Math.max(
      inset,
      cardBounds.left + (cardBounds.width - dialogBounds.width) / 2,
    ),
    window.innerWidth - dialogBounds.width - inset,
  );
  const top = Math.min(
    Math.max(
      inset,
      cardBounds.top + (cardBounds.height - dialogBounds.height) / 2,
    ),
    window.innerHeight - dialogBounds.height - inset,
  );
  dialog.style.left = `${left}px`;
  dialog.style.top = `${top}px`;
}

function composedAncestor(
  element: Element,
  selector: string,
): HTMLElement | null {
  let current: Element | null = element;
  while (current) {
    if (current instanceof HTMLElement && current.matches(selector)) {
      return current;
    }
    const root = current.getRootNode();
    current = root instanceof ShadowRoot ? root.host : current.parentElement;
  }
  return null;
}
