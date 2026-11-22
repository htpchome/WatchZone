const browserGlobal = typeof self === "undefined" ? window : self;
const arrayPrototype = Array.prototype as unknown as Record<string, unknown>;
const elementPrototype = Element.prototype as unknown as Record<
  string,
  unknown
>;
const objectConstructor = Object as unknown as Record<string, unknown>;
const promiseConstructor = Promise as unknown as Record<string, unknown>;
const stringPrototype = String.prototype as unknown as Record<string, unknown>;

if (typeof elementPrototype.toggleAttribute !== "function") {
  Object.defineProperty(Element.prototype, "toggleAttribute", {
    configurable: true,
    value(this: Element, name: string, force?: boolean): boolean {
      const shouldSet = force ?? !this.hasAttribute(name);
      if (shouldSet) this.setAttribute(name, "");
      else this.removeAttribute(name);
      return shouldSet;
    },
    writable: true,
  });
}

if (!("globalThis" in browserGlobal)) {
  Object.defineProperty(browserGlobal, "globalThis", {
    configurable: true,
    value: browserGlobal,
    writable: true,
  });
}

if (typeof objectConstructor.fromEntries !== "function") {
  Object.defineProperty(Object, "fromEntries", {
    configurable: true,
    value(entries: Iterable<readonly [PropertyKey, unknown]>): object {
      const result = {};
      for (const [key, value] of entries) {
        Object.defineProperty(result, key, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        });
      }
      return result;
    },
    writable: true,
  });
}

if (typeof arrayPrototype.flat !== "function") {
  Object.defineProperty(Array.prototype, "flat", {
    configurable: true,
    value(this: unknown[], depth = 1): unknown[] {
      const flatten = (values: unknown[], remaining: number): unknown[] =>
        values.reduce<unknown[]>((result, value) => {
          if (Array.isArray(value) && remaining > 0) {
            return result.concat(flatten(value, remaining - 1));
          }
          result.push(value);
          return result;
        }, []);
      return flatten(this, Number(depth));
    },
    writable: true,
  });
}

if (typeof arrayPrototype.flatMap !== "function") {
  Object.defineProperty(Array.prototype, "flatMap", {
    configurable: true,
    value<T, U>(
      this: T[],
      callback: (value: T, index: number, array: T[]) => U,
      thisArgument?: unknown,
    ): U[] {
      return this.map(callback, thisArgument).flat() as U[];
    },
    writable: true,
  });
}

if (typeof promiseConstructor.allSettled !== "function") {
  Object.defineProperty(Promise, "allSettled", {
    configurable: true,
    value(values: Iterable<unknown>): Promise<unknown[]> {
      return Promise.all(
        Array.from(values, (value) =>
          Promise.resolve(value).then(
            (result) => ({ status: "fulfilled", value: result }),
            (reason: unknown) => ({ reason, status: "rejected" }),
          ),
        ),
      );
    },
    writable: true,
  });
}

if (typeof stringPrototype.replaceAll !== "function") {
  Object.defineProperty(String.prototype, "replaceAll", {
    configurable: true,
    value(this: string, search: string | RegExp, replacement: string): string {
      if (search instanceof RegExp) {
        if (!search.global) {
          throw new TypeError("replaceAll RegExp must be global");
        }
        return this.replace(search, replacement);
      }
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return this.replace(new RegExp(escaped, "gu"), replacement);
    },
    writable: true,
  });
}

if (!("queueMicrotask" in browserGlobal)) {
  Object.defineProperty(browserGlobal, "queueMicrotask", {
    configurable: true,
    value(callback: VoidFunction): void {
      void Promise.resolve()
        .then(callback)
        .catch((error: unknown) => {
          setTimeout(() => {
            throw error;
          });
        });
    },
    writable: true,
  });
}
