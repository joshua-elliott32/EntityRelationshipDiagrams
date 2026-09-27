import { z } from "zod";
import { uid } from "./ids";
import { MAX_ZOOM, MIN_ZOOM, REFERENTIAL_ACTIONS, type Diagram } from "./types";

/**
 * Parsing for anything that arrives from outside the app: imported files,
 * localStorage drafts and share links. It is deliberately forgiving — missing
 * fields get defaults and v1 files from the original single-page demo are
 * migrated — but it never lets a malformed value into the store.
 */

export class DiagramParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagramParseError";
  }
}

const str = (fallback = "") =>
  z
    .unknown()
    .optional()
    .transform((v) => (v == null ? fallback : String(v)));
const bool = z
  .unknown()
  .optional()
  .transform((v) => !!v);
const num = z
  .unknown()
  .optional()
  .transform((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
const id = z
  .unknown()
  .optional()
  .transform((v) => (v == null || v === "" ? uid() : String(v)));
const action = z
  .unknown()
  .optional()
  .transform((v) =>
    REFERENTIAL_ACTIONS.includes(v as never)
      ? (v as (typeof REFERENTIAL_ACTIONS)[number])
      : "NO ACTION",
  );

const columnSchema = z
  .object({
    id,
    name: str(),
    type: str(),
    pk: bool,
    unique: bool,
    nullable: bool,
    multi: bool,
    determinedBy: z.unknown().optional(),
    /** v1 files stored a single determinant id. */
    dep: z.unknown().optional(),
    defaultValue: str(),
    note: str(),
  })
  .transform(({ dep, determinedBy, ...c }) => {
    let det: string[] = [];
    if (Array.isArray(determinedBy)) det = determinedBy.filter(Boolean).map(String);
    else if (dep) det = [String(dep)];
    return { ...c, determinedBy: c.pk && !Array.isArray(determinedBy) ? [] : det };
  });

const tableSchema = z.object({
  id,
  name: str("table"),
  x: num,
  y: num,
  color: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" && v ? v : null)),
  note: str(),
  columns: z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v : []))
    .pipe(z.array(columnSchema)),
});

const relSchema = z
  .object({
    id,
    from: str(),
    fromCol: str(),
    to: str(),
    toCol: str(),
    type: z
      .unknown()
      .optional()
      .transform((v) => (v === "1:1" || v === "N:M" ? v : "1:N") as "1:1" | "1:N" | "N:M"),
    label: str(),
    fromOptional: z.unknown().optional(),
    toOptional: z.unknown().optional(),
    onDelete: action,
    onUpdate: action,
  })
  .transform((r) => ({
    ...r,
    fromOptional: r.fromOptional === undefined ? false : !!r.fromOptional,
    toOptional: r.toOptional === undefined ? true : !!r.toOptional,
  }));

const viewSchema = z
  .unknown()
  .optional()
  .transform((v) => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const k = Number(o.k);
    if (!Number.isFinite(k)) return null;
    return {
      x: Number(o.x) || 0,
      y: Number(o.y) || 0,
      k: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k)),
    };
  });

const diagramSchema = z.object({
  name: str("Untitled diagram"),
  tables: z.array(tableSchema),
  rels: z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v : []))
    .pipe(z.array(relSchema)),
  view: viewSchema,
  updatedAt: z
    .unknown()
    .optional()
    .transform((v) => Number(v) || 0),
  /** v1 name for updatedAt. */
  savedAt: z.unknown().optional(),
});

/** Validate and normalise an unknown value into a Diagram. Throws DiagramParseError. */
export function normalizeDiagram(input: unknown): Diagram {
  if (
    !input ||
    typeof input !== "object" ||
    !Array.isArray((input as { tables?: unknown }).tables)
  ) {
    throw new DiagramParseError(
      "This file has no “tables” list, so it isn’t a diagram from this tool.",
    );
  }
  const parsed = diagramSchema.safeParse(input);
  if (!parsed.success) {
    throw new DiagramParseError("This diagram file is damaged: " + parsed.error.issues[0]?.message);
  }
  const { savedAt, ...p } = parsed.data;

  // Drop duplicate ids and dangling references so the rest of the app can
  // trust the data.
  const tableIds = new Set<string>();
  const tables = p.tables.filter((t) => !tableIds.has(t.id) && tableIds.add(t.id));
  for (const t of tables) {
    const colIds = new Set<string>();
    t.columns = t.columns.filter((c) => !colIds.has(c.id) && colIds.add(c.id));
    for (const c of t.columns) {
      c.determinedBy = c.determinedBy.filter((x) => x !== c.id && colIds.has(x));
    }
  }
  const colsOf = new Map(tables.map((t) => [t.id, new Set(t.columns.map((c) => c.id))]));
  const relIds = new Set<string>();
  const rels = p.rels
    .filter(
      (r) => tableIds.has(r.from) && tableIds.has(r.to) && !relIds.has(r.id) && relIds.add(r.id),
    )
    .map((r) => ({
      ...r,
      fromCol: colsOf.get(r.from)!.has(r.fromCol) ? r.fromCol : "",
      toCol: colsOf.get(r.to)!.has(r.toCol) ? r.toCol : "",
    }));

  return {
    version: 2,
    name: p.name,
    tables,
    rels,
    view: p.view,
    updatedAt: p.updatedAt || Number(savedAt) || 0,
  };
}

/** Parse JSON text into a Diagram with friendly error messages. */
export function parseDiagramJson(text: string): Diagram {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DiagramParseError(
      "That isn’t valid JSON. Paste the whole file, including the first { and last }.",
    );
  }
  return normalizeDiagram(data);
}
