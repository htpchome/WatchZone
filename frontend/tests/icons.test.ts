import { render } from "lit";
import { describe, expect, it } from "vitest";

import { renderIcon } from "../src/ui/icons";

describe("WatchZone icon registry", () => {
  it("renders the required Picture-in-Picture pop-out geometry safely", () => {
    const host = document.createElement("div");
    render(renderIcon("pipPopOut"), host);

    const svg = host.querySelector("svg");
    const paths = [...host.querySelectorAll("path")];
    expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(paths.every((path) => path.namespaceURI === svg?.namespaceURI)).toBe(
      true,
    );
    expect(svg?.getAttribute("fill")).toBe("currentColor");
    expect(paths).toHaveLength(4);
    expect(paths[1].getAttribute("fill-rule")).toBe("evenodd");
    expect(paths[3].getAttribute("d")).toContain("M16.75 14.75");
  });
});
