"use client";

import {
  REFERENTIAL_ACTIONS,
  findTable,
  primaryKeyColumns,
  relSentence,
  singular,
  type Cardinality,
  type ReferentialAction,
  type Relationship,
} from "@/lib/model";
import { useDiagramStore } from "@/store/diagram";
import { useUiStore } from "@/store/ui";
import { toast } from "@/hooks/useToast";
import { deleteRelationshipWithUndo } from "../actions";
import { SwapIcon, TrashIcon } from "../icons";
import { Button } from "../ui/Button";
import { Checkbox, Field, Input, Select } from "../ui/Field";
import styles from "./Panel.module.css";

const SIDE_NAMES: Record<Cardinality, [string, string]> = {
  "1:N": ["One side — referenced", "Many side — holds the foreign key"],
  "1:1": ["Parent — referenced", "Child — holds the foreign key"],
  "N:M": ["Side A", "Side B"],
};

export function RelationshipEditor({ rel: r }: { rel: Relationship }) {
  const diagram = useDiagramStore((s) => s.diagram);
  const update = useDiagramStore((s) => s.updateRelationship);
  const swap = useDiagramStore((s) => s.swapRelationship);
  const createJunction = useDiagramStore((s) => s.createJunction);
  const reveal = useUiStore((s) => s.revealOnCanvas);

  const A = findTable(diagram, r.from);
  const B = findTable(diagram, r.to);
  const names = SIDE_NAMES[r.type];
  const parent = singular(A?.name ?? "parent") || "parent";
  const child = singular(B?.name ?? "child") || "child";
  const children = B?.name || "children";

  const tableOptions = diagram.tables.map((t) => (
    <option key={t.id} value={t.id}>
      {t.name || "untitled"}
    </option>
  ));

  return (
    <div data-testid="relationship-editor">
      <div className={styles.paneHead}>
        <span className={styles.kicker}>Relationship</span>
      </div>
      <p className={styles.sentence} aria-live="polite">
        {relSentence(diagram, r)}
      </p>

      <Field label="Cardinality">
        <Select
          value={r.type}
          onChange={(e) => update(r.id, { type: e.target.value as Cardinality })}
        >
          <option value="1:1">One to one (1:1)</option>
          <option value="1:N">One to many (1:N)</option>
          <option value="N:M">Many to many (N:M)</option>
        </Select>
      </Field>

      <fieldset className={styles.side}>
        <legend>{names[0]}</legend>
        <div className={styles.row2}>
          <Field label="Table">
            <Select
              value={r.from}
              onChange={(e) => {
                const t = findTable(diagram, e.target.value);
                update(r.id, {
                  from: e.target.value,
                  fromCol: t ? (primaryKeyColumns(t)[0]?.id ?? "") : "",
                });
              }}
            >
              {tableOptions}
            </Select>
          </Field>
          <Field label="Column">
            <Select value={r.fromCol} onChange={(e) => update(r.id, { fromCol: e.target.value })}>
              <option value="">Not set</option>
              {A?.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "?"}
                  {c.pk ? " (key)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className={styles.side}>
        <legend>{names[1]}</legend>
        <div className={styles.row2}>
          <Field label="Table">
            <Select value={r.to} onChange={(e) => update(r.id, { to: e.target.value })}>
              {tableOptions}
            </Select>
          </Field>
          <Field label={r.type === "N:M" ? "Column" : "Foreign key column"}>
            <Select value={r.toCol} onChange={(e) => update(r.id, { toCol: e.target.value })}>
              <option value="">Not set</option>
              {B?.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "?"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      {r.type !== "N:M" && (
        <>
          <fieldset className={styles.side}>
            <legend>Optionality</legend>
            <Checkbox
              label={`Every ${child} must have a ${parent}`}
              checked={!r.fromOptional}
              onChange={(v) => update(r.id, { fromOptional: !v })}
            />
            <Checkbox
              label={
                r.type === "1:1"
                  ? `A ${parent} can exist without a ${child}`
                  : `A ${parent} can exist without any ${children}`
              }
              checked={r.toOptional}
              onChange={(v) => update(r.id, { toOptional: v })}
            />
          </fieldset>

          <div className={styles.row2}>
            <Field label="On delete">
              <Select
                value={r.onDelete}
                onChange={(e) => update(r.id, { onDelete: e.target.value as ReferentialAction })}
              >
                {REFERENTIAL_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="On update">
              <Select
                value={r.onUpdate}
                onChange={(e) => update(r.id, { onUpdate: e.target.value as ReferentialAction })}
              >
                {REFERENTIAL_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </>
      )}

      <Field label="Label (optional)">
        <Input
          value={r.label}
          placeholder="e.g. places"
          autoComplete="off"
          onChange={(e) => update(r.id, { label: e.target.value })}
        />
      </Field>

      <div className={styles.actions}>
        <Button icon={<SwapIcon />} onClick={() => swap(r.id)}>
          Swap sides
        </Button>
        <Button
          variant="danger"
          icon={<TrashIcon />}
          onClick={() => deleteRelationshipWithUndo(r.id)}
        >
          Delete relationship
        </Button>
      </div>

      {r.type === "N:M" && (
        <div className={styles.warn} role="note">
          <p>
            A many-to-many link needs a junction table before it can be built: a table holding one
            row per pair, with a foreign key to each side.
          </p>
          <Button
            size="small"
            onClick={() => {
              const id = createJunction(r.id);
              if (!id) return;
              reveal({ kind: "table", id });
              toast(
                `Created ${findTable(useDiagramStore.getState().diagram, id)?.name ?? "junction table"}`,
              );
            }}
          >
            Create junction table
          </Button>
        </div>
      )}

      {(A || B) && (
        <div className={styles.secHead}>
          <h3>Tables</h3>
        </div>
      )}
      <ul className={styles.list}>
        {[A, B]
          .filter((t, i, arr) => t && arr.indexOf(t) === i)
          .map((t) => (
            <li key={t!.id}>
              <button
                type="button"
                className={styles.linkish}
                onClick={() => reveal({ kind: "table", id: t!.id })}
              >
                {t!.name || "untitled"}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
