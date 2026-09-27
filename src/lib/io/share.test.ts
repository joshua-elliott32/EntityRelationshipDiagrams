import { describe, expect, it } from "vitest";
import { compressToEncodedURIComponent } from "lz-string";
import { makeColumn, makeRelationship, makeTable, sampleDiagram, type Diagram } from "@/lib/model";
import {
  SHARE_URL_WARN_LENGTH,
  compactDiagram,
  fromShareHash,
  shareUrlLength,
  toShareHash,
} from "./share";

function rich(): Diagram {
  const a = makeTable("a", 10, 20, {
    color: "teal",
    note: "note",
    columns: [
      makeColumn("id", "INT", { pk: true }),
      makeColumn("x", "TEXT", {
        nullable: true,
        multi: true,
        unique: true,
        defaultValue: "'q'",
        note: "n",
      }),
    ],
  });
  a.columns[1].determinedBy = [a.columns[0].id];
  const b = makeTable("b", 0, 0, { columns: [makeColumn("a_id", "INT")] });
  return {
    version: 2,
    name: "Rich",
    tables: [a, b],
    rels: [
      makeRelationship(a.id, b.id, {
        fromCol: a.columns[0].id,
        toCol: b.columns[0].id,
        type: "1:1",
        label: "owns",
        fromOptional: true,
        toOptional: false,
        onDelete: "CASCADE",
        onUpdate: "SET DEFAULT",
      }),
      makeRelationship(a.id, b.id, { type: "N:M" }),
    ],
    view: { x: 1, y: 2, k: 1.5 },
    updatedAt: 12345,
  };
}

describe("share links", () => {
  it("round-trips a diagram, dropping view and updatedAt", () => {
    for (const d of [sampleDiagram(), rich()]) {
      const hash = toShareHash(d);
      expect(hash.startsWith("#d=")).toBe(true);
      expect(fromShareHash(hash)).toEqual({ ...d, view: null, updatedAt: 0 });
      expect(fromShareHash(hash.slice(1))).toEqual({ ...d, view: null, updatedAt: 0 });
    }
  });

  it("omits default-valued fields to keep links short", () => {
    const c = compactDiagram(sampleDiagram()) as { tables: { columns: object[] }[] };
    expect(c).not.toHaveProperty("view");
    expect(c).not.toHaveProperty("updatedAt");
    expect(Object.keys(c.tables[0].columns[1])).toEqual(["id", "name", "type"]);
  });

  it("finds d= among other fragment parameters", () => {
    const d = sampleDiagram();
    expect(fromShareHash(`#x=1&${toShareHash(d).slice(1)}`)?.name).toBe("Shop example");
  });

  it("returns null for garbage", () => {
    expect(fromShareHash("")).toBeNull();
    expect(fromShareHash("#")).toBeNull();
    expect(fromShareHash("#other=1")).toBeNull();
    expect(fromShareHash("#d=")).toBeNull();
    expect(fromShareHash("#d=%%%not-lz%%%")).toBeNull();
    expect(fromShareHash("#d=" + compressToEncodedURIComponent("{not json"))).toBeNull();
    expect(fromShareHash("#d=" + compressToEncodedURIComponent('{"no":"tables"}'))).toBeNull();
    expect(fromShareHash(undefined as unknown as string)).toBeNull();
  });

  it("measures the link length", () => {
    const d = sampleDiagram();
    expect(shareUrlLength(d)).toBe(toShareHash(d).length);
    expect(shareUrlLength(d, "https://example.com/")).toBe(20 + toShareHash(d).length);
    expect(shareUrlLength(d)).toBeLessThan(SHARE_URL_WARN_LENGTH);
  });
});
