/** Clears touch-created focus without disturbing keyboard focus. */
export function releaseTouchFocus(event: PointerEvent): void {
  if (event.pointerType === "touch") {
    (event.currentTarget as HTMLElement).blur();
  }
}

/** Accepts the primary pointer across mouse, touch, and pen input. */
export function isPrimaryControlPointer(event: PointerEvent): boolean {
  return (
    event.isPrimary && (event.pointerType !== "mouse" || event.button === 0)
  );
}
