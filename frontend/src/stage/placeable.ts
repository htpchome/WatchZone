import type { CameraSessionContext } from "./camera-session-context";
import type { CameraSelectionContext } from "./camera-selection-context";
import type { ActivityFilterContext } from "./activity";
import type { HomeAssistant, HomeAssistantApi } from "../core/home-assistant";
import type { LocalizeFunction } from "../core/localization";
import type { TranslationKey } from "../core/localization";

export interface PlaceableRuntimeContext {
  readonly activityFilter: ActivityFilterContext;
  readonly api?: HomeAssistantApi;
  readonly cameraSelection: CameraSelectionContext;
  readonly cameraSession: CameraSessionContext;
  readonly hass?: HomeAssistant;
  readonly localize?: LocalizeFunction;
  readonly placeableId: string;
}

export interface PlaceablePreparation {
  release(): void;
}

export interface PlaceableDefinition<TConfig = unknown> {
  readonly type: string;
  createElement(): HTMLElement;
  define(): Promise<void>;
  getEntityIds(config: TConfig): readonly string[];
  prepare?(
    config: TConfig,
    context: PlaceableRuntimeContext,
  ): Promise<PlaceablePreparation | undefined>;
  updateElement(
    element: HTMLElement,
    config: TConfig,
    context: PlaceableRuntimeContext,
  ): void;
  validateConfig(value: unknown): TConfig;
}

export type ModuleDefinition<TConfig = unknown> = PlaceableDefinition<TConfig>;
export type ComponentDefinition<TConfig = unknown> =
  PlaceableDefinition<TConfig>;

export interface PlaceableLoaderRegistration {
  readonly load: () => Promise<PlaceableDefinition>;
  readonly navigation?: {
    readonly icon: string;
    readonly labelKey: TranslationKey;
  };
  readonly placeholder?: "activity" | "camera" | "camera-navigation";
}

export type PlaceableLoaderMap = Readonly<
  Record<string, PlaceableLoaderRegistration>
>;
