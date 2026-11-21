import {
  animate,
  type AnimationPlaybackControlsWithThen,
  type ValueAnimationTransition,
} from "motion";

import { reducedMotionRequested } from "./index";

export interface ValueMotionOptions extends ValueAnimationTransition {
  readonly onUpdate?: (value: number) => void;
  readonly reduceMotion?: boolean;
}

/** The only application boundary allowed to start a numeric Motion animation. */
export function animateValue(
  from: number,
  to: number,
  options: ValueMotionOptions = {},
): AnimationPlaybackControlsWithThen {
  const { reduceMotion = true, ...transition } = options;
  return animate(from, to, {
    ...transition,
    duration:
      reduceMotion && reducedMotionRequested() ? 0 : transition.duration,
  });
}

export class OwnedValueMotion {
  private _animation?: AnimationPlaybackControlsWithThen;

  public start(
    from: number,
    to: number,
    options: ValueMotionOptions = {},
  ): AnimationPlaybackControlsWithThen {
    this.cancel();
    const animation = animateValue(from, to, options);
    this._animation = animation;
    return animation;
  }

  public cancel(): void {
    this._animation?.cancel();
    this._animation = undefined;
  }
}
