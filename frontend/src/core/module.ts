import type { HomeAssistant, HomeAssistantApi } from "./home-assistant";
import type { LocalizeFunction } from "./localization";

export interface ModuleRuntimeContext {
  readonly api?: HomeAssistantApi;
  readonly hass?: HomeAssistant;
  readonly localize?: LocalizeFunction;
}

export interface ModulePreparation {
  release(): void;
}

export interface ModuleDefinition<TConfig = unknown> {
  readonly type: string;
  createElement(): HTMLElement;
  define(): Promise<void>;
  getEntityIds(config: TConfig): readonly string[];
  prepare?(
    config: TConfig,
    context: ModuleRuntimeContext,
  ): Promise<ModulePreparation | undefined>;
  updateElement(
    element: HTMLElement,
    config: TConfig,
    context: ModuleRuntimeContext,
  ): void;
  validateConfig(value: unknown): TConfig;
}

export interface ModuleLoaderRegistration {
  readonly load: () => Promise<{ readonly moduleDefinition: ModuleDefinition }>;
  readonly reserveAspectRatio?: boolean;
}

export type ModuleLoaderMap = Readonly<
  Record<string, ModuleLoaderRegistration>
>;
