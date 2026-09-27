"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Issue } from "@/lib/analysis";
import {
  findColumn,
  findTable,
  fkRelsOf,
  foreignKeyOf,
  type Column,
  type Table,
} from "@/lib/model";
import { useFocusOnRequest } from "@/hooks/useFocusRequest";
import { useDiagramStore } from "@/store/diagram";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, CloseIcon } from "../icons";
import { Button, cx } from "../ui/Button";
import { Checkbox, Field, Input, Select, TextArea } from "../ui/Field";
import { defaultRefColumn, guessReference } from "./fk";
import styles from "./ColumnCard.module.css";

export const TYPES_LIST_ID = "erd-column-types";

interface ColumnCardProps {
  table: Table;
  column: Column;
  index: number;
  /** Highlight with the yellow bar (the checker mentions this column). */
  flagged?: boolean;
  /** Issues that mention this column, shown in short under the card. */
  issues?: Issue[];
}

/** One column in the table editor: name, type, keys, foreign key, dependencies. */
export function ColumnCard({ table, column: c, index, flagged, issues = [] }: ColumnCardProps) {
  const updateColumn = useDiagramStore((s) => s.updateColumn);
  const moveColumn = useDiagramStore((s) => s.moveColumn);
  const deleteColumn = useDiagramStore((s) => s.deleteColumn);
  const target = useSettingsStore((s) => s.settings.targetNormalForm);
  const nameRef = useRef<HTMLInputElement>(null);
  useFocusOnRequest(`column-name:${c.id}`, nameRef);

  const [moreOpen, setMoreOpen] = useState(() => !!(c.defaultValue || c.note));
  const label = c.name || "unnamed column";
  const set = (patch: Partial<Omit<Column, "id">>) => updateColumn(table.id, c.id, patch);
  const count = table.columns.length;

  return (
    <div
      className={cx(styles.card, flagged && styles.flagged)}
      data-column-id={c.id}
      data-testid="column-card"
    >
      <div className={styles.row}>
        <input
          ref={nameRef}
          className={cx(styles.input, styles.name)}
          value={c.name}
          placeholder="column_name"
          aria-label="Column name"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => set({ name: e.target.value })}
        />
        <input
          className={cx(styles.input, styles.type)}
          value={c.type}
          list={TYPES_LIST_ID}
          placeholder="TYPE"
          aria-label={`Data type of ${label}`}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => set({ type: e.target.value })}
        />
        <div className={styles.rowTools}>
          <Button
            size="small"
            variant="ghost"
            iconOnly
            icon={<ArrowUpIcon />}
            aria-label={`Move ${label} up`}
            title="Move up"
            disabled={index === 0}
            onClick={() => moveColumn(table.id, c.id, index - 1)}
          />
          <Button
            size="small"
            variant="ghost"
            iconOnly
            icon={<ArrowDownIcon />}
            aria-label={`Move ${label} down`}
            title="Move down"
            disabled={index === count - 1}
            onClick={() => moveColumn(table.id, c.id, index + 1)}
          />
          <Button
            size="small"
            variant="ghost"
            iconOnly
            icon={<CloseIcon />}
            aria-label={`Delete ${label}`}
            title="Delete column"
            className={styles.del}
            onClick={() => deleteColumn(table.id, c.id)}
          />
        </div>
      </div>

      <div className={styles.flags}>
        <Checkbox
          label="Primary key"
          checked={c.pk}
          onChange={(v) => set(v ? { pk: true, nullable: false, determinedBy: [] } : { pk: false })}
        />
        <Checkbox label="Unique" checked={c.unique} onChange={(v) => set({ unique: v })} />
        <Checkbox
          label="Can be empty"
          checked={c.nullable}
          disabled={c.pk}
          onChange={(v) => set({ nullable: v })}
        />
        <Checkbox label="Holds a list" checked={c.multi} onChange={(v) => set({ multi: v })} />
        <ForeignKeyControl table={table} column={c} />
      </div>

      {!c.pk && target !== "none" && count > 1 && <DeterminedBy table={table} column={c} />}

      <div className={styles.more}>
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={moreOpen}
          aria-label={`More options for ${label}`}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <ChevronDownIcon className={styles.chev} />
          More
          {!moreOpen && (c.defaultValue || c.note) && (
            <span className={styles.moreHint}>
              {[c.defaultValue && "default", c.note && "note"].filter(Boolean).join(", ")}
            </span>
          )}
        </button>
        {moreOpen && (
          <div className={styles.moreBody}>
            <Field label="Default value">
              <Input
                className="mono"
                value={c.defaultValue}
                placeholder="e.g. 0 or CURRENT_DATE"
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => set({ defaultValue: e.target.value })}
              />
            </Field>
            <Field label="Note">
              <TextArea
                rows={2}
                value={c.note}
                placeholder="What this column holds"
                onChange={(e) => set({ note: e.target.value })}
              />
            </Field>
          </div>
        )}
      </div>

      {issues.length > 0 && (
        <ul className={styles.issues} aria-label={`Checks for ${label}`}>
          {issues.map((i) => (
            <li key={i.id}>
              <span className={styles.rule}>{i.rule}</span> {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ForeignKeyControl({ table, column: c }: { table: Table; column: Column }) {
  const diagram = useDiagramStore((s) => s.diagram);
  const setForeignKey = useDiagramStore((s) => s.setForeignKey);
  const reveal = useUiStore((s) => s.revealOnCanvas);
  const ref = foreignKeyOf(diagram, table.id, c.id);
  const rel = ref ? fkRelsOf(diagram, table.id, c.id)[0] : undefined;
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const tableSel = useId();
  const colSel = useId();

  const isFk = !!ref;
  const parent = ref ? findTable(diagram, ref.tableId) : undefined;
  const parentCol = parent && ref ? findColumn(parent, ref.columnId) : undefined;

  function toggle(on: boolean) {
    if (!on) {
      setPending(false);
      setEditing(false);
      if (isFk) setForeignKey(table.id, c.id, null);
      return;
    }
    const guess = guessReference(diagram, table.id, c);
    if (guess) {
      setForeignKey(table.id, c.id, guess);
      setEditing(false);
    } else {
      setPending(true);
      setEditing(true);
    }
  }

  function pickTable(tableId: string) {
    if (!tableId) return;
    const t = findTable(diagram, tableId);
    setForeignKey(table.id, c.id, { tableId, columnId: defaultRefColumn(t) });
    setPending(false);
  }

  const showEditor = pending || (isFk && editing);
  const summary = parent ? `${parent.name}.${parentCol?.name ?? "?"}` : "";

  // Rendered inside the card's flags grid: the checkbox takes one cell, the
  // summary / editor spans the full width underneath.
  return (
    <>
      <Checkbox label="Foreign key" checked={isFk || pending} onChange={toggle} />
      {isFk && !showEditor && (
        <div className={styles.fkSummary}>
          <span className={styles.fkRef} title={`References ${summary}`}>
            → {summary}
          </span>
          <button type="button" className={styles.textBtn} onClick={() => setEditing(true)}>
            Change
          </button>
          {rel && (
            <button
              type="button"
              className={styles.textBtn}
              onClick={() => reveal({ kind: "rel", id: rel.id })}
            >
              Relationship
            </button>
          )}
        </div>
      )}
      {showEditor && (
        <div className={styles.fkEditor}>
          <span className={styles.fkTitle}>References</span>
          <div className={styles.fkGrid}>
            <label className={styles.sub} htmlFor={tableSel}>
              Table
            </label>
            <Select
              id={tableSel}
              value={ref?.tableId ?? ""}
              onChange={(e) => pickTable(e.target.value)}
            >
              {!ref && <option value="">Choose a table…</option>}
              {diagram.tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || "untitled"}
                  {t.id === table.id ? " (this table)" : ""}
                </option>
              ))}
            </Select>
            <label className={styles.sub} htmlFor={colSel}>
              Column
            </label>
            <Select
              id={colSel}
              value={ref?.columnId ?? ""}
              disabled={!ref}
              onChange={(e) =>
                ref &&
                setForeignKey(table.id, c.id, { tableId: ref.tableId, columnId: e.target.value })
              }
            >
              <option value="">Not set</option>
              {parent?.columns.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.name || "?"}
                  {pc.pk ? " (key)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <p className={styles.fkHint}>
            {pending
              ? "Pick the table this column points at. Its primary key is chosen for you."
              : "Unticking Foreign key removes this relationship."}
          </p>
          {isFk && (
            <button type="button" className={styles.textBtn} onClick={() => setEditing(false)}>
              Done
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function DeterminedBy({ table, column: c }: { table: Table; column: Column }) {
  const updateColumn = useDiagramStore((s) => s.updateColumn);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const others = table.columns.filter((o) => o.id !== c.id);
  const chosen = c.determinedBy
    .map((id) => table.columns.find((o) => o.id === id))
    .filter((x): x is Column => !!x);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function toggle(id: string, on: boolean) {
    const next = on
      ? [...c.determinedBy.filter((x) => x !== id), id]
      : c.determinedBy.filter((x) => x !== id);
    // Keep the table's column order so the summary reads naturally.
    const order = new Map(table.columns.map((o, i) => [o.id, i]));
    next.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    updateColumn(table.id, c.id, { determinedBy: next });
  }

  return (
    <div
      className={styles.dep}
      ref={rootRef}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <span className={styles.depLabel} id={`${popId}-label`}>
        Determined by
      </span>
      <button
        type="button"
        className={styles.depBtn}
        aria-expanded={open}
        aria-controls={popId}
        aria-labelledby={`${popId}-label ${popId}-value`}
        onClick={() => setOpen((o) => !o)}
      >
        <span id={`${popId}-value`} className={styles.depValue}>
          {chosen.length ? chosen.map((o) => o.name || "?").join(" + ") : "The primary key"}
        </span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div id={popId} className={styles.depPop} role="group" aria-label="Determined by">
          <p className={styles.depHelp}>
            Tick the column(s) whose value decides this one. Leave all unticked for “the primary
            key” — the usual case.
          </p>
          {others.map((o) => (
            <Checkbox
              key={o.id}
              className={styles.depItem}
              label={<span className="mono">{o.name || "?"}</span>}
              checked={c.determinedBy.includes(o.id)}
              onChange={(v) => toggle(o.id, v)}
            />
          ))}
          {chosen.length > 0 && (
            <button
              type="button"
              className={styles.textBtn}
              onClick={() => updateColumn(table.id, c.id, { determinedBy: [] })}
            >
              Reset to the primary key
            </button>
          )}
        </div>
      )}
    </div>
  );
}
