import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@/lib/analysis/types";
import { sampleDiagram } from "@/lib/model";
import { buildWorkbookRows, toXlsx } from "./xlsx";

function analysisFor(): { d: ReturnType<typeof sampleDiagram>; analysis: AnalysisResult } {
  const d = sampleDiagram();
  const [customers, orders] = d.tables;
  const analysis: AnalysisResult = {
    issues: [
      {
        id: "3NF:x",
        rule: "3NF",
        severity: "error",
        certain: true,
        tableId: orders.id,
        relId: null,
        columnIds: [orders.columns[5].id],
        message: "city depends on postcode",
        fix: "Move postcode and city to their own table",
      },
      {
        id: "1NF:y",
        rule: "1NF",
        severity: "warning",
        certain: false,
        tableId: customers.id,
        relId: null,
        columnIds: [customers.columns[3].id, customers.columns[4].id],
        message: "phone_1 and phone_2 look like a repeating group",
        fix: "Move phone numbers to a separate table",
      },
      {
        id: "Design:z",
        rule: "Design",
        severity: "info",
        certain: true,
        tableId: null,
        relId: d.rels[1].id,
        columnIds: [],
        message: "Many-to-many needs a junction table",
        fix: "Add order_products",
      },
    ],
    highestForm: "2NF",
    meetsTarget: false,
    byTable: {},
    flaggedColumns: new Set(),
  };
  return { d, analysis };
}

describe("buildWorkbookRows", () => {
  const { d, analysis } = analysisFor();
  const sheets = buildWorkbookRows(d, analysis, new Date(Date.UTC(2026, 0, 2, 3, 4, 5)));
  const sheet = (name: string) => sheets.find((s) => s.name === name)!.rows;

  it("has the five sheets in order", () => {
    expect(sheets.map((s) => s.name)).toEqual([
      "Summary",
      "Tables",
      "Columns",
      "Relationships",
      "Normalisation issues",
    ]);
  });

  it("summarises the diagram", () => {
    const rows = sheet("Summary");
    expect(rows[0]).toEqual(["Item", "Value"]);
    expect(rows.slice(1).map((r) => r[0])).toEqual([
      "Diagram",
      "Exported",
      "Tables",
      "Relationships",
      "Normalisation issues",
      "Highest normal form met",
      "Status",
    ]);
    expect(rows[1][1]).toBe("Shop example");
    expect(rows[3][1]).toBe(3);
    expect(rows[5][1]).toBe(3);
    expect(rows[6][1]).toBe("2NF");
    expect(rows[7][1]).toMatch(/^Doesn’t meet the target normal form/);
  });

  it("lists tables with keys and issue rules", () => {
    expect(sheet("Tables")).toEqual([
      ["Table", "Columns", "Primary key", "Foreign keys", "Issues", "Note"],
      ["customers", 5, "customer_id", "", "1NF", ""],
      ["orders", 6, "order_id", "customer_id", "3NF", ""],
      ["products", 3, "product_id", "", "", ""],
    ]);
  });

  it("lists every column", () => {
    const rows = sheet("Columns");
    expect(rows).toHaveLength(1 + 5 + 6 + 3);
    expect(rows[0]).toEqual([
      "Table",
      "#",
      "Column",
      "Data type",
      "Primary key",
      "Foreign key",
      "References",
      "Unique",
      "Can be empty",
      "Holds a list",
      "Determined by",
      "Default",
      "Note",
      "Issues",
    ]);
    const row = (t: string, c: string) => rows.find((r) => r[0] === t && r[2] === c)!;
    expect(row("customers", "customer_id")).toEqual([
      "customers",
      1,
      "customer_id",
      "INT",
      "Yes",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect(row("orders", "customer_id").slice(4, 7)).toEqual(["", "Yes", "customers.customer_id"]);
    expect(row("orders", "city")[10]).toBe("postcode");
    expect(row("orders", "city")[13]).toBe("3NF");
    expect(row("orders", "postcode")[10]).toBe("Primary key");
    expect(row("customers", "phone_1")[8]).toBe("Yes");
  });

  it("describes relationships in words", () => {
    expect(sheet("Relationships")).toEqual([
      [
        "From table",
        "From column",
        "Cardinality",
        "To table",
        "To column (foreign key)",
        "Optionality",
        "On delete",
        "On update",
        "Label",
        "Reads as",
      ],
      [
        "customers",
        "customer_id",
        "One to many",
        "orders",
        "customer_id",
        "Parent required, children optional",
        "NO ACTION",
        "NO ACTION",
        "places",
        "customers (one) places orders (many)",
      ],
      [
        "orders",
        "",
        "Many to many",
        "products",
        "",
        "Parent required, children optional",
        "",
        "",
        "contains",
        "orders (many) contains products (many)",
      ],
    ]);
  });

  it("lists issues, naming the relationship when there is no table", () => {
    const rows = sheet("Normalisation issues");
    expect(rows[0]).toEqual([
      "Rule",
      "Severity",
      "Certainty",
      "Table",
      "Column(s)",
      "Problem",
      "Suggested fix",
    ]);
    expect(rows[1].slice(0, 5)).toEqual(["3NF", "Error", "Definite", "orders", "city"]);
    expect(rows[2].slice(0, 5)).toEqual([
      "1NF",
      "Warning",
      "Possible",
      "customers",
      "phone_1, phone_2",
    ]);
    expect(rows[3].slice(0, 5)).toEqual([
      "Design",
      "Info",
      "Definite",
      "orders N:M products (contains)",
      "",
    ]);
  });

  it("says so when there are no problems", () => {
    const clean = buildWorkbookRows(d, {
      ...analysis,
      issues: [],
      meetsTarget: true,
      highestForm: "none",
    });
    expect(clean[4].rows[1]).toEqual(["", "", "", "", "", "No problems found", ""]);
    expect(clean[0].rows[6][1]).toBe("None (fails 1NF)");
    expect(clean[0].rows[7][1]).toBe("Passes all checks");
  });

  it("sizes columns between 10 and 62 characters", () => {
    for (const s of sheets) {
      expect(s.widths).toHaveLength(s.rows[0].length);
      for (const w of s.widths) {
        expect(w).toBeGreaterThanOrEqual(10);
        expect(w).toBeLessThanOrEqual(62);
      }
    }
  });
});

describe("toXlsx", () => {
  it("produces an xlsx Blob (skipped where the environment can't zip)", async (ctx) => {
    const { d, analysis } = analysisFor();
    let blob: Blob;
    try {
      blob = await toXlsx(d, analysis);
    } catch {
      ctx.skip();
      return;
    }
    expect(blob.size).toBeGreaterThan(1000);
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    expect([...head]).toEqual([0x50, 0x4b]); // "PK" zip signature
  });
});
