import {
  DiagramParseError,
  makeColumn,
  makeRelationship,
  makeTable,
  type Column,
  type Diagram,
  type ReferentialAction,
  type Relationship,
  type Table,
} from "@/lib/model";
import { splitStatements, tokenize, type Token } from "./tokenize";

export interface SqlImportResult {
  diagram: Diagram;
  /** Statements or clauses that were skipped, in plain English. */
  warnings: string[];
}

/* ------------------------------------------------------------------ cursor */

class Cursor {
  i = 0;
  constructor(
    readonly toks: Token[],
    readonly src: string,
  ) {}

  get done(): boolean {
    return this.i >= this.toks.length;
  }
  peek(k = 0): Token | undefined {
    return this.toks[this.i + k];
  }
  next(): Token | undefined {
    return this.toks[this.i++];
  }
  /** Upper-cased unquoted word at offset k, or null. */
  word(k = 0): string | null {
    const t = this.peek(k);
    return t && t.kind === "word" ? t.value.toUpperCase() : null;
  }
  is(...words: string[]): boolean {
    return words.every((w, k) => this.word(k) === w);
  }
  accept(...words: string[]): boolean {
    if (!this.is(...words)) return false;
    this.i += words.length;
    return true;
  }
  /** Accept at most one of several single words. */
  acceptOne(...words: string[]): boolean {
    const w = this.word();
    if (w === null || !words.includes(w)) return false;
    this.i++;
    return true;
  }
  punct(p: string, k = 0): boolean {
    const t = this.peek(k);
    return !!t && t.kind === "punct" && t.value === p;
  }
  acceptPunct(p: string): boolean {
    if (!this.punct(p)) return false;
    this.i++;
    return true;
  }
  /** At "(": consume through the matching ")" and return the tokens inside. */
  group(): Token[] {
    if (!this.punct("(")) return [];
    const start = this.i;
    let depth = 0;
    while (!this.done) {
      const t = this.next()!;
      if (t.kind !== "punct") continue;
      if (t.value === "(") depth++;
      else if (t.value === ")" && --depth === 0) return this.toks.slice(start + 1, this.i - 1);
    }
    return this.toks.slice(start + 1);
  }
  /** One identifier: bare word, "quoted", `quoted` or [quoted]. */
  ident(): string | null {
    const t = this.peek();
    if (!t || (t.kind !== "word" && t.kind !== "qident")) return null;
    this.i++;
    return t.value;
  }
  /** `a.b.c` → ["a", "b", "c"]. */
  qualified(): string[] {
    const first = this.ident();
    if (first === null) return [];
    const parts = [first];
    while (this.punct(".") && isIdentToken(this.peek(1))) {
      this.i++;
      parts.push(this.ident()!);
    }
    return parts;
  }
  rest(): Token[] {
    return this.toks.slice(this.i);
  }
}

function isIdentToken(t: Token | undefined): boolean {
  return !!t && (t.kind === "word" || t.kind === "qident");
}

function rawText(src: string, toks: Token[]): string {
  if (!toks.length) return "";
  return src.slice(toks[0].start, toks[toks.length - 1].end);
}

/** Split a token list at top-level commas. */
function splitCommas(toks: Token[]): Token[][] {
  const out: Token[][] = [];
  let cur: Token[] = [];
  let depth = 0;
  for (const t of toks) {
    if (t.kind === "punct") {
      if (t.value === "(") depth++;
      else if (t.value === ")") depth--;
      else if (t.value === "," && depth === 0) {
        out.push(cur);
        cur = [];
        continue;
      }
    }
    cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out.filter((e) => e.length);
}

/* ------------------------------------------------------------- vocabulary */

/** Words that end a column's type and start its constraints. */
const TYPE_STOP = new Set(
  `CONSTRAINT PRIMARY NOT NULL UNIQUE DEFAULT REFERENCES CHECK COLLATE AUTO_INCREMENT AUTOINCREMENT
  IDENTITY GENERATED COMMENT ON CHARSET AS KEY SPARSE ROWGUIDCOL FILESTREAM MASKED VISIBLE
  INVISIBLE STORAGE COLUMN_FORMAT SRID ENCODE COMPRESSION CLUSTERED NONCLUSTERED INDEX FOREIGN
  ENCRYPTED HIDDEN`.split(/\s+/),
);

/** Words that end a DEFAULT expression. */
const DEFAULT_STOP = new Set(
  `CONSTRAINT PRIMARY NOT NULL UNIQUE REFERENCES CHECK COLLATE AUTO_INCREMENT AUTOINCREMENT
  COMMENT ON GENERATED IDENTITY KEY CHARACTER CHARSET VISIBLE INVISIBLE`.split(/\s+/),
);

const INT_SERIAL: Record<string, string> = {
  INT: "SERIAL",
  INTEGER: "SERIAL",
  INT4: "SERIAL",
  MEDIUMINT: "SERIAL",
  BIGINT: "BIGSERIAL",
  INT8: "BIGSERIAL",
  SMALLINT: "SMALLSERIAL",
  INT2: "SMALLSERIAL",
  TINYINT: "SMALLSERIAL",
};

function parseAction(c: Cursor): ReferentialAction | null {
  if (c.accept("CASCADE")) return "CASCADE";
  if (c.accept("RESTRICT")) return "RESTRICT";
  if (c.accept("NO", "ACTION")) return "NO ACTION";
  if (c.accept("SET", "NULL")) {
    c.group(); // PostgreSQL 15: SET NULL (col, …)
    return "SET NULL";
  }
  if (c.accept("SET", "DEFAULT")) {
    c.group();
    return "SET DEFAULT";
  }
  return null;
}

/** Tidy verbose or dialect-specific spellings into the short forms the editor suggests. */
export function normalizeTypeName(t: string): string {
  let s = t.trim().replace(/\s+/g, " ");
  s = s.replace(/^CHARACTER VARYING\b/, "VARCHAR").replace(/^CHARACTER\b/, "CHAR");
  s = s.replace(/^NATIONAL (VARCHAR|CHAR)/, "N$1");
  s = s.replace(/^(TIMESTAMP|TIME)(\(\d+\))? WITHOUT TIME ZONE$/, "$1$2");
  s = s.replace(/^TIMESTAMP(\(\d+\))? WITH TIME ZONE$/, "TIMESTAMPTZ$1");
  s = s.replace(/^TIME(\(\d+\))? WITH TIME ZONE$/, "TIMETZ$1");
  if (/^TINYINT\(1\)$/.test(s)) return "BOOLEAN";
  s = s.replace(/^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)\(\d+\)/, "$1");
  if (s === "BOOL") return "BOOLEAN";
  return s;
}

/* ------------------------------------------------------------------ parser */

interface PendingFk {
  child: Table;
  cols: string[];
  parent: string;
  parentCols: string[] | null;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

interface Reference {
  parent: string;
  parentCols: string[] | null;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

class SqlImporter {
  tables: Table[] = [];
  byName = new Map<string, Table>();
  fks: PendingFk[] = [];
  warnings: string[] = [];
  skipped = new Map<string, number>();
  createTableCount = 0;

  constructor(readonly src: string) {}

  skip(key: string) {
    this.skipped.set(key, (this.skipped.get(key) ?? 0) + 1);
  }

  table(name: string): Table | undefined {
    return this.byName.get(name.toLowerCase());
  }

  column(t: Table, name: string): Column | undefined {
    const n = name.toLowerCase();
    return t.columns.find((c) => c.name.toLowerCase() === n);
  }

  run(): SqlImportResult {
    const statements = splitStatements(tokenize(stripCopyData(this.src)));
    for (const st of statements) {
      try {
        this.statement(new Cursor(st, this.src));
      } catch {
        const text = rawText(this.src, st.slice(0, 8)).replace(/\s+/g, " ");
        this.warnings.push(`Couldn’t read the statement starting “${text}…”, so it was skipped.`);
      }
    }
    if (!this.createTableCount) {
      throw new DiagramParseError(
        "No CREATE TABLE statements found. Paste a schema script — for example the output of " +
          "pg_dump --schema-only, mysqldump --no-data or SQLite’s .schema.",
      );
    }
    if (!this.tables.length) {
      throw new DiagramParseError(
        `Found ${this.createTableCount} CREATE TABLE statement(s) but couldn’t read any of them.`,
      );
    }
    const rels = this.resolveFks();
    if (this.skipped.size) {
      const parts = [...this.skipped].map(([k, n]) => `${n} ${k} statement${n === 1 ? "" : "s"}`);
      const list =
        parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
      this.warnings.push(`Skipped ${list}.`);
    }
    this.tables.forEach((t, i) => {
      t.x = 40 + (i % 4) * 320;
      t.y = 40 + Math.floor(i / 4) * 260;
    });
    return {
      diagram: {
        version: 2,
        name: "Imported from SQL",
        tables: this.tables,
        rels,
        view: null,
        updatedAt: 0,
      },
      warnings: this.warnings,
    };
  }

  statement(c: Cursor) {
    const first = c.word();
    if (!first) {
      this.skip("unrecognised");
      return;
    }
    if (first === "CREATE") return this.create(c);
    if (first === "ALTER" && c.word(1) === "TABLE") return this.alterTable(c);
    if (first === "COMMENT" && c.word(1) === "ON") return this.commentOn(c);
    // Transaction wrappers and SQLite pragmas carry no structure worth a warning.
    if (["BEGIN", "COMMIT", "END", "START", "PRAGMA"].includes(first)) return;
    if (first === "ALTER" || first === "DROP") {
      this.skip(`${first} ${c.word(1) ?? ""}`.trim());
      return;
    }
    this.skip(first);
  }

  create(c: Cursor) {
    c.next(); // CREATE
    const objects = new Set(
      `TABLE VIEW INDEX SEQUENCE FUNCTION PROCEDURE TRIGGER TYPE SCHEMA DATABASE EXTENSION DOMAIN
      ROLE USER EVENT AGGREGATE OPERATOR POLICY PUBLICATION SUBSCRIPTION RULE COLLATION SYNONYM
      LOGIN SERVER CAST`.split(/\s+/),
    );
    const prefix: string[] = [];
    for (let k = 0; k < 20 && c.peek(k); k++) {
      const w = c.word(k);
      if (w && objects.has(w)) {
        const tableModifiers = new Set([
          "OR",
          "REPLACE",
          "GLOBAL",
          "LOCAL",
          "TEMP",
          "TEMPORARY",
          "UNLOGGED",
        ]);
        if (w === "TABLE" && prefix.every((p) => tableModifiers.has(p))) {
          c.i += k + 1;
          this.createTableCount++;
          return this.createTable(c);
        }
        if (w === "TABLE" && prefix.includes("VIRTUAL")) {
          this.skip("CREATE VIRTUAL TABLE");
          return;
        }
        this.skip(`CREATE ${w === "TABLE" ? prefix.at(-1) + " TABLE" : w}`);
        return;
      }
      prefix.push(w ?? "");
    }
    this.skip(`CREATE ${c.word() ?? ""}`.trim());
  }

  createTable(c: Cursor) {
    c.accept("IF", "NOT", "EXISTS");
    const parts = c.qualified();
    const name = parts.at(-1);
    if (!name) throw new Error("no table name");
    if (!c.punct("(")) {
      const how = c.word() === "AS" ? "CREATE TABLE … AS SELECT" : `CREATE TABLE ${c.word() ?? ""}`;
      this.warnings.push(`Skipped table ${name}: ${how.trim()} has no column list to read.`);
      return;
    }
    if (this.table(name)) {
      this.warnings.push(`Table ${name} is defined twice; kept the first definition.`);
      return;
    }
    const body = c.group();
    const t = makeTable(name, 0, 0);
    const elements = splitCommas(body);
    const constraints: Token[][] = [];
    for (const el of elements) {
      const ec = new Cursor(el, this.src);
      const w = ec.word();
      if (
        w &&
        [
          "CONSTRAINT",
          "PRIMARY",
          "UNIQUE",
          "FOREIGN",
          "KEY",
          "INDEX",
          "FULLTEXT",
          "SPATIAL",
          "CHECK",
          "EXCLUDE",
          "LIKE",
          "PERIOD",
        ].includes(w)
      ) {
        constraints.push(el);
        continue;
      }
      try {
        const col = this.columnDef(ec, t);
        if (!col) continue;
        if (this.column(t, col.name)) {
          this.warnings.push(`Column ${name}.${col.name} is defined twice; kept the first.`);
          continue;
        }
        t.columns.push(col);
      } catch {
        this.warnings.push(`Couldn’t read a column of ${name}: “${rawText(this.src, el)}”.`);
      }
    }
    this.tables.push(t);
    this.byName.set(name.toLowerCase(), t);
    for (const el of constraints) {
      try {
        this.tableConstraint(new Cursor(el, this.src), t);
      } catch {
        this.warnings.push(`Couldn’t read a constraint of ${name}: “${rawText(this.src, el)}”.`);
      }
    }
    // Table options: only MySQL's COMMENT='…' is interesting.
    while (!c.done) {
      if (c.accept("COMMENT")) {
        c.acceptPunct("=");
        const s = c.peek();
        if (s?.kind === "string") t.note = s.value;
      }
      c.next();
    }
    for (const col of t.columns) if (col.pk) col.nullable = false;
  }

  /** A column definition, with inline constraints. Returns null for things that aren't columns. */
  columnDef(c: Cursor, t: Table): Column | null {
    const name = c.ident();
    if (name === null) return null;
    const { type, array } = this.parseType(c);
    const col = makeColumn(name, type, { nullable: true, multi: array });
    let auto = false;
    let explicitNull: boolean | null = null;

    while (!c.done) {
      const w = c.word();
      if (!w) {
        if (c.punct("(")) c.group();
        else c.next();
        continue;
      }
      if (c.accept("CONSTRAINT")) {
        c.ident();
      } else if (c.accept("PRIMARY", "KEY") || (w === "KEY" && c.accept("KEY"))) {
        col.pk = true;
        c.acceptOne("ASC", "DESC");
        c.acceptOne("CLUSTERED", "NONCLUSTERED");
        if (c.accept("AUTOINCREMENT")) auto = true;
        if (c.accept("ON", "CONFLICT")) c.next();
      } else if (c.accept("NOT", "NULL")) {
        explicitNull = false;
      } else if (c.accept("NOT")) {
        // NOT FOR REPLICATION, NOT DEFERRABLE …
      } else if (c.accept("NULL")) {
        explicitNull = true;
      } else if (c.accept("UNIQUE")) {
        col.unique = true;
        c.accept("KEY");
        c.acceptOne("CLUSTERED", "NONCLUSTERED");
      } else if (c.accept("DEFAULT")) {
        const expr = this.defaultExpr(c);
        if (/^nextval\s*\(/i.test(expr)) auto = true;
        else if (!/^null$/i.test(expr)) col.defaultValue = expr;
      } else if (c.accept("AUTO_INCREMENT") || c.accept("AUTOINCREMENT")) {
        auto = true;
      } else if (c.accept("IDENTITY")) {
        auto = true;
        c.group();
      } else if (c.accept("GENERATED")) {
        if (!c.accept("ALWAYS")) c.accept("BY", "DEFAULT");
        c.accept("ON", "NULL");
        c.accept("AS");
        if (c.accept("IDENTITY")) {
          auto = true;
          c.group();
        } else {
          c.group();
          c.acceptOne("STORED", "VIRTUAL");
        }
      } else if (c.accept("AS")) {
        c.group(); // computed column
        c.acceptOne("PERSISTED", "STORED", "VIRTUAL");
      } else if (c.accept("CHECK")) {
        c.group();
      } else if (c.accept("COLLATE")) {
        c.next();
      } else if (c.accept("CHARACTER", "SET") || c.accept("CHARSET")) {
        c.next();
      } else if (c.accept("REFERENCES")) {
        const ref = this.references(c);
        if (ref) this.fks.push({ child: t, cols: [name], ...ref });
      } else if (c.accept("COMMENT")) {
        const s = c.peek();
        if (s?.kind === "string") {
          col.note = s.value;
          c.next();
        }
      } else if (c.accept("ON", "UPDATE")) {
        c.next(); // MySQL: ON UPDATE CURRENT_TIMESTAMP[(n)]
        c.group();
      } else {
        c.next();
        c.group();
      }
    }

    if (explicitNull !== null) col.nullable = explicitNull;
    if (col.pk) col.nullable = false;
    if (auto) {
      const base = col.type.replace(/\s+(UNSIGNED|SIGNED|ZEROFILL)\b/g, "");
      if (INT_SERIAL[base]) col.type = INT_SERIAL[base];
    }
    return col;
  }

  parseType(c: Cursor): { type: string; array: boolean } {
    const parts: string[] = [];
    let array = false;
    let first = true;
    while (!c.done) {
      const t = c.peek()!;
      if (t.kind === "word" || (t.kind === "qident" && (first || c.punct(".", -1)))) {
        const up = t.value.toUpperCase();
        if (t.kind === "word" && TYPE_STOP.has(up)) break;
        if (t.kind === "word" && up === "CHARACTER" && c.word(1) === "SET") break;
        c.next();
        if (up === "ARRAY") {
          array = true;
          c.group();
          continue;
        }
        parts.push(up);
      } else if (t.kind === "punct" && t.value === "." && parts.length) {
        // schema-qualified type: keep only the last part
        parts.pop();
        c.next();
        continue;
      } else if (t.kind === "punct" && t.value === "(" && parts.length) {
        const inner = c.group();
        const raw = rawText(this.src, inner);
        const params = /['"]/.test(raw) ? raw : raw.replace(/\s+/g, "").toUpperCase();
        parts[parts.length - 1] += `(${params})`;
      } else if (t.kind === "punct" && t.value === "[]") {
        array = true;
        c.next();
      } else break;
      first = false;
    }
    const type = normalizeTypeName(parts.join(" "));
    return { type: array && type ? `${type}[]` : type, array };
  }

  /** The text of a DEFAULT expression, stopping at the next constraint keyword. */
  defaultExpr(c: Cursor): string {
    const start = c.i;
    let depth = 0;
    while (!c.done) {
      const t = c.peek()!;
      if (
        depth === 0 &&
        c.i > start &&
        t.kind === "word" &&
        DEFAULT_STOP.has(t.value.toUpperCase()) &&
        !c.punct("::", -1) // 'x'::character varying
      ) {
        break;
      }
      if (t.kind === "punct" && t.value === "(") depth++;
      if (t.kind === "punct" && t.value === ")") depth--;
      c.next();
    }
    let expr = rawText(this.src, c.toks.slice(start, c.i)).trim();
    // Strip redundant wrapping parentheses: ((0)) → 0.
    for (;;) {
      if (!expr.startsWith("(") || !expr.endsWith(")")) break;
      let d = 0;
      let wraps = true;
      for (let k = 0; k < expr.length; k++) {
        if (expr[k] === "(") d++;
        else if (expr[k] === ")") d--;
        if (d === 0 && k < expr.length - 1) {
          wraps = false;
          break;
        }
      }
      if (!wraps) break;
      expr = expr.slice(1, -1).trim();
    }
    // PostgreSQL casts on literals: 'x'::character varying → 'x'.
    const cast = /^('(?:[^']|'')*'|-?\d+(?:\.\d+)?)::[\w\s."]+(?:\(\d+(?:,\d+)?\))?(?:\[\])?$/.exec(
      expr,
    );
    if (cast) expr = cast[1];
    return expr;
  }

  /** After REFERENCES: table [(cols)] [MATCH …] [ON DELETE …] [ON UPDATE …] … */
  references(c: Cursor): Reference | null {
    const parent = c.qualified().at(-1);
    if (!parent) return null;
    let parentCols: string[] | null = null;
    if (c.punct("(")) parentCols = this.columnList(c);
    let onDelete: ReferentialAction = "NO ACTION";
    let onUpdate: ReferentialAction = "NO ACTION";
    for (;;) {
      if (c.accept("MATCH")) c.next();
      else if (c.accept("ON", "DELETE")) onDelete = parseAction(c) ?? onDelete;
      else if (c.accept("ON", "UPDATE")) onUpdate = parseAction(c) ?? onUpdate;
      else if (c.accept("NOT", "FOR", "REPLICATION") || c.accept("NOT", "DEFERRABLE")) continue;
      else if (c.accept("DEFERRABLE")) continue;
      else if (c.accept("INITIALLY")) c.next();
      else break;
    }
    return { parent, parentCols, onDelete, onUpdate };
  }

  /** `(a, b(10) DESC, [c])` → ["a", "b", "c"]. */
  columnList(c: Cursor): string[] {
    return splitCommas(c.group())
      .map((el) => new Cursor(el, this.src).ident())
      .filter((n): n is string => n !== null);
  }

  tableConstraint(c: Cursor, t: Table) {
    if (c.accept("CONSTRAINT")) c.ident();
    if (c.accept("PRIMARY", "KEY")) {
      c.acceptOne("CLUSTERED", "NONCLUSTERED");
      for (const n of this.columnList(c)) {
        const col = this.column(t, n);
        if (col) {
          col.pk = true;
          col.nullable = false;
        } else this.warnings.push(`Primary key of ${t.name} names a missing column ${n}.`);
      }
    } else if (c.accept("UNIQUE")) {
      c.acceptOne("KEY", "INDEX");
      c.acceptOne("CLUSTERED", "NONCLUSTERED");
      if (!c.punct("(")) c.ident(); // MySQL: UNIQUE KEY name (…)
      const cols = this.columnList(c);
      if (cols.length === 1) {
        const col = this.column(t, cols[0]);
        if (col) col.unique = true;
        else
          this.warnings.push(`Unique constraint on ${t.name} names a missing column ${cols[0]}.`);
      } else if (cols.length > 1) {
        this.warnings.push(
          `${t.name} has a unique constraint across ${cols.join(", ")}; ` +
            "multi-column unique constraints aren’t shown on the diagram.",
        );
      }
    } else if (c.accept("FOREIGN", "KEY")) {
      if (!c.punct("(")) c.ident(); // MySQL allows an index name here
      const cols = this.columnList(c);
      if (!c.accept("REFERENCES")) return;
      const ref = this.references(c);
      if (ref && cols.length) this.fks.push({ child: t, cols, ...ref });
    } else if (c.accept("CHECK") || c.accept("EXCLUDE")) {
      // not modelled
    } else if (c.accept("LIKE")) {
      this.warnings.push(
        `${t.name} copies columns with LIKE, which isn’t supported; add them by hand.`,
      );
    } else {
      // KEY / INDEX / FULLTEXT / SPATIAL / PERIOD: indexes aren't modelled.
    }
  }

  alterTable(c: Cursor) {
    c.i += 2; // ALTER TABLE
    c.accept("IF", "EXISTS");
    c.accept("ONLY");
    const name = c.qualified().at(-1);
    if (!name) throw new Error("no table name");
    const t = this.table(name);
    const actions = splitCommas(c.rest());
    let handled = false;
    let silent = false;
    for (const el of actions) {
      const a = new Cursor(el, this.src);
      if (a.accept("WITH")) a.next(); // SQL Server: WITH CHECK / WITH NOCHECK
      if (a.accept("ADD")) {
        if (!t) {
          this.warnings.push(`ALTER TABLE ${name} refers to a table that isn’t in the script.`);
          return;
        }
        let constraintName = false;
        if (a.accept("CONSTRAINT")) {
          a.ident();
          constraintName = true;
        }
        const w = a.word();
        if (w === "PRIMARY" || w === "UNIQUE" || w === "FOREIGN" || w === "CHECK") {
          this.tableConstraint(a, t);
          handled = true;
        } else if (w === "DEFAULT") {
          // SQL Server: ADD CONSTRAINT DF_x DEFAULT (expr) FOR col
          a.next();
          const exprStart = a.i;
          while (!a.done && !a.is("FOR")) a.next();
          const expr = new Cursor(a.toks.slice(exprStart, a.i), this.src);
          const value = this.defaultExpr(expr);
          a.accept("FOR");
          const col = this.column(t, a.ident() ?? "");
          if (col && !/^null$/i.test(value)) col.defaultValue = value;
          handled = true;
        } else if (w === "INDEX" || w === "KEY" || w === "FULLTEXT" || w === "SPATIAL") {
          silent = true;
        } else if (!constraintName) {
          a.accept("COLUMN");
          a.accept("IF", "NOT", "EXISTS");
          const col = this.columnDef(a, t);
          if (col && !this.column(t, col.name)) t.columns.push(col);
          handled = true;
        }
      } else if (a.accept("ALTER")) {
        a.accept("COLUMN");
        const col = t && this.column(t, a.ident() ?? "");
        if (!col) {
          silent = true;
          continue;
        }
        if (a.accept("SET", "DEFAULT")) {
          const value = this.defaultExpr(a);
          if (/^nextval\s*\(/i.test(value)) {
            col.type = INT_SERIAL[col.type] ?? col.type;
          } else col.defaultValue = value;
          handled = true;
        } else if (a.accept("SET", "NOT", "NULL")) {
          col.nullable = false;
          handled = true;
        } else if (a.accept("DROP", "NOT", "NULL")) {
          col.nullable = !col.pk;
          handled = true;
        } else if (a.accept("ADD", "GENERATED")) {
          col.type = INT_SERIAL[col.type] ?? col.type;
          handled = true;
        } else silent = true;
      } else {
        const w = a.word();
        if (
          w &&
          ["OWNER", "CHECK", "NOCHECK", "ENABLE", "DISABLE", "REPLICA", "CLUSTER", "SET"].includes(
            w,
          )
        ) {
          silent = true;
        }
      }
    }
    if (!handled && !silent) this.skip("ALTER TABLE");
  }

  commentOn(c: Cursor) {
    c.i += 2; // COMMENT ON
    const kind = c.word();
    if (kind !== "TABLE" && kind !== "COLUMN") {
      this.skip(`COMMENT ON ${kind ?? ""}`.trim());
      return;
    }
    c.next();
    const parts = c.qualified();
    if (!c.accept("IS")) return;
    const s = c.peek();
    const text = s?.kind === "string" ? s.value : "";
    if (kind === "TABLE") {
      const t = this.table(parts.at(-1) ?? "");
      if (t) t.note = text;
    } else {
      const t = this.table(parts.at(-2) ?? "");
      const col = t && this.column(t, parts.at(-1) ?? "");
      if (col) col.note = text;
    }
  }

  resolveFks(): Relationship[] {
    const rels: Relationship[] = [];
    const seen = new Set<string>();
    for (const fk of this.fks) {
      const where = `${fk.child.name}.${fk.cols.join(", ")}`;
      const parent = this.table(fk.parent);
      if (!parent) {
        this.warnings.push(
          `Foreign key ${where} references ${fk.parent}, which isn’t in the script, so no relationship was added.`,
        );
        continue;
      }
      const parentColNames = fk.parentCols ?? parent.columns.filter((c) => c.pk).map((c) => c.name);
      if (parentColNames.length !== fk.cols.length) {
        this.warnings.push(
          `Foreign key ${where} doesn’t match the key of ${parent.name}, so no relationship was added.`,
        );
        continue;
      }
      const childCols = fk.cols.map((n) => this.column(fk.child, n));
      const parentCols = parentColNames.map((n) => this.column(parent, n));
      if (childCols.some((x) => !x) || parentCols.some((x) => !x)) {
        this.warnings.push(
          `Foreign key ${where} → ${parent.name} names a column that doesn’t exist, so no relationship was added.`,
        );
        continue;
      }
      const childPk = fk.child.columns.filter((c) => c.pk);
      const oneToOne =
        childCols.length === 1
          ? childCols[0]!.unique || (childCols[0]!.pk && childPk.length === 1)
          : childPk.length === childCols.length && childCols.every((c) => c!.pk);
      childCols.forEach((cc, k) => {
        const pc = parentCols[k]!;
        const key = `${fk.child.id}:${cc!.id}>${parent.id}:${pc.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        rels.push(
          makeRelationship(parent.id, fk.child.id, {
            fromCol: pc.id,
            toCol: cc!.id,
            type: oneToOne ? "1:1" : "1:N",
            fromOptional: cc!.nullable,
            toOptional: true,
            onDelete: fk.onDelete,
            onUpdate: fk.onUpdate,
          }),
        );
      });
    }
    return rels;
  }
}

/**
 * pg_dump writes table data as `COPY … FROM stdin;` followed by raw rows and a
 * `\.` line. The rows aren't SQL, so drop them before tokenizing.
 */
function stripCopyData(src: string): string {
  return src.replace(
    /^([ \t]*COPY\b[^\n]*\bFROM\s+stdin[^\n]*;)[^\n]*\n[\s\S]*?^\\\.[ \t]*$/gim,
    "$1",
  );
}

/** Parse CREATE TABLE statements (and ALTER TABLE … ADD FOREIGN KEY) into a diagram. */
export function fromSql(text: string): SqlImportResult {
  return new SqlImporter(String(text ?? "")).run();
}
