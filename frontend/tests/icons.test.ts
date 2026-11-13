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

  it.each([
    [
      "cameraGroupSingle",
      "m4 20c-0.54667 0-1.0167-0.19667-1.41-0.59s-0.59-0.86333-0.59-1.41v-12c0-0.54667 0.19667-1.0167 0.59-1.41s0.86333-0.59 1.41-0.59h16c0.55333 0 1.0233 0.19667 1.41 0.59 0.39333 0.39333 0.59 0.86333 0.59 1.41v12c0 0.54667-0.19667 1.0167-0.59 1.41s-0.86333 0.59-1.41 0.59zm0-2h16v-12h-16zm0 0v-12z",
    ],
    [
      "cameraGroupStacked",
      "M8,18h8V13H8v5Zm0-7h8V6H8v5Zm12,9q0,0.82-0.59,1.41T18,22H6q-0.82,0-1.41-0.59T4,20V4Q4,3.17 4.59,2.59T6,2H18q0.82,0 1.41,0.59T20,4V20Zm-2,0V4H6V20H18ZM18,4H6H18Z",
    ],
    [
      "cameraGroupSideBySide",
      "M13,16h5V8H13v8ZM6,16h5V8H6v8ZM4,20q-0.82,0-1.41-0.59T2,18V6Q2,5.18 2.59,4.59T4,4H20q0.83,0 1.41,0.59Q22,5.18 22,6V18q0,0.82-0.59,1.41T20,20H4ZM20,6H4V18H20V6ZM4,6V18V6Z",
    ],
  ] as const)("renders the supplied %s geometry", (name, path) => {
    const host = document.createElement("div");
    render(renderIcon(name), host);

    expect(host.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 24 24",
    );
    expect(host.querySelector("path")?.getAttribute("d")).toBe(path);
  });
});
