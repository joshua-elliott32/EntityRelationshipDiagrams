"use client";

import { analyze, type AnalysisResult } from "@/lib/analysis";
import { autoLayout, layoutTables, type TextMeasurer } from "@/lib/geometry";
import { downloadFile, slugify, toJson, toXlsx } from "@/lib/io";
import {
  blankDiagram,
  findRel,
  findTable,
  relShort,
  sampleDiagram,
  type Diagram,
} from "@/lib/model";
import { useDiagramStore } from "@/store/diagram";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { createCanvasMeasurer } from "@/components/canvas/measure";
import { confirmAction } from "@/hooks/useConfirm";
import { requestFocus } from "@/hooks/useFocusRequest";
import { toast } from "@/hooks/useToast";

/**
 * Imperative app actions shared by the toolbar, menus, side panel and
 * keyboard shortcuts. They read the stores directly so they can run from
 * any event handler.
 */

/** Marks the element that wraps the canvas, so actions can find its size. */
export const STAGE_ATTR = "data-canvas-stage";

const diagram = () => useDiagramStore.getState();
const ui = () => useUiStore.getState();
const settings = () => useSettingsStore.getState().settings;

let measurer: TextMeasurer | null = null;
export function getMeasurer(): TextMeasurer {
  if (!measurer) measurer = createCanvasMeasurer();
  return measurer;
}

export function currentAnalysis(d: Diagram = diagram().diagram): AnalysisResult {
  const s = settings();
  return analyze(d, {
    target: s.targetNormalForm,
    heuristics: s.showHeuristics,
    designChecks: s.designChecks,
    naming: s.namingConvention,
  });
}

/** Offer to undo the change that produced `after`, if nothing changed since. */
function undoAction(after: Diagram) {
  return {
    label: "Undo",
    run() {
      if (diagram().diagram === after) diagram().undo();
      else toast("Something else changed since — use Undo in the toolbar.");
    },
  };
}

// ---------------------------------------------------------------------------
// Tables

/** World coordinates of the centre of the visible canvas, if known. */
export function visibleCentre(): { x: number; y: number } | null {
  const v = diagram().diagram.view;
  const el = typeof document !== "undefined" ? document.querySelector(`[${STAGE_ATTR}]`) : null;
  if (!v || !el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 40 || r.height < 40) return null;
  return { x: (r.width / 2 - v.x) / v.k, y: (r.height / 2 - v.y) / v.k };
}

/** Size reserved for a brand-new table (one `id` column) when looking for free space. */
const NEW_W = 200;
const NEW_H = 80;
const GAP = 24;

/** The nearest spot to `want` (top-left) where a new table doesn't overlap another. */
export function findFreeSpot(
  want: { x: number; y: number },
  boxes: { x: number; y: number; w: number; h: number }[],
): { x: number; y: number } {
  const free = (x: number, y: number) =>
    boxes.every(
      (b) =>
        x + NEW_W + GAP <= b.x ||
        b.x + b.w + GAP <= x ||
        y + NEW_H + GAP <= b.y ||
        b.y + b.h + GAP <= y,
    );
  const step = 40;
  for (let ring = 0; ring <= 12; ring++) {
    const candidates: { x: number; y: number }[] = [];
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        candidates.push({ x: want.x + i * step, y: want.y + j * step });
      }
    }
    candidates.sort(
      (a, b) => Math.hypot(a.x - want.x, a.y - want.y) - Math.hypot(b.x - want.x, b.y - want.y),
    );
    const hit = candidates.find((p) => free(p.x, p.y));
    if (hit) return hit;
  }
  return want;
}

/** Add a table where the user is looking, select it and focus its name. */
export function addTableAtCentre(): string {
  const d = diagram().diagram;
  const c = visibleCentre();
  const boxes = [
    ...layoutTables(d, getMeasurer(), { showDataTypes: settings().showDataTypes }).values(),
  ];
  let want: { x: number; y: number };
  if (c) {
    want = { x: c.x - NEW_W / 2, y: c.y - NEW_H / 2 };
  } else if (boxes.length) {
    // Camera unknown: place it to the right of everything else.
    want = {
      x: Math.max(...boxes.map((b) => b.x + b.w)) + 60,
      y: Math.min(...boxes.map((b) => b.y)),
    };
  } else {
    want = { x: 40, y: 40 };
  }
  const spot = findFreeSpot(want, boxes);
  // The store staggers new tables by (count % 5) * 20; cancel that out.
  const off = (d.tables.length % 5) * 20;
  const id = diagram().addTable({ x: spot.x - off, y: spot.y - off });
  if (c) ui().select({ kind: "table", id });
  else ui().revealOnCanvas({ kind: "table", id });
  requestFocus(`table-name:${id}`);
  return id;
}

export function duplicateSelectedTable(): void {
  const sel = ui().selection;
  if (sel?.kind !== "table") return;
  const src = findTable(diagram().diagram, sel.id);
  const id = diagram().duplicateTable(sel.id);
  if (!id || !src) return;
  ui().select({ kind: "table", id });
  const copy = findTable(diagram().diagram, id);
  toast(`Duplicated ${src.name} as ${copy?.name ?? "a copy"}`);
}

export function deleteTableWithUndo(id: string): void {
  const t = findTable(diagram().diagram, id);
  if (!t) return;
  diagram().deleteTable(id);
  ui().select(null);
  toast(`Deleted ${t.name || "table"}`, undoAction(diagram().diagram));
}

export function deleteRelationshipWithUndo(id: string): void {
  const r = findRel(diagram().diagram, id);
  if (!r) return;
  const label = relShort(diagram().diagram, r);
  diagram().deleteRelationship(id);
  ui().select(null);
  toast(`Deleted ${label}`, undoAction(diagram().diagram));
}

/** Delete whatever is selected (undoable). */
export function deleteSelection(): boolean {
  const sel = ui().selection;
  if (!sel) return false;
  if (sel.kind === "table") deleteTableWithUndo(sel.id);
  else deleteRelationshipWithUndo(sel.id);
  return true;
}

/** "Tidy up": auto-layout every table as one undo step. The camera stays put. */
export function tidyUp(): void {
  const d = diagram().diagram;
  if (!d.tables.length) {
    toast("Add a table first.");
    return;
  }
  try {
    const boxes = layoutTables(d, getMeasurer(), { showDataTypes: settings().showDataTypes });
    const pos = autoLayout(d, boxes);
    diagram().setPositions(pos);
  } catch {
    toast("Couldn’t tidy up this diagram.");
    return;
  }
  const after = diagram().diagram;
  if (after === d) toast("Already tidy.");
  else toast("Tidied up the layout", undoAction(after));
}

// ---------------------------------------------------------------------------
// Whole-diagram actions

/** Replace the diagram, keeping history so Undo brings the old one back. */
export function replaceDiagram(d: Diagram, message: string): void {
  ui().cancelLink();
  ui().select(null);
  diagram().load(d, { keepHistory: true });
  toast(message, undoAction(diagram().diagram));
}

/** Give an imported diagram tidy positions before it is loaded (one undo step). */
export function withAutoLayout(d: Diagram): Diagram {
  if (!d.tables.length) return d;
  try {
    const boxes = layoutTables(d, getMeasurer(), { showDataTypes: settings().showDataTypes });
    const pos = autoLayout(d, boxes);
    return {
      ...d,
      tables: d.tables.map((t) => {
        const p = pos.get(t.id);
        return p ? { ...t, x: p.x, y: p.y } : t;
      }),
      view: null,
    };
  } catch {
    return { ...d, view: null };
  }
}

export async function newDiagram(): Promise<void> {
  const d = diagram().diagram;
  if (d.tables.length) {
    const ok = await confirmAction({
      title: "Start a new diagram?",
      message: `This replaces “${d.name}”. You can bring it back with Undo, or export it first.`,
      confirmLabel: "New diagram",
      danger: true,
    });
    if (!ok) return;
  }
  replaceDiagram(blankDiagram(), "Started a new diagram");
}

export async function loadExample(): Promise<void> {
  const d = diagram().diagram;
  if (d.tables.length) {
    const ok = await confirmAction({
      title: "Load the example?",
      message: `This replaces “${d.name}” with the shop example. You can bring it back with Undo.`,
      confirmLabel: "Load example",
    });
    if (!ok) return;
  }
  replaceDiagram(sampleDiagram(), "Loaded the shop example");
}

// ---------------------------------------------------------------------------
// Exports

function fileBase(): string {
  return slugify(diagram().diagram.name);
}

function needTables(): boolean {
  if (diagram().diagram.tables.length) return true;
  toast("Add a table first.");
  return false;
}

export function exportJson(): void {
  const name = `${fileBase()}.json`;
  try {
    downloadFile(name, toJson(diagram().diagram), "application/json");
    toast(`Saved ${name}`);
  } catch {
    toast("Couldn’t create the diagram file.");
  }
}

function imageOptions() {
  const s = settings();
  return { settings: s, analysis: currentAnalysis(), includeIssues: s.highlightIssues };
}

// The image exporter pulls in react-dom/server, so it is loaded on demand.
const loadImageExport = () => import("@/lib/export/image");

export async function exportPng(): Promise<void> {
  if (!needTables()) return;
  const name = `${fileBase()}.png`;
  try {
    const { toPngBlob } = await loadImageExport();
    const blob = await toPngBlob(diagram().diagram, imageOptions(), 2);
    downloadFile(name, blob, "image/png");
    toast(`Saved ${name}`);
  } catch {
    toast("Couldn’t draw the image. Try the vector image (.svg) instead.");
  }
}

export async function exportSvg(): Promise<void> {
  if (!needTables()) return;
  const name = `${fileBase()}.svg`;
  try {
    const d = diagram().diagram;
    const { loadExportFonts, toSvgString } = await loadImageExport();
    // Embed the page fonts so text fits its boxes wherever the file is opened.
    await loadExportFonts(d);
    const svg = toSvgString(d, imageOptions());
    if (!svg) throw new Error("empty");
    downloadFile(name, svg, "image/svg+xml");
    toast(`Saved ${name}`);
  } catch {
    toast("Couldn’t draw the vector image.");
  }
}

export async function exportXlsx(): Promise<void> {
  if (!needTables()) return;
  const name = `${fileBase()}.xlsx`;
  toast("Building workbook…");
  try {
    const d = diagram().diagram;
    const blob = await toXlsx(d, currentAnalysis(d));
    downloadFile(name, blob);
    toast(`Saved ${name}`);
  } catch {
    toast("Couldn’t build the Excel workbook.");
  }
}
