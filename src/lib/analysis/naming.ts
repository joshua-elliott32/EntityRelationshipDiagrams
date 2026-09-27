/** Naming-convention and reserved-word checks (advice only). */
import type { NamingConvention } from "@/lib/settings/types";
import type { Table } from "@/lib/model";
import { listAnd, makeIssue, tName } from "./issues";
import type { Issue } from "./types";

export type ActiveConvention = Exclude<NamingConvention, "off">;

const PATTERNS: Record<ActiveConvention, RegExp> = {
  snake_case: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
};

/**
 * Words reserved (not just "non-reserved keywords") in at least one of
 * PostgreSQL, MySQL, SQLite or SQL Server, and plausible as a name.
 */
export const RESERVED_WORDS = new Set([
  "add",
  "all",
  "alter",
  "and",
  "as",
  "asc",
  "between",
  "by",
  "case",
  "check",
  "column",
  "constraint",
  "create",
  "cross",
  "current_date",
  "current_time",
  "current_timestamp",
  "current_user",
  "default",
  "delete",
  "desc",
  "distinct",
  "drop",
  "else",
  "end",
  "exists",
  "fetch",
  "for",
  "foreign",
  "from",
  "grant",
  "group",
  "having",
  "in",
  "index",
  "inner",
  "insert",
  "into",
  "is",
  "join",
  "key",
  "left",
  "like",
  "limit",
  "not",
  "null",
  "offset",
  "on",
  "or",
  "order",
  "outer",
  "primary",
  "range",
  "references",
  "right",
  "rows",
  "select",
  "session_user",
  "set",
  "table",
  "then",
  "to",
  "trigger",
  "union",
  "unique",
  "update",
  "user",
  "using",
  "values",
  "view",
  "when",
  "where",
  "with",
]);

export function matchesConvention(name: string, conv: ActiveConvention): boolean {
  return PATTERNS[conv].test(name);
}

/** Splits `customerID`, `Order Date`, `first-name`, `HTTPStatus2` into lower-case words. */
export function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** `customerID` → `customer_id` / `customerId` / `CustomerId`. */
export function toConvention(name: string, conv: ActiveConvention): string {
  const w = words(name);
  if (w.length === 0) return name;
  if (conv === "snake_case") return w.join("_");
  if (conv === "camelCase") return w[0] + w.slice(1).map(cap).join("");
  return w.map(cap).join("");
}

const MAX_LISTED = 6;

function examples(names: string[], conv: ActiveConvention): string {
  const shown = names.slice(0, MAX_LISTED).map((n) => {
    const s = toConvention(n, conv);
    // Leading digits etc. can't always be fixed mechanically.
    return matchesConvention(s, conv) ? `${n} → ${s}` : n;
  });
  const more = names.length - shown.length;
  return shown.join(", ") + (more > 0 ? ` and ${more} more` : "");
}

export function namingIssues(t: Table, conv: NamingConvention): Issue[] {
  if (conv === "off") return [];
  const out: Issue[] = [];
  const T = tName(t);

  const badTable = t.name.trim() !== "" && !matchesConvention(t.name.trim(), conv);
  const badCols = t.columns.filter(
    (c) => c.name.trim() !== "" && !matchesConvention(c.name.trim(), conv),
  );
  if (badTable || badCols.length > 0) {
    const names = [...(badTable ? [t.name.trim()] : []), ...badCols.map((c) => c.name.trim())];
    const what =
      badTable && badCols.length === 0
        ? `The table name ${T} isn’t ${conv}.`
        : badTable
          ? `${T} and ${badCols.length === 1 ? "one of its columns" : `${badCols.length} of its columns`} aren’t ${conv}: ${listAnd(badCols.map((c) => c.name.trim()))}.`
          : `${badCols.length === 1 ? "A column" : `${badCols.length} columns`} in ${T} ${badCols.length === 1 ? "isn’t" : "aren’t"} ${conv}: ${listAnd(badCols.map((c) => c.name.trim()))}.`;
    out.push(
      makeIssue({
        id: `Naming:style:${t.id}`,
        rule: "Naming",
        severity: "info",
        certain: true,
        tableId: t.id,
        columnIds: badCols.map((c) => c.id),
        message: what,
        fix: `Rename to ${conv}: ${examples(names, conv)}. (You can change or turn off the naming convention in Settings.)`,
      }),
    );
  }

  const reservedTable = RESERVED_WORDS.has(t.name.trim().toLowerCase());
  const reservedCols = t.columns.filter((c) => RESERVED_WORDS.has(c.name.trim().toLowerCase()));
  if (reservedTable || reservedCols.length > 0) {
    const names = [
      ...(reservedTable ? [t.name.trim()] : []),
      ...reservedCols.map((c) => `${T}.${c.name.trim()}`),
    ];
    out.push(
      makeIssue({
        id: `Naming:reserved:${t.id}`,
        rule: "Naming",
        severity: "info",
        certain: true,
        tableId: t.id,
        columnIds: reservedCols.map((c) => c.id),
        message: `${listAnd(names)} ${names.length === 1 ? "is an SQL reserved word" : "are SQL reserved words"}.`,
        fix: "Reserved words need quoting in every query. Pick another name — a plural for a table (users) or a more specific column name (order_date, sort_order).",
      }),
    );
  }
  return out;
}
