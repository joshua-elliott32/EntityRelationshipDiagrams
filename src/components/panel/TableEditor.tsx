"use client";

import { useMemo, useRef } from "react";
import type { Issue } from "@/lib/analysis";
import { COMMON_TYPES, TABLE_COLORS, relShort, relsOfTable, type Table } from "@/lib/model";
import { useAnalysis } from "@/hooks/useAnalysis";
import { requestFocus, useFocusOnRequest } from "@/hooks/useFocusRequest";
import { useDiagramStore } from "@/store/diagram";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { deleteTableWithUndo, duplicateSelectedTable } from "../actions";
import { CopyIcon, LinkIcon, PlusIcon } from "../icons";
import { KEYS } from "../shortcuts";
import { Button, ConfirmButton } from "../ui/Button";
import { Field, Input, TextArea } from "../ui/Field";
import { ColumnCard, TYPES_LIST_ID } from "./ColumnCard";
import styles from "./Panel.module.css";

const COLOR_LABELS: Record<string, string> = {
  slate: "Slate",
  teal: "Teal",
  blue: "Blue",
  violet: "Violet",
  rose: "Rose",
  amber: "Amber",
  green: "Green",
};

export function TableEditor({ table }: { table: Table }) {
  const diagram = useDiagramStore((s) => s.diagram);
  const updateTable = useDiagramStore((s) => s.updateTable);
  const addColumn = useDiagramStore((s) => s.addColumn);
  const target = useSettingsStore((s) => s.settings.targetNormalForm);
  const startLink = useUiStore((s) => s.startLink);
  const reveal = useUiStore((s) => s.revealOnCanvas);
  const analysis = useAnalysis();
  const nameRef = useRef<HTMLInputElement>(null);
  useFocusOnRequest(`table-name:${table.id}`, nameRef);

  const rels = relsOfTable(diagram, table.id);
  const issuesByColumn = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of analysis.issues) {
      if (i.tableId !== table.id) continue;
      for (const c of i.columnIds) m.set(c, [...(m.get(c) ?? []), i]);
    }
    return m;
  }, [analysis.issues, table.id]);
  const tableIssues = analysis.byTable[table.id] ?? 0;

  function onAddColumn() {
    const id = addColumn(table.id);
    requestFocus(`column-name:${id}`);
  }

  return (
    <div data-testid="table-editor">
      <div className={styles.paneHead}>
        <span className={styles.kicker}>Table</span>
        {tableIssues > 0 && (
          <span className={styles.badge} title="Issues in this table">
            {tableIssues} issue{tableIssues === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <Field label="Table name">
        <Input
          ref={nameRef}
          className={styles.bigName}
          value={table.name}
          spellCheck={false}
          autoComplete="off"
          placeholder="table_name"
          onChange={(e) => updateTable(table.id, { name: e.target.value })}
        />
      </Field>

      <fieldset className={styles.swatches}>
        <legend>Header colour</legend>
        <label className={styles.swatch} title="Default">
          <input
            type="radio"
            name={`color-${table.id}`}
            checked={!table.color}
            onChange={() => updateTable(table.id, { color: null })}
            aria-label="Default"
          />
          <span className={styles.swatchDefault}>Default</span>
        </label>
        {TABLE_COLORS.map((c) => (
          <label key={c} className={styles.swatch} title={COLOR_LABELS[c] ?? c}>
            <input
              type="radio"
              name={`color-${table.id}`}
              checked={table.color === c}
              onChange={() => updateTable(table.id, { color: c })}
              aria-label={COLOR_LABELS[c] ?? c}
            />
            <span style={{ background: `var(--t-${c})` }} />
          </label>
        ))}
      </fieldset>

      <Field label="Note (optional)">
        <TextArea
          rows={2}
          value={table.note}
          placeholder="What one row of this table represents"
          onChange={(e) => updateTable(table.id, { note: e.target.value })}
        />
      </Field>

      <div className={styles.secHead}>
        <h3>
          Columns <span className={styles.count}>({table.columns.length})</span>
        </h3>
        <Button size="small" icon={<PlusIcon />} onClick={onAddColumn}>
          Add column
        </Button>
      </div>
      {target !== "none" && table.columns.length > 1 && (
        <p className={styles.help}>
          “Determined by” is what decides a column’s value. Leave it on the primary key unless
          another column decides it — a city decided by a postcode, say.
        </p>
      )}
      {table.columns.length === 0 && (
        <p className={styles.help}>No columns yet. Add one to get started.</p>
      )}
      {table.columns.map((c, i) => (
        <ColumnCard
          key={c.id}
          table={table}
          column={c}
          index={i}
          flagged={analysis.flaggedColumns.has(c.id)}
          issues={issuesByColumn.get(c.id)}
        />
      ))}
      {table.columns.length > 3 && (
        <Button size="small" icon={<PlusIcon />} onClick={onAddColumn}>
          Add column
        </Button>
      )}
      <datalist id={TYPES_LIST_ID}>
        {COMMON_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className={styles.secHead}>
        <h3>
          Relationships <span className={styles.count}>({rels.length})</span>
        </h3>
        <Button
          size="small"
          icon={<LinkIcon />}
          onClick={() => startLink(table.id)}
          title="Then click the table on the “many” side"
        >
          Link to another table
        </Button>
      </div>
      {rels.length ? (
        <ul className={styles.list}>
          {rels.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={styles.linkish}
                onClick={() => reveal({ kind: "rel", id: r.id })}
              >
                {relShort(diagram, r)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.help}>None yet. Tick “Foreign key” on a column, or link tables.</p>
      )}

      <div className={`${styles.actions} ${styles.actionsEnd}`}>
        <Button
          icon={<CopyIcon />}
          onClick={duplicateSelectedTable}
          title={`Duplicate (${KEYS.duplicate})`}
        >
          Duplicate table
        </Button>
        <ConfirmButton
          variant="danger"
          confirmLabel="Click again to delete"
          onConfirm={() => deleteTableWithUndo(table.id)}
        >
          Delete table
        </ConfirmButton>
      </div>
    </div>
  );
}
