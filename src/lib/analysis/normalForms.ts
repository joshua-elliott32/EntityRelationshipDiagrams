/**
 * Normal-form checks, one table at a time. Returns every NF issue (certain
 * and heuristic, all forms); index.ts filters by the user's options.
 */
import { singular, type Column, type Table } from "@/lib/model";
import { fkRelsFor, type Ctx } from "./context";
import { isSuperkey, tableFDs } from "./fd";
import { cName, joinPlus, makeIssue, qName, tName, ui } from "./issues";
import type { Issue } from "./types";

/** Matches `phone_1`, `phone2`, `address-3`, `line 4`. Group 1 is the base. */
const NUMBERED = /^(.*?[a-z])[_\-\s]?(\d+)$/i;

/**
 * Column names too generic to mean "copied from the parent" when they appear
 * in both tables, plus values that are routinely snapshotted on purpose
 * (an order line keeps the price it was sold at).
 */
const COPY_STOPLIST = new Set([
  "id",
  "name",
  "title",
  "label",
  "description",
  "note",
  "notes",
  "comment",
  "comments",
  "status",
  "state",
  "type",
  "kind",
  "code",
  "version",
  "active",
  "is_active",
  "enabled",
  "deleted",
  "is_deleted",
  "position",
  "sort_order",
  "created",
  "updated",
  "modified",
  "created_at",
  "updated_at",
  "modified_at",
  "deleted_at",
  "created_by",
  "updated_by",
  "date",
  "start_date",
  "end_date",
  "price",
  "unit_price",
  "amount",
  "total",
  "quantity",
  "qty",
  "cost",
  "rate",
  "discount",
  "tax",
  "currency",
]);

const lower = (s: string) => s.trim().toLowerCase();

/** More same-named columns than this and the tables are look-alikes, not copies. */
const MAX_EXACT_COPIES = 2;

export function normalFormIssues(ctx: Ctx, t: Table): Issue[] {
  const out: Issue[] = [];
  const cols = t.columns;
  if (cols.length === 0) return out; // reported by the design checks
  const T = tName(t);

  // ---------- 1NF ----------
  const pks = cols.filter((c) => c.pk);
  if (pks.length === 0) {
    const alt = cols.find((c) => c.unique && !c.nullable);
    out.push(
      makeIssue({
        id: `1NF:nopk:${t.id}`,
        rule: "1NF",
        severity: "error",
        certain: true,
        tableId: t.id,
        message: `${T} has no primary key.`,
        fix:
          `Tick ${ui("Primary key")} on the column (or columns) that uniquely identify each row.` +
          (alt ? ` ${cName(alt)} is already ${ui("Unique")}, so it could be the key.` : ""),
      }),
    );
  }
  for (const c of cols) {
    if (!c.multi) continue;
    out.push(
      makeIssue({
        id: `1NF:multi:${t.id}:${c.id}`,
        rule: "1NF",
        severity: "error",
        certain: true,
        tableId: t.id,
        columnIds: [c.id],
        message: `${qName(t, c)} holds a list of values.`,
        fix: `Move the values into their own table with one row per value and a foreign key back to ${T}, then untick ${ui("Holds a list")}.`,
      }),
    );
  }
  const groups = new Map<string, Column[]>();
  for (const c of cols) {
    const m = NUMBERED.exec(c.name.trim());
    if (!m) continue;
    const base = m[1].toLowerCase().replace(/[_\-\s]+$/, "");
    const g = groups.get(base);
    if (g) g.push(c);
    else groups.set(base, [c]);
  }
  for (const [base, g] of groups) {
    if (g.length < 2) continue;
    out.push(
      makeIssue({
        id: `1NF:group:${t.id}:${g.map((c) => c.id).join(",")}`,
        rule: "1NF",
        severity: "warning",
        certain: false,
        tableId: t.id,
        columnIds: g.map((c) => c.id),
        message: `${g.map(cName).join(", ")} look like a repeating group in ${T}.`,
        fix: `Create a ${base} table with one row per value, linked back to ${T} by a foreign key, and remove the numbered columns.`,
      }),
    );
  }

  // ---------- 2NF / 3NF / BCNF from declared dependencies ----------
  const fds = tableFDs(t);
  const flagged = new Set<string>();
  const declaredCols = new Set(fds.declared.map((d) => cols[d.col].id));
  for (const dep of fds.declared) {
    if (isSuperkey(fds.n, fds.all, dep.lhs)) continue;
    const c = cols[dep.col];
    const D = dep.lhs.map((i) => cols[i]);
    const Dn = joinPlus(D);
    const columnIds = [c.id, ...D.map((x) => x.id)];
    flagged.add(c.id);

    if (fds.prime[dep.col]) {
      const key = fds.candidateKeys.find((k) => k.includes(dep.col)) ?? [dep.col];
      out.push(
        makeIssue({
          id: `BCNF:dep:${t.id}:${c.id}`,
          rule: "BCNF",
          severity: "error",
          certain: true,
          tableId: t.id,
          columnIds,
          message: `${qName(t, c)} depends on ${Dn}, which isn’t a key — but ${cName(c)} is part of the key (${joinPlus(key.map((i) => cols[i]))}).`,
          fix: `Move ${Dn} and ${cName(c)} into their own table keyed by ${Dn}, and keep ${Dn} here. If ${Dn} doesn’t really decide ${cName(c)}, clear its ${ui("Determined by")}.`,
        }),
      );
      continue;
    }

    const partOf = fds.candidateKeys.find(
      (k) => k.length > 1 && dep.lhs.length < k.length && dep.lhs.every((i) => k.includes(i)),
    );
    if (partOf) {
      out.push(
        makeIssue({
          id: `2NF:partial:${t.id}:${c.id}`,
          rule: "2NF",
          severity: "error",
          certain: true,
          tableId: t.id,
          columnIds,
          message: `${qName(t, c)} depends on ${Dn}, which is only part of the key (${joinPlus(partOf.map((i) => cols[i]))}).`,
          fix: `Move ${cName(c)} to a table whose key is ${Dn} and keep ${Dn} here as a foreign key. If it depends on the whole key, clear its ${ui("Determined by")}.`,
        }),
      );
      continue;
    }

    const one = D.length === 1 ? D[0] : null;
    const hint =
      one && one.unique
        ? ` (${cName(one)} is ${ui("Unique")} but ${ui("Can be empty")} is ticked, so it can’t act as a key.)`
        : "";
    out.push(
      makeIssue({
        id: `3NF:dep:${t.id}:${c.id}`,
        rule: "3NF",
        severity: "error",
        certain: true,
        tableId: t.id,
        columnIds,
        message: `${qName(t, c)} depends on ${Dn}, which ${one ? "isn’t a key" : "together aren’t a key"}.`,
        fix: `Move ${cName(c)} into a table keyed by ${Dn} and keep just ${Dn} here.${hint}`,
      }),
    );
  }

  // ---------- 3NF heuristics ----------
  // Columns with a declared dependency are skipped: the user has said what
  // decides them (setting "Determined by" to the key confirms a snapshot).
  const skip = (c: Column) => c.pk || flagged.has(c.id) || declaredCols.has(c.id);
  const fkCols = ctx.fkRels.get(t.id);
  const isFk = (c: Column) => fkCols?.has(c.id) ?? false;
  const names = cols.map((c) => lower(c.name));

  for (let fi = 0; fi < cols.length; fi++) {
    const f = cols[fi];
    if (f.pk || !names[fi].endsWith("_id")) continue;
    const pre = names[fi].slice(0, -3);
    if (!pre) continue;
    for (let oi = 0; oi < cols.length; oi++) {
      const o = cols[oi];
      const on = names[oi];
      if (oi === fi || !on.startsWith(`${pre}_`) || on.endsWith("_id") || skip(o)) continue;
      flagged.add(o.id);
      out.push(
        makeIssue({
          id: `3NF:prefix:${t.id}:${o.id}`,
          rule: "3NF",
          severity: "warning",
          certain: false,
          tableId: t.id,
          columnIds: [o.id],
          message: `${qName(t, o)} probably describes the ${pre}, not the ${T} row.`,
          fix: `Keep ${cName(f)} and read ${cName(o)} from the ${pre} table instead. If it really belongs to each ${T} row (a snapshot), set its ${ui("Determined by")} to the primary key to confirm.`,
        }),
      );
    }
  }

  for (let fi = 0; fkCols && fi < cols.length; fi++) {
    const f = cols[fi];
    for (const r of fkRelsFor(ctx, t.id, f.id)) {
      const P = ctx.tableById.get(r.from);
      if (!P || P.id === t.id) continue;
      const prefixes = new Set([singular(P.name.trim()), lower(P.name)]);
      if (names[fi].endsWith("_id")) prefixes.add(names[fi].slice(0, -3));
      prefixes.delete("");
      const starts = [...prefixes].map((p) => `${p}_`);
      const parentCols = new Map<string, Column>();
      for (const pc of P.columns) {
        const pn = lower(pc.name);
        if (pn && !pc.pk && pc.id !== r.fromCol && !parentCols.has(pn)) parentCols.set(pn, pc);
      }
      /** `customer_email` → customers.email, when the prefix names the parent. */
      const prefixedMatch = (on: string): Column | undefined => {
        for (const st of starts) {
          if (on.length > st.length && on.startsWith(st)) {
            const pc = parentCols.get(on.slice(st.length));
            if (pc) return pc;
          }
        }
        return undefined;
      };
      const hits: { o: Column; pc: Column; exactOnly: boolean }[] = [];
      let exactHits = 0;
      for (let oi = 0; oi < cols.length; oi++) {
        const o = cols[oi];
        if (oi === fi || skip(o) || o.unique || isFk(o)) continue;
        const on = names[oi];
        const viaPrefix = prefixedMatch(on);
        const pc = viaPrefix ?? (COPY_STOPLIST.has(on) ? undefined : parentCols.get(on));
        if (!pc) continue;
        const exactOnly = !viaPrefix;
        if (exactOnly) exactHits++;
        hits.push({ o, pc, exactOnly });
      }
      // Many same-named columns means a look-alike table (an archive, a
      // subtype, a history table) rather than stray copies: keep only the
      // explicitly prefixed matches then.
      const keepExact = exactHits <= MAX_EXACT_COPIES;
      for (const { o, pc, exactOnly } of hits) {
        if (exactOnly && !keepExact) continue;
        flagged.add(o.id);
        out.push(
          makeIssue({
            id: `3NF:copy:${t.id}:${o.id}`,
            rule: "3NF",
            severity: "warning",
            certain: false,
            tableId: t.id,
            columnIds: [o.id],
            message: `${qName(t, o)} looks like a copy of ${tName(P)}.${cName(pc)}.`,
            fix: `Read ${cName(pc)} from ${tName(P)} through ${cName(f)} so it is stored only once. If it’s a deliberate snapshot, set its ${ui("Determined by")} to the primary key to confirm.`,
          }),
        );
      }
    }
  }

  return out;
}
