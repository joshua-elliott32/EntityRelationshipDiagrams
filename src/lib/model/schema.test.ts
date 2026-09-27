import { describe, expect, it } from "vitest";
import { normalizeDiagram, parseDiagramJson, DiagramParseError } from "./schema";
import { sampleDiagram } from "./sample";

describe("normalizeDiagram", () => {
  it("round-trips a v2 diagram", () => {
    const d = sampleDiagram();
    expect(normalizeDiagram(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("migrates a v1 demo file (dep → determinedBy, savedAt → updatedAt)", () => {
    const v1 = {
      v: 1,
      name: "Old",
      savedAt: 42,
      tables: [
        {
          id: "t1",
          name: "orders",
          x: 1,
          y: 2,
          columns: [
            { id: "a", name: "postcode", type: "VARCHAR(10)", pk: false, dep: "" },
            { id: "b", name: "city", type: "VARCHAR(60)", dep: "a" },
          ],
        },
      ],
      rels: [{ id: "r", from: "t1", to: "t1", fromCol: "zzz", toCol: "a", type: "1:N", label: "" }],
      view: { x: 0, y: 0, k: 9 },
    };
    const d = normalizeDiagram(v1);
    expect(d.version).toBe(2);
    expect(d.updatedAt).toBe(42);
    expect(d.tables[0].columns[1].determinedBy).toEqual(["a"]);
    expect(d.tables[0].columns[0].determinedBy).toEqual([]);
    expect(d.rels[0].fromCol).toBe("");
    expect(d.rels[0].toOptional).toBe(true);
    expect(d.view?.k).toBe(2.5);
  });

  it("drops relationships to missing tables", () => {
    const d = normalizeDiagram({
      tables: [{ id: "a", name: "a" }],
      rels: [{ from: "a", to: "nope" }],
    });
    expect(d.rels).toEqual([]);
  });

  it("gives friendly errors", () => {
    expect(() => parseDiagramJson("{")).toThrow(DiagramParseError);
    expect(() => parseDiagramJson("{}")).toThrow(/tables/);
  });
});
