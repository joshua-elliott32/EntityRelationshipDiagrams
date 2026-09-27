import type { Diagram } from "@/lib/model";
import type { AnalysisResult } from "@/lib/analysis";
import type { SqlDialect } from "@/lib/settings/types";

/**
 * Import and export of diagram data. Everything runs in the browser.
 * OWNER: io subagent. Replace these stubs (split into json.ts, sql.ts,
 * sqlImport.ts, mermaid.ts, xlsx.ts, share.ts, download.ts as you see fit,
 * but keep these exports).
 */

export { parseDiagramJson, DiagramParseError } from "@/lib/model";

/** Pretty JSON for the .json diagram file. */
export function toJson(d: Diagram): string {
  return JSON.stringify(d, null, 2);
}

/** CREATE TABLE script, dependency ordered, with PK/UNIQUE/NOT NULL/FK constraints. */
export function toSql(d: Diagram, dialect: SqlDialect): string {
  void d;
  void dialect;
  return "";
}

export interface SqlImportResult {
  diagram: Diagram;
  /** Statements or clauses that were skipped, in plain English. */
  warnings: string[];
}

/** Parse CREATE TABLE statements (and ALTER TABLE … ADD FOREIGN KEY) into a diagram. */
export function fromSql(text: string): SqlImportResult {
  void text;
  throw new Error("Not implemented");
}

/** Mermaid `erDiagram` source. */
export function toMermaid(d: Diagram): string {
  void d;
  return "";
}

/** DBML (dbdiagram.io) source. */
export function toDbml(d: Diagram): string {
  void d;
  return "";
}

/** Excel workbook: Summary, Tables, Columns, Relationships, Normalisation issues. */
export async function toXlsx(d: Diagram, analysis: AnalysisResult): Promise<Blob> {
  void d;
  void analysis;
  throw new Error("Not implemented");
}

/** A URL fragment (`#d=…`) that encodes the whole diagram, compressed. */
export function toShareHash(d: Diagram): string {
  void d;
  return "";
}

/** Decode a `#d=…` fragment; null if absent or invalid. */
export function fromShareHash(hash: string): Diagram | null {
  void hash;
  return null;
}

/** `Shop example` → `shop-example`. */
export function slugify(name: string): string {
  return (
    (name || "diagram")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "diagram"
  );
}

/** Trigger a browser download. */
export function downloadFile(
  filename: string,
  data: Blob | string,
  mime = "application/octet-stream",
): void {
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
