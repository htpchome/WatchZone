import { afterEach, describe, expect, it, vi } from "vitest";

import { APP_NAME, TOAST_TAG } from "../src/core/constants";
import { DEFAULT_TOAST_DURATION_MS } from "../src/ui/toast";
import "../src/ui/toast";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe(`${APP_NAME} toast`, () => {
  it.each(["neutral", "success", "warning", "error"] as const)(
    "renders and expires the %s category",
    async (category) => {
      vi.useFakeTimers();
      const toast = document.createElement(TOAST_TAG);
      document.body.append(toast);

      toast.show("Test message", { category });
      await toast.updateComplete;
      const surface = toast.shadowRoot?.querySelector(".toast");
      expect(surface?.classList).toContain(category);
      expect(surface?.classList).toContain("visible");
      expect(surface?.getAttribute("role")).toBe(
        category === "error" ? "alert" : "status",
      );

      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS);
      await toast.updateComplete;
      expect(surface?.classList).not.toContain("visible");
    },
  );

  it("supports persistent inline and positioned overlay presentations", async () => {
    vi.useFakeTimers();
    const toast = document.createElement(TOAST_TAG);
    document.body.append(toast);

    toast.show("Inline", {
      persistent: true,
      presentation: "inline",
    });
    await toast.updateComplete;
    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS * 2);
    await toast.updateComplete;
    expect(toast.presentation).toBe("inline");
    expect(toast.shadowRoot?.querySelector(".visible")).not.toBeNull();

    toast.show("Overlay", {
      placement: "top-end",
      presentation: "overlay",
    });
    await toast.updateComplete;
    expect(toast.placement).toBe("top-end");
    expect(toast.getAttribute("placement")).toBe("top-end");
    expect(toast.getAttribute("presentation")).toBe("overlay");
  });

  it("does not restore stale visible state after disconnection", async () => {
    const toast = document.createElement(TOAST_TAG);
    document.body.append(toast);
    toast.show("Temporary", { persistent: true });
    await toast.updateComplete;
    expect(toast.shadowRoot?.querySelector(".visible")).not.toBeNull();

    toast.remove();
    document.body.append(toast);
    await toast.updateComplete;
    expect(toast.shadowRoot?.querySelector(".visible")).toBeNull();
  });
});
