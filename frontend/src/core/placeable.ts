import type { CameraSessionContext } from "./camera-session-context";
import type { HomeAssistant, HomeAssistantApi } from "./home-assistant";
import type { LocalizeFunction } from "./localization";

export interface PlaceableRuntimeContext {
  readonly api?: HomeAssistantApi;
  readonly cameraSession: CameraSessionContext;
  readonly hass?: HomeAssistant;
  readonly localize?: LocalizeFunction;
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
  readonly reserveAspectRatio?: boolean;
}

export type PlaceableLoaderMap = Readonly<
  Record<string, PlaceableLoaderRegistration>
>;
