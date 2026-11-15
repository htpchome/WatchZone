export const DEFAULT_FULL_STAGE_ID = "default-stage";
export const DEFAULT_CAMERA_ONLY_STAGE_ID = "standard-camera-stage";

export type StageType = "camera_only" | "full" | "tiny_camera_only";
export type AvailableStageType = Exclude<StageType, "tiny_camera_only">;

export interface ConfiguredStageFlow {
  readonly default: readonly string[];
  readonly phone: readonly string[];
}

export function defaultStageFlow(
  stageType: AvailableStageType,
): ConfiguredStageFlow {
  const stageId =
    stageType === "camera_only"
      ? DEFAULT_CAMERA_ONLY_STAGE_ID
      : DEFAULT_FULL_STAGE_ID;
  return { default: [stageId], phone: [stageId] };
}

export function stageFlowsEqual(
  left: ConfiguredStageFlow,
  right: ConfiguredStageFlow,
): boolean {
  return (
    arraysEqual(left.default, right.default) &&
    arraysEqual(left.phone, right.phone)
  );
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
