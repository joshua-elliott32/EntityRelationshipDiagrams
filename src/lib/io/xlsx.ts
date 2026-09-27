import type { AnalysisResult } from "@/lib/analysis/types";
import {
  findColumn,
  findTable,
  isForeignKey,
  primaryKeyColumns,
  relSentence,
  relShort,
  type Cardinality,
  type Diagram,
  type Relationship,
} from "@/lib/model";

export type CellValue = string | number;

export interface SheetRows {
  name: string;
  /** First row is the header. */
  rows: CellValue[][];
  /** Column widths in characters. */
  widths: number[];
}

const CARDINALITY: Record<Cardinality, string> = {
  "1:1": "One to one",
  "1:N": "One to many",
  "N:M": "Many to many",
};

const FORM_LABEL: Record<AnalysisResult["highestForm"], string> = {
  none: "None (fails 1NF)",
  "1NF": "1NF",
  "2NF": "2NF",
  "3NF": "3NF",
  BCNF: "BCNF",
};

const SEVERITY = { error: "Error", warning: "Warning", info: "Info" } as const;

const yes = (b: boolean) => (b ? "Yes" : "");
const uniq = (a: string[] | undefined) => (a ? [...new Set(a)].join(", ") : "");

function widths(rows: CellValue[][]): number[] {
  const n = Math.max(...rows.map((r) => r.length));
  const w: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = 8;
    for (const r of rows) {
      const cell = r[i] == null ? "" : String(r[i]);
      for (const line of cell.split("\n")) m = Math.max(m, line.length);
    }
    w.push(Math.min(60, m + 2));
  }
  return w;
}

function optionality(r: Relationship): string {
  const parent = r.fromOptional ? "Parent optional" : "Parent required";
  const child =
    r.type === "1:1"
      ? r.toOptional
        ? "child optional"
        : "child required"
      : r.toOptional
        ? "children optional"
        : "at least one child";
  return `${parent}, ${child}`;
}

/** The workbook's content, as plain rows. Pure, so it can be tested without a zip library. */
export function buildWorkbookRows(
  d: Diagram,
  analysis: AnalysisResult,
  exportedAt: Date = new Date(),
): SheetRows[] {
  const issues = analysis.issues;
  const tableRules: Record<string, string[]> = {};
  const columnRules: Record<string, string[]> = {};
  for (const i of issues) {
    if (i.tableId) (tableRules[i.tableId] ??= []).push(i.rule);
    for (const c of i.columnIds) (columnRules[c] ??= []).push(i.rule);
  }

  const status = !issues.length
    ? "Passes all checks"
    : analysis.meetsTarget
      ? "Meets the target normal form — see the Normalisation issues sheet for advice"
      : "Doesn’t meet the target normal form — see the Normalisation issues sheet";

  const summary: CellValue[][] = [
    ["Item", "Value"],
    ["Diagram", d.name],
    ["Exported", exportedAt.toLocaleString("en-GB")],
    ["Tables", d.tables.length],
    ["Relationships", d.rels.length],
    ["Normalisation issues", issues.length],
    ["Highest normal form met", FORM_LABEL[analysis.highestForm]],
    ["Status", status],
  ];

  const tables: CellValue[][] = [
    ["Table", "Columns", "Primary key", "Foreign keys", "Issues", "Note"],
  ];
  for (const t of d.tables) {
    tables.push([
      t.name,
      t.columns.length,
      primaryKeyColumns(t)
        .map((c) => c.name)
        .join(" + "),
      t.columns
        .filter((c) => isForeignKey(d, t.id, c.id))
        .map((c) => c.name)
        .join(", "),
      uniq(tableRules[t.id]),
      t.note,
    ]);
  }

  const columns: CellValue[][] = [
    [
      "Table",
      "#",
      "Column",
      "Data type",
      "Primary key",
      "Foreign key",
      "References",
      "Unique",
      "Can be empty",
      "Holds a list",
      "Determined by",
      "Default",
      "Note",
      "Issues",
    ],
  ];
  for (const t of d.tables) {
    t.columns.forEach((c, i) => {
      const ref = d.rels.find((r) => r.to === t.id && r.toCol === c.id && r.type !== "N:M");
      let refText = "";
      if (ref) {
        const parent = findTable(d, ref.from);
        const pc = findColumn(parent, ref.fromCol);
        refText = `${parent?.name ?? "?"}.${pc?.name ?? "?"}`;
      }
      const determinedBy = c.pk
        ? ""
        : c.determinedBy.length
          ? c.determinedBy.map((id) => findColumn(t, id)?.name ?? "?").join(", ")
          : "Primary key";
      columns.push([
        t.name,
        i + 1,
        c.name,
        c.type,
        yes(c.pk),
        yes(!!ref),
        refText,
        yes(c.unique),
        yes(c.nullable),
        yes(c.multi),
        determinedBy,
        c.defaultValue,
        c.note,
        uniq(columnRules[c.id]),
      ]);
    });
  }

  const rels: CellValue[][] = [
    [
      "From table",
      "From column",
      "Cardinality",
      "To table",
      "To column (foreign key)",
      "Optionality",
      "On delete",
      "On update",
      "Label",
      "Reads as",
    ],
  ];
  for (const r of d.rels) {
    const a = findTable(d, r.from);
    const b = findTable(d, r.to);
    const nm = r.type === "N:M";
    rels.push([
      a?.name ?? "",
      findColumn(a, r.fromCol)?.name ?? "",
      CARDINALITY[r.type],
      b?.name ?? "",
      findColumn(b, r.toCol)?.name ?? "",
      optionality(r),
      nm ? "" : r.onDelete,
      nm ? "" : r.onUpdate,
      r.label,
      relSentence(d, r),
    ]);
  }

  const problems: CellValue[][] = [
    ["Rule", "Severity", "Certainty", "Table", "Column(s)", "Problem", "Suggested fix"],
  ];
  for (const i of issues) {
    const t = i.tableId ? findTable(d, i.tableId) : undefined;
    const rel = i.relId ? d.rels.find((r) => r.id === i.relId) : undefined;
    problems.push([
      i.rule,
      SEVERITY[i.severity],
      i.certain ? "Definite" : "Possible",
      t ? t.name : rel ? relShort(d, rel) : "",
      t
        ? i.columnIds
            .map((id) => findColumn(t, id)?.name)
            .filter(Boolean)
            .join(", ")
        : "",
      i.message,
      i.fix,
    ]);
  }
  if (problems.length === 1) problems.push(["", "", "", "", "", "No problems found", ""]);

  return [
    { name: "Summary", rows: summary },
    { name: "Tables", rows: tables },
    { name: "Columns", rows: columns },
    { name: "Relationships", rows: rels },
    { name: "Normalisation issues", rows: problems },
  ].map((s) => ({ ...s, widths: widths(s.rows) }));
}

/** Excel workbook: Summary, Tables, Columns, Relationships, Normalisation issues. */
export async function toXlsx(d: Diagram, analysis: AnalysisResult): Promise<Blob> {
  // Loaded on demand so the zip code stays out of the main bundle.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const sheets = buildWorkbookRows(d, analysis).map((s) => ({
    sheet: s.name,
    columns: s.widths.map((width) => ({ width })),
    stickyRowsCount: 1,
    data: s.rows.map((row, r) =>
      row.map((value) =>
        r === 0
          ? { value, fontWeight: "bold" as const }
          : { value, ...(typeof value === "string" && value.includes("\n") ? { wrap: true } : {}) },
      ),
    ),
  }));
  return writeXlsxFile(sheets).toBlob();
}
