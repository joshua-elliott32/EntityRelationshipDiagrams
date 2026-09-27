/**
 * Structural and key checks: things that would break the SQL or the meaning
 * of a relationship, independent of normalisation.
 */
import { singular, type Column, type Relationship, type Table } from "@/lib/model";
import { fkRelsFor, type Ctx } from "./context";
import { minimiseKey, tableFDs } from "./fd";
import { cName, joinPlus, listAnd, makeIssue, qName, tName, ui } from "./issues";
import type { Issue } from "./types";

const TYPE_ALIASES: Record<string, string> = {
  INTEGER: "INT",
  INT4: "INT",
  SERIAL: "INT",
  SERIAL4: "INT",
  INT8: "BIGINT",
  BIGSERIAL: "BIGINT",
  SERIAL8: "BIGINT",
  INT2: "SMALLINT",
  SMALLSERIAL: "SMALLINT",
  SERIAL2: "SMALLINT",
};

/** Canonical form of a SQL type for comparison: `serial` ≈ `INT`, `varchar (10)` = `VARCHAR(10)`. */
export function normaliseType(type: string): string {
  const t = type.replace(/\s+/g, "").toUpperCase();
  return TYPE_ALIASES[t] ?? t;
}

/** Table-level structure: no columns, empty or duplicate names, oversized primary key. */
export function tableDesignIssues(t: Table): Issue[] {
  const out: Issue[] = [];
  const T = tName(t);

  if (!t.name.trim()) {
    out.push(
      makeIssue({
        id: `Design:noname:${t.id}`,
        rule: "Design",
        severity: "error",
        certain: true,
        tableId: t.id,
        message: "A table has no name.",
        fix: "Select the table and type a name for it.",
      }),
    );
  }

  if (t.columns.length === 0) {
    out.push(
      makeIssue({
        id: `Design:empty:${t.id}`,
        rule: "Design",
        severity: "error",
        certain: true,
        tableId: t.id,
        message: `${T} has no columns.`,
        fix: `Add at least a key column and tick ${ui("Primary key")} on it.`,
      }),
    );
    return out;
  }

  const unnamed = t.columns.filter((c) => !c.name.trim());
  if (unnamed.length > 0) {
    out.push(
      makeIssue({
        id: `Design:colnoname:${t.id}`,
        rule: "Design",
        severity: "error",
        certain: true,
        tableId: t.id,
        columnIds: unnamed.map((c) => c.id),
        message:
          unnamed.length === 1
            ? `${T} has a column with no name.`
            : `${T} has ${unnamed.length} columns with no name.`,
        fix: "Give every column a name, or delete the ones you don’t need.",
      }),
    );
  }

  const byName = new Map<string, Column[]>();
  for (const c of t.columns) {
    const k = c.name.trim().toLowerCase();
    if (!k) continue;
    const g = byName.get(k);
    if (g) g.push(c);
    else byName.set(k, [c]);
  }
  for (const g of byName.values()) {
    if (g.length < 2) continue;
    out.push(
      makeIssue({
        id: `Design:dupcol:${t.id}:${g.map((c) => c.id).join(",")}`,
        rule: "Design",
        severity: "error",
        certain: true,
        tableId: t.id,
        columnIds: g.map((c) => c.id),
        message: `${T} has ${g.length} columns called ${cName(g[0])}.`,
        fix: "Rename all but one of them — every column in a table needs its own name.",
      }),
    );
  }

  // A composite primary key where fewer columns already identify each row.
  const pk = t.columns.map((c, i) => (c.pk ? i : -1)).filter((i) => i >= 0);
  if (pk.length > 1) {
    const fds = tableFDs(t);
    const min = minimiseKey(fds.n, fds.all, pk);
    if (min.length < pk.length) {
      const extra = pk.filter((i) => !min.includes(i)).map((i) => t.columns[i]);
      const keep = min.map((i) => t.columns[i]);
      out.push(
        makeIssue({
          id: `Keys:pkminimal:${t.id}`,
          rule: "Keys",
          severity: "info",
          certain: true,
          tableId: t.id,
          columnIds: extra.map((c) => c.id),
          message: `The primary key of ${T} (${joinPlus(t.columns.filter((c) => c.pk))}) is bigger than it needs to be: ${joinPlus(keep)} alone identifies each row.`,
          fix: `Untick ${ui("Primary key")} on ${listAnd(extra.map(cName))}, or check the ${ui("Unique")} and ${ui("Determined by")} settings that make ${joinPlus(keep)} enough.`,
        }),
      );
    }
  }
  return out;
}

/** Two or more tables with the same name: flag every one after the first. */
export function duplicateTableIssues(tables: Table[]): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  for (const t of tables) {
    const k = t.name.trim().toLowerCase();
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      continue;
    }
    out.push(
      makeIssue({
        id: `Design:duptable:${t.id}`,
        rule: "Design",
        severity: "error",
        certain: true,
        tableId: t.id,
        message: `There is already a table called ${tName(t)}.`,
        fix: "Rename this one — every table needs its own name.",
      }),
    );
  }
  return out;
}

/** Relationship and foreign-key checks. */
export function relationshipIssues(ctx: Ctx, r: Relationship): Issue[] {
  const out: Issue[] = [];
  const parent = ctx.tableById.get(r.from);
  const child = ctx.tableById.get(r.to);
  if (!parent || !child) return out;
  const P = tName(parent);
  const C = tName(child);

  if (r.type === "N:M") {
    out.push(
      makeIssue({
        id: `Design:nm:${r.id}`,
        rule: "Design",
        severity: "error",
        certain: true,
        relId: r.id,
        message: `${P} ↔ ${C} is many-to-many.`,
        fix: "Relational tables can’t hold this directly. Select the relationship to create a junction table.",
      }),
    );
    return out;
  }

  const fk = r.toCol ? child.columns.find((c) => c.id === r.toCol) : undefined;
  if (!fk) {
    out.push(
      makeIssue({
        id: `Keys:nofk:${r.id}`,
        rule: "Keys",
        severity: "warning",
        certain: true,
        tableId: child.id,
        relId: r.id,
        message: `Which column in ${C} holds the foreign key to ${P}?`,
        fix: `Tick ${ui("Foreign key")} on the column of ${C} that points to ${P} (usually ${singular(P)}_id), or pick the column in the relationship.`,
      }),
    );
    return out;
  }

  const ref = r.fromCol ? parent.columns.find((c) => c.id === r.fromCol) : undefined;
  if (!ref) {
    out.push(
      makeIssue({
        id: `Keys:noref:${r.id}`,
        rule: "Keys",
        severity: "error",
        certain: true,
        tableId: child.id,
        relId: r.id,
        columnIds: [fk.id],
        message: `The foreign key ${qName(child, fk)} doesn’t say which column of ${P} it points to.`,
        fix: `Select the relationship and choose the referenced column of ${P} — usually its primary key.`,
      }),
    );
  } else {
    if (!ref.pk && !ref.unique) {
      out.push(
        makeIssue({
          id: `Keys:badref:${r.id}`,
          rule: "Keys",
          severity: "error",
          certain: true,
          tableId: child.id,
          relId: r.id,
          columnIds: [fk.id, ref.id],
          message: `${qName(child, fk)} points to ${qName(parent, ref)}, which isn’t a key.`,
          fix: `Point the foreign key at the primary key of ${P}, or tick ${ui("Unique")} on ${qName(parent, ref)} if every value really is different.`,
        }),
      );
    }
    if (fk.type.trim() && ref.type.trim() && normaliseType(fk.type) !== normaliseType(ref.type)) {
      out.push(
        makeIssue({
          id: `Keys:type:${r.id}`,
          rule: "Keys",
          severity: "warning",
          certain: true,
          tableId: child.id,
          relId: r.id,
          columnIds: [fk.id, ref.id],
          message: `${qName(child, fk)} is ${fk.type.trim()} but ${qName(parent, ref)} is ${ref.type.trim()}.`,
          fix: `Give both columns the same data type so the values can match.`,
        }),
      );
    }
  }

  if (r.type === "1:1" && !fk.pk && !fk.unique) {
    out.push(
      makeIssue({
        id: `Keys:oneone:${r.id}`,
        rule: "Keys",
        severity: "warning",
        certain: true,
        tableId: child.id,
        relId: r.id,
        columnIds: [fk.id],
        message: `${P} → ${C} is one-to-one, but ${qName(child, fk)} isn’t unique, so several ${C} rows could point to the same ${P} row.`,
        fix: `Tick ${ui("Unique")} on ${qName(child, fk)} (or make it the ${ui("Primary key")}), or change the relationship to 1:N.`,
      }),
    );
  }

  if (r.from === r.to && !fk.nullable) {
    out.push(
      makeIssue({
        id: `Keys:selfref:${r.id}`,
        rule: "Keys",
        severity: "info",
        certain: true,
        tableId: child.id,
        relId: r.id,
        columnIds: [fk.id],
        message: `${qName(child, fk)} can’t be empty, so the first ${C} row has nothing to point to.`,
        fix: `Tick ${ui("Can be empty")} on ${qName(child, fk)} so top-level rows can leave it blank.`,
      }),
    );
  } else if (fk.nullable && !r.fromOptional && !fk.pk) {
    out.push(
      makeIssue({
        id: `Keys:optional:${r.id}`,
        rule: "Keys",
        severity: "info",
        certain: true,
        tableId: child.id,
        relId: r.id,
        columnIds: [fk.id],
        message: `${qName(child, fk)} can be empty, but the relationship says every ${C} row needs a ${P} row.`,
        fix: `Untick ${ui("Can be empty")} on ${qName(child, fk)}, or make the ${P} end optional in the relationship.`,
      }),
    );
  } else if (!fk.nullable && r.fromOptional) {
    out.push(
      makeIssue({
        id: `Keys:optional:${r.id}`,
        rule: "Keys",
        severity: "info",
        certain: true,
        tableId: child.id,
        relId: r.id,
        columnIds: [fk.id],
        message: `The relationship says a ${C} row may exist without a ${P} row, but ${qName(child, fk)} can’t be empty.`,
        fix: `Tick ${ui("Can be empty")} on ${qName(child, fk)}, or make the ${P} end mandatory in the relationship.`,
      }),
    );
  }
  return out;
}

/** A column that is the foreign key of more than one relationship. */
export function multiFkIssues(ctx: Ctx, t: Table): Issue[] {
  const out: Issue[] = [];
  if (!ctx.fkRels.has(t.id)) return out;
  for (const c of t.columns) {
    const rels = fkRelsFor(ctx, t.id, c.id);
    const parents = rels.flatMap((r) => {
      const p = ctx.tableById.get(r.from);
      return p ? [tName(p)] : [];
    });
    if (parents.length < 2) continue;
    out.push(
      makeIssue({
        id: `Keys:multifk:${t.id}:${c.id}`,
        rule: "Keys",
        severity: "warning",
        certain: true,
        tableId: t.id,
        columnIds: [c.id],
        message: `${qName(t, c)} is the foreign key of ${parents.length} relationships (${listAnd([...new Set(parents)])}).`,
        fix: `A column can point to only one row. Give each relationship its own ${ui("Foreign key")} column, or delete the duplicate relationship.`,
      }),
    );
  }
  return out;
}
