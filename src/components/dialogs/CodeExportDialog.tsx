"use client";

import { useMemo, useRef, useState } from "react";
import { SQL_DIALECT_LABELS, downloadFile, slugify, toDbml, toMermaid, toSql } from "@/lib/io";
import type { SqlDialect } from "@/lib/settings/types";
import { useCodeExportStore, type CodeFormat } from "@/hooks/useCodeExport";
import { toast } from "@/hooks/useToast";
import { useDiagramStore } from "@/store/diagram";
import { useSettingsStore } from "@/store/settings";
import { CopyIcon, DownloadIcon } from "../icons";
import { Button } from "../ui/Button";
import { Field, Select } from "../ui/Field";
import { Dialog } from "../ui/Dialog";
import styles from "./Dialogs.module.css";

const FORMATS: Record<CodeFormat, { label: string; ext: string; mime: string; help: string }> = {
  sql: {
    label: "SQL",
    ext: "sql",
    mime: "application/sql",
    help: "CREATE TABLE statements in dependency order, with keys and foreign-key constraints.",
  },
  mermaid: {
    label: "Mermaid",
    ext: "mmd",
    mime: "text/plain",
    help: "Paste into a ```mermaid block in GitHub, GitLab, Notion or Obsidian.",
  },
  dbml: {
    label: "DBML",
    ext: "dbml",
    mime: "text/plain",
    help: "Paste into dbdiagram.io or use with dbdocs.",
  },
};

/** Copy text with the clipboard API, falling back to execCommand for older browsers. */
export async function copyText(
  text: string,
  fallbackEl?: HTMLTextAreaElement | HTMLInputElement | null,
) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallbackEl) return false;
    fallbackEl.focus();
    fallbackEl.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

export function CodeExportDialog({ onClose }: { onClose(): void }) {
  const format = useCodeExportStore((s) => s.format);
  const setFormat = useCodeExportStore((s) => s.setFormat);
  const diagram = useDiagramStore((s) => s.diagram);
  const defaultDialect = useSettingsStore((s) => s.settings.sqlDialect);
  const [dialect, setDialect] = useState<SqlDialect>(defaultDialect);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const f = FORMATS[format];

  const { code, error } = useMemo(() => {
    try {
      const code =
        format === "sql"
          ? toSql(diagram, dialect)
          : format === "mermaid"
            ? toMermaid(diagram)
            : toDbml(diagram);
      return { code, error: code ? "" : "Nothing to export yet." };
    } catch {
      return { code: "", error: `Couldn’t generate ${f.label} for this diagram.` };
    }
  }, [format, dialect, diagram, f.label]);

  async function copy() {
    const ok = await copyText(code, areaRef.current);
    toast(
      ok ? `Copied ${f.label} to the clipboard` : "Couldn’t copy — select the text and copy it.",
    );
  }

  function download() {
    const name = `${slugify(diagram.name)}.${f.ext}`;
    downloadFile(name, code, f.mime);
    toast(`Saved ${name}`);
  }

  return (
    <Dialog
      title={`Export ${f.label}`}
      description={f.help}
      onClose={onClose}
      size="wide"
      testId="code-export-dialog"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button icon={<CopyIcon />} disabled={!code} onClick={() => void copy()}>
            Copy
          </Button>
          <Button variant="primary" icon={<DownloadIcon />} disabled={!code} onClick={download}>
            Download .{f.ext}
          </Button>
        </>
      }
    >
      <div className={styles.controls}>
        <Field label="Format">
          <Select value={format} onChange={(e) => setFormat(e.target.value as CodeFormat)}>
            {(Object.keys(FORMATS) as CodeFormat[]).map((k) => (
              <option key={k} value={k}>
                {FORMATS[k].label}
              </option>
            ))}
          </Select>
        </Field>
        {format === "sql" && (
          <Field label="Dialect">
            <Select value={dialect} onChange={(e) => setDialect(e.target.value as SqlDialect)}>
              {(Object.keys(SQL_DIALECT_LABELS) as SqlDialect[]).map((d) => (
                <option key={d} value={d}>
                  {SQL_DIALECT_LABELS[d]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <textarea
        ref={areaRef}
        className={styles.code}
        value={code}
        readOnly
        rows={16}
        spellCheck={false}
        aria-label={`${f.label} code`}
        placeholder={error}
      />
      {error && !code && <p className={styles.meta}>{error}</p>}
    </Dialog>
  );
}
