import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { estimateText } from "@/lib/geometry";
import { sampleDiagram, type Diagram } from "@/lib/model";
import type { AnalysisResult } from "@/lib/analysis";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { DiagramSvg, type DiagramSvgProps } from "./DiagramSvg";
import { computeLayout } from "./stableLayout";

function setup(d: Diagram, over: Partial<DiagramSvgProps> = {}) {
  const layout = computeLayout(d.tables, d.rels, estimateText, {
    showDataTypes: true,
    lineStyle: "orthogonal",
  });
  const props: DiagramSvgProps = {
    diagram: d,
    boxes: layout.boxes,
    routes: layout.routes,
    analysis: null,
    settings: DEFAULT_SETTINGS,
    selection: null,
    hover: null,
    linkFrom: null,
    palette: "screen",
    ...over,
  };
  return render(
    <svg>
      <DiagramSvg {...props} />
    </svg>,
  );
}

describe("DiagramSvg", () => {
  const d = sampleDiagram();

  it("draws every table with its rows", () => {
    const { container } = setup(d);
    const groups = container.querySelectorAll("[data-table]");
    expect(groups).toHaveLength(3);
    const customers = container.querySelector(`[data-table="${d.tables[0].id}"]`)!;
    expect(customers.getAttribute("aria-label")).toBe("Table customers, 5 columns");
    expect(customers.textContent).toContain("customer_id");
    expect(customers.textContent).toContain("VARCHAR(255)");
    expect(customers.textContent).toContain("PK");
  });

  it("marks the foreign-key column", () => {
    const { container } = setup(d);
    const orders = container.querySelector(`[data-table="${d.tables[1].id}"]`)!;
    expect(orders.textContent).toContain("FK");
  });

  it("draws a path for each relationship", () => {
    const { container } = setup(d);
    for (const r of d.rels) {
      const g = container.querySelector(`[data-rel="${r.id}"] path`);
      expect(g?.getAttribute("d")).toMatch(/^M/);
    }
    // Label pill shows the relationship label.
    expect(container.textContent).toContain("places");
  });

  it("hides data types when asked", () => {
    const { container } = setup(d, { settings: { ...DEFAULT_SETTINGS, showDataTypes: false } });
    expect(container.textContent).not.toContain("VARCHAR(255)");
  });

  it("shows issue badges and highlights flagged columns", () => {
    const flagged = d.tables[0].columns[3].id;
    const analysis: AnalysisResult = {
      issues: [],
      highestForm: "none",
      meetsTarget: false,
      byTable: { [d.tables[0].id]: 2 },
      flaggedColumns: new Set([flagged]),
    };
    const { container } = setup(d, { analysis, palette: "print" });
    const customers = container.querySelector(`[data-table="${d.tables[0].id}"]`)!;
    expect(customers.querySelector('[aria-label="2 issues"]')).not.toBeNull();
    // The flagged row gets a highlight bar (jsdom normalises colours to rgb()).
    const rows = customers.querySelectorAll("rect[rx='3']");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("style")).toContain("rgb(247, 223, 69)");
  });

  it("the print palette uses no CSS variables", () => {
    const { container } = setup(d, {
      palette: "print",
      selection: { kind: "table", id: d.tables[0].id },
      settings: { ...DEFAULT_SETTINGS, notation: "numeric" },
    });
    expect(container.innerHTML).not.toContain("var(--");
  });

  it("renders connector handles only when interactive", () => {
    expect(setup(d).container.querySelector("[data-handle]")).toBeNull();
    const { container } = setup(d, { interactive: true });
    expect(container.querySelectorAll("[data-col]").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-handle]")).not.toBeNull();
  });

  it("says so when a table has no columns", () => {
    const empty: Diagram = {
      ...d,
      tables: [{ ...d.tables[0], columns: [] }],
      rels: [],
    };
    const { container } = setup(empty);
    expect(container.textContent).toContain("No columns yet");
  });
});
