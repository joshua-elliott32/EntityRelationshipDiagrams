import type { SqlDialect } from "@/lib/settings/types";

export const SQL_DIALECT_LABELS: Record<SqlDialect, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
  sqlserver: "SQL Server",
};

/**
 * Words that need quoting as identifiers in at least one of the dialects.
 * Quoting a word that one dialect would have accepted is harmless, so this is
 * the union rather than four separate lists.
 */
export const RESERVED_WORDS: ReadonlySet<string> = new Set(
  `add all alter analyse analyze and any array as asc asymmetric authorization backup begin between
  bigint binary bit blob both break browse bulk by call cascade case cast change char character
  check checkpoint close clustered coalesce collate column commit condition constraint contains
  continue convert create cross current current_date current_role current_time current_timestamp
  current_user cursor database databases date datetime day dbcc deallocate dec decimal declare
  default deferrable delete deny desc describe distinct distributed div do double drop dual dump
  each else elseif enclosed end errlvl escape escaped except exec execute exists exit explain false
  fetch file fillfactor float for force foreign freetext from full fulltext function goto grant
  group having high_priority holdlock identity identity_insert identitycol if ignore in index
  infile initially inner inout insert int integer intersect interval into is iterate join key
  keys kill lateral leading leave left like limit lineno linear lines load localtime
  localtimestamp lock long loop match merge mod modifies natural nocheck nonclustered not null
  nullif numeric of off offset offsets on only open option optionally or order out outer outfile
  over partition percent pivot placing plan precision primary print proc procedure public range
  raiserror rank read reads real reconfigure recursive references regexp release rename repeat
  replace replication require restore restrict return returning revert revoke right rlike
  rollback row rows rowcount rule save schema schemas select session_user set setuser show
  shutdown similar smallint some spatial sql statistics symmetric system_user table tablesample
  terminated textsize then to top trailing tran transaction trigger true truncate union unique
  unlock unpivot unsigned update updatetext usage use user using values varchar variadic varying
  view waitfor when where while window with within writetext xor year_month zerofill`
    .split(/\s+/)
    .filter(Boolean),
);

const PLAIN_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Quote an identifier only when the dialect needs it. */
export function quoteIdent(name: string, dialect: SqlDialect): string {
  const needs =
    !PLAIN_IDENT.test(name) ||
    RESERVED_WORDS.has(name.toLowerCase()) ||
    (dialect === "postgres" && name !== name.toLowerCase());
  if (!needs) return name;
  switch (dialect) {
    case "mysql":
      return "`" + name.replace(/`/g, "``") + "`";
    case "sqlserver":
      return "[" + name.replace(/]/g, "]]") + "]";
    default:
      return '"' + name.replace(/"/g, '""') + '"';
  }
}

/** A string literal. MySQL also treats backslash as an escape character. */
export function quoteString(s: string, dialect: SqlDialect): string {
  let v = s.replace(/'/g, "''");
  if (dialect === "mysql") v = v.replace(/\\/g, "\\\\");
  return "'" + v + "'";
}

export interface MappedType {
  type: string;
  /** SQLite: emit `INTEGER PRIMARY KEY AUTOINCREMENT` inline when this is the only PK column. */
  autoIncrement?: boolean;
  /** Something the reader should look at, emitted as a trailing `--` comment. */
  comment?: string;
}

const SERIALS: Record<string, string> = {
  SERIAL: "INT",
  SERIAL4: "INT",
  BIGSERIAL: "BIGINT",
  SERIAL8: "BIGINT",
  SMALLSERIAL: "SMALLINT",
  SERIAL2: "SMALLINT",
};

/** Per-dialect replacements for a type name (the part before any `(…)`). */
const RENAMES: Record<SqlDialect, Record<string, string>> = {
  postgres: {
    DATETIME: "TIMESTAMP",
    DATETIME2: "TIMESTAMP",
    SMALLDATETIME: "TIMESTAMP",
    DATETIMEOFFSET: "TIMESTAMPTZ",
    TINYINT: "SMALLINT",
    MEDIUMINT: "INTEGER",
    DOUBLE: "DOUBLE PRECISION",
    BLOB: "BYTEA",
    TINYBLOB: "BYTEA",
    MEDIUMBLOB: "BYTEA",
    LONGBLOB: "BYTEA",
    VARBINARY: "BYTEA",
    IMAGE: "BYTEA",
    NVARCHAR: "VARCHAR",
    NCHAR: "CHAR",
    NTEXT: "TEXT",
    TINYTEXT: "TEXT",
    MEDIUMTEXT: "TEXT",
    LONGTEXT: "TEXT",
    CLOB: "TEXT",
    UNIQUEIDENTIFIER: "UUID",
  },
  mysql: {
    UUID: "CHAR(36)",
    UNIQUEIDENTIFIER: "CHAR(36)",
    BYTEA: "BLOB",
    TIMESTAMPTZ: "TIMESTAMP",
    "TIMESTAMP WITH TIME ZONE": "TIMESTAMP",
    "TIMESTAMP WITHOUT TIME ZONE": "TIMESTAMP",
    DATETIME2: "DATETIME",
    DATETIMEOFFSET: "TIMESTAMP",
    JSONB: "JSON",
    NTEXT: "LONGTEXT",
    CLOB: "LONGTEXT",
    MONEY: "DECIMAL(19,4)",
    "CHARACTER VARYING": "VARCHAR",
  },
  sqlite: {
    UUID: "TEXT",
    UNIQUEIDENTIFIER: "TEXT",
    JSON: "TEXT",
    JSONB: "TEXT",
    BYTEA: "BLOB",
    TIMESTAMPTZ: "TIMESTAMP",
    "TIMESTAMP WITH TIME ZONE": "TIMESTAMP",
  },
  sqlserver: {
    BOOLEAN: "BIT",
    BOOL: "BIT",
    UUID: "UNIQUEIDENTIFIER",
    TEXT: "NVARCHAR(MAX)",
    TINYTEXT: "NVARCHAR(MAX)",
    MEDIUMTEXT: "NVARCHAR(MAX)",
    LONGTEXT: "NVARCHAR(MAX)",
    CLOB: "NVARCHAR(MAX)",
    JSON: "NVARCHAR(MAX)",
    JSONB: "NVARCHAR(MAX)",
    // SQL Server's TIMESTAMP is a row version, not a date.
    TIMESTAMP: "DATETIME2",
    "TIMESTAMP WITHOUT TIME ZONE": "DATETIME2",
    TIMESTAMPTZ: "DATETIMEOFFSET",
    "TIMESTAMP WITH TIME ZONE": "DATETIMEOFFSET",
    BLOB: "VARBINARY(MAX)",
    LONGBLOB: "VARBINARY(MAX)",
    MEDIUMBLOB: "VARBINARY(MAX)",
    BYTEA: "VARBINARY(MAX)",
    DOUBLE: "FLOAT",
    "DOUBLE PRECISION": "FLOAT",
    "CHARACTER VARYING": "VARCHAR",
  },
};

/** What a list-valued (`X[]`) column becomes where arrays don't exist. */
const ARRAY_FALLBACK: Record<SqlDialect, string> = {
  postgres: "",
  mysql: "JSON",
  sqlite: "TEXT",
  sqlserver: "NVARCHAR(MAX)",
};

/** Map a free-text column type to something the dialect accepts. */
export function mapType(raw: string, dialect: SqlDialect): MappedType {
  const src = raw.trim();
  if (!src) return { type: "VARCHAR(255)", comment: "TODO: choose a data type" };

  const arrayMatch = /(\s*\[\s*\d*\s*\])+$/.exec(src);
  if (arrayMatch && dialect !== "postgres") {
    return { type: ARRAY_FALLBACK[dialect], comment: `was ${src}` };
  }
  const body = arrayMatch ? src.slice(0, arrayMatch.index) : src;
  const suffix = arrayMatch ? arrayMatch[0].replace(/\s+/g, "") : "";

  const m = /^([^(]*)(\([^)]*\))?\s*(.*)$/.exec(body)!;
  let name = m[1].trim().toUpperCase().replace(/\s+/g, " ");
  const params = (m[2] ?? "").replace(/\s+/g, "");
  let rest = m[3].trim().toUpperCase().replace(/\s+/g, " ");

  if (dialect !== "mysql") {
    const strip = (s: string) =>
      s
        .replace(/\b(UNSIGNED|SIGNED|ZEROFILL)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    name = strip(name);
    rest = strip(rest);
  }

  const serial = SERIALS[name];
  if (serial && !params && !rest) {
    switch (dialect) {
      case "postgres":
        return { type: name + suffix };
      case "mysql":
        return { type: `${serial} AUTO_INCREMENT` };
      case "sqlite":
        return { type: "INTEGER", autoIncrement: true };
      case "sqlserver":
        return { type: `${serial} IDENTITY(1,1)` };
    }
  }

  // NVARCHAR(MAX) and friends where MAX isn't a thing.
  if (/^\(max\)$/i.test(params) && dialect !== "sqlserver") {
    const bin = /BINARY/.test(name);
    if (dialect === "postgres") return { type: bin ? "BYTEA" : "TEXT" };
    if (dialect === "mysql") return { type: bin ? "LONGBLOB" : "LONGTEXT" };
    return { type: bin ? "BLOB" : "TEXT" };
  }

  const renames = RENAMES[dialect];
  const full = rest ? `${name} ${rest}` : name;
  let renamed: string | undefined;
  let tail = "";
  if (renames[full] !== undefined) {
    renamed = renames[full];
  } else if (renames[name] !== undefined) {
    renamed = renames[name];
    tail = rest ? " " + rest : "";
  }
  if (renamed === undefined) {
    // Unchanged: keep the user's spelling, including dialect-specific suffixes.
    const kept =
      dialect === "mysql" ? body : body.replace(/\s*\b(UNSIGNED|SIGNED|ZEROFILL)\b/gi, "");
    return { type: kept.trim() + suffix };
  }
  const keepsParams = PARAM_TYPES.has(renamed);
  return { type: renamed + (keepsParams ? params : "") + tail + suffix };
}

/** Renamed types that still take the original `(n)` / `(p,s)` parameters. */
const PARAM_TYPES = new Set([
  "VARCHAR",
  "CHAR",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "DATETIME",
  "DATETIME2",
  "DATETIMEOFFSET",
]);

/** Referential action keyword, or null when the dialect can't express it. */
export function actionFor(
  action: string,
  dialect: SqlDialect,
): { sql: string | null; comment?: string } {
  if (action === "NO ACTION") return { sql: null };
  if (action === "RESTRICT" && dialect === "sqlserver") {
    return { sql: null, comment: "SQL Server has no RESTRICT; NO ACTION behaves the same" };
  }
  return { sql: action };
}
