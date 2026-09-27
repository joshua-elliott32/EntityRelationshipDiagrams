import { create } from "zustand";
import { produce, type Draft } from "immer";
import {
  blankDiagram,
  findColumn,
  findTable,
  fkRelsOf,
  makeColumn,
  makeRelationship,
  makeTable,
  primaryKeyColumns,
  singular,
  uniqueColumnName,
  uniqueTableName,
  type Column,
  type ColumnRef,
  type Diagram,
  type Relationship,
  type Table,
  type Viewport,
} from "@/lib/model";

/**
 * The diagram store. All edits go through the actions below so that undo /
 * redo, autosave and the checker see every change.
 *
 * History: each action pushes the previous diagram onto `past` (immer's
 * structural sharing keeps that cheap). Rapid edits with the same
 * `coalesce` key — typing into one field — collapse into one undo step.
 * Drags are wrapped in beginGesture()/endGesture() so a whole drag is one step.
 * The camera (`diagram.view`) is never part of history.
 */

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

export interface AddRelationshipOptions {
  /** Add a `<parent>_id` column to the child when no matching FK column exists. */
  autoCreateFk?: boolean;
  type?: Relationship["type"];
}

interface HistoryOpts {
  /** Merge with the previous step if it had the same key and was recent. */
  coalesce?: string;
  /** Skip history entirely (camera moves). */
  skipHistory?: boolean;
}

export interface DiagramStore {
  diagram: Diagram;
  past: Diagram[];
  future: Diagram[];

  undo(): void;
  redo(): void;
  /** Start a drag: intermediate moves won't create history steps. */
  beginGesture(): void;
  /** Finish a drag: records a single step if anything changed. */
  endGesture(): void;

  /** Replace the whole diagram (open, import, new). Clears history unless keepHistory. */
  load(d: Diagram, opts?: { keepHistory?: boolean }): void;
  rename(name: string): void;
  setView(v: Viewport): void;

  addTable(at?: { x: number; y: number }, name?: string): string;
  updateTable(id: string, patch: Partial<Pick<Table, "name" | "note" | "color">>): void;
  moveTable(id: string, x: number, y: number): void;
  /** Move many tables at once (auto-layout). */
  setPositions(pos: Map<string, { x: number; y: number }>): void;
  duplicateTable(id: string): string | null;
  deleteTable(id: string): void;

  addColumn(tableId: string, patch?: Partial<Omit<Column, "id">>, index?: number): string;
  updateColumn(tableId: string, colId: string, patch: Partial<Omit<Column, "id">>): void;
  moveColumn(tableId: string, colId: string, toIndex: number): void;
  deleteColumn(tableId: string, colId: string): void;

  /**
   * Mark a column as a foreign key referencing `ref`, or un-mark it (null).
   * Creates, re-points or removes the backing relationship.
   */
  setForeignKey(tableId: string, colId: string, ref: ColumnRef | null): void;

  /** Link parent `fromId` (one side) to child `toId` (many side). Returns the new rel id. */
  addRelationship(fromId: string, toId: string, opts?: AddRelationshipOptions): string;
  updateRelationship(id: string, patch: Partial<Omit<Relationship, "id">>): void;
  swapRelationship(id: string): void;
  deleteRelationship(id: string): void;
  /** Replace an N:M relationship with a junction table and two 1:N links. Returns the table id. */
  createJunction(relId: string): string | null;

  clear(): void;
}

let lastKey: string | null = null;
let lastAt = 0;
let gestureStart: Diagram | null = null;

export const useDiagramStore = create<DiagramStore>()((set, get) => {
  /** Apply an immer recipe to the diagram and record history. */
  function mutate(recipe: (d: Draft<Diagram>) => void, opts: HistoryOpts = {}): void {
    const prev = get().diagram;
    const next = produce(prev, (d) => {
      recipe(d);
      if (!opts.skipHistory) d.updatedAt = Date.now();
    });
    if (next === prev) return;
    if (opts.skipHistory || gestureStart) {
      set({ diagram: next });
      return;
    }
    const now = Date.now();
    const merge = !!opts.coalesce && opts.coalesce === lastKey && now - lastAt < COALESCE_MS;
    lastKey = opts.coalesce ?? null;
    lastAt = now;
    set((s) => ({
      diagram: next,
      past: merge ? s.past : [...s.past, prev].slice(-HISTORY_LIMIT),
      future: [],
    }));
  }

  const table = (d: Draft<Diagram>, id: string) => d.tables.find((t) => t.id === id);

  return {
    diagram: blankDiagram(),
    past: [],
    future: [],

    undo() {
      const { past, diagram, future } = get();
      if (!past.length) return;
      lastKey = null;
      const prev = { ...past[past.length - 1], view: diagram.view };
      set({ diagram: prev, past: past.slice(0, -1), future: [diagram, ...future] });
    },
    redo() {
      const { past, diagram, future } = get();
      if (!future.length) return;
      lastKey = null;
      const next = { ...future[0], view: diagram.view };
      set({ diagram: next, past: [...past, diagram], future: future.slice(1) });
    },
    beginGesture() {
      gestureStart = get().diagram;
    },
    endGesture() {
      const start = gestureStart;
      gestureStart = null;
      if (!start) return;
      const cur = get().diagram;
      if (cur.tables === start.tables && cur.rels === start.rels && cur.name === start.name) return;
      lastKey = null;
      set((s) => ({ past: [...s.past, start].slice(-HISTORY_LIMIT), future: [] }));
    },

    load(d, opts) {
      lastKey = null;
      gestureStart = null;
      set((s) => ({
        diagram: d,
        past: opts?.keepHistory ? [...s.past, s.diagram].slice(-HISTORY_LIMIT) : [],
        future: [],
      }));
    },
    rename(name) {
      mutate((d) => void (d.name = name), { coalesce: "doc-name" });
    },
    setView(v) {
      mutate((d) => void (d.view = v), { skipHistory: true });
    },

    addTable(at, name) {
      const d0 = get().diagram;
      const off = (d0.tables.length % 5) * 20;
      const t = makeTable(
        name ?? uniqueTableName(d0),
        Math.round(((at?.x ?? 40) + off) / 10) * 10,
        Math.round(((at?.y ?? 40) + off) / 10) * 10,
        {
          columns: [makeColumn("id", "INT", { pk: true })],
        },
      );
      mutate((d) => void d.tables.push(t));
      return t.id;
    },
    updateTable(id, patch) {
      mutate(
        (d) => {
          const t = table(d, id);
          if (t) Object.assign(t, patch);
        },
        { coalesce: `table:${id}:${Object.keys(patch).join()}` },
      );
    },
    moveTable(id, x, y) {
      mutate((d) => {
        const t = table(d, id);
        if (t && (t.x !== x || t.y !== y)) {
          t.x = x;
          t.y = y;
        }
      });
    },
    setPositions(pos) {
      mutate((d) => {
        for (const t of d.tables) {
          const p = pos.get(t.id);
          if (p) {
            t.x = p.x;
            t.y = p.y;
          }
        }
      });
    },
    duplicateTable(id) {
      const src = findTable(get().diagram, id);
      if (!src) return null;
      const colMap = new Map<string, string>();
      const copy = makeTable(
        uniqueTableName(get().diagram, `${src.name}_copy`),
        src.x + 40,
        src.y + 40,
        {
          color: src.color,
          note: src.note,
          columns: src.columns.map(({ id: oldId, ...c }) => {
            const nc = makeColumn(c.name, c.type, c);
            colMap.set(oldId, nc.id);
            return nc;
          }),
        },
      );
      for (const c of copy.columns) c.determinedBy = c.determinedBy.map((x) => colMap.get(x) ?? x);
      mutate((d) => void d.tables.push(copy));
      return copy.id;
    },
    deleteTable(id) {
      mutate((d) => {
        d.tables = d.tables.filter((t) => t.id !== id);
        d.rels = d.rels.filter((r) => r.from !== id && r.to !== id);
      });
    },

    addColumn(tableId, patch, index) {
      const c = makeColumn("", "VARCHAR(100)", patch);
      mutate((d) => {
        const t = table(d, tableId);
        if (!t) return;
        if (index == null || index < 0 || index > t.columns.length) t.columns.push(c);
        else t.columns.splice(index, 0, c);
      });
      return c.id;
    },
    updateColumn(tableId, colId, patch) {
      const textOnly = Object.keys(patch).every(
        (k) => k === "name" || k === "type" || k === "note" || k === "defaultValue",
      );
      mutate(
        (d) => {
          const c = table(d, tableId)?.columns.find((x) => x.id === colId);
          if (c) Object.assign(c, patch);
        },
        textOnly ? { coalesce: `col:${colId}:${Object.keys(patch).join()}` } : {},
      );
    },
    moveColumn(tableId, colId, toIndex) {
      mutate((d) => {
        const t = table(d, tableId);
        if (!t) return;
        const i = t.columns.findIndex((c) => c.id === colId);
        if (i < 0 || toIndex < 0 || toIndex >= t.columns.length || toIndex === i) return;
        const [c] = t.columns.splice(i, 1);
        t.columns.splice(toIndex, 0, c);
      });
    },
    deleteColumn(tableId, colId) {
      mutate((d) => {
        const t = table(d, tableId);
        if (!t) return;
        t.columns = t.columns.filter((c) => c.id !== colId);
        for (const c of t.columns) c.determinedBy = c.determinedBy.filter((x) => x !== colId);
        for (const r of d.rels) {
          if (r.from === tableId && r.fromCol === colId) r.fromCol = "";
          if (r.to === tableId && r.toCol === colId) r.toCol = "";
        }
      });
    },

    setForeignKey(tableId, colId, ref) {
      const d0 = get().diagram;
      const existing = fkRelsOf(d0, tableId, colId);
      const col = findColumn(findTable(d0, tableId), colId);
      if (!col) return;
      if (!ref) {
        const ids = new Set(existing.map((r) => r.id));
        mutate((d) => void (d.rels = d.rels.filter((r) => !ids.has(r.id))));
        return;
      }
      const parent = findTable(d0, ref.tableId);
      if (!parent) return;
      const refCol = findColumn(parent, ref.columnId);
      const keep = existing[0];
      // An existing column-less link between the same tables becomes this FK.
      const conceptual = keep
        ? undefined
        : d0.rels.find(
            (r) => r.from === ref.tableId && r.to === tableId && !r.toCol && r.type !== "N:M",
          );
      const newRel =
        keep || conceptual
          ? null
          : makeRelationship(ref.tableId, tableId, { fromOptional: col.nullable });
      mutate((d) => {
        const drop = new Set(existing.slice(1).map((r) => r.id));
        d.rels = d.rels.filter((r) => !drop.has(r.id));
        const target = keep ?? conceptual;
        const r = target
          ? d.rels.find((x) => x.id === target.id)!
          : (d.rels.push(newRel!), d.rels[d.rels.length - 1]);
        r.from = ref.tableId;
        r.fromCol = ref.columnId;
        r.to = tableId;
        r.toCol = colId;
        const c = table(d, tableId)?.columns.find((x) => x.id === colId);
        if (c && !c.type.trim() && refCol) c.type = fkTypeFor(refCol.type);
      });
    },

    addRelationship(fromId, toId, opts = {}) {
      const d0 = get().diagram;
      const A = findTable(d0, fromId);
      const B = findTable(d0, toId);
      if (!A || !B) return "";
      const pks = primaryKeyColumns(A);
      const pk = pks[0];
      const wanted = new Set(
        [
          pk && pk.name !== "id" ? pk.name : "",
          `${singular(A.name)}_id`,
          `${A.name.toLowerCase()}_id`,
          A === B ? "parent_id" : "",
        ]
          .filter(Boolean)
          .map((s) => s.toLowerCase()),
      );
      let fk = B.columns.find((c) => c !== pk && wanted.has(c.name.toLowerCase()));
      let newCol: Column | null = null;
      if (!fk && opts.autoCreateFk && pk && pks.length === 1 && opts.type !== "N:M") {
        const base = A === B ? "parent_id" : pk.name !== "id" ? pk.name : `${singular(A.name)}_id`;
        newCol = makeColumn(uniqueColumnName(B, base), fkTypeFor(pk.type), { nullable: A === B });
        fk = newCol;
      }
      const type = opts.type ?? "1:N";
      const r = makeRelationship(A.id, B.id, {
        type,
        fromCol: pk?.id ?? "",
        toCol: type === "N:M" ? "" : (fk?.id ?? ""),
        fromOptional: fk?.nullable ?? false,
      });
      mutate((d) => {
        if (newCol) table(d, toId)?.columns.push(newCol);
        d.rels.push(r);
      });
      return r.id;
    },
    updateRelationship(id, patch) {
      mutate(
        (d) => {
          const r = d.rels.find((x) => x.id === id);
          if (!r) return;
          Object.assign(r, patch);
          if (patch.from !== undefined && patch.fromCol === undefined) r.fromCol = "";
          if (patch.to !== undefined && patch.toCol === undefined) r.toCol = "";
        },
        patch.label !== undefined && Object.keys(patch).length === 1
          ? { coalesce: `rel:${id}:label` }
          : {},
      );
    },
    swapRelationship(id) {
      mutate((d) => {
        const r = d.rels.find((x) => x.id === id);
        if (!r) return;
        [r.from, r.to] = [r.to, r.from];
        [r.fromCol, r.toCol] = [r.toCol, r.fromCol];
        [r.fromOptional, r.toOptional] = [r.toOptional, r.fromOptional];
      });
    },
    deleteRelationship(id) {
      mutate((d) => void (d.rels = d.rels.filter((r) => r.id !== id)));
    },
    createJunction(relId) {
      const d0 = get().diagram;
      const r = d0.rels.find((x) => x.id === relId);
      const A = r && findTable(d0, r.from);
      const B = r && findTable(d0, r.to);
      if (!r || !A || !B) return null;
      const pa = primaryKeyColumns(A)[0];
      const pb = primaryKeyColumns(B)[0];
      let na = pa && pa.name !== "id" ? pa.name : `${singular(A.name)}_id`;
      let nb = pb && pb.name !== "id" ? pb.name : `${singular(B.name)}_id`;
      if (na === nb) {
        na = `${singular(A.name)}_${na}`;
        nb = `${singular(B.name)}_${nb}`;
      }
      const ca = makeColumn(na, fkTypeFor(pa?.type ?? "INT"), { pk: true });
      const cb = makeColumn(nb, fkTypeFor(pb?.type ?? "INT"), { pk: true });
      const J = makeTable(
        uniqueTableName(d0, `${singular(A.name)}_${singular(B.name)}`),
        Math.round((A.x + B.x) / 2 / 10) * 10,
        Math.round(
          (Math.max(A.y, B.y) + 60 + 24 * Math.max(A.columns.length, B.columns.length)) / 10,
        ) * 10,
        { columns: [ca, cb] },
      );
      mutate((d) => {
        d.tables.push(J);
        d.rels = d.rels.filter((x) => x.id !== relId);
        d.rels.push(
          makeRelationship(A.id, J.id, { fromCol: pa?.id ?? "", toCol: ca.id, label: r.label }),
        );
        d.rels.push(makeRelationship(B.id, J.id, { fromCol: pb?.id ?? "", toCol: cb.id }));
      });
      return J.id;
    },

    clear() {
      mutate((d) => {
        d.tables = [];
        d.rels = [];
      });
    },
  };
});

/** Auto-increment key types become their plain integer type on the FK side. */
export function fkTypeFor(pkType: string): string {
  const t = pkType.trim().toUpperCase();
  if (t === "SERIAL") return "INT";
  if (t === "BIGSERIAL") return "BIGINT";
  if (t === "SMALLSERIAL") return "SMALLINT";
  return pkType;
}

/** Convenience selectors. */
export const useDiagram = () => useDiagramStore((s) => s.diagram);
export const useCanUndo = () => useDiagramStore((s) => s.past.length > 0);
export const useCanRedo = () => useDiagramStore((s) => s.future.length > 0);
