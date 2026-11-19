import { animate } from "motion/mini";

export type MotionAnimation = ReturnType<typeof animate>;
export type MotionKeyframes = Parameters<typeof animate>[1];
export type MotionOptions = NonNullable<Parameters<typeof animate>[2]>;

export const motionDurations = {
  immediate: 0,
  fast: 0.12,
  overlay: 0.14,
  standard: 0.18,
  settle: 0.24,
  carousel: 0.3,
  layout: 0.36,
  orientation: 0.6,
} as const;

export const motionEasings = {
  standard: [0.2, 0.8, 0.2, 1],
  out: [0, 0, 0.2, 1],
} as const;

export function reducedMotionRequested(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}

/** The only application boundary allowed to start a DOM animation. */
export function animateElement(
  element: Element,
  keyframes: MotionKeyframes,
  options: MotionOptions = {},
): MotionAnimation {
  if (!("animate" in element) || typeof element.animate !== "function") {
    return applyImmediately(element, keyframes, options);
  }
  return animate(element, keyframes, {
    ...options,
    duration: reducedMotionRequested()
      ? motionDurations.immediate
      : options.duration,
  });
}

function applyImmediately(
  element: Element,
  keyframes: MotionKeyframes,
  options: MotionOptions,
): MotionAnimation {
  const style = (element as HTMLElement | SVGElement).style;
  const originals = new Map<string, string>();
  if (style) {
    for (const [property, keyframe] of Object.entries(keyframes)) {
      const value = Array.isArray(keyframe)
        ? keyframe[keyframe.length - 1]
        : keyframe;
      if (value === undefined || value === null) continue;
      originals.set(property, String(Reflect.get(style, property) ?? ""));
      Reflect.set(style, property, String(value));
    }
  }
  queueMicrotask(() => options.onComplete?.());
  const finished = Promise.resolve();
  return {
    cancel: () => {
      if (!style) return;
      for (const [property, value] of originals) {
        Reflect.set(style, property, value);
      }
    },
    stop: () => undefined,
    then: finished.then.bind(finished),
  } as unknown as MotionAnimation;
}

/** Owns one replaceable animation and guarantees teardown cancellation. */
export class OwnedMotion {
  private _animation?: MotionAnimation;

  public start(
    element: Element,
    keyframes: MotionKeyframes,
    options: MotionOptions = {},
  ): MotionAnimation {
    this.stop();
    const animation = animateElement(element, keyframes, options);
    this._animation = animation;
    return animation;
  }

  public stop(): void {
    this._animation?.stop();
    this._animation = undefined;
  }

  public cancel(): void {
    this._animation?.cancel();
    this._animation = undefined;
  }
}

/** Animates one element's visibility while semantic state remains with its owner. */
export class VisibilityMotion {
  private readonly _motion = new OwnedMotion();
  private _element?: HTMLElement;
  private _visible?: boolean;
  private _generation = 0;

  public update(element: HTMLElement | undefined, visible: boolean): void {
    if (!element) {
      this.disconnect();
      return;
    }
    if (this._element !== element) {
      this.disconnect();
      this._element = element;
      this._visible = visible;
      return;
    }
    if (this._visible === visible) return;
    this._visible = visible;
    const generation = ++this._generation;
    this._motion.stop();
    element.style.visibility = "visible";
    this._motion.start(
      element,
      { opacity: visible ? 1 : 0 },
      {
        duration: motionDurations.overlay,
        ease: motionEasings.standard,
        onComplete: () => this._finish(element, generation),
      },
    );
  }

  public disconnect(): void {
    this._generation += 1;
    this._motion.cancel();
    this._clearElementStyles();
    this._element = undefined;
    this._visible = undefined;
  }

  private _finish(element: HTMLElement, generation: number): void {
    if (
      generation !== this._generation ||
      element !== this._element ||
      this._visible === undefined
    )
      return;
    this._motion.cancel();
    this._clearElementStyles();
  }

  private _clearElementStyles(): void {
    this._element?.style.removeProperty("opacity");
    this._element?.style.removeProperty("visibility");
  }
}
