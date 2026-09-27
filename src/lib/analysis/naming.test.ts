import { describe, expect, it } from "vitest";
import { analyze } from ".";
import { matchesConvention, toConvention, words } from "./naming";
import { ALL, col, diagram, table } from "./testing";
import type { AnalysisOptions } from "./types";

const opts = (naming: AnalysisOptions["naming"]): AnalysisOptions => ({
  ...ALL,
  target: "none",
  designChecks: false,
  naming,
});

describe("conventions", () => {
  it("matches each style", () => {
    expect(matchesConvention("order_items", "snake_case")).toBe(true);
    expect(matchesConvention("orderItems", "snake_case")).toBe(false);
    expect(matchesConvention("order__items", "snake_case")).toBe(false);
    expect(matchesConvention("orderItems", "camelCase")).toBe(true);
    expect(matchesConvention("OrderItems", "camelCase")).toBe(false);
    expect(matchesConvention("OrderItems", "PascalCase")).toBe(true);
    expect(matchesConvention("order_items", "PascalCase")).toBe(false);
  });

  it("converts names", () => {
    expect(words("customerID")).toEqual(["customer", "id"]);
    expect(words("HTTPStatus2")).toEqual(["http", "status2"]);
    expect(toConvention("Order Date", "snake_case")).toBe("order_date");
    expect(toConvention("first-name", "camelCase")).toBe("firstName");
    expect(toConvention("customer_id", "PascalCase")).toBe("CustomerId");
  });
});

describe("naming issues", () => {
  it("lists every offending name in one issue per table", () => {
    const t = table("Orders", { order_id: { pk: true }, OrderDate: {}, customerID: {} });
    const r = analyze(diagram([t]), opts("snake_case"));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ rule: "Naming", severity: "info", tableId: t.id });
    expect(r.issues[0].columnIds).toEqual([col(t, "OrderDate").id, col(t, "customerID").id]);
    expect(r.issues[0].message).toBe(
      "Orders and 2 of its columns aren’t snake_case: OrderDate and customerID.",
    );
    expect(r.issues[0].fix).toContain("OrderDate → order_date");
    expect(r.issues[0].fix).toContain("customerID → customer_id");
  });

  it("accepts names that follow the convention", () => {
    const t = table("orderItems", { orderId: { pk: true } });
    expect(analyze(diagram([t]), opts("camelCase")).issues).toEqual([]);
  });

  it("flags SQL reserved words", () => {
    const t = table("user", { id: { pk: true }, order: {}, email: {} });
    const r = analyze(diagram([t]), opts("snake_case"));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].message).toBe("user and user.order are SQL reserved words.");
    expect(r.issues[0].columnIds).toEqual([col(t, "order").id]);
  });

  it("does nothing when naming is off", () => {
    const t = table("User Table", { Order: { pk: true } });
    expect(analyze(diagram([t]), opts("off")).issues).toEqual([]);
  });
});
