import { describe, expect, it } from "vitest";
import { analyze, normaliseType } from ".";
import { ALL, col, diagram, rel, table } from "./testing";
import type { Diagram } from "@/lib/model";

const DESIGN = { ...ALL, target: "none" as const, heuristics: false };
const run = (d: Diagram) => analyze(d, DESIGN);
const ids = (d: Diagram) => run(d).issues.map((i) => i.id.split(":").slice(0, 2).join(":"));

const customers = () => table("customers", { customer_id: { pk: true }, email: { unique: true } });
const orders = () => table("orders", { order_id: { pk: true }, customer_id: {} });

describe("table structure", () => {
  it("flags a table with no columns", () => {
    const r = run(diagram([table("empty", {})]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({
      id: expect.stringMatching(/^Design:empty:/),
      severity: "error",
    });
    expect(r.issues[0].message).toBe("empty has no columns.");
  });

  it("flags empty table and column names", () => {
    const t = table("", { id: { pk: true }, "": {} });
    expect(ids(diagram([t]))).toEqual(["Design:noname", "Design:colnoname"]);
  });

  it("flags duplicate column names case-insensitively", () => {
    const t = table("t", { id: { pk: true }, Email: {}, email: {} });
    const r = run(diagram([t]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].message).toBe("t has 2 columns called Email.");
    expect(r.issues[0].columnIds).toHaveLength(2);
  });

  it("flags the second table with the same name", () => {
    const a = table("items", { id: { pk: true } });
    const b = table("Items", { id: { pk: true } });
    const r = run(diagram([a, b]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].tableId).toBe(b.id);
  });

  it("accepts a clean table", () => {
    expect(run(diagram([customers()])).issues).toEqual([]);
  });

  it("notes a composite primary key that is bigger than needed", () => {
    const t = table("t", { a: { pk: true, unique: true }, b: { pk: true } });
    const r = run(diagram([t]));
    expect(r.issues.map((i) => i.id)).toEqual([`Keys:pkminimal:${t.id}`]);
    expect(r.issues[0].columnIds).toEqual([col(t, "b").id]);
    expect(run(diagram([table("t", { a: { pk: true }, b: { pk: true } })])).issues).toEqual([]);
  });
});

describe("relationships", () => {
  it("asks for a junction table for N:M, with the demo wording", () => {
    const a = customers();
    const b = orders();
    const r = run(diagram([a, b], [rel(a, "", b, "", { type: "N:M" })]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ tableId: null, severity: "error", rule: "Design" });
    expect(r.issues[0].relId).not.toBeNull();
    expect(r.issues[0].fix).toContain("Select the relationship to create a junction table.");
  });

  it("asks which column holds the foreign key", () => {
    const a = customers();
    const b = orders();
    const r = run(diagram([a, b], [rel(a, "customer_id", b, "")]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ severity: "warning", tableId: b.id });
    expect(r.issues[0].message).toBe("Which column in orders holds the foreign key to customers?");
    expect(r.issues[0].fix).toContain("“Foreign key”");
    expect(r.issues[0].fix).toContain("customer_id");
  });

  it("accepts a well-formed 1:N foreign key", () => {
    const a = customers();
    const b = orders();
    expect(run(diagram([a, b], [rel(a, "customer_id", b, "customer_id")])).issues).toEqual([]);
  });

  it("flags a foreign key with no referenced column", () => {
    const a = customers();
    const b = orders();
    expect(ids(diagram([a, b], [rel(a, "", b, "customer_id")]))).toEqual(["Keys:noref"]);
  });

  it("flags a foreign key that points at a non-key column", () => {
    const a = table("customers", { customer_id: { pk: true }, name: {} });
    const b = orders();
    const r = run(diagram([a, b], [rel(a, "name", b, "customer_id")]));
    expect(r.issues.map((i) => i.id.split(":")[1])).toEqual(["badref"]);
    expect(r.issues[0].message).toBe(
      "orders.customer_id points to customers.name, which isn’t a key.",
    );
  });

  it("warns about type mismatches but treats SERIAL as INT", () => {
    const a = customers();
    const b = orders();
    col(a, "customer_id").type = "serial";
    col(b, "customer_id").type = "Integer";
    expect(run(diagram([a, b], [rel(a, "customer_id", b, "customer_id")])).issues).toEqual([]);
    col(b, "customer_id").type = "VARCHAR(10)";
    const r = run(diagram([a, b], [rel(a, "customer_id", b, "customer_id")]));
    expect(r.issues.map((i) => i.id.split(":")[1])).toEqual(["type"]);
    expect(r.issues[0].message).toBe(
      "orders.customer_id is VARCHAR(10) but customers.customer_id is serial.",
    );
  });

  it("normalises types", () => {
    expect(normaliseType(" varchar (10) ")).toBe("VARCHAR(10)");
    expect(normaliseType("bigserial")).toBe(normaliseType("BIGINT"));
    expect(normaliseType("INT")).not.toBe(normaliseType("BIGINT"));
  });

  it("warns when a 1:1 foreign key isn't unique", () => {
    const a = customers();
    const b = table("profiles", { id: { pk: true }, customer_id: {} });
    const r = run(diagram([a, b], [rel(a, "customer_id", b, "customer_id", { type: "1:1" })]));
    expect(r.issues.map((i) => i.id.split(":")[1])).toEqual(["oneone"]);
    col(b, "customer_id").unique = true;
    expect(
      run(diagram([a, b], [rel(a, "customer_id", b, "customer_id", { type: "1:1" })])).issues,
    ).toEqual([]);
  });

  it("notes when nullability and the relationship's optionality disagree", () => {
    const a = customers();
    const b = orders();
    col(b, "customer_id").nullable = true;
    const r1 = run(diagram([a, b], [rel(a, "customer_id", b, "customer_id")]));
    expect(r1.issues.map((i) => [i.id.split(":")[1], i.severity])).toEqual([["optional", "info"]]);
    expect(r1.issues[0].fix).toContain("“Can be empty”");
    const ok = rel(a, "customer_id", b, "customer_id", { fromOptional: true });
    expect(run(diagram([a, b], [ok])).issues).toEqual([]);
    col(b, "customer_id").nullable = false;
    expect(ids(diagram([a, b], [ok]))).toEqual(["Keys:optional"]);
  });

  it("notes a self-reference that can't be empty (and nothing else)", () => {
    const t = table("employees", { id: { pk: true }, manager_id: {} });
    const r = rel(t, "id", t, "manager_id", { fromOptional: true });
    expect(ids(diagram([t], [r]))).toEqual(["Keys:selfref"]);
    col(t, "manager_id").nullable = true;
    expect(ids(diagram([t], [r]))).toEqual([]);
  });

  it("warns when a column is the foreign key of two relationships", () => {
    const a = customers();
    const s = table("suppliers", { customer_id: { pk: true } });
    const b = orders();
    const r = run(
      diagram(
        [a, s, b],
        [rel(a, "customer_id", b, "customer_id"), rel(s, "customer_id", b, "customer_id")],
      ),
    );
    expect(r.issues.map((i) => i.id.split(":")[1])).toEqual(["multifk"]);
    expect(r.issues[0].message).toContain("(customers and suppliers)");
  });

  it("ignores relationships to deleted tables", () => {
    const a = customers();
    expect(run(diagram([a], [rel(a, "customer_id", orders(), "")])).issues).toEqual([]);
  });

  it("are all skipped when design checks are off", () => {
    const a = customers();
    const b = orders();
    const d = diagram([a, b, table("empty", {})], [rel(a, "", b, "", { type: "N:M" })]);
    expect(analyze(d, { ...DESIGN, designChecks: false }).issues).toEqual([]);
  });
});
