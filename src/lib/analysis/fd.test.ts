import { describe, expect, it } from "vitest";
import { makeTable } from "@/lib/model";
import { candidateKeys, closure, isSuperkey, minimiseKey, tableFDs } from "./fd";
import { table } from "./testing";

describe("closure", () => {
  it("follows chains and handles cycles", () => {
    const fds = [
      { lhs: [0], rhs: [1] },
      { lhs: [1], rhs: [2] },
      { lhs: [2], rhs: [0] },
    ];
    expect(closure(4, fds, [1])).toEqual([true, true, true, false]);
    expect(closure(4, fds, [3])).toEqual([false, false, false, true]);
  });

  it("needs every attribute of a composite left-hand side", () => {
    const fds = [{ lhs: [0, 1], rhs: [2] }];
    expect(closure(3, fds, [0])[2]).toBe(false);
    expect(closure(3, fds, [0, 1])[2]).toBe(true);
  });
});

describe("keys", () => {
  const fds = [
    { lhs: [0, 1], rhs: [0, 1, 2] },
    { lhs: [2], rhs: [1] },
  ];

  it("minimises a superkey", () => {
    expect(isSuperkey(3, fds, [0, 1, 2])).toBe(true);
    expect(minimiseKey(3, fds, [0, 1, 2])).toEqual([0, 2]);
  });

  it("finds every candidate key reachable from a seed (Lucchesi–Osborn)", () => {
    // (student, course) → teacher; teacher → course  ⇒ keys {student,course}, {student,teacher}
    const keys = candidateKeys(3, fds, [[0, 1]]);
    expect(keys).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  it("returns no keys without seeds", () => {
    expect(candidateKeys(3, fds, [])).toEqual([]);
  });
});

describe("tableFDs", () => {
  it("ignores unknown ids and self-references in determinedBy", () => {
    const t = table("t", { id: { pk: true }, a: { by: ["ghost", "a"] }, b: { by: ["a"] } });
    const f = tableFDs(t);
    expect(f.declared).toEqual([{ lhs: [1], col: 2 }]);
  });

  it("treats unique non-null columns as keys, but not nullable ones", () => {
    const t = table("t", {
      id: { pk: true },
      email: { unique: true },
      nick: { unique: true, nullable: true },
    });
    const f = tableFDs(t);
    expect(f.candidateKeys).toEqual([[0], [1]]);
    expect(f.prime).toEqual([true, true, false]);
  });

  it("promotes a declared determinant that decides everything to a key", () => {
    const t = table("t", { id: { pk: true }, code: {}, x: { by: ["code"] }, id2: {} });
    // code → x only, so not a key
    expect(tableFDs(t).candidateKeys).toEqual([[0]]);
    const t2 = table("t", { id: { pk: true, by: ["code"] }, code: {} });
    expect(tableFDs(t2).candidateKeys).toEqual([[0], [1]]);
  });

  it("copes with an empty table", () => {
    const f = tableFDs(makeTable("empty"));
    expect(f.n).toBe(0);
    expect(f.candidateKeys).toEqual([]);
  });
});
