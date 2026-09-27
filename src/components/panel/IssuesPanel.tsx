"use client";

import { useState } from "react";
import type { Issue, Severity } from "@/lib/analysis";
import { findRel, findTable, relShort } from "@/lib/model";
import { NORMAL_FORMS, type NormalForm } from "@/lib/settings/types";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useDiagramStore } from "@/store/diagram";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { Segmented } from "../ui/Field";
import panel from "./Panel.module.css";
import styles from "./IssuesPanel.module.css";

const SEVERITY_TITLES: Record<Severity, string> = {
  error: "Problems",
  warning: "Possible problems",
  info: "Suggestions",
};
const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

export const FORM_LABELS: Record<NormalForm, string> = {
  none: "None",
  "1NF": "1NF",
  "2NF": "2NF",
  "3NF": "3NF",
  BCNF: "BCNF",
};

type Grouping = "severity" | "table";

/** The Checks tab: status, target normal form and the list of issues. */
export function IssuesPanel() {
  const analysis = useAnalysis();
  const diagram = useDiagramStore((s) => s.diagram);
  const target = useSettingsStore((s) => s.settings.targetNormalForm);
  const update = useSettingsStore((s) => s.update);
  const reveal = useUiStore((s) => s.revealOnCanvas);
  const [grouping, setGrouping] = useState<Grouping>("severity");
  const { issues } = analysis;

  const groups: { key: string; title: string; items: Issue[] }[] = [];
  if (grouping === "severity") {
    for (const sev of SEVERITY_ORDER) {
      const items = issues.filter((i) => i.severity === sev);
      if (items.length) groups.push({ key: sev, title: SEVERITY_TITLES[sev], items });
    }
  } else {
    const byKey = new Map<string, Issue[]>();
    for (const i of issues) {
      const k = i.tableId ?? (i.relId ? `rel:${i.relId}` : "diagram");
      byKey.set(k, [...(byKey.get(k) ?? []), i]);
    }
    byKey.forEach((items, k) => {
      let title = "Whole diagram";
      if (k.startsWith("rel:")) {
        const r = findRel(diagram, k.slice(4));
        title = r ? relShort(diagram, r) : "Relationship";
      } else if (k !== "diagram") {
        title = findTable(diagram, k)?.name || "untitled";
      }
      groups.push({ key: k, title, items });
    });
  }

  function open(i: Issue) {
    if (i.relId && findRel(diagram, i.relId)) reveal({ kind: "rel", id: i.relId });
    else if (i.tableId && findTable(diagram, i.tableId)) reveal({ kind: "table", id: i.tableId });
  }

  const highest = analysis.highestForm === "none" ? "none yet" : analysis.highestForm;

  return (
    <div data-testid="issues-panel">
      <div className={styles.head}>
        <p className={styles.summary} aria-live="polite">
          {target === "none" ? (
            <>Normal-form checks are off.</>
          ) : analysis.meetsTarget ? (
            <>
              <span className={styles.good}>Meets {target}</span>
              {analysis.highestForm !== target && analysis.highestForm !== "none" && (
                <span className={styles.muted}> (and {analysis.highestForm})</span>
              )}
            </>
          ) : (
            <>
              Highest form met: <strong>{highest}</strong>
              <span className={styles.muted}> — target {target}</span>
            </>
          )}
        </p>
        <label className={styles.target}>
          <span>Target</span>
          <select
            value={target}
            onChange={(e) => update({ targetNormalForm: e.target.value as NormalForm })}
            aria-label="Target normal form"
          >
            {NORMAL_FORMS.map((f) => (
              <option key={f} value={f}>
                {FORM_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {issues.length === 0 ? (
        <div className={panel.ok}>
          <strong>
            {target === "none" ? "Nothing to report." : "No normalisation problems found."}
          </strong>
          <p>
            {target === "none"
              ? "Pick a target normal form above to check your design against it."
              : "Every table has a key, nothing holds a list or repeats, and no column depends on part of a key or on a non-key column."}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <p className={styles.count}>
              {issues.length} thing{issues.length === 1 ? "" : "s"} to look at
            </p>
            <Segmented<Grouping>
              label="Group issues by"
              hideLabel
              size="small"
              value={grouping}
              onChange={setGrouping}
              options={[
                { value: "severity", label: "Severity" },
                { value: "table", label: "Table" },
              ]}
            />
          </div>
          {groups.map((g) => (
            <section key={g.key} className={styles.group} aria-label={g.title}>
              <h3 className={styles.groupTitle}>
                {g.title} <span className={styles.muted}>({g.items.length})</span>
              </h3>
              <ul className={styles.issues}>
                {g.items.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      className={`${styles.issue} ${styles[i.severity]}`}
                      onClick={() => open(i)}
                    >
                      <span className={styles.tags}>
                        <span className={styles.chip}>{i.rule}</span>
                        {!i.certain && <span className={styles.maybe}>Possible</span>}
                        {grouping === "severity" && i.tableId && (
                          <span className={styles.where}>
                            {findTable(diagram, i.tableId)?.name}
                          </span>
                        )}
                      </span>
                      <strong>{i.message}</strong>
                      {i.fix && <span className={styles.fix}>{i.fix}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <p className={panel.note}>
        Checks use your primary keys, the “Holds a list” and “Determined by” settings, your
        relationships and hints from column names. Hints are marked “Possible” — you decide whether
        they apply. Click an issue to show it on the diagram.
      </p>
    </div>
  );
}
