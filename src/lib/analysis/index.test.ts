import { describe, expect, it } from "vitest";
import { makeColumn, makeRelationship, makeTable, sampleDiagram, type Table } from "@/lib/model";
import { NORMAL_FORMS } from "@/lib/settings/types";
import { analyze } from ".";
import { ALL, diagram, table } from "./testing";

describe("sample diagram", () => {
  const d = sampleDiagram();
  const [customers, orders] = d.tables;
  const r = analyze(d, ALL);
  const byKind = (k: string) => r.issues.filter((i) => i.id.startsWith(k));

  it("finds the deliberate problems", () => {
    expect(r.issues.map((i) => i.id.split(":").slice(0, 2).join(":"))).toEqual([
      "3NF:dep",
      "Design:nm",
      "1NF:group",
      "3NF:prefix",
    ]);
    expect(byKind("3NF:dep")[0].message).toBe(
      "orders.city depends on postcode, which isn’t a key.",
    );
    expect(byKind("1NF:group")[0].message).toBe(
      "phone_1, phone_2 look like a repeating group in customers.",
    );
    expect(byKind("3NF:prefix")[0].message).toBe(
      "orders.customer_email probably describes the customer, not the orders row.",
    );
    expect(byKind("Design:nm")[0].message).toBe("orders ↔ products is many-to-many.");
  });

  it("reports the highest form and target", () => {
    expect(r.highestForm).toBe("2NF");
    expect(r.meetsTarget).toBe(false);
    expect(analyze(d, { ...ALL, target: "2NF" }).meetsTarget).toBe(true);
  });

  it("counts issues per table and collects flagged columns", () => {
    expect(r.byTable).toEqual({ [customers.id]: 1, [orders.id]: 2 });
    const city = orders.columns.find((c) => c.name === "city")!;
    const email = orders.columns.find((c) => c.name === "customer_email")!;
    expect(r.flaggedColumns.has(city.id)).toBe(true);
    expect(r.flaggedColumns.has(email.id)).toBe(true);
    expect(r.flaggedColumns.size).toBe(5); // city, postcode, phone_1, phone_2, customer_email
  });

  it("gives every issue a message and a fix", () => {
    for (const i of analyze(d, { ...ALL, naming: "PascalCase" }).issues) {
      expect(i.message.length).toBeGreaterThan(5);
      expect(i.fix.length).toBeGreaterThan(5);
    }
  });
});

describe("options", () => {
  const t = table("t", {
    a: { pk: true },
    b: { pk: true, by: ["x"] },
    x: {},
    tags: { multi: true },
    part: { by: ["a"] },
    y: {},
    trans: { by: ["y"] },
  });
  const d = diagram([t]);
  const rules = (target: (typeof NORMAL_FORMS)[number]) =>
    [...new Set(analyze(d, { ...ALL, target }).issues.map((i) => i.rule))].sort();

  it("includes normal-form issues only up to the target", () => {
    expect(rules("none")).toEqual([]);
    expect(rules("1NF")).toEqual(["1NF"]);
    expect(rules("2NF")).toEqual(["1NF", "2NF"]);
    expect(rules("3NF")).toEqual(["1NF", "2NF", "3NF"]);
    expect(rules("BCNF")).toEqual(["1NF", "2NF", "3NF", "BCNF"]);
  });

  it("computes highestForm regardless of target", () => {
    for (const target of NORMAL_FORMS) {
      const r = analyze(d, { ...ALL, target });
      expect(r.highestForm).toBe("none");
      expect(r.meetsTarget).toBe(target === "none");
    }
  });

  it("walks the forms up as problems are fixed", () => {
    const forms = (spec: Parameters<typeof table>[1]) =>
      analyze(diagram([table("t", spec)]), ALL).highestForm;
    expect(forms({ a: { pk: true }, b: { pk: true }, c: { by: ["a"] } })).toBe("1NF");
    expect(forms({ a: { pk: true }, b: {}, c: { by: ["b"] } })).toBe("2NF");
    expect(forms({ a: { pk: true }, b: { pk: true, by: ["c"] }, c: {} })).toBe("3NF");
    expect(forms({ a: { pk: true }, b: {}, c: {} })).toBe("BCNF");
  });

  it("an empty diagram is in BCNF", () => {
    const r = analyze(diagram([]), ALL);
    expect(r).toMatchObject({ issues: [], highestForm: "BCNF", meetsTarget: true, byTable: {} });
  });
});

describe("output", () => {
  it("sorts by severity, then table order, and ids are unique and stable", () => {
    const a = table("Zeta", { id: { pk: true }, phone_1: {}, phone_2: {} });
    const b = table("alpha", { x: {} });
    const c = table("beta", { id: { pk: true }, p: {}, q: { by: ["p"] } });
    const d = diagram([a, b, c]);
    const opts = { ...ALL, naming: "snake_case" as const };
    const r = analyze(d, opts);
    expect(r.issues.map((i) => [i.severity, i.tableId])).toEqual([
      ["error", b.id],
      ["error", c.id],
      ["warning", a.id],
      ["info", a.id],
    ]);
    const ids = r.issues.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(analyze(structuredClone(d), opts).issues.map((i) => i.id)).toEqual(ids);
  });

  it("keeps ids unique even with duplicated column ids", () => {
    const t = table("t", { id: { pk: true }, a: { multi: true } });
    t.columns.push({ ...t.columns[1] });
    const ids = analyze(diagram([t]), ALL).issues.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not mutate the diagram", () => {
    const d = sampleDiagram();
    const before = JSON.stringify(d);
    analyze(d, { ...ALL, naming: "camelCase" });
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("performance", () => {
  it("handles 200 tables × 20 columns quickly", () => {
    const tables: Table[] = [];
    for (let i = 0; i < 200; i++) {
      const cols = [makeColumn(`t${i}_id`, "INT", { pk: true })];
      for (let j = 1; j < 20; j++) {
        const dep = j % 5 === 0 ? [cols[j - 1].id] : [];
        cols.push(makeColumn(`col_${j}`, "VARCHAR(50)", { determinedBy: dep, unique: j === 3 }));
      }
      tables.push(makeTable(`table_${i}`, 0, 0, { columns: cols }));
    }
    const rels = tables.slice(1).map((t, i) =>
      makeRelationship(tables[i].id, t.id, {
        fromCol: tables[i].columns[0].id,
        toCol: t.columns[1].id,
      }),
    );
    const d = diagram(tables, rels);
    analyze(d, { ...ALL, naming: "camelCase" }); // warm up
    const start = performance.now();
    const r = analyze(d, { ...ALL, naming: "camelCase" });
    expect(performance.now() - start).toBeLessThan(500);
    expect(r.issues.length).toBeGreaterThan(0);
  });
});
