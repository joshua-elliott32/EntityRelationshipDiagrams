"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { findRel, findTable } from "@/lib/model";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useDiagramStore } from "@/store/diagram";
import { useUiStore, type PanelTab } from "@/store/ui";
import { cx } from "../ui/Button";
import { EmptyPanel } from "./EmptyPanel";
import { IssuesPanel } from "./IssuesPanel";
import { RelationshipEditor } from "./RelationshipEditor";
import { TableEditor } from "./TableEditor";
import styles from "./Panel.module.css";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "issues", label: "Checks" },
];

export function SidePanel({ className }: { className?: string }) {
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const n = useAnalysis().issues.length;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onTabKey(e: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  return (
    <aside className={cx(styles.panel, className)} aria-label="Side panel">
      <div className={styles.tabs} role="tablist" aria-label="Side panel" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "issues" && (
              <>
                <span className={cx(styles.badge, n === 0 && styles.badgeOk)} aria-hidden="true">
                  {n}
                </span>
                <span className="visually-hidden">{` (${n} issue${n === 1 ? "" : "s"})`}</span>
              </>
            )}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div
          key={t.id}
          className={styles.body}
          role="tabpanel"
          id={`tabpanel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={tab !== t.id}
        >
          {tab === t.id && (t.id === "edit" ? <EditPane /> : <IssuesPanel />)}
        </div>
      ))}
    </aside>
  );
}

function EditPane() {
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const diagram = useDiagramStore((s) => s.diagram);
  const table = selection?.kind === "table" ? findTable(diagram, selection.id) : undefined;
  const rel = selection?.kind === "rel" ? findRel(diagram, selection.id) : undefined;
  const stale = !!selection && !table && !rel;
  const scrollRef = useRef<HTMLDivElement>(null);

  // The selected item disappeared (undo, delete, import): drop the selection.
  useEffect(() => {
    if (stale) select(null);
  }, [stale, select]);

  // Start each selection at the top of the panel.
  const key = table?.id ?? rel?.id ?? "none";
  useEffect(() => {
    const body = scrollRef.current?.parentElement;
    if (body) body.scrollTop = 0;
  }, [key]);

  return (
    <div ref={scrollRef}>
      {table ? (
        <TableEditor key={table.id} table={table} />
      ) : rel ? (
        <RelationshipEditor key={rel.id} rel={rel} />
      ) : (
        <EmptyPanel />
      )}
    </div>
  );
}
