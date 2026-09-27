import type { Diagram } from "@/lib/model";

/**
 * Import and export of diagram data. Everything runs in the browser.
 *
 * - sql/     CREATE TABLE export per dialect, and a tolerant SQL importer
 * - mermaid  Mermaid `erDiagram`
 * - dbml     dbdiagram.io DBML
 * - xlsx     Excel workbook (write-excel-file, loaded on demand)
 * - share    `#d=…` share links (lz-string)
 * - download slugify + browser download
 */

export { parseDiagramJson, DiagramParseError } from "@/lib/model";

/** Pretty JSON for the .json diagram file. */
export function toJson(d: Diagram): string {
  return JSON.stringify(d, null, 2);
}

export { toSql } from "./sql/export";
export { fromSql, normalizeTypeName, type SqlImportResult } from "./sql/import";
export { SQL_DIALECT_LABELS, mapType, quoteIdent } from "./sql/dialects";
export { toMermaid } from "./mermaid";
export { toDbml } from "./dbml";
export { toXlsx, buildWorkbookRows, type SheetRows, type CellValue } from "./xlsx";
export {
  toShareHash,
  fromShareHash,
  shareUrlLength,
  compactDiagram,
  SHARE_URL_WARN_LENGTH,
} from "./share";
export { slugify, downloadFile } from "./download";
