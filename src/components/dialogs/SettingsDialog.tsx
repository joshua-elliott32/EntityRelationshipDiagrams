"use client";

import type {
  LineStyle,
  NamingConvention,
  NormalForm,
  Notation,
  SqlDialect,
  ThemePref,
} from "@/lib/settings/types";
import { SQL_DIALECT_LABELS } from "@/lib/io";
import { useSettingsStore } from "@/store/settings";
import { Button } from "../ui/Button";
import { Checkbox, Field, Segmented, Select } from "../ui/Field";
import { Dialog } from "../ui/Dialog";
import styles from "./Dialogs.module.css";

export const NF_HELP: Record<NormalForm, string> = {
  none: "No normal-form checks — only the key, relationship and naming checks you turn on below.",
  "1NF":
    "Every table has a primary key and each cell holds one value (no lists or repeating groups).",
  "2NF": "1NF, and no column depends on only part of a composite key.",
  "3NF": "2NF, and no column depends on another non-key column (like city on postcode).",
  BCNF: "3NF, and every column that decides another is itself a key. The strictest check here.",
};

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const s = useSettingsStore((st) => st.settings);
  const update = useSettingsStore((st) => st.update);
  const reset = useSettingsStore((st) => st.reset);

  return (
    <Dialog
      title="Settings"
      description="Changes apply straight away and are remembered in this browser."
      onClose={onClose}
      testId="settings-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={reset} className={styles.footLeft}>
            Reset to defaults
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <section className={styles.section} aria-labelledby="set-appearance">
        <h3 id="set-appearance">Appearance</h3>
        <Segmented<ThemePref>
          label="Theme"
          value={s.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <Segmented<Notation>
          label="Notation"
          value={s.notation}
          onChange={(notation) => update({ notation })}
          options={[
            { value: "crowsfoot", label: "Crow’s foot" },
            { value: "numeric", label: "1 / N labels" },
          ]}
        />
        <Segmented<LineStyle>
          label="Line style"
          value={s.lineStyle}
          onChange={(lineStyle) => update({ lineStyle })}
          options={[
            { value: "orthogonal", label: "Orthogonal" },
            { value: "curved", label: "Curved" },
            { value: "straight", label: "Straight" },
          ]}
        />
        <div className={styles.checks}>
          <Checkbox
            label="Show data types"
            checked={s.showDataTypes}
            onChange={(showDataTypes) => update({ showDataTypes })}
          />
          <Checkbox
            label="Show grid"
            checked={s.showGrid}
            onChange={(showGrid) => update({ showGrid })}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="set-checks">
        <h3 id="set-checks">Checks</h3>
        <Field label="Target normal form" hint={NF_HELP[s.targetNormalForm]}>
          <Select
            value={s.targetNormalForm}
            onChange={(e) => update({ targetNormalForm: e.target.value as NormalForm })}
          >
            <option value="none">None — checks off</option>
            <option value="1NF">First normal form (1NF)</option>
            <option value="2NF">Second normal form (2NF)</option>
            <option value="3NF">Third normal form (3NF)</option>
            <option value="BCNF">Boyce–Codd normal form (BCNF)</option>
          </Select>
        </Field>
        <div className={styles.checks}>
          <Checkbox
            label="Show possible issues"
            hint="Hints guessed from column names, like phone_1 and phone_2."
            checked={s.showHeuristics}
            onChange={(showHeuristics) => update({ showHeuristics })}
          />
          <Checkbox
            label="Key and relationship checks"
            hint="Missing keys, foreign keys pointing nowhere, mismatched types."
            checked={s.designChecks}
            onChange={(designChecks) => update({ designChecks })}
          />
          <Checkbox
            label="Highlight issues on the canvas"
            hint="Paint flagged columns yellow and badge their tables."
            checked={s.highlightIssues}
            onChange={(highlightIssues) => update({ highlightIssues })}
          />
        </div>
        <Field label="Naming convention">
          <Select
            value={s.namingConvention}
            onChange={(e) => update({ namingConvention: e.target.value as NamingConvention })}
          >
            <option value="off">Off — don’t check names</option>
            <option value="snake_case">snake_case</option>
            <option value="camelCase">camelCase</option>
            <option value="PascalCase">PascalCase</option>
          </Select>
        </Field>
      </section>

      <section className={styles.section} aria-labelledby="set-editing">
        <h3 id="set-editing">Editing</h3>
        <div className={styles.inlineRow}>
          <Checkbox
            label="Snap to grid"
            checked={s.snapToGrid}
            onChange={(snapToGrid) => update({ snapToGrid })}
          />
          <Field label="Grid size" inline className={styles.compactField}>
            <Select
              value={String(s.gridSize)}
              disabled={!s.snapToGrid}
              onChange={(e) => update({ gridSize: Number(e.target.value) })}
            >
              <option value="5">5 px</option>
              <option value="10">10 px</option>
              <option value="20">20 px</option>
            </Select>
          </Field>
        </div>
        <Checkbox
          label="Create a foreign-key column when linking tables"
          hint="Adds customer_id to orders when you link customers → orders and no such column exists."
          checked={s.autoCreateFkColumn}
          onChange={(autoCreateFkColumn) => update({ autoCreateFkColumn })}
        />
      </section>

      <section className={styles.section} aria-labelledby="set-export">
        <h3 id="set-export">Export</h3>
        <Field label="Default SQL dialect">
          <Select
            value={s.sqlDialect}
            onChange={(e) => update({ sqlDialect: e.target.value as SqlDialect })}
          >
            {(Object.keys(SQL_DIALECT_LABELS) as SqlDialect[]).map((d) => (
              <option key={d} value={d}>
                {SQL_DIALECT_LABELS[d]}
              </option>
            ))}
          </Select>
        </Field>
      </section>
    </Dialog>
  );
}
