import {
  CAMERA_MODULE_TYPE,
  PTZ_COMPONENT_TYPE,
  TALK_COMPONENT_TYPE,
} from "../core/constants";
import type {
  PlaceableDefinition,
  PlaceableLoaderMap,
  PlaceableLoaderRegistration,
} from "../core/placeable";

const moduleLoaders = {
  [CAMERA_MODULE_TYPE]: {
    load: () =>
      import("../modules/camera").then(
        ({ moduleDefinition }) => moduleDefinition,
      ),
    reserveAspectRatio: true,
  },
} satisfies PlaceableLoaderMap;

const componentLoaders = {
  [TALK_COMPONENT_TYPE]: {
    load: () =>
      import("../components/two-way-talk").then(
        ({ componentDefinition }) => componentDefinition,
      ),
  },
  [PTZ_COMPONENT_TYPE]: {
    load: () =>
      import("../components/ptz").then(
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
