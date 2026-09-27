import { describe, expect, it } from "vitest";
import {
  DiagramParseError,
  findColumn,
  findTable,
  makeColumn,
  makeRelationship,
  makeTable,
  sampleDiagram,
  type Diagram,
  type Table,
} from "@/lib/model";
import type { SqlDialect } from "@/lib/settings/types";
import { toSql } from "./export";
import { fromSql, normalizeTypeName } from "./import";
import { tokenize } from "./tokenize";

function table(d: Diagram, name: string): Table {
  const t = d.tables.find((x) => x.name === name);
  if (!t) throw new Error(`no table ${name}`);
  return t;
}

function col(d: Diagram, t: string, c: string) {
  const found = table(d, t).columns.find((x) => x.name === c);
  if (!found) throw new Error(`no column ${t}.${c}`);
  return found;
}

/** `child.col -> parent.col` lines, sorted, for comparing relationships. */
function fkLines(d: Diagram, withActions = true): string[] {
  return d.rels
    .filter((r) => r.type !== "N:M" && r.toCol)
    .map((r) => {
      const p = findTable(d, r.from)!;
      const c = findTable(d, r.to)!;
      const base = `${c.name}.${findColumn(c, r.toCol)?.name} -> ${p.name}.${findColumn(p, r.fromCol)?.name}`;
      return withActions ? `${base} ${r.type} del:${r.onDelete} upd:${r.onUpdate}` : base;
    })
    .sort();
}

describe("tokenize", () => {
  it("handles comments, quotes, strings and GO", () => {
    const toks = tokenize(
      "-- hi\n/* block /* nested */ */ SELECT `a`, [b c], \"d\"\"e\", 'it''s', N'x', $$body;$$ # mysql\nGO\n",
    );
    expect(toks.map((t) => `${t.kind}:${t.value}`)).toEqual([
      "word:SELECT",
      "qident:a",
      "punct:,",
      "qident:b c",
      "punct:,",
      'qident:d"e',
      "punct:,",
      "string:it's",
      "punct:,",
      "string:x",
      "punct:,",
      "string:body;",
      "punct:;",
    ]);
  });
  it("reads array suffixes as punctuation, not SQL Server names", () => {
    expect(tokenize("text[] int[3]").map((t) => t.value)).toEqual(["text", "[]", "int", "[]"]);
  });
});

describe("normalizeTypeName", () => {
  it("shortens verbose spellings", () => {
    expect(normalizeTypeName("CHARACTER VARYING(20)")).toBe("VARCHAR(20)");
    expect(normalizeTypeName("TIMESTAMP(6) WITHOUT TIME ZONE")).toBe("TIMESTAMP(6)");
    expect(normalizeTypeName("TIMESTAMP WITH TIME ZONE")).toBe("TIMESTAMPTZ");
    expect(normalizeTypeName("INT(11)")).toBe("INT");
    expect(normalizeTypeName("TINYINT(1)")).toBe("BOOLEAN");
    expect(normalizeTypeName("DOUBLE PRECISION")).toBe("DOUBLE PRECISION");
  });
});

describe("fromSql — real-world dumps", () => {
  it("reads a pg_dump schema", () => {
    const sql = String.raw`--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SELECT pg_catalog.set_config('search_path', '', false);
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE TYPE public.mood AS ENUM ('sad', 'ok', 'happy');

CREATE FUNCTION public.touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.authors (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    bio text,
    tags text[],
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    mood public.mood DEFAULT 'ok'::public.mood
);

ALTER TABLE public.authors OWNER TO postgres;
COMMENT ON TABLE public.authors IS 'People who write';
COMMENT ON COLUMN public.authors.bio IS 'Short biography';

CREATE SEQUENCE public.authors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.authors_id_seq OWNED BY public.authors.id;

CREATE TABLE public.books (
    id bigint NOT NULL,
    author_id integer,
    title character varying(200) NOT NULL,
    price numeric(10,2) DEFAULT 0.00,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    published_at timestamp with time zone,
    isbn character(13)
);

ALTER TABLE public.books ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.books_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY public.authors ALTER COLUMN id SET DEFAULT nextval('public.authors_id_seq'::regclass);

COPY public.authors (id, name, bio) FROM stdin;
1	Ann	Wrote things; lots
2	Bob	\N
\.

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_isbn_key UNIQUE (isbn);

CREATE INDEX books_author_idx ON public.books USING btree (author_id);

ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.authors(id) ON DELETE SET NULL;
`;
    const { diagram: d, warnings } = fromSql(sql);
    expect(d.name).toBe("Imported from SQL");
    expect(d.view).toBeNull();
    expect(d.tables.map((t) => t.name)).toEqual(["authors", "books"]);
    expect(table(d, "authors").note).toBe("People who write");

    expect(col(d, "authors", "id")).toMatchObject({ type: "SERIAL", pk: true, nullable: false });
    expect(col(d, "authors", "name")).toMatchObject({ type: "VARCHAR(100)", nullable: false });
    expect(col(d, "authors", "bio")).toMatchObject({
      type: "TEXT",
      nullable: true,
      note: "Short biography",
    });
    expect(col(d, "authors", "tags")).toMatchObject({ type: "TEXT[]", multi: true });
    expect(col(d, "authors", "created_at")).toMatchObject({
      type: "TIMESTAMP",
      defaultValue: "now()",
    });
    expect(col(d, "authors", "mood")).toMatchObject({ type: "MOOD", defaultValue: "'ok'" });

    expect(col(d, "books", "id")).toMatchObject({ type: "BIGSERIAL", pk: true });
    expect(col(d, "books", "price")).toMatchObject({ type: "NUMERIC(10,2)", defaultValue: "0.00" });
    expect(col(d, "books", "status")).toMatchObject({ defaultValue: "'draft'", nullable: false });
    expect(col(d, "books", "published_at").type).toBe("TIMESTAMPTZ");
    expect(col(d, "books", "isbn")).toMatchObject({ type: "CHAR(13)", unique: true });

    expect(fkLines(d)).toEqual(["books.author_id -> authors.id 1:N del:SET NULL upd:NO ACTION"]);
    expect(d.rels[0]).toMatchObject({ fromOptional: true, toOptional: true });

    expect(warnings).toEqual([
      "Skipped 2 SET statements, 1 SELECT statement, 1 CREATE EXTENSION statement, " +
        "1 CREATE TYPE statement, 1 CREATE FUNCTION statement, 1 CREATE SEQUENCE statement, " +
        "1 ALTER SEQUENCE statement, 1 COPY statement and 1 CREATE INDEX statement.",
    ]);
  });

  it("reads a mysqldump", () => {
    const sql = `-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!50503 SET NAMES utf8mb4 */;

DROP TABLE IF EXISTS \`customers\`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
CREATE TABLE \`customers\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`email\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`name\` varchar(100) CHARACTER SET utf8mb4 DEFAULT NULL COMMENT 'Display name',
  \`active\` tinyint(1) NOT NULL DEFAULT '1',
  \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`customers_email_unique\` (\`email\`),
  UNIQUE KEY \`name_active\` (\`name\`, \`active\`),
  KEY \`idx_name\` (\`name\`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Buyers';

LOCK TABLES \`customers\` WRITE;
INSERT INTO \`customers\` VALUES (1,'a@b.c','Ann',1,'2024-01-01 00:00:00'),(2,'x;y','Bob\\'s',0,NULL);
UNLOCK TABLES;

CREATE TABLE \`orders\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`customer_id\` int unsigned NOT NULL,
  \`total\` decimal(10, 2) NOT NULL DEFAULT '0.00',
  \`order\` int NOT NULL, # a reserved word as a name
  PRIMARY KEY (\`id\`),
  KEY \`fk_orders_customer\` (\`customer_id\`),
  CONSTRAINT \`fk_orders_customer\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
    const { diagram: d, warnings } = fromSql(sql);
    expect(d.tables.map((t) => t.name)).toEqual(["customers", "orders"]);
    expect(table(d, "customers").note).toBe("Buyers");
    expect(col(d, "customers", "id")).toMatchObject({ type: "SERIAL", pk: true });
    expect(col(d, "customers", "email")).toMatchObject({
      type: "VARCHAR(255)",
      unique: true,
      nullable: false,
    });
    expect(col(d, "customers", "name")).toMatchObject({
      nullable: true,
      defaultValue: "",
      note: "Display name",
    });
    expect(col(d, "customers", "active")).toMatchObject({ type: "BOOLEAN", defaultValue: "'1'" });
    expect(col(d, "customers", "created_at")).toMatchObject({
      type: "TIMESTAMP",
      nullable: true,
      defaultValue: "CURRENT_TIMESTAMP",
    });
    expect(col(d, "orders", "id").type).toBe("SERIAL");
    expect(col(d, "orders", "customer_id").type).toBe("INT UNSIGNED");
    expect(col(d, "orders", "total")).toMatchObject({
      type: "DECIMAL(10,2)",
      defaultValue: "'0.00'",
    });
    expect(col(d, "orders", "order").nullable).toBe(false);
    expect(fkLines(d)).toEqual(["orders.customer_id -> customers.id 1:N del:CASCADE upd:CASCADE"]);
    expect(d.rels[0].fromOptional).toBe(false);
    expect(warnings).toEqual([
      "customers has a unique constraint across name, active; multi-column unique constraints aren’t shown on the diagram.",
      "Skipped 1 DROP TABLE statement, 1 LOCK statement, 1 INSERT statement and 1 UNLOCK statement.",
    ]);
  });

  it("reads a SQLite schema", () => {
    const sql = `PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "artists" (
  "ArtistId" INTEGER PRIMARY KEY AUTOINCREMENT,
  "Name" NVARCHAR(120)
);
CREATE TABLE albums
(
    AlbumId INTEGER NOT NULL PRIMARY KEY,
    Title TEXT NOT NULL CHECK (length(Title) > 0),
    ArtistId INTEGER NOT NULL REFERENCES artists ON DELETE CASCADE,
    Released DATE DEFAULT (date('now'))
);
CREATE TABLE tracks (id integer primary key, album_id integer, name, FOREIGN KEY(album_id) REFERENCES albums(AlbumId)) WITHOUT ROWID;
CREATE TEMP TABLE scratch (x);
CREATE INDEX IX_albums ON albums (ArtistId);
INSERT INTO sqlite_sequence VALUES('artists', 3);
COMMIT;
`;
    const { diagram: d, warnings } = fromSql(sql);
    expect(d.tables.map((t) => t.name)).toEqual(["artists", "albums", "tracks", "scratch"]);
    expect(col(d, "artists", "ArtistId")).toMatchObject({ type: "SERIAL", pk: true });
    expect(col(d, "artists", "Name")).toMatchObject({ type: "NVARCHAR(120)", nullable: true });
    expect(col(d, "albums", "Title").nullable).toBe(false);
    expect(col(d, "albums", "Released").defaultValue).toBe("date('now')");
    expect(col(d, "tracks", "name").type).toBe("");
    expect(fkLines(d)).toEqual([
      "albums.ArtistId -> artists.ArtistId 1:N del:CASCADE upd:NO ACTION",
      "tracks.album_id -> albums.AlbumId 1:N del:NO ACTION upd:NO ACTION",
    ]);
    expect(warnings).toEqual(["Skipped 1 CREATE INDEX statement and 1 INSERT statement."]);
    // Grid layout: four per row.
    expect(d.tables.map((t) => [t.x, t.y])).toEqual([
      [40, 40],
      [360, 40],
      [680, 40],
      [1000, 40],
    ]);
  });

  it("reads a SQL Server script", () => {
    const sql = `USE [Shop]
GO
SET ANSI_NULLS ON
GO
CREATE TABLE [dbo].[Customers](
\t[CustomerID] [int] IDENTITY(1,1) NOT NULL,
\t[Name] [nvarchar](100) NOT NULL,
\t[Notes] [nvarchar](max) NULL,
\t[IsActive] [bit] NOT NULL,
 CONSTRAINT [PK_Customers] PRIMARY KEY CLUSTERED
(
\t[CustomerID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
CREATE TABLE [dbo].[Orders](
\t[OrderID] [int] IDENTITY(1,1) NOT NULL,
\t[CustomerID] [int] NULL,
\t[OrderDate] [datetime2](7) NOT NULL,
\t[Total] [decimal](18, 2) NOT NULL,
 CONSTRAINT [PK_Orders] PRIMARY KEY CLUSTERED ([OrderID] ASC)
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[Customers] ADD  CONSTRAINT [DF_Customers_IsActive]  DEFAULT ((1)) FOR [IsActive]
GO
ALTER TABLE [dbo].[Orders]  WITH CHECK ADD  CONSTRAINT [FK_Orders_Customers] FOREIGN KEY([CustomerID])
REFERENCES [dbo].[Customers] ([CustomerID])
ON DELETE SET NULL
GO
ALTER TABLE [dbo].[Orders] CHECK CONSTRAINT [FK_Orders_Customers]
GO
`;
    const { diagram: d, warnings } = fromSql(sql);
    expect(d.tables.map((t) => t.name)).toEqual(["Customers", "Orders"]);
    expect(col(d, "Customers", "CustomerID")).toMatchObject({ type: "SERIAL", pk: true });
    expect(col(d, "Customers", "Notes")).toMatchObject({ type: "NVARCHAR(MAX)", nullable: true });
    expect(col(d, "Customers", "IsActive")).toMatchObject({ type: "BIT", defaultValue: "1" });
    expect(col(d, "Orders", "OrderDate").type).toBe("DATETIME2(7)");
    expect(col(d, "Orders", "Total").type).toBe("DECIMAL(18,2)");
    expect(fkLines(d)).toEqual([
      "Orders.CustomerID -> Customers.CustomerID 1:N del:SET NULL upd:NO ACTION",
    ]);
    expect(warnings).toEqual(["Skipped 1 USE statement and 1 SET statement."]);
  });
});

describe("fromSql — keys and edge cases", () => {
  it("builds composite foreign keys and 1:1 relationships", () => {
    const { diagram: d } = fromSql(`
      create table users (id int primary key);
      create table profiles (user_id int primary key references users(id));
      create table passports (id int primary key, user_id int not null unique references users);
      create table orders (id int, line int, primary key (id, line));
      create table notes (
        id int primary key,
        order_id int, line int,
        constraint fk foreign key (order_id, line) references orders (id, line) on update cascade
      );
    `);
    expect(fkLines(d)).toEqual([
      "notes.line -> orders.line 1:N del:NO ACTION upd:CASCADE",
      "notes.order_id -> orders.id 1:N del:NO ACTION upd:CASCADE",
      "passports.user_id -> users.id 1:1 del:NO ACTION upd:NO ACTION",
      "profiles.user_id -> users.id 1:1 del:NO ACTION upd:NO ACTION",
    ]);
    expect(table(d, "orders").columns.map((c) => c.pk)).toEqual([true, true]);
  });

  it("warns about foreign keys to unknown tables and columns", () => {
    const { diagram: d, warnings } = fromSql(`
      CREATE TABLE a (id INT PRIMARY KEY, x_id INT REFERENCES x(id), b_id INT REFERENCES a(nope));
    `);
    expect(d.rels).toEqual([]);
    expect(warnings).toEqual([
      "Foreign key a.x_id references x, which isn’t in the script, so no relationship was added.",
      "Foreign key a.b_id → a names a column that doesn’t exist, so no relationship was added.",
    ]);
  });

  it("accepts ALTER TABLE … ADD FOREIGN KEY / PRIMARY KEY / COLUMN", () => {
    const { diagram: d } = fromSql(`
      CREATE TABLE p (id INT NOT NULL);
      CREATE TABLE c (id INT NOT NULL, p_id INT);
      ALTER TABLE p ADD PRIMARY KEY (id);
      ALTER TABLE c ADD CONSTRAINT fk_c FOREIGN KEY (p_id) REFERENCES p (id) ON DELETE RESTRICT,
        ADD COLUMN extra VARCHAR(10) DEFAULT 'x';
    `);
    expect(col(d, "p", "id").pk).toBe(true);
    expect(col(d, "c", "extra")).toMatchObject({ type: "VARCHAR(10)", defaultValue: "'x'" });
    expect(fkLines(d)).toEqual(["c.p_id -> p.id 1:N del:RESTRICT upd:NO ACTION"]);
  });

  it("parses multi-word and unusual types", () => {
    const { diagram: d } = fromSql(`
      CREATE TABLE t (
        a DOUBLE PRECISION,
        b CHARACTER VARYING(20) COLLATE "C",
        c TIMESTAMP(3) WITH TIME ZONE,
        d INT UNSIGNED ZEROFILL,
        e INTEGER ARRAY,
        f ENUM('x', 'y') NOT NULL,
        g INTERVAL DAY TO SECOND,
        h INT GENERATED ALWAYS AS (d * 2) STORED,
        i BIGINT GENERATED BY DEFAULT AS IDENTITY (START WITH 10),
        j VARCHAR(10) CHECK (j <> '') DEFAULT 'a,b',
        k NUMERIC DEFAULT -1
      ) ;
    `);
    const types = table(d, "t").columns.map((c) => c.type);
    expect(types).toEqual([
      "DOUBLE PRECISION",
      "VARCHAR(20)",
      "TIMESTAMPTZ(3)",
      "INT UNSIGNED ZEROFILL",
      "INTEGER[]",
      "ENUM('x', 'y')",
      "INTERVAL DAY TO SECOND",
      "INT",
      "BIGSERIAL",
      "VARCHAR(10)",
      "NUMERIC",
    ]);
    expect(col(d, "t", "e").multi).toBe(true);
    expect(col(d, "t", "j").defaultValue).toBe("'a,b'");
    expect(col(d, "t", "k").defaultValue).toBe("-1");
  });

  it("warns instead of throwing on odd input", () => {
    const { diagram: d, warnings } = fromSql(`
      CREATE TABLE ok (id INT PRIMARY KEY);
      CREATE TABLE copy AS SELECT * FROM ok;
      CREATE TABLE ok (id INT);
      CREATE TABLE child (LIKE ok);
      CREATE VIEW v AS SELECT 1;
      )))garbage(((;
    `);
    expect(d.tables.map((t) => t.name)).toEqual(["ok", "child"]);
    expect(warnings).toContain(
      "Skipped table copy: CREATE TABLE … AS SELECT has no column list to read.",
    );
    expect(warnings).toContain("Table ok is defined twice; kept the first definition.");
    expect(warnings).toContain(
      "child copies columns with LIKE, which isn’t supported; add them by hand.",
    );
    expect(warnings.at(-1)).toBe("Skipped 1 CREATE VIEW statement and 1 unrecognised statement.");
  });

  it("throws a DiagramParseError without any CREATE TABLE", () => {
    expect(() => fromSql("SELECT 1; INSERT INTO x VALUES (1);")).toThrow(DiagramParseError);
    expect(() => fromSql("")).toThrow(/No CREATE TABLE statements found/);
  });
});

describe("round trip toSql → fromSql", () => {
  function richDiagram(): Diagram {
    const users = makeTable("Users", 0, 0, {
      note: "Everyone who signs in",
      columns: [
        makeColumn("id", "SERIAL", { pk: true }),
        makeColumn("email", "VARCHAR(255)", { unique: true, note: "Lower-cased" }),
        makeColumn("display name", "VARCHAR(100)", { nullable: true }),
        makeColumn("active", "BOOLEAN", { defaultValue: "true" }),
        makeColumn("best_friend_id", "INT", { nullable: true }),
        makeColumn("team_id", "INT", { nullable: true }),
      ],
    });
    const teams = makeTable("teams", 0, 0, {
      columns: [
        makeColumn("id", "INT", { pk: true }),
        makeColumn("captain_id", "INT"),
        makeColumn("order", "INT", { defaultValue: "0" }),
      ],
    });
    const orders = makeTable("orders", 0, 0, {
      columns: [
        makeColumn("id", "INT", { pk: true }),
        makeColumn("user_id", "INT"),
        makeColumn("placed_at", "TIMESTAMP"),
      ],
    });
    const lines = makeTable("order_lines", 0, 0, {
      columns: [
        makeColumn("order_id", "INT", { pk: true }),
        makeColumn("line_no", "INT", { pk: true }),
        makeColumn("qty", "INT", { defaultValue: "1" }),
      ],
    });
    const notes = makeTable("line_notes", 0, 0, {
      columns: [
        makeColumn("id", "INT", { pk: true }),
        makeColumn("order_id", "INT"),
        makeColumn("line_no", "INT"),
        makeColumn("body", "TEXT", { nullable: true }),
      ],
    });
    const c = (t: Table, n: string) => t.columns.find((x) => x.name === n)!.id;
    return {
      version: 2,
      name: "Rich",
      tables: [notes, lines, orders, users, teams],
      rels: [
        makeRelationship(users.id, orders.id, {
          fromCol: c(users, "id"),
          toCol: c(orders, "user_id"),
          onDelete: "CASCADE",
        }),
        makeRelationship(orders.id, lines.id, {
          fromCol: c(orders, "id"),
          toCol: c(lines, "order_id"),
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        }),
        makeRelationship(lines.id, notes.id, {
          fromCol: c(lines, "order_id"),
          toCol: c(notes, "order_id"),
        }),
        makeRelationship(lines.id, notes.id, {
          fromCol: c(lines, "line_no"),
          toCol: c(notes, "line_no"),
        }),
        // Cycle: users.team_id → teams, teams.captain_id → users.
        makeRelationship(teams.id, users.id, {
          fromCol: c(teams, "id"),
          toCol: c(users, "team_id"),
          onDelete: "SET NULL",
          fromOptional: true,
        }),
        makeRelationship(users.id, teams.id, {
          fromCol: c(users, "id"),
          toCol: c(teams, "captain_id"),
        }),
        // Self reference.
        makeRelationship(users.id, users.id, {
          fromCol: c(users, "id"),
          toCol: c(users, "best_friend_id"),
          fromOptional: true,
        }),
      ],
      view: null,
      updatedAt: 0,
    };
  }

  function shape(d: Diagram) {
    return d.tables
      .map((t) => ({
        name: t.name,
        columns: t.columns.map(
          (c) =>
            `${c.name}${c.pk ? " pk" : ""}${c.nullable ? " null" : ""}${c.unique ? " unique" : ""}`,
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const dialects: SqlDialect[] = ["postgres", "mysql", "sqlite", "sqlserver"];

  for (const dialect of dialects) {
    it(`preserves tables, columns, keys and FKs for ${dialect}`, () => {
      const d = richDiagram();
      const { diagram: back, warnings } = fromSql(toSql(d, dialect));
      expect(warnings).toEqual([]);
      expect(shape(back)).toEqual(shape(d));
      expect(fkLines(back)).toEqual(fkLines(d));
      if (dialect === "postgres") {
        const types = (x: Diagram) => x.tables.flatMap((t) => t.columns.map((c) => c.type));
        expect(types(back).sort()).toEqual(types(d).sort());
      }
      // Auto-increment survives as SERIAL in every dialect.
      expect(col(back, "Users", "id").type).toBe("SERIAL");
      expect(col(back, "teams", "order").defaultValue).toBe("0");
    });
  }

  it("keeps notes for postgres and mysql", () => {
    for (const dialect of ["postgres", "mysql"] as const) {
      const { diagram: back } = fromSql(toSql(richDiagram(), dialect));
      expect(table(back, "Users").note).toBe("Everyone who signs in");
      expect(col(back, "Users", "email").note).toBe("Lower-cased");
    }
  });

  it("round-trips the sample diagram's FK", () => {
    for (const dialect of dialects) {
      const d = sampleDiagram();
      const { diagram: back } = fromSql(toSql(d, dialect));
      expect(fkLines(back)).toEqual(fkLines(d));
      expect(shape(back)).toEqual(shape(d));
    }
  });
});
