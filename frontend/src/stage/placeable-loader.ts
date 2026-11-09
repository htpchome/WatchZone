import {
  CAMERA_NAVIGATION_COMPONENT_TYPE,
  CAMERA_MODULE_TYPE,
  ALERTS_MODULE_TYPE,
  EVENTS_MODULE_TYPE,
  LIGHT_COMPONENT_TYPE,
  PTZ_COMPONENT_TYPE,
  PANEL_MODULE_TYPE,
  TALK_COMPONENT_TYPE,
} from "../core/constants";
import type {
  PlaceableDefinition,
  PlaceableLoaderMap,
  PlaceableLoaderRegistration,
} from "./placeable";

const moduleLoaders = {
  [ALERTS_MODULE_TYPE]: {
    load: () =>
      import("./modules/alerts").then(
        ({ moduleDefinition }) => moduleDefinition,
      ),
    navigation: { icon: "alerts", labelKey: "navigation.alerts" },
    placeholder: "activity",
  },
  [CAMERA_MODULE_TYPE]: {
    load: () =>
      import("./modules/camera").then(
        ({ moduleDefinition }) => moduleDefinition,
      ),
    placeholder: "camera",
  },
  [PANEL_MODULE_TYPE]: {
    load: () =>
      import("./modules/panel").then(
        ({ moduleDefinition }) => moduleDefinition,
      ),
  },
  [EVENTS_MODULE_TYPE]: {
    load: () =>
      import("./modules/events").then(
        ({ moduleDefinition }) => moduleDefinition,
      ),
    navigation: { icon: "events", labelKey: "navigation.events" },
    placeholder: "activity",
  },
} satisfies PlaceableLoaderMap;

const componentLoaders = {
  [CAMERA_NAVIGATION_COMPONENT_TYPE]: {
    load: () =>
      import("./components/camera-navigation").then(
        ({ componentDefinition }) => componentDefinition,
      ),
    placeholder: "camera-navigation",
  },
  [TALK_COMPONENT_TYPE]: {
    load: () =>
      import("./components/two-way-talk").then(
        ({ componentDefinition }) => componentDefinition,
      ),
  },
  [PTZ_COMPONENT_TYPE]: {
    load: () =>
      import("./components/ptz").then(
        ({ componentDefinition }) => componentDefinition,
      ),
  },
  [LIGHT_COMPONENT_TYPE]: {
    load: () =>
      import("./components/light-control").then(
        ({ componentDefinition }) => componentDefinition,
      ),
  },
} satisfies PlaceableLoaderMap;

export class PlaceableLoader {
  private readonly _promises = new Map<
    string,
    Promise<PlaceableDefinition<unknown>>
  >();

  public constructor(
    private readonly _registrations: PlaceableLoaderMap = moduleLoaders,
  ) {}

  public getRegistration(
    type: string,
  ): PlaceableLoaderRegistration | undefined {
    return this._registrations[type];
  }

  public load(type: string): Promise<PlaceableDefinition<unknown>> {
    const existing = this._promises.get(type);
    if (existing) return existing;
    const registration = this.getRegistration(type);
    if (!registration) {
      return Promise.reject(new Error(`Unknown placeable type "${type}".`));
    }
    const promise = registration
      .load()
      .then((definition) => {
        if (definition.type !== type) {
          throw new Error(
            `Placeable "${type}" returned an invalid definition.`,
          );
        }
        return definition;
      })
      .catch((error: unknown) => {
        this._promises.delete(type);
        throw error;
      });
    this._promises.set(type, promise);
    return promise;
  }

  public retry(type: string): Promise<PlaceableDefinition<unknown>> {
    this._promises.delete(type);
    return this.load(type);
  }
}

export const moduleLoader = new PlaceableLoader();
export const componentLoader = new PlaceableLoader(componentLoaders);
