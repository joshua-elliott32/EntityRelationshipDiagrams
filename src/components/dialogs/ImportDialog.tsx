"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DiagramParseError, fromSql, parseDiagramJson, type SqlImportResult } from "@/lib/io";
import { replaceDiagram, withAutoLayout } from "../actions";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import styles from "./Dialogs.module.css";

type Mode = "json" | "sql";

const MODES: { id: Mode; label: string }[] = [
  { id: "json", label: "Diagram file (.json)" },
  { id: "sql", label: "SQL (CREATE TABLE)" },
];

function friendly(err: unknown, fallback: string): string {
  if (err instanceof DiagramParseError) return err.message;
  if (err instanceof Error && err.message && err.message !== "Not implemented") return err.message;
  return fallback;
}

export function ImportDialog({ onClose }: { onClose(): void }) {
  const [mode, setMode] = useState<Mode>("json");
  const [texts, setTexts] = useState<Record<Mode, string>>({ json: "", sql: "" });
  const [fileNames, setFileNames] = useState<Record<Mode, string>>({ json: "", sql: "" });
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textId = useId();
  const text = texts[mode];

  const sql = useMemo((): { result?: SqlImportResult; error?: string } | null => {
    if (mode !== "sql" || !texts.sql.trim()) return null;
    try {
      return { result: fromSql(texts.sql) };
    } catch (err) {
      return {
        error: friendly(err, "Couldn’t read that SQL. Paste CREATE TABLE statements."),
      };
    }
  }, [mode, texts.sql]);

  function setText(v: string) {
    setTexts((t) => ({ ...t, [mode]: v }));
    setError("");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const content = await file.text();
      setTexts((t) => ({ ...t, [mode]: content }));
      setFileNames((f) => ({ ...f, [mode]: file.name }));
      setError("");
    } catch {
      setError("Couldn’t read that file.");
    }
  }

  function submit() {
    if (!text.trim()) {
      setError(
        mode === "json"
          ? "Choose a file or paste a diagram first."
          : "Choose a .sql file or paste some SQL first.",
      );
      return;
    }
    if (mode === "json") {
      try {
        const d = parseDiagramJson(text);
        replaceDiagram(d, `Loaded ${d.name}`);
        onClose();
      } catch (err) {
        setError(friendly(err, "That file couldn’t be opened as a diagram."));
      }
      return;
    }
    if (!sql?.result) {
      setError(sql?.error ?? "Couldn’t read that SQL.");
      return;
    }
    let d = sql.result.diagram;
    if (!d.tables.length) {
      setError("No CREATE TABLE statements were found.");
      return;
    }
    const base = fileNames.sql.replace(/\.[^.]+$/, "");
    if (base && (!d.name || /^(untitled|imported)/i.test(d.name))) d = { ...d, name: base };
    d = withAutoLayout(d);
    replaceDiagram(
      d,
      `Imported ${d.tables.length} table${d.tables.length === 1 ? "" : "s"} from SQL`,
    );
    onClose();
  }

  function onTabKey(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = mode === "json" ? "sql" : "json";
    setMode(next);
    setError("");
    (e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus();
  }

  const result = sql?.result;
  const tableCount = result?.diagram.tables.length ?? 0;
  const relCount = result?.diagram.rels.length ?? 0;

  return (
    <Dialog
      title="Import"
      description="Loading replaces the current diagram — you can bring it back with Undo."
      onClose={onClose}
      onSubmit={submit}
      size="wide"
      testId="import-dialog"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={mode === "sql" && !!text.trim() && !result}
          >
            {mode === "json"
              ? "Load diagram"
              : tableCount
                ? `Import ${tableCount} table${tableCount === 1 ? "" : "s"}`
                : "Import SQL"}
          </Button>
        </>
      }
    >
      <div className={styles.tabs} role="tablist" aria-label="What to import" onKeyDown={onTabKey}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            data-mode={m.id}
            aria-selected={mode === m.id}
            tabIndex={mode === m.id ? 0 : -1}
            className={styles.tab}
            onClick={() => {
              setMode(m.id);
              setError("");
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={MODES.find((m) => m.id === mode)?.label}>
        <p className={styles.help}>
          {mode === "json"
            ? "Choose a .json file exported from ERD Studio, or paste its contents below."
            : "Choose a .sql file or paste CREATE TABLE statements (PostgreSQL, MySQL, SQLite or SQL Server). Keys, foreign keys and ALTER TABLE … ADD FOREIGN KEY are picked up; the tables are arranged for you."}
        </p>

        <div className={styles.file}>
          <input
            ref={fileRef}
            key={mode}
            type="file"
            className="visually-hidden"
            tabIndex={-1}
            accept={
              mode === "json" ? ".json,application/json" : ".sql,.txt,text/plain,application/sql"
            }
            onChange={(e) => void onFile(e.target.files?.[0])}
            aria-label={mode === "json" ? "Diagram file" : "SQL file"}
          />
          <Button onClick={() => fileRef.current?.click()}>
            {mode === "json" ? "Choose .json file…" : "Choose .sql file…"}
          </Button>
          <span className={styles.fileName}>{fileNames[mode] || "No file chosen"}</span>
        </div>

        <label
          htmlFor={textId}
          className={styles.help}
          style={{ display: "block", marginBottom: 4 }}
        >
          {mode === "json" ? "…or paste the diagram file" : "…or paste SQL"}
        </label>
        <textarea
          id={textId}
          className={styles.code}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={
            mode === "json"
              ? '{ "version": 2, "name": "…", "tables": [ … ] }'
              : "CREATE TABLE customers (\n  customer_id INT PRIMARY KEY,\n  full_name VARCHAR(100) NOT NULL\n);"
          }
          rows={10}
        />

        {mode === "sql" && sql?.error && !error && (
          <p className={styles.error} role="alert">
            {sql.error}
          </p>
        )}
        {mode === "sql" && result && (
          <>
            <p className={styles.okLine}>
              Found {tableCount} table{tableCount === 1 ? "" : "s"} and {relCount} relationship
              {relCount === 1 ? "" : "s"}.
            </p>
            {result.warnings.length > 0 && (
              <>
                <p className={styles.warningsTitle}>
                  {result.warnings.length} thing{result.warnings.length === 1 ? " was" : "s were"}{" "}
                  skipped:
                </p>
                <ul className={styles.warnings}>
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
