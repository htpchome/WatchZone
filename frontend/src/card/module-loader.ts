import {
  CAMERA_MODULE_TYPE,
  PTZ_MODULE_TYPE,
  TALK_MODULE_TYPE,
} from "../core/constants";
import type {
  ModuleDefinition,
  ModuleLoaderMap,
  ModuleLoaderRegistration,
} from "../core/module";

const moduleLoaders = {
  [CAMERA_MODULE_TYPE]: {
    load: () => import("../modules/camera"),
    reserveAspectRatio: true,
  },
  [TALK_MODULE_TYPE]: {
    load: () => import("../modules/two-way-talk"),
  },
  [PTZ_MODULE_TYPE]: {
    load: () => import("../modules/ptz"),
  },
} satisfies ModuleLoaderMap;

export class ModuleLoader {
  private readonly _promises = new Map<
    string,
    Promise<ModuleDefinition<unknown>>
  >();

  public constructor(
    private readonly _registrations: ModuleLoaderMap = moduleLoaders,
  ) {}

  public getRegistration(type: string): ModuleLoaderRegistration | undefined {
    return this._registrations[type];
  }

  public load(type: string): Promise<ModuleDefinition<unknown>> {
    const existing = this._promises.get(type);
    if (existing) return existing;
    const registration = this.getRegistration(type);
    if (!registration) {
      return Promise.reject(new Error(`Unknown module type "${type}".`));
    }
    const promise = registration
      .load()
      .then(({ moduleDefinition }) => {
        if (moduleDefinition.type !== type) {
          throw new Error(`Module "${type}" returned an invalid definition.`);
        }
        return moduleDefinition;
      })
      .catch((error: unknown) => {
        this._promises.delete(type);
        throw error;
      });
    this._promises.set(type, promise);
    return promise;
  }

  public retry(type: string): Promise<ModuleDefinition<unknown>> {
    this._promises.delete(type);
    return this.load(type);
  }
}

export const moduleLoader = new ModuleLoader();
