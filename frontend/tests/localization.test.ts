import type { ReactiveController } from "lit";
import { describe, expect, it, vi } from "vitest";

import {
  LocalizationController,
  supportedLanguage,
} from "../src/core/localization";

class TestHost {
  public controller?: ReactiveController;
  public readonly requestUpdate = vi.fn();
  public readonly updateComplete = Promise.resolve(true);

  public addController(controller: ReactiveController): void {
    this.controller = controller;
  }

  public removeController(controller: ReactiveController): void {
    void controller;
  }
}

describe("localization", () => {
  it("normalizes exact regional locales and falls back through base language", () => {
    expect(supportedLanguage("pt_br")).toBe("pt-BR");
    expect(supportedLanguage("es-MX")).toBe("es");
    expect(supportedLanguage("en-US")).toBe("en");
    expect(supportedLanguage("unknown")).toBe("en");
  });

  it("lazy-loads the HA-selected catalog and interpolates values", async () => {
    const host = new TestHost();
    const controller = new LocalizationController(host);

    controller.setLanguage("es-ES");
    await vi.waitFor(() => {
      expect(controller.localize("common.cancel")).toBe("Cancelar");
    });
    expect(
      controller.localize("editor.camera_count", {
        count: 2,
        maximum: 12,
      }),
    ).toBe("2 de 12 configuradas");
    expect(host.requestUpdate).toHaveBeenCalled();
  });
});
