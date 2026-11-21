import type { BadgeVariant } from "../badge";
import { distinctBadgeColorsForLabels, type BadgeColor } from "../badge/colors";

export interface ActivityBadgePresentation {
  readonly color?: BadgeColor;
  readonly label: string;
  readonly variant?: BadgeVariant;
}

export interface ActivityBadgeTypePresentation {
  readonly label: string;
  readonly variant: BadgeVariant;
}

/** Canonical activity badge order and color policy shared by tiles and media. */
export function activityBadgePresentations(
  cameraLabel: string | undefined,
  objectLabels: readonly string[],
  typeBadge: ActivityBadgeTypePresentation | undefined,
): readonly ActivityBadgePresentation[] {
  const coloredLabels = [
    ...(cameraLabel ? [cameraLabel] : []),
    ...objectLabels,
  ];
  const colors = distinctBadgeColorsForLabels(
    coloredLabels,
    typeBadge ? [reservedColor(typeBadge.variant)] : [],
  );
  return [
    ...coloredLabels.map((label, index) => ({
      color: colors[index] ?? "neutral",
      label,
    })),
    ...(typeBadge ? [typeBadge] : []),
  ];
}

function reservedColor(variant: BadgeVariant): BadgeColor {
  if (variant === "alert" || variant === "danger") return "red";
  if (variant === "detection" || variant === "warning") return "amber";
  if (variant === "success") return "green";
  if (variant === "accent") return "blue";
  return "neutral";
}
