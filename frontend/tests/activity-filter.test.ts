import { afterEach, describe, expect, it } from "vitest";

import { ACTIVITY_FILTER_TAG } from "../src/core/constants";
import {
  ActivityFilterContext,
  type ActivityFilter,
} from "../src/stage/activity";
import { CameraSelectionContext } from "../src/stage/camera-selection-context";

describe("activity filter", () => {
  afterEach(() => document.body.replaceChildren());

  it("presents camera facets and preserves independent camera selections", async () => {
    const context = new ActivityFilterContext();
    const selection = new CameraSelectionContext();
    const filter = document.createElement(
      ACTIVITY_FILTER_TAG,
    ) as ActivityFilter;
    filter.cameraSelection = selection;
    filter.filterContext = context;
    filter.targetModuleId = "camera-module";
    document.body.append(filter);
    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.front",
        items: [
          { entityId: "camera.front", label: "Front" },
          { entityId: "camera.back", label: "Back" },
        ],
      },
      () => undefined,
    );
    context.publishReviews("camera.front", [
      {
        classification: "alert",
        id: "review-1",
        labels: ["person", "Resident"],
        relatedEventIds: ["event-1"],
        reviewed: true,
        zones: ["driveway"],
      },
    ]);

    await filter.updateComplete;
    filter.shadowRoot
      ?.querySelector<HTMLButtonElement>(".filter-trigger")
      ?.click();
    await filter.updateComplete;

    expect(
      [...(filter.shadowRoot?.querySelectorAll("label span") ?? [])].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual([
      "All",
      "Alerts",
      "Detections",
      "All",
      "person",
      "Resident",
      "All",
      "Reviewed",
      "Unreviewed",
      "All",
      "driveway",
    ]);

    filter.shadowRoot
      ?.querySelector<HTMLInputElement>('input[value="alert"]')
      ?.click();
    const person = [...(filter.shadowRoot?.querySelectorAll("label") ?? [])]
      .find(({ textContent }) => textContent?.trim() === "person")
      ?.querySelector<HTMLInputElement>("input");
    person?.click();
    expect(context.stateFor("camera.front")).toMatchObject({
      classification: "alert",
      labels: ["person"],
    });

    selection.select("camera-module", "camera.back");
    await filter.updateComplete;
    expect(context.stateFor("camera.back")).toMatchObject({
      classification: "all",
      labels: [],
    });
    selection.select("camera-module", "camera.front");
    await filter.updateComplete;
    expect(context.stateFor("camera.front")).toMatchObject({
      classification: "alert",
      labels: ["person"],
    });
  });
});
