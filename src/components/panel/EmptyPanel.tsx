"use client";

import { useDiagramStore } from "@/store/diagram";
import { useUiStore } from "@/store/ui";
import { loadExample } from "../actions";
import { KEYS } from "../shortcuts";
import { Button, ConfirmButton } from "../ui/Button";
import styles from "./Panel.module.css";

/** Shown when nothing is selected: how-to, the table list and diagram actions. */
export function EmptyPanel() {
  const tables = useDiagramStore((s) => s.diagram.tables);
  const rels = useDiagramStore((s) => s.diagram.rels);
  const clear = useDiagramStore((s) => s.clear);
  const reveal = useUiStore((s) => s.revealOnCanvas);

  return (
    <div className={styles.empty}>
      <h2>Build your diagram</h2>
      <ul className={styles.tips}>
        <li>
          <strong>Add table</strong> (<kbd>{KEYS.addTable}</kbd>), then click it to edit its name,
          columns and keys.
        </li>
        <li>
          To connect two tables, press <strong>Link tables</strong> (<kbd>{KEYS.link}</kbd>), click
          the table on the “one” side, then the other table. Or tick <strong>Foreign key</strong> on
          a column and pick what it references.
        </li>
        <li>Click a line to change its cardinality, optionality and delete rules.</li>
        <li>
          Drag tables to arrange them, or use Tidy up. Drag the background to pan; scroll or pinch
          to zoom.
        </li>
        <li>
          The <strong>Checks</strong> tab explains anything that breaks your target normal form.
        </li>
      </ul>

      {tables.length > 0 && (
        <>
          <div className={styles.secHead}>
            <h3>
              Tables <span className={styles.count}>({tables.length})</span>
            </h3>
          </div>
          <ul className={styles.list}>
            {tables.map((t) => {
              const n = rels.filter((r) => r.from === t.id || r.to === t.id).length;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    className={styles.linkish}
                    onClick={() => reveal({ kind: "table", id: t.id })}
                  >
                    {t.name || "untitled"}
                    <span className={styles.linkMeta}>
                      {t.columns.length} column{t.columns.length === 1 ? "" : "s"}
                      {n ? ` · ${n} link${n === 1 ? "" : "s"}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className={styles.actions}>
        <Button onClick={() => void loadExample()}>Load example</Button>
        {tables.length > 0 && (
          <ConfirmButton variant="danger" confirmLabel="Click again to clear" onConfirm={clear}>
            Clear diagram
          </ConfirmButton>
        )}
      </div>
      <p className={styles.note}>
        Your work is saved in this browser automatically. Nothing is uploaded.
      </p>
    </div>
  );
}
