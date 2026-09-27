import { beforeEach, describe, expect, it } from "vitest";
import { blankDiagram, foreignKeyOf, isForeignKey, sampleDiagram } from "@/lib/model";
import { useDiagramStore } from "./diagram";

const S = () => useDiagramStore.getState();
const D = () => S().diagram;

beforeEach(() => S().load(blankDiagram()));

describe("tables and columns", () => {
  it("adds a table with an id primary key", () => {
    const id = S().addTable({ x: 0, y: 0 });
    const t = D().tables.find((x) => x.id === id)!;
    expect(t.name).toBe("table_1");
    expect(t.columns[0]).toMatchObject({ name: "id", pk: true });
  });

  it("deleting a column clears determinants and FK references", () => {
    S().load(sampleDiagram());
    const orders = D().tables[1];
    const postcode = orders.columns.find((c) => c.name === "postcode")!;
    S().deleteColumn(orders.id, postcode.id);
    const city = D().tables[1].columns.find((c) => c.name === "city")!;
    expect(city.determinedBy).toEqual([]);
  });

  it("duplicates a table with fresh ids and remapped determinants", () => {
    S().load(sampleDiagram());
    const orders = D().tables[1];
    const copyId = S().duplicateTable(orders.id)!;
    const copy = D().tables.find((t) => t.id === copyId)!;
    expect(copy.name).toBe("orders_copy");
    const ids = new Set(orders.columns.map((c) => c.id));
    expect(copy.columns.every((c) => !ids.has(c.id))).toBe(true);
    const pc = copy.columns.find((c) => c.name === "postcode")!;
    expect(copy.columns.find((c) => c.name === "city")!.determinedBy).toEqual([pc.id]);
  });
});

describe("foreign keys", () => {
  it("linking finds an existing <parent>_id column", () => {
    S().load(sampleDiagram());
    const [customers, orders] = D().tables;
    const relId = S().addRelationship(customers.id, orders.id);
    const r = D().rels.find((x) => x.id === relId)!;
    expect(orders.columns.find((c) => c.id === r.toCol)?.name).toBe("customer_id");
  });

  it("linking creates an FK column when asked", () => {
    const a = S().addTable(undefined, "authors");
    const b = S().addTable(undefined, "books");
    S().addRelationship(a, b, { autoCreateFk: true });
    const books = D().tables.find((t) => t.id === b)!;
    const fk = books.columns.find((c) => c.name === "author_id")!;
    expect(fk).toBeDefined();
    expect(isForeignKey(D(), b, fk.id)).toBe(true);
  });

  it("setForeignKey creates, re-points and removes the relationship", () => {
    const a = S().addTable(undefined, "authors");
    const b = S().addTable(undefined, "books");
    const c = S().addTable(undefined, "publishers");
    const col = S().addColumn(b, { name: "ref_id", type: "" });
    const aPk = D().tables.find((t) => t.id === a)!.columns[0].id;
    const cPk = D().tables.find((t) => t.id === c)!.columns[0].id;

    S().setForeignKey(b, col, { tableId: a, columnId: aPk });
    expect(foreignKeyOf(D(), b, col)).toEqual({ tableId: a, columnId: aPk });
    expect(D().rels).toHaveLength(1);
    expect(
      D()
        .tables.find((t) => t.id === b)!
        .columns.find((x) => x.id === col)!.type,
    ).toBe("INT");

    S().setForeignKey(b, col, { tableId: c, columnId: cPk });
    expect(D().rels).toHaveLength(1);
    expect(foreignKeyOf(D(), b, col)?.tableId).toBe(c);

    S().setForeignKey(b, col, null);
    expect(D().rels).toHaveLength(0);
  });

  it("setForeignKey adopts an existing column-less link", () => {
    const a = S().addTable(undefined, "authors");
    const b = S().addTable(undefined, "books");
    const relId = S().addRelationship(a, b);
    expect(D().rels[0].toCol).toBe("");
    const col = S().addColumn(b, { name: "writer", type: "INT" });
    S().setForeignKey(b, col, { tableId: a, columnId: D().tables[0].columns[0].id });
    expect(D().rels).toHaveLength(1);
    expect(D().rels[0]).toMatchObject({ id: relId, toCol: col });
  });

  it("creates a junction table from a many-to-many link", () => {
    S().load(sampleDiagram());
    const nm = D().rels.find((r) => r.type === "N:M")!;
    const jid = S().createJunction(nm.id)!;
    const j = D().tables.find((t) => t.id === jid)!;
    expect(j.name).toBe("order_product");
    expect(j.columns.map((c) => [c.name, c.pk])).toEqual([
      ["order_id", true],
      ["product_id", true],
    ]);
    expect(D().rels.filter((r) => r.to === jid && r.toCol)).toHaveLength(2);
    expect(D().rels.some((r) => r.type === "N:M")).toBe(false);
  });
});

describe("history", () => {
  it("undoes and redoes", () => {
    S().addTable();
    S().addTable();
    expect(D().tables).toHaveLength(2);
    S().undo();
    expect(D().tables).toHaveLength(1);
    S().redo();
    expect(D().tables).toHaveLength(2);
  });

  it("coalesces typing into one step", () => {
    const t = S().addTable();
    S().updateTable(t, { name: "a" });
    S().updateTable(t, { name: "ab" });
    S().updateTable(t, { name: "abc" });
    S().undo();
    expect(D().tables[0].name).toBe("table_1");
  });

  it("records a drag as one step and keeps the camera on undo", () => {
    const t = S().addTable({ x: 0, y: 0 });
    S().beginGesture();
    S().moveTable(t, 10, 10);
    S().moveTable(t, 50, 50);
    S().endGesture();
    S().setView({ x: 5, y: 5, k: 2 });
    S().undo();
    expect(D().tables[0]).toMatchObject({ x: 0, y: 0 });
    expect(D().view).toEqual({ x: 5, y: 5, k: 2 });
  });
});
