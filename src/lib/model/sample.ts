import { makeColumn, makeRelationship, makeTable } from "./factory";
import type { Diagram } from "./types";

/**
 * The example diagram from the original demo, with deliberate normalisation
 * problems so the checker has something to show.
 */
export function sampleDiagram(): Diagram {
  const customers = makeTable("customers", 40, 40, {
    columns: [
      makeColumn("customer_id", "INT", { pk: true }),
      makeColumn("full_name", "VARCHAR(100)"),
      makeColumn("email", "VARCHAR(255)", { unique: true }),
      makeColumn("phone_1", "VARCHAR(20)", { nullable: true }),
      makeColumn("phone_2", "VARCHAR(20)", { nullable: true }),
    ],
  });
  const postcode = makeColumn("postcode", "VARCHAR(10)");
  const orders = makeTable("orders", 400, 60, {
    columns: [
      makeColumn("order_id", "INT", { pk: true }),
      makeColumn("customer_id", "INT"),
      makeColumn("customer_email", "VARCHAR(255)"),
      makeColumn("order_date", "DATE"),
      postcode,
      makeColumn("city", "VARCHAR(60)", { determinedBy: [postcode.id] }),
    ],
  });
  const products = makeTable("products", 760, 120, {
    columns: [
      makeColumn("product_id", "INT", { pk: true }),
      makeColumn("name", "VARCHAR(100)"),
      makeColumn("price", "DECIMAL(10,2)"),
    ],
  });
  return {
    version: 2,
    name: "Shop example",
    tables: [customers, orders, products],
    rels: [
      makeRelationship(customers.id, orders.id, {
        fromCol: customers.columns[0].id,
        toCol: orders.columns[1].id,
        type: "1:N",
        label: "places",
      }),
      makeRelationship(orders.id, products.id, { type: "N:M", label: "contains" }),
    ],
    view: null,
    updatedAt: 0,
  };
}
