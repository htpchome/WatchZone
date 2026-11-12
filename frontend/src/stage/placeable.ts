import type { CameraSessionContext } from "./camera-session-context";
import type { CameraSelectionContext } from "./camera-selection-context";
import type { ActivityFilterContext } from "./activity";
import type { HomeAssistant, HomeAssistantApi } from "../core/home-assistant";
import type { LocalizeFunction } from "../core/localization";
import type { TranslationKey } from "../core/localization";
import type { MediaDateContext } from "./media-date-context";
import type { ExportFilterContext } from "./export-filter-context";

export interface PlaceableBaseRuntimeContext {
  readonly api?: HomeAssistantApi;
  readonly hass?: HomeAssistant;
  readonly localize?: LocalizeFunction;
  readonly placeableId: string;
}

export interface PlaceableContextBindings {
  readonly activityFilter: ActivityFilterContext;
  readonly cameraSelection: CameraSelectionContext;
  readonly cameraSession: CameraSessionContext;
  readonly exportFilter: ExportFilterContext;
  readonly mediaDate: MediaDateContext;
}

export type PlaceableContextKey = keyof PlaceableContextBindings;
export type PlaceableRuntimeContext<
  TContext extends PlaceableContextKey = PlaceableContextKey,
> = PlaceableBaseRuntimeContext & Pick<PlaceableContextBindings, TContext>;

export interface PlaceablePreparation {
  release(): void;
}

export interface PlaceableDefinition<
  TConfig = unknown,
  TContext extends PlaceableContextKey = PlaceableContextKey,
> {
  readonly contextKeys?: readonly TContext[];
  readonly type: string;
  createElement(): HTMLElement;
  define(): Promise<void>;
  getEntityIds(config: TConfig): readonly string[];
  prepare?(
    config: TConfig,
    context: PlaceableRuntimeContext<TContext>,
  ): Promise<PlaceablePreparation | undefined>;
  updateElement(
    element: HTMLElement,
    config: TConfig,
    context: PlaceableRuntimeContext<TContext>,
  ): void;
  validateConfig(value: unknown): TConfig;
}

export type ModuleDefinition<
  TConfig = unknown,
  TContext extends PlaceableContextKey = PlaceableContextKey,
> = PlaceableDefinition<TConfig, TContext>;
export type ComponentDefinition<
  TConfig = unknown,
  TContext extends PlaceableContextKey = PlaceableContextKey,
> = PlaceableDefinition<TConfig, TContext>;

export interface PlaceableLoaderRegistration {
  readonly load: () => Promise<PlaceableDefinition>;
  readonly navigation?: {
    readonly icon: string;
    readonly labelKey: TranslationKey;
  };
  readonly placeholder?: "activity" | "camera" | "camera-navigation";
  readonly stackAccessories?: (
    config: unknown,
  ) => StageStackAccessoryConfiguration | undefined;
}

export interface StageStackAccessoryConfiguration {
  readonly calendar: "activity" | "disabled" | "recordings";
  readonly filter: "activity" | "exports" | "none";
  readonly historyDays?: number;
  readonly targetModuleId?: string;
}

export type PlaceableLoaderMap = Readonly<
  Record<string, PlaceableLoaderRegistration>
>;
