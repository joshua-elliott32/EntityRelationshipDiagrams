/** User preferences. Persisted to localStorage by src/store/settings.ts. */

export type ThemePref = "system" | "light" | "dark";

/** How far the normalisation checker should push. `none` turns NF checks off. */
export type NormalForm = "none" | "1NF" | "2NF" | "3NF" | "BCNF";
export const NORMAL_FORMS: NormalForm[] = ["none", "1NF", "2NF", "3NF", "BCNF"];

/** Relationship end markers: crow's foot (IE) or plain 1 / N / M text. */
export type Notation = "crowsfoot" | "numeric";

export type LineStyle = "orthogonal" | "curved" | "straight";

export type SqlDialect = "postgres" | "mysql" | "sqlite" | "sqlserver";

export type NamingConvention = "off" | "snake_case" | "camelCase" | "PascalCase";

export interface Settings {
  theme: ThemePref;

  // Checks
  targetNormalForm: NormalForm;
  /** Include "Possible" issues guessed from column names (e.g. phone_1, phone_2). */
  showHeuristics: boolean;
  /** Key and foreign-key design checks (missing FK column, type mismatch, …). */
  designChecks: boolean;
  namingConvention: NamingConvention;
  /** Paint flagged columns yellow on the canvas. */
  highlightIssues: boolean;

  // Canvas
  notation: Notation;
  lineStyle: LineStyle;
  showDataTypes: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;

  // Editing
  /** When linking tables, add a `<parent>_id` column to the child if no FK column is found. */
  autoCreateFkColumn: boolean;

  // Export
  sqlDialect: SqlDialect;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  targetNormalForm: "3NF",
  showHeuristics: true,
  designChecks: true,
  namingConvention: "off",
  highlightIssues: true,
  notation: "crowsfoot",
  lineStyle: "orthogonal",
  showDataTypes: true,
  showGrid: true,
  snapToGrid: true,
  gridSize: 10,
  autoCreateFkColumn: true,
  sqlDialect: "postgres",
};
