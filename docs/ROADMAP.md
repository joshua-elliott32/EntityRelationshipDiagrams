# Roadmap — recommended next features

Ordered by value for effort. Everything here can stay client-side.

1. **Diagram library** — keep several diagrams in IndexedDB with a "Recent"
   list, rename/duplicate/delete, instead of a single autosaved draft.
2. **Guided "fix it" actions for checks** — e.g. _Move `city` into a
   `postcodes` table_ for a 3NF issue: create the table, move the columns, add
   the foreign key, in one undoable step. The biggest differentiator for
   students learning normalisation.
3. **Multi-select** — marquee/shift-click selection, move and delete as a
   group, copy and paste tables between diagrams, align and distribute.
4. **Composite foreign keys as one relationship** — today each FK column is
   its own relationship (SQL export already merges them).
5. **Search and command palette** (Ctrl/⌘+K) — jump to a table, run any
   action; plus a minimap for large diagrams.
6. **Learn mode** — short explanations of each normal form with worked
   examples, linked from each issue.
7. **Import from CSV / spreadsheet** — infer tables, types and candidate
   functional dependencies from sample data.
8. **Snapshots / version history** — named checkpoints with visual diff.
9. **Installable offline app (PWA)** — service worker + manifest.
10. **Areas and sticky notes** — group related tables and annotate designs.
11. **Chen / UML notation** options for courses that teach them.
12. **Real-time collaboration** — would need a sync server (e.g. Yjs), so it
    breaks the "nothing leaves your browser" promise; only if there's demand.

## Known limitations

- Orthogonal lines can still cross tables that overlap or sit < ~32px apart;
  curved/straight styles don't avoid tables.
- Pointer interactions (drag, pinch, link-drag) are covered by manual checks,
  not automated tests.
- The SQL importer treats backslash as an escape inside strings (MySQL style).
