import { describe, expect, it } from "vitest";
import { analyze } from ".";
import { NF_ONLY, col, diagram, rel, table } from "./testing";
import type { Issue } from "./types";

const run = (...args: Parameters<typeof diagram>) => analyze(diagram(...args), NF_ONLY);
const kinds = (issues: Issue[]) => issues.map((i) => i.id.split(":").slice(0, 2).join(":"));

describe("1NF", () => {
  it("flags a table with no primary key", () => {
    const t = table("log", { msg: {} });
    const r = run([t]);
    expect(kinds(r.issues)).toEqual(["1NF:nopk"]);
    expect(r.issues[0]).toMatchObject({ severity: "error", certain: true, tableId: t.id });
    expect(r.issues[0].message).toBe("log has no primary key.");
    expect(r.issues[0].fix).toContain("“Primary key”");
    expect(r.highestForm).toBe("none");
  });

  it("suggests an existing unique column as the key", () => {
    const r = run([table("users", { email: { unique: true } })]);
    expect(r.issues[0].fix).toContain("email is already “Unique”");
  });

  it("does not flag a table with a primary key", () => {
    expect(run([table("t", { id: { pk: true } })]).issues).toEqual([]);
  });

  it("flags a column that holds a list", () => {
    const t = table("posts", { id: { pk: true }, tags: { multi: true } });
    const r = run([t]);
    expect(kinds(r.issues)).toEqual(["1NF:multi"]);
    expect(r.issues[0].columnIds).toEqual([col(t, "tags").id]);
    expect(r.issues[0].message).toBe("posts.tags holds a list of values.");
    expect(r.issues[0].fix).toContain("“Holds a list”");
  });

  it("guesses repeating groups from numbered names", () => {
    const t = table("people", {
      id: { pk: true },
      phone_1: {},
      phone2: {},
      "address-1": {},
      md5: {},
    });
    const r = run([t]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ rule: "1NF", severity: "warning", certain: false });
    expect(r.issues[0].message).toBe("phone_1, phone2 look like a repeating group in people.");
    expect(r.highestForm).toBe("BCNF"); // heuristics don't count
  });

  it("hides heuristics when they are turned off", () => {
    const t = table("people", { id: { pk: true }, phone_1: {}, phone_2: {} });
    expect(analyze(diagram([t]), { ...NF_ONLY, heuristics: false }).issues).toEqual([]);
  });
});

describe("2NF", () => {
  const lines = () =>
    table("order_lines", {
      order_id: { pk: true },
      product_id: { pk: true },
      qty: {},
      product_name: { by: ["product_id"] },
    });

  it("flags a partial dependency on a composite key", () => {
    const t = lines();
    const r = run([t]);
    expect(kinds(r.issues)).toEqual(["2NF:partial"]);
    expect(r.issues[0].message).toBe(
      "order_lines.product_name depends on product_id, which is only part of the key (order_id + product_id).",
    );
    expect(r.issues[0].columnIds).toEqual([col(t, "product_name").id, col(t, "product_id").id]);
    expect(r.issues[0].fix).toContain("“Determined by”");
    expect(r.highestForm).toBe("1NF");
  });

  it("does not flag a dependency on the whole composite key", () => {
    const t = table("order_lines", {
      order_id: { pk: true },
      product_id: { pk: true },
      qty: { by: ["order_id", "product_id"] },
    });
    expect(run([t]).issues).toEqual([]);
  });

  it("does not flag a single-column key (nothing is a proper subset)", () => {
    const t = table("t", { id: { pk: true }, a: { by: ["id"] } });
    expect(run([t]).issues).toEqual([]);
  });
});

describe("3NF", () => {
  it("flags a transitive dependency on a non-key column", () => {
    const t = table("orders", { order_id: { pk: true }, postcode: {}, city: { by: ["postcode"] } });
    const r = run([t]);
    expect(kinds(r.issues)).toEqual(["3NF:dep"]);
    expect(r.issues[0].message).toBe("orders.city depends on postcode, which isn’t a key.");
    expect(r.highestForm).toBe("2NF");
  });

  it("does not flag a dependency on a unique, non-empty column", () => {
    const t = table("t", { id: { pk: true }, code: { unique: true }, label: { by: ["code"] } });
    expect(run([t]).issues).toEqual([]);
  });

  it("explains why a unique but nullable determinant isn't a key", () => {
    const t = table("t", {
      id: { pk: true },
      code: { unique: true, nullable: true },
      label: { by: ["code"] },
    });
    const r = run([t]);
    expect(kinds(r.issues)).toEqual(["3NF:dep"]);
    expect(r.issues[0].fix).toContain("“Can be empty”");
  });

  it("describes composite determinants", () => {
    const t = table("t", { id: { pk: true }, a: {}, b: {}, c: { by: ["a", "b"] } });
    expect(run([t]).issues[0].message).toBe("t.c depends on a + b, which together aren’t a key.");
  });

  it("flags both sides of a determinedBy cycle without hanging", () => {
    const t = table("t", { id: { pk: true }, a: { by: ["b"] }, b: { by: ["a"] } });
    expect(kinds(run([t]).issues)).toEqual(["3NF:dep", "3NF:dep"]);
  });

  it("reports a partial dependency as 2NF only, not also 3NF", () => {
    const t = table("t", { a: { pk: true }, b: { pk: true }, x: { by: ["a"] } });
    expect(kinds(run([t]).issues)).toEqual(["2NF:partial"]);
  });

  describe("heuristics", () => {
    it("flags <x>_something next to <x>_id (the demo rule)", () => {
      const t = table("orders", { order_id: { pk: true }, customer_id: {}, customer_email: {} });
      const r = run([t]);
      expect(r.issues).toHaveLength(1);
      expect(r.issues[0]).toMatchObject({ rule: "3NF", severity: "warning", certain: false });
      expect(r.issues[0].message).toBe(
        "orders.customer_email probably describes the customer, not the orders row.",
      );
    });

    it("is silenced by an explicit dependency on the key", () => {
      const t = table("orders", {
        order_id: { pk: true },
        customer_id: {},
        customer_email: { by: ["order_id"] },
      });
      expect(run([t]).issues).toEqual([]);
    });

    it("skips other _id columns and columns already flagged for certain", () => {
      const t = table("orders", {
        order_id: { pk: true },
        customer_id: {},
        customer_type_id: {},
        customer_city: { by: ["customer_id"] },
      });
      expect(kinds(run([t]).issues)).toEqual(["3NF:dep"]);
    });

    it("flags a column copied from the parent of a foreign key", () => {
      const customers = table("customers", { id: { pk: true }, email: { unique: true } });
      const orders = table("orders", { id: { pk: true }, buyer: {}, email: {} });
      const r = run([customers, orders], [rel(customers, "id", orders, "buyer")]);
      expect(kinds(r.issues)).toEqual(["3NF:copy"]);
      expect(r.issues[0].message).toBe("orders.email looks like a copy of customers.email.");
    });

    it("matches <parent>_<column> through a differently named foreign key", () => {
      const customers = table("customers", { id: { pk: true }, phone: {} });
      const orders = table("orders", { id: { pk: true }, buyer: {}, customer_phone: {} });
      const r = run([customers, orders], [rel(customers, "id", orders, "buyer")]);
      expect(kinds(r.issues)).toEqual(["3NF:copy"]);
    });

    it("ignores generic and snapshot-worthy names like name, created_at and price", () => {
      const products = table("products", { id: { pk: true }, name: {}, price: {}, created_at: {} });
      const lines = table("lines", {
        id: { pk: true },
        product: {},
        name: {},
        price: {},
        created_at: {},
      });
      const r = run([products, lines], [rel(products, "id", lines, "product")]);
      expect(r.issues).toEqual([]);
    });

    it("treats many same-named columns as a look-alike table, not copies", () => {
      const orders = table("orders", { id: { pk: true }, email: {}, phone: {}, city: {} });
      const archive = table("order_archive", {
        id: { pk: true },
        original: {},
        email: {},
        phone: {},
        city: {},
      });
      const r = run([orders, archive], [rel(orders, "id", archive, "original")]);
      expect(r.issues).toEqual([]);
    });

    it("doesn't use N:M relationships or unrelated tables", () => {
      const a = table("a", { id: { pk: true }, email: {} });
      const b = table("b", { id: { pk: true }, a_ref: {}, email: {} });
      expect(run([a, b], [rel(a, "id", b, "a_ref", { type: "N:M" })]).issues).toEqual([]);
      expect(run([a, b]).issues).toEqual([]);
    });
  });
});

describe("BCNF", () => {
  it("flags a non-key determinant of a key column", () => {
    const t = table("enrolments", {
      student: { pk: true },
      course: { pk: true, by: ["teacher"] },
      teacher: {},
    });
    const r = run([t]);
    expect(kinds(r.issues)).toEqual(["BCNF:dep"]);
    expect(r.issues[0].message).toContain("enrolments.course depends on teacher");
    expect(r.issues[0].message).toContain("part of the key (student + course)");
    expect(r.highestForm).toBe("3NF");
  });

  it("does not flag a key column decided by another key", () => {
    const t = table("t", { id: { pk: true, by: ["code"] }, code: { unique: true } });
    expect(run([t]).issues).toEqual([]);
  });
});

describe("robustness", () => {
  it("skips empty tables and dangling determinedBy ids", () => {
    const t = table("t", { id: { pk: true }, a: { by: ["deleted"] } });
    expect(run([table("empty", {}), t]).issues).toEqual([]);
  });

  it("checks a keyless table's dependencies too", () => {
    const t = table("t", { a: {}, b: { by: ["a"] }, c: {} });
    expect(kinds(run([t]).issues)).toEqual(["1NF:nopk", "3NF:dep"]);
  });
});
