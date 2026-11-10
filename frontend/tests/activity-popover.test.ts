import { describe, expect, it } from "vitest";

import { activityPopoverGeometry } from "../src/stage/activity/activity-popover.controller";

const trigger = {
  bottom: 84,
  height: 40,
  left: 744,
  right: 784,
  top: 44,
  width: 40,
};
const popover = {
  bottom: 400,
  height: 300,
  left: 0,
  right: 320,
  top: 100,
  width: 320,
};

describe("activity popover placement", () => {
  it("prefers the space below its trigger", () => {
    expect(
      activityPopoverGeometry(trigger, popover, {
        height: 600,
        left: 0,
        top: 0,
        width: 800,
      }),
    ).toMatchObject({ left: 464, placement: "below", top: 88 });
  });

  it("moves above only when the space below is insufficient", () => {
    const lowTrigger = { ...trigger, bottom: 540, top: 500 };
    expect(
      activityPopoverGeometry(lowTrigger, popover, {
        height: 600,
        left: 0,
        top: 0,
        width: 800,
      }),
    ).toMatchObject({ placement: "above", top: 196 });
  });

  it("uses a side only when neither vertical direction can fit", () => {
    const centerTrigger = {
      ...trigger,
      bottom: 220,
      left: 360,
      right: 400,
      top: 180,
    };
    expect(
      activityPopoverGeometry(centerTrigger, popover, {
        height: 400,
        left: 0,
        top: 0,
        width: 900,
      }),
    ).toMatchObject({ left: 404, placement: "right", top: 84 });
  });
});
