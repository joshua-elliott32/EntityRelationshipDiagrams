#!/usr/bin/env node
/**
 * Build an ERD Studio diagram file (format version 2) from a compact spec.
 *
 *   node build-diagram.mjs <spec.json> <out.json>
 *
 * The spec is what you write after reading a picture of a diagram. See
 * ../SKILL.md for the format and ../examples/scorecards.spec.json for a
 * complete example. This script fills in every field the app requires,
 * turns "Table.Column" references into ids, converts crow's-foot notation
 * into cardinality/optionality and scales picture coordinates to the canvas.
 */
import { readFileSync, writeFileSync } from "node:fs";

const COLORS = ["slate", "teal", "blue", "violet", "rose", "amber", "green"];
const ACTIONS = ["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"];

// Canvas metrics from src/lib/geometry/types.ts, used to estimate table sizes.
const HEAD_H = 34;
const ROW_H = 24;
const MIN_W = 180;
const MONO_CHAR = 7.3; // 12px JetBrains Mono
const TYPE_CHAR = 6.7; // 11px JetBrains Mono
const HEAD_CHAR = 7.6; // 13px Instrument Sans, semibold

const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) {
  console.error("Usage: node build-diagram.mjs <spec.json> <out.json>");
  process.exit(2);
}

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const errors = [];
const warnings = [];

const slug = (s) =>
  String(s)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase() || "x";

/** "Name TYPE PK UK NULL LIST" or an object → column fields. */
function parseColumn(raw, tableName) {
  if (typeof raw === "object" && raw) {
    return {
      name: String(raw.name ?? ""),
      type: String(raw.type ?? ""),
      pk: !!raw.pk,
      unique: !!raw.unique,
      nullable: !!raw.nullable,
      multi: !!raw.multi,
      defaultValue: String(raw.default ?? raw.defaultValue ?? ""),
      note: String(raw.note ?? ""),
      fkHint: !!raw.fk,
    };
  }
  const parts = String(raw).trim().split(/\s+/);
  const name = parts.shift() ?? "";
  const flags = new Set();
  const typeParts = [];
  for (const p of parts) {
    const u = p.toUpperCase();
    if (["PK", "FK", "UK", "UNIQUE", "NULL", "NULLABLE", "LIST", "MULTI"].includes(u)) flags.add(u);
    else typeParts.push(p);
  }
  let type = typeParts.join(" ");
  let nullable = flags.has("NULL") || flags.has("NULLABLE");
  if (type.endsWith("?")) {
    // The app draws nullable columns as "INT?".
    type = type.slice(0, -1);
    nullable = true;
  }
  if (!name) errors.push(`A column in ${tableName} has no name: "${raw}"`);
  return {
    name,
    type,
    pk: flags.has("PK"),
    unique: flags.has("UK") || flags.has("UNIQUE"),
    nullable,
    multi: flags.has("LIST") || flags.has("MULTI"),
    defaultValue: "",
    note: "",
    fkHint: flags.has("FK"),
  };
}

function estimateSize(t) {
  let w = 24 + t.name.length * HEAD_CHAR + 34;
  for (const c of t.columns) {
    w = Math.max(
      w,
      24 + 42 + c.name.length * MONO_CHAR + 18 + (c.type.length + (c.nullable ? 1 : 0)) * TYPE_CHAR,
    );
  }
  return {
    w: Math.max(MIN_W, Math.ceil(w / 2) * 2),
    h: HEAD_H + Math.max(1, t.columns.length) * ROW_H,
  };
}

// ---- tables -------------------------------------------------------------
const tables = [];
const byName = new Map();
for (const [i, st] of (spec.tables ?? []).entries()) {
  const name = String(st.name ?? `table_${i + 1}`);
  const id = st.id ?? slug(name);
  if (byName.has(name.toLowerCase())) errors.push(`Duplicate table name: ${name}`);
  let color = st.color ?? null;
  if (color && !COLORS.includes(color)) {
    warnings.push(
      `${name}: colour "${color}" isn't one of ${COLORS.join(", ")}; using the default.`,
    );
    color = null;
  }
  const colNames = new Set();
  const columns = (st.columns ?? []).map((raw) => {
    const c = parseColumn(raw, name);
    if (colNames.has(c.name.toLowerCase())) errors.push(`Duplicate column ${name}.${c.name}`);
    colNames.add(c.name.toLowerCase());
    return c;
  });
  const t = { id, name, color, note: String(st.note ?? ""), columns, at: st.at, size: st.size, i };
  tables.push(t);
  byName.set(name.toLowerCase(), t);
}

// ---- determinants ("Determined by") ------------------------------------
for (const t of tables) {
  for (const [ci, c] of t.columns.entries()) {
    const raw = (spec.tables[t.i].columns ?? [])[ci];
    const dets = typeof raw === "object" && raw ? raw.determinedBy : undefined;
    c.determinedByNames = Array.isArray(dets) ? dets.map(String) : [];
  }
}

// ---- positions ----------------------------------------------------------
// `at` and `size` are in picture pixels. Scale them so a table's picture width
// matches the width the app will draw it at, then snap to the 10px grid.
const ratios = tables
  .filter((t) => Array.isArray(t.size) && t.size[0] > 0)
  .map((t) => t.size[0] / estimateSize(t).w)
  .sort((a, b) => a - b);
const scale = spec.pixelScale ?? (ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1);
const snap = (v) => Math.round(v / 10) * 10;
let minX = Infinity;
let minY = Infinity;
for (const t of tables) {
  if (Array.isArray(t.at)) {
    t.x = t.at[0] / scale;
    t.y = t.at[1] / scale;
  } else {
    // No position given: simple grid, 4 per row.
    t.x = (t.i % 4) * 320;
    t.y = Math.floor(t.i / 4) * 280;
    if (spec.tables.some((s) => Array.isArray(s.at)))
      warnings.push(`${t.name}: no "at" position; placed on a grid.`);
  }
  minX = Math.min(minX, t.x);
  minY = Math.min(minY, t.y);
}
for (const t of tables) {
  t.x = snap(t.x - minX + 40);
  t.y = snap(t.y - minY + 40);
}

// ---- relationships ------------------------------------------------------
/**
 * Mermaid-style crow's foot, parent end first: "||--o{".
 *   ||  exactly one      |o / o|  zero or one
 *   |{ / }|  one or many   o{ / }o  zero or many
 */
function parseEnds(n) {
  const m = /^([|o}{]{2})-{1,2}([|o}{]{2})$/.exec(
    String(n)
      .replace(/\s|\.\./g, "")
      .replace(/</g, "{")
      .replace(/>/g, "}"),
  );
  if (!m) return null;
  const end = (s) => ({ many: /[{}]/.test(s), optional: s.includes("o") });
  return [end(m[1]), end(m[2])];
}

function resolve(ref, what, relName) {
  const [tn, ...rest] = String(ref ?? "").split(".");
  const cn = rest.join(".");
  const t = byName.get(tn.toLowerCase());
  if (!t) {
    errors.push(`${relName}: ${what} table "${tn}" not found`);
    return null;
  }
  if (!cn) return { t, c: null };
  const ci = t.columns.findIndex((c) => c.name.toLowerCase() === cn.toLowerCase());
  if (ci < 0) {
    errors.push(`${relName}: column "${ref}" not found`);
    return { t, c: null };
  }
  return { t, c: ci };
}

const colId = (t, ci) => `${t.id}.${slug(t.columns[ci].name)}`;
const rels = [];
const relIds = new Set();
for (const [i, sr] of (spec.relationships ?? []).entries()) {
  const relName = `Relationship ${i + 1} (${sr.from} → ${sr.to})`;
  const a = resolve(sr.from, "parent", relName);
  const b = resolve(sr.to, "child", relName);
  if (!a || !b) continue;
  let type = sr.type;
  let fromOptional = sr.fromOptional;
  let toOptional = sr.toOptional;
  if (sr.ends) {
    const ends = parseEnds(sr.ends);
    if (!ends) errors.push(`${relName}: can't read ends "${sr.ends}" (use e.g. "||--o{")`);
    else {
      const [p, c] = ends;
      type ??= p.many && c.many ? "N:M" : c.many ? "1:N" : p.many ? "1:N" : "1:1";
      if (p.many && !c.many)
        warnings.push(
          `${relName}: the many end is on the parent side; swap from/to so the child holds the foreign key.`,
        );
      fromOptional ??= p.optional;
      toOptional ??= c.optional;
    }
  }
  type ??= "1:N";
  if (!["1:1", "1:N", "N:M"].includes(type))
    errors.push(`${relName}: type must be 1:1, 1:N or N:M`);
  let id = sr.id ?? `${a.t.id}__${b.t.id}`;
  while (relIds.has(id)) id += "_2";
  relIds.add(id);
  if (a.c != null && !a.t.columns[a.c].pk && !a.t.columns[a.c].unique) {
    warnings.push(`${relName}: ${sr.from} isn't a primary key or unique column.`);
  }
  if (b.c != null) b.t.columns[b.c].isFk = true;
  rels.push({
    id,
    from: a.t.id,
    fromCol: a.c == null ? "" : colId(a.t, a.c),
    to: b.t.id,
    toCol: b.c == null || type === "N:M" ? "" : colId(b.t, b.c),
    type,
    label: String(sr.label ?? ""),
    fromOptional: fromOptional ?? (b.c != null ? b.t.columns[b.c].nullable : false),
    toOptional: toOptional ?? true,
    onDelete: ACTIONS.includes(sr.onDelete) ? sr.onDelete : "NO ACTION",
    onUpdate: ACTIONS.includes(sr.onUpdate) ? sr.onUpdate : "NO ACTION",
  });
}

for (const t of tables) {
  for (const c of t.columns) {
    if (c.fkHint && !c.isFk)
      warnings.push(`${t.name}.${c.name} is marked FK but no relationship points at it.`);
  }
}

// ---- output -------------------------------------------------------------
const diagram = {
  version: 2,
  name: String(spec.name ?? "Untitled diagram"),
  tables: tables.map((t) => ({
    id: t.id,
    name: t.name,
    x: t.x,
    y: t.y,
    color: t.color,
    note: t.note,
    columns: t.columns.map((c, ci) => ({
      id: colId(t, ci),
      name: c.name,
      type: c.type,
      pk: c.pk,
      unique: c.unique,
      nullable: c.pk ? false : c.nullable,
      multi: c.multi,
      determinedBy: c.determinedByNames
        .map((n) => t.columns.findIndex((o) => o.name.toLowerCase() === n.toLowerCase()))
        .filter((j) => j >= 0 && j !== ci)
        .map((j) => colId(t, j)),
      defaultValue: c.defaultValue,
      note: c.note,
    })),
  })),
  rels,
  view: null,
  updatedAt: 0,
};

// Overlap check with estimated sizes (the verify script shows the real layout).
const boxes = tables.map((t) => ({ t, ...estimateSize(t) }));
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i];
    const B = boxes[j];
    if (A.t.x < B.t.x + B.w && B.t.x < A.t.x + A.w && A.t.y < B.t.y + B.h && B.t.y < A.t.y + A.h) {
      warnings.push(
        `${A.t.name} and ${B.t.name} probably overlap; move one or check the scale (${scale.toFixed(2)} picture px per canvas px).`,
      );
    }
  }
}

for (const w of warnings) console.warn("warning:", w);
if (errors.length) {
  for (const e of errors) console.error("error:", e);
  process.exit(1);
}
writeFileSync(outPath, JSON.stringify(diagram, null, 2) + "\n");
console.log(
  `Wrote ${outPath}: ${diagram.tables.length} tables, ${diagram.rels.length} relationships (scale ${scale.toFixed(2)}).`,
);
