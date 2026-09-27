import type { NamingConvention, NormalForm } from "@/lib/settings/types";

export type Severity = "error" | "warning" | "info";

export type RuleCategory = "1NF" | "2NF" | "3NF" | "BCNF" | "Keys" | "Design" | "Naming";

export interface Issue {
  /** Stable within one analysis run (e.g. `3NF:tableId:colId`), usable as a React key. */
  id: string;
  rule: RuleCategory;
  /**
   * error   — a definite violation of the target normal form, or a broken design
   *           (e.g. a table with no primary key, a foreign key pointing nowhere).
   * warning — a likely problem inferred from names ("Possible").
   * info    — advice that doesn't block the target (naming style, notes).
   */
  severity: Severity;
  /** false for heuristics guessed from column names. */
  certain: boolean;
  tableId: string | null;
  relId: string | null;
  /** Columns to highlight on the canvas and in the editor. */
  columnIds: string[];
  message: string;
  fix: string;
}

export interface AnalysisOptions {
  target: NormalForm;
  heuristics: boolean;
  designChecks: boolean;
  naming: NamingConvention;
}

export interface AnalysisResult {
  /** Only issues relevant to the options (NF rules above the target are left out). */
  issues: Issue[];
  /**
   * The highest normal form every table satisfies according to the *certain*
   * checks, regardless of target. `none` if something fails 1NF.
   */
  highestForm: NormalForm;
  /** True when highestForm is at or above the target (always true for target `none`). */
  meetsTarget: boolean;
  /** Issue counts by table id, for the badge on each table header. */
  byTable: Record<string, number>;
  /** Every column id mentioned by an issue. */
  flaggedColumns: Set<string>;
}
