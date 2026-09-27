/**
 * The diagram data model. Everything here is plain JSON so a diagram can be
 * saved to localStorage, exported as a file and re-imported unchanged.
 *
 * Foreign keys: a column is a foreign key when a relationship points at it —
 * `rel.to === table.id && rel.toCol === column.id`. The relationship is the
 * single source of truth, so the "Foreign key" control on a column and the
 * lines on the canvas can never disagree. See `foreignKeyOf` in ./queries.
 */

export type Cardinality = "1:1" | "1:N" | "N:M";

export type ReferentialAction = "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";

export interface Column {
  id: string;
  name: string;
  /** Free-text SQL type, e.g. `VARCHAR(100)`. */
  type: string;
  pk: boolean;
  unique: boolean;
  nullable: boolean;
  /** "Holds a list" — the column stores several values (breaks 1NF). */
  multi: boolean;
  /**
   * Functional dependency: the ids of the columns whose values decide this
   * column's value. Empty means "the primary key" (the normal case).
   * A single entry models `postcode → city`; several entries model a
   * composite determinant.
   */
  determinedBy: string[];
  /** Optional default value expression, emitted as-is in SQL. */
  defaultValue: string;
  note: string;
}

export interface Table {
  id: string;
  name: string;
  /** Top-left corner in world coordinates. */
  x: number;
  y: number;
  /** Optional header colour token name (see TABLE_COLORS), or null for default. */
  color: string | null;
  note: string;
  columns: Column[];
}

export interface Relationship {
  id: string;
  /** Parent / "one" side — the referenced table. */
  from: string;
  /** Referenced column on the parent (usually its primary key); "" if unset. */
  fromCol: string;
  /** Child / "many" side — the table that holds the foreign key. */
  to: string;
  /** The foreign-key column on the child; "" if unset. */
  toCol: string;
  type: Cardinality;
  label: string;
  /** Minimum cardinality: may a child exist without a parent? */
  fromOptional: boolean;
  /** Minimum cardinality: may a parent exist without any children? */
  toOptional: boolean;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

export interface Viewport {
  /** Screen-space translation of the world origin, in CSS pixels. */
  x: number;
  y: number;
  /** Zoom factor. */
  k: number;
}

export interface Diagram {
  version: 2;
  name: string;
  tables: Table[];
  rels: Relationship[];
  /** Last camera position, or null to "fit to content" on open. */
  view: Viewport | null;
  updatedAt: number;
}

export interface ColumnRef {
  tableId: string;
  columnId: string;
}

export type Selection = { kind: "table"; id: string } | { kind: "rel"; id: string } | null;

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;

/** Header colour choices for tables. Values are CSS custom property names. */
export const TABLE_COLORS = ["slate", "teal", "blue", "violet", "rose", "amber", "green"] as const;
export type TableColor = (typeof TABLE_COLORS)[number];

export const REFERENTIAL_ACTIONS: ReferentialAction[] = [
  "NO ACTION",
  "RESTRICT",
  "CASCADE",
  "SET NULL",
  "SET DEFAULT",
];

/** Suggestions for the data-type field. */
export const COMMON_TYPES = [
  "INT",
  "BIGINT",
  "SMALLINT",
  "SERIAL",
  "DECIMAL(10,2)",
  "NUMERIC",
  "REAL",
  "VARCHAR(50)",
  "VARCHAR(100)",
  "VARCHAR(255)",
  "CHAR(10)",
  "TEXT",
  "BOOLEAN",
  "DATE",
  "TIME",
  "DATETIME",
  "TIMESTAMP",
  "UUID",
  "JSON",
  "BLOB",
];
