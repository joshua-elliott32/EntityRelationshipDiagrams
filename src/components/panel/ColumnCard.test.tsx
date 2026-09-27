import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  blankDiagram,
  findTable,
  foreignKeyOf,
  makeColumn,
  makeTable,
  type Diagram,
} from "@/lib/model";
import { useDiagramStore } from "@/store/diagram";
import { ColumnCard } from "./ColumnCard";

const S = () => useDiagramStore.getState();

function shop(fkName: string): { d: Diagram; ordersId: string; fkColId: string; pkId: string } {
  const customers = makeTable("customers", 0, 0, {
    columns: [makeColumn("customer_id", "INT", { pk: true }), makeColumn("full_name")],
  });
  const fk = makeColumn(fkName, "INT");
  const orders = makeTable("orders", 300, 0, {
    columns: [makeColumn("order_id", "INT", { pk: true }), fk],
  });
  const d = { ...blankDiagram("Shop"), tables: [customers, orders] };
  return { d, ordersId: orders.id, fkColId: fk.id, pkId: customers.columns[0].id };
}

/** Re-reads the table from the store so the card sees every update. */
function Harness({ tableId, colId }: { tableId: string; colId: string }) {
  const table = useDiagramStore((s) => findTable(s.diagram, tableId))!;
  const index = table.columns.findIndex((c) => c.id === colId);
  return <ColumnCard table={table} column={table.columns[index]} index={index} />;
}

beforeEach(() => S().load(blankDiagram()));
afterEach(cleanup);

describe("ColumnCard foreign key", () => {
  it("ticking Foreign key and picking a table creates the relationship", async () => {
    const user = userEvent.setup();
    const { d, ordersId, fkColId, pkId } = shop("buyer_ref");
    S().load(d);
    render(<Harness tableId={ordersId} colId={fkColId} />);

    const box = screen.getByRole("checkbox", { name: "Foreign key" });
    expect((box as HTMLInputElement).checked).toBe(false);
    await user.click(box);

    // No name match, so nothing is linked until a table is picked.
    expect(S().diagram.rels).toHaveLength(0);
    const tableSelect = screen.getByLabelText("Table");
    const customersId = S().diagram.tables[0].id;
    await user.selectOptions(tableSelect, customersId);

    expect(S().diagram.rels).toHaveLength(1);
    expect(foreignKeyOf(S().diagram, ordersId, fkColId)).toEqual({
      tableId: customersId,
      columnId: pkId,
    });
    // The editor stays open with the parent's key picked for you.
    expect((screen.getByLabelText("Column") as HTMLSelectElement).value).toBe(pkId);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText(/customers\.customer_id/)).toBeTruthy();
  });

  it("guesses the reference from the column name", async () => {
    const user = userEvent.setup();
    const { d, ordersId, fkColId, pkId } = shop("customer_id");
    S().load(d);
    render(<Harness tableId={ordersId} colId={fkColId} />);

    await user.click(screen.getByRole("checkbox", { name: "Foreign key" }));
    expect(foreignKeyOf(S().diagram, ordersId, fkColId)?.columnId).toBe(pkId);
    expect(
      (screen.getByRole("checkbox", { name: "Foreign key" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("unticking Foreign key removes the relationship", async () => {
    const user = userEvent.setup();
    const { d, ordersId, fkColId, pkId } = shop("buyer_ref");
    S().load(d);
    S().setForeignKey(ordersId, fkColId, { tableId: d.tables[0].id, columnId: pkId });
    expect(S().diagram.rels).toHaveLength(1);
    render(<Harness tableId={ordersId} colId={fkColId} />);

    const box = screen.getByRole("checkbox", { name: "Foreign key" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await user.click(box);
    expect(S().diagram.rels).toHaveLength(0);
    expect(foreignKeyOf(S().diagram, ordersId, fkColId)).toBeNull();
  });

  it("changing the referenced column re-points the relationship", async () => {
    const user = userEvent.setup();
    const { d, ordersId, fkColId, pkId } = shop("buyer_ref");
    S().load(d);
    S().setForeignKey(ordersId, fkColId, { tableId: d.tables[0].id, columnId: pkId });
    render(<Harness tableId={ordersId} colId={fkColId} />);

    await user.click(screen.getByRole("button", { name: "Change" }));
    const nameCol = d.tables[0].columns[1].id;
    await user.selectOptions(screen.getByLabelText("Column"), nameCol);
    expect(S().diagram.rels).toHaveLength(1);
    expect(foreignKeyOf(S().diagram, ordersId, fkColId)?.columnId).toBe(nameCol);
  });
});

describe("ColumnCard flags", () => {
  it("ticking Primary key clears nullability and dependencies", async () => {
    const user = userEvent.setup();
    const { d, ordersId, fkColId } = shop("postcode");
    d.tables[1].columns[1].nullable = true;
    S().load(d);
    render(<Harness tableId={ordersId} colId={fkColId} />);
    await user.click(screen.getByRole("checkbox", { name: "Primary key" }));
    const col = findTable(S().diagram, ordersId)!.columns[1];
    expect(col).toMatchObject({ pk: true, nullable: false, determinedBy: [] });
  });
});
