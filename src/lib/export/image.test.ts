import { describe, expect, it } from "vitest";
import { blankDiagram, sampleDiagram } from "@/lib/model";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { toSvgString } from "./image";

const opts = { settings: DEFAULT_SETTINGS, analysis: null, includeIssues: false };

function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

describe("toSvgString", () => {
  it("produces well-formed SVG with the table names and title", () => {
    const d = sampleDiagram();
    d.name = "Shop <example> & co";
    const svg = toSvgString(d, opts);
    const doc = parse(svg);
    const root = doc.documentElement;
    expect(root.nodeName).toBe("svg");
    expect(root.getAttribute("viewBox")).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
    const text = root.textContent ?? "";
    for (const t of d.tables) expect(text).toContain(t.name);
    expect(text).toContain("Shop <example> & co");
    expect(svg).not.toContain("var(--");
  });

  it("handles an empty diagram", () => {
    const doc = parse(toSvgString(blankDiagram("Empty"), opts));
    expect(Number(doc.documentElement.getAttribute("width"))).toBeGreaterThan(0);
  });
});
