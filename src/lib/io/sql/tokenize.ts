/**
 * A forgiving SQL tokenizer for schema dumps from PostgreSQL, MySQL, SQLite
 * and SQL Server. It never throws: anything it doesn't recognise becomes a
 * one-character punctuation token.
 */

export type TokenKind = "word" | "qident" | "string" | "number" | "punct";

export interface Token {
  kind: TokenKind;
  /** Word text as written, identifier/string contents unquoted, or the punctuation. */
  value: string;
  /** Offsets into the source, so callers can recover the original text. */
  start: number;
  end: number;
}

const WORD_START = /[A-Za-z_À-￿@#]/;
const WORD_PART = /[A-Za-z0-9_$@#À-￿]/;

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const n = src.length;
  let i = 0;
  let lineStart = true; // only whitespace so far on this line

  const push = (kind: TokenKind, value: string, start: number, end: number) => {
    tokens.push({ kind, value, start, end });
    lineStart = false;
  };

  /** Read a quoted run ending in `close`, where a doubled `close` is an escape. */
  const quoted = (open: number, close: string, backslash: boolean): [string, number] => {
    let j = open + 1;
    let out = "";
    while (j < n) {
      const ch = src[j];
      if (backslash && ch === "\\" && j + 1 < n) {
        const nx = src[j + 1];
        out += nx === "n" ? "\n" : nx === "t" ? "\t" : nx === "r" ? "\r" : nx === "0" ? "\0" : nx;
        j += 2;
        continue;
      }
      if (ch === close) {
        if (src[j + 1] === close) {
          out += close;
          j += 2;
          continue;
        }
        return [out, j + 1];
      }
      out += ch;
      j++;
    }
    return [out, n];
  };

  while (i < n) {
    const ch = src[i];

    if (ch === "\n") {
      lineStart = true;
      i++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\f" || ch === "\v" || ch === "﻿") {
      i++;
      continue;
    }
    // -- line comment (MySQL wants a space after it, but be lenient)
    if (ch === "-" && src[i + 1] === "-") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    // # line comment (MySQL) — but not SQL Server #temp table names mid-statement
    if (ch === "#" && (lineStart || /\s/.test(src[i + 1] ?? " ") || src[i + 1] === "#")) {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    // /* block comment */ (PostgreSQL nests them)
    if (ch === "/" && src[i + 1] === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (src[i] === "/" && src[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (src[i] === "*" && src[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      continue;
    }
    // SQL Server batch separator: GO alone on a line (optionally with a count).
    if (lineStart && /^go\b/i.test(src.slice(i, i + 3))) {
      const m = /^go(?:[ \t]+\d+)?[ \t]*(?:--[^\n]*)?(?=\r?\n|$)/i.exec(src.slice(i));
      if (m) {
        push("punct", ";", i, i + m[0].length);
        i += m[0].length;
        continue;
      }
    }
    // Strings, including N'…', E'…', X'…', B'…' prefixes.
    if (ch === "'" || (/[NnEeXxBb]/.test(ch) && src[i + 1] === "'")) {
      const open = ch === "'" ? i : i + 1;
      const [value, end] = quoted(open, "'", true);
      push("string", value, i, end);
      i = end;
      continue;
    }
    // Dollar-quoted strings (PostgreSQL function bodies).
    if (ch === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i));
      if (m) {
        const tag = m[0];
        const close = src.indexOf(tag, i + tag.length);
        const end = close < 0 ? n : close + tag.length;
        push("string", src.slice(i + tag.length, close < 0 ? n : close), i, end);
        i = end;
        continue;
      }
    }
    if (ch === '"') {
      const [value, end] = quoted(i, '"', false);
      push("qident", value, i, end);
      i = end;
      continue;
    }
    if (ch === "`") {
      const [value, end] = quoted(i, "`", false);
      push("qident", value, i, end);
      i = end;
      continue;
    }
    if (ch === "[") {
      // `[]` and `[3]` are array suffixes (PostgreSQL); anything else is a SQL Server name.
      const m = /^\[\s*\d*\s*\]/.exec(src.slice(i));
      if (m) {
        push("punct", "[]", i, i + m[0].length);
        i += m[0].length;
        continue;
      }
      const [value, end] = quoted(i, "]", false);
      push("qident", value, i, end);
      i = end;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
      push("number", m[0], i, i + m[0].length);
      i += m[0].length;
      continue;
    }
    if (WORD_START.test(ch) || (ch === "$" && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < n && WORD_PART.test(src[j])) j++;
      push("word", src.slice(i, j), i, j);
      i = j;
      continue;
    }
    if (ch === ":" && src[i + 1] === ":") {
      push("punct", "::", i, i + 2);
      i += 2;
      continue;
    }
    push("punct", ch, i, i + 1);
    i++;
  }
  return tokens;
}

/**
 * Split into statements at semicolons. Semicolons never appear inside a DDL
 * statement outside strings, so a stray parenthesis can't swallow the rest of
 * the script. Empty statements are dropped.
 */
export function splitStatements(tokens: Token[]): Token[][] {
  const out: Token[][] = [];
  let cur: Token[] = [];
  for (const t of tokens) {
    if (t.kind === "punct" && t.value === ";") {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}
