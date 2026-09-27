"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { METRICS, type Point } from "@/lib/geometry";
import {
  findColumn,
  findTable,
  fkRelsOf,
  MAX_ZOOM,
  MIN_ZOOM,
  type Diagram,
  type Selection,
  type Viewport,
} from "@/lib/model";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useLayout } from "@/hooks/useLayout";
import { useDiagramStore } from "@/store/diagram";
import { useSettings } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { DiagramSvg } from "./DiagramSvg";
import { loadExportFonts } from "./exportFonts";
import { sharedMeasurer } from "./measure";
import { contentBounds } from "./stableLayout";
import { clamp, fitView, isVisible, rectExit, revealView, routeRect, zoomAround } from "./viewMath";
import styles from "./canvas.module.css";

/**
 * Interactive diagram canvas: pan, zoom, drag tables, link mode, connector
 * handles, selection and hover. Fills its container. The camera lives in
 * `diagram.view` (outside undo history); a table drag is one undo step.
 */

type ColTarget = { tableId: string; colId: string };

type Gesture =
  | {
      kind: "pan";
      pointerId: number;
      sx: number;
      sy: number;
      vx: number;
      vy: number;
      moved: boolean;
      /** What a click (press without drag) does. */
      click: { rel: string } | "clear" | "cancelLink" | "none";
    }
  | {
      kind: "table";
      pointerId: number;
      tableId: string;
      sx: number;
      sy: number;
      tx: number;
      ty: number;
      moved: boolean;
    }
  | {
      kind: "connect";
      pointerId: number;
      tableId: string;
      colId: string;
      from: Point;
      target: ColTarget | null;
    }
  | { kind: "pinch"; d0: number; mid0: Point; v0: Viewport };

type Mode = "idle" | "panning" | "dragging" | "connecting";

const ZOOM_STEP = 1.2;
const DRAG_THRESHOLD = 3;
const DEFAULT_VIEW: Viewport = { x: 0, y: 0, k: 1 };

const sameSel = (a: Selection, b: Selection) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function DiagramCanvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState<Mode>("idle");
  const [band, setBand] = useState<{ from: Point; to: Point; target: ColTarget | null } | null>(
    null,
  );
  /** Pointer position in link mode, tagged with the link step it belongs to. */
  const [linkPointer, setLinkPointer] = useState<{ at: Point; step: string } | null>(null);

  const name = useDiagramStore((s) => s.diagram.name);
  const tables = useDiagramStore((s) => s.diagram.tables);
  const rels = useDiagramStore((s) => s.diagram.rels);
  const view = useDiagramStore((s) => s.diagram.view);
  const setView = useDiagramStore((s) => s.setView);
  const settings = useSettings();
  const analysis = useAnalysis();
  const selection = useUiStore((s) => s.selection);
  const hover = useUiStore((s) => s.hover);
  const linkFrom = useUiStore((s) => s.linkFrom);
  const reveal = useUiStore((s) => s.reveal);
  const layout = useLayout();

  // A diagram object that stays the same while only the camera moves.
  const diagram = useMemo<Diagram>(
    () => ({ version: 2, name, tables, rels, view: null, updatedAt: 0 }),
    [name, tables, rels],
  );

  // Mutable interaction state (never read during render).
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const frames = useRef<{ id: number; jobs: Map<string, () => void> }>({ id: 0, jobs: new Map() });
  const pendingView = useRef<Viewport | null>(null);
  const anim = useRef(0);

  // ---- container size -----------------------------------------------------
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) =>
        s.w === Math.round(r.width) && s.h === Math.round(r.height)
          ? s
          : { w: Math.round(r.width), h: Math.round(r.height) },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- camera helpers -------------------------------------------------------
  function currentView(): Viewport {
    return pendingView.current ?? useDiagramStore.getState().diagram.view ?? DEFAULT_VIEW;
  }

  function schedule(key: string, job: () => void) {
    const f = frames.current;
    f.jobs.set(key, job);
    if (!f.id) f.id = requestAnimationFrame(runFrames);
  }

  function runFrames() {
    const f = frames.current;
    if (f.id) cancelAnimationFrame(f.id);
    f.id = 0;
    const jobs = [...f.jobs.values()];
    f.jobs.clear();
    jobs.forEach((j) => j());
  }

  /** Move the camera on the next frame (coalesces rapid wheel/pointer events). */
  function queueView(v: Viewport) {
    pendingView.current = v;
    schedule("view", () => {
      const pv = pendingView.current;
      pendingView.current = null;
      if (pv) setView(pv);
    });
  }

  function commitView(v: Viewport) {
    stopAnimation();
    pendingView.current = null;
    setView(v);
  }

  function stopAnimation() {
    if (anim.current) cancelAnimationFrame(anim.current);
    anim.current = 0;
  }

  function animateTo(to: Viewport) {
    stopAnimation();
    const from = currentView();
    if (prefersReducedMotion()) return commitView(to);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 280);
      const e = 1 - Math.pow(1 - t, 3);
      setView({
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        k: from.k + (to.k - from.k) * e,
      });
      anim.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    anim.current = requestAnimationFrame(step);
  }

  function screenPoint(clientX: number, clientY: number): Point {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }

  function toWorld(clientX: number, clientY: number): Point {
    const v = currentView();
    const p = screenPoint(clientX, clientY);
    return { x: (p.x - Math.round(v.x)) / v.k, y: (p.y - Math.round(v.y)) / v.k };
  }

  function zoomBy(factor: number) {
    commitView(zoomAround(currentView(), size.w / 2, size.h / 2, factor));
  }

  function zoomReset() {
    const v = currentView();
    commitView(zoomAround(v, size.w / 2, size.h / 2, 1 / v.k));
  }

  function fitBounds() {
    if (!layout.boxes.size) return null;
    return contentBounds(rels, layout, sharedMeasurer(), 40);
  }

  function fit() {
    commitView(fitView(fitBounds(), size.w, size.h));
  }

  // New or imported diagram: fit once the container has a size.
  useEffect(() => {
    if (view !== null || size.w <= 0 || size.h <= 0) return;
    const b = layout.boxes.size ? contentBounds(rels, layout, sharedMeasurer(), 40) : null;
    setView(fitView(b, size.w, size.h));
  }, [view, size, layout, rels, setView]);

  // Warm the export font cache once the page fonts are in, so a later
  // synchronous SVG export can embed them.
  useEffect(() => {
    let cancelled = false;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    void fonts?.ready.then(() => {
      if (!cancelled) setTimeout(() => void loadExportFonts(), 1500);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up pending frames and animations on unmount.
  useEffect(() => {
    const f = frames.current;
    return () => {
      if (f.id) cancelAnimationFrame(f.id);
      if (anim.current) cancelAnimationFrame(anim.current);
    };
  }, []);

  // ---- reveal requests from the side panel -------------------------------
  const onReveal = useEffectEvent((target: Exclude<Selection, null>) => {
    let rect;
    if (target.kind === "table") rect = layout.boxes.get(target.id);
    else {
      const rt = layout.routes.get(target.id);
      rect = rt && routeRect(rt);
    }
    if (!rect || !size.w || !size.h) return;
    const v = currentView();
    if (isVisible(rect, v, size.w, size.h)) return;
    animateTo(revealView(rect, v, size.w, size.h));
  });
  useEffect(() => {
    if (reveal) onReveal(reveal.target);
  }, [reveal]);

  // ---- wheel: pan, ctrl/⌘ + wheel and trackpad pinch zoom -----------------
  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault();
    stopAnimation();
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    } else if (e.deltaMode === 2) {
      dx *= size.w;
      dy *= size.h;
    }
    const v = currentView();
    if (e.ctrlKey || e.metaKey) {
      const f = clamp(Math.exp(-dy * (Math.abs(dy) < 50 ? 0.01 : 0.002)), 0.5, 2);
      const p = screenPoint(e.clientX, e.clientY);
      queueView(zoomAround(v, p.x, p.y, f));
    } else {
      if (e.shiftKey && !dx) [dx, dy] = [dy, 0];
      queueView({ ...v, x: v.x - dx, y: v.y - dy });
    }
  });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => onWheel(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  // ---- keyboard: zoom and nudge -------------------------------------------
  // Esc during a connector drag cancels just the drag (capture phase, so the
  // shell's own Esc handling doesn't also clear the selection).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || gesture.current?.kind !== "connect") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      gesture.current = null;
      frames.current.jobs.delete("band");
      setBand(null);
      setMode("idle");
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (
      t?.closest?.("input, select, textarea, [contenteditable]:not([contenteditable='false'])") ||
      t?.isContentEditable
    )
      return;
    if (useUiStore.getState().dialog || document.querySelector("dialog[open]")) return;
    switch (e.key) {
      case "+":
      case "=":
        e.preventDefault();
        return zoomBy(ZOOM_STEP);
      case "-":
      case "_":
        e.preventDefault();
        return zoomBy(1 / ZOOM_STEP);
      case "0":
        e.preventDefault();
        return fit();
      case "1":
        e.preventDefault();
        return zoomReset();
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        const sel = useUiStore.getState().selection;
        if (sel?.kind !== "table") return;
        const store = useDiagramStore.getState();
        const tb = findTable(store.diagram, sel.id);
        if (!tb) return;
        e.preventDefault();
        const step = settings.gridSize * (e.shiftKey ? 5 : 1);
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const g = settings.gridSize;
        const snap = (n: number) => (settings.snapToGrid && g > 0 ? Math.round(n / g) * g : n);
        store.moveTable(tb.id, snap(tb.x + dx), snap(tb.y + dy));
        return;
      }
    }
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKeyDown(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // ---- pointer interaction ------------------------------------------------
  function pinchState() {
    const [a, b] = [...pointers.current.values()];
    return {
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: screenPoint((a.x + b.x) / 2, (a.y + b.y) / 2),
    };
  }

  function endCurrentGesture() {
    const g = gesture.current;
    if (!g) return;
    runFrames();
    if (g.kind === "table" && g.moved) useDiagramStore.getState().endGesture();
    if (g.kind === "connect") setBand(null);
    gesture.current = null;
    setMode("idle");
  }

  function linkClick(tableId: string) {
    const ui = useUiStore.getState();
    if (ui.linkFrom === null) return;
    if (ui.linkFrom === "" || !findTable(useDiagramStore.getState().diagram, ui.linkFrom)) {
      ui.startLink(tableId);
      return;
    }
    const id = useDiagramStore.getState().addRelationship(ui.linkFrom, tableId, {
      autoCreateFk: settings.autoCreateFkColumn,
    });
    ui.cancelLink();
    setLinkPointer(null);
    if (id) ui.select({ kind: "rel", id });
  }

  function colTargetAt(clientX: number, clientY: number, g: Gesture): ColTarget | null {
    if (g.kind !== "connect") return null;
    const el = document.elementFromPoint?.(clientX, clientY);
    const row = el?.closest("[data-col]");
    const tableEl = row?.closest("[data-table]");
    if (!row || !tableEl || !svgRef.current?.contains(row)) return null;
    const colId = row.getAttribute("data-col")!;
    const tableId = tableEl.getAttribute("data-table")!;
    if (tableId === g.tableId && colId === g.colId) return null;
    return { tableId, colId };
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    stopAnimation();
    const svg = e.currentTarget;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events (tests) can't be captured.
    }

    if (pointers.current.size === 2) {
      endCurrentGesture();
      const { d, mid } = pinchState();
      gesture.current = { kind: "pinch", d0: d, mid0: mid, v0: currentView() };
      return;
    }
    if (pointers.current.size > 2) return;

    const v = currentView();
    const pan = (click: Extract<Gesture, { kind: "pan" }>["click"]): Gesture => ({
      kind: "pan",
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      vx: v.x,
      vy: v.y,
      moved: false,
      click,
    });

    if (e.button === 1) {
      e.preventDefault();
      gesture.current = pan("none");
      return;
    }

    const el = e.target as Element;
    const tableId = el.closest("[data-table]")?.getAttribute("data-table") ?? null;
    const relId = el.closest("[data-rel]")?.getAttribute("data-rel") ?? null;
    const ui = useUiStore.getState();

    if (ui.linkFrom !== null) {
      if (tableId) {
        linkClick(tableId);
        gesture.current = null;
      } else gesture.current = pan("cancelLink");
      return;
    }

    const handle = el.closest("[data-handle]");
    const row = el.closest("[data-col]");
    if (handle && row && tableId) {
      const colId = row.getAttribute("data-col")!;
      const box = layout.boxes.get(tableId);
      if (box) {
        const side = handle.getAttribute("data-handle");
        const from = { x: side === "left" ? box.x : box.x + box.w, y: box.rowY[colId] ?? box.y };
        gesture.current = {
          kind: "connect",
          pointerId: e.pointerId,
          tableId,
          colId,
          from,
          target: null,
        };
        setBand({ from, to: from, target: null });
        setMode("connecting");
        return;
      }
    }

    if (tableId) {
      const t = findTable(useDiagramStore.getState().diagram, tableId);
      if (!t) return;
      if (!sameSel(ui.selection, { kind: "table", id: tableId }))
        ui.select({ kind: "table", id: tableId });
      gesture.current = {
        kind: "table",
        pointerId: e.pointerId,
        tableId,
        sx: e.clientX,
        sy: e.clientY,
        tx: t.x,
        ty: t.y,
        moved: false,
      };
      return;
    }

    gesture.current = pan(relId ? { rel: relId } : "clear");
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    const lf = useUiStore.getState().linkFrom;
    if (lf && (!g || g.kind === "pan")) {
      const cx = e.clientX;
      const cy = e.clientY;
      schedule("link", () => setLinkPointer({ at: toWorld(cx, cy), step: lf }));
    }
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;

    if (g.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const { d, mid } = pinchState();
      const k = clamp(g.v0.k * (d / g.d0), MIN_ZOOM, MAX_ZOOM);
      const wx = (g.mid0.x - g.v0.x) / g.v0.k;
      const wy = (g.mid0.y - g.v0.y) / g.v0.k;
      queueView({ x: mid.x - wx * k, y: mid.y - wy * k, k });
      return;
    }
    if (g.pointerId !== e.pointerId) return;

    if (g.kind === "connect") {
      const to = toWorld(e.clientX, e.clientY);
      const target = colTargetAt(e.clientX, e.clientY, g);
      g.target = target;
      schedule("band", () => setBand({ from: g.from, to, target }));
      return;
    }

    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved) {
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
      g.moved = true;
      if (g.kind === "table") useDiagramStore.getState().beginGesture();
      setMode(g.kind === "table" ? "dragging" : "panning");
    }

    if (g.kind === "table") {
      const k = currentView().k;
      const gs = settings.gridSize;
      const snap = settings.snapToGrid && !e.altKey && gs > 0;
      const s = (n: number) => (snap ? Math.round(n / gs) * gs : Math.round(n));
      const x = s(g.tx + dx / k);
      const y = s(g.ty + dy / k);
      const id = g.tableId;
      schedule("move", () => useDiagramStore.getState().moveTable(id, x, y));
    } else {
      queueView({ ...currentView(), x: g.vx + dx, y: g.vy + dy });
    }
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) {
        gesture.current = null;
        runFrames();
      }
      return;
    }
    if (g.pointerId !== e.pointerId) return;
    gesture.current = null;
    runFrames();
    setMode("idle");

    if (g.kind === "table") {
      if (g.moved) useDiagramStore.getState().endGesture();
      return;
    }

    if (g.kind === "connect") {
      setBand(null);
      const target = cancelled ? null : (colTargetAt(e.clientX, e.clientY, g) ?? g.target);
      if (target) connectColumns({ tableId: g.tableId, colId: g.colId }, target);
      return;
    }

    if (g.moved || cancelled) return;
    const ui = useUiStore.getState();
    if (g.click === "none") return;
    if (g.click === "cancelLink") {
      ui.cancelLink();
      setLinkPointer(null);
    } else if (g.click === "clear") {
      if (ui.linkFrom !== null) ui.cancelLink();
      else if (ui.selection) ui.select(null);
    } else ui.select({ kind: "rel", id: g.click.rel });
  }

  /** Drag from a foreign-key column onto the column it references. */
  function connectColumns(src: ColTarget, dst: ColTarget) {
    const store = useDiagramStore.getState();
    const d = store.diagram;
    const a = findColumn(findTable(d, src.tableId), src.colId);
    const b = findColumn(findTable(d, dst.tableId), dst.colId);
    if (!a || !b) return;
    // Dragged the other way round (key → plain column): the plain column is the FK.
    const [child, parent] = a.pk && !b.pk ? [dst, src] : [src, dst];
    store.setForeignKey(child.tableId, child.colId, {
      tableId: parent.tableId,
      columnId: parent.colId,
    });
    const r = fkRelsOf(useDiagramStore.getState().diagram, child.tableId, child.colId)[0];
    if (r) useUiStore.getState().select({ kind: "rel", id: r.id });
  }

  function hoverTarget(el: Element | null): Selection {
    const t = el?.closest("[data-table]")?.getAttribute("data-table");
    if (t) return { kind: "table", id: t };
    const r = el?.closest("[data-rel]")?.getAttribute("data-rel");
    return r ? { kind: "rel", id: r } : null;
  }

  function onPointerOver(e: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (g && g.kind !== "pan") return;
    if (g?.kind === "pan" && g.moved) return;
    const next = hoverTarget(e.target as Element);
    const ui = useUiStore.getState();
    if (!sameSel(ui.hover, next)) ui.setHover(next);
  }

  function onPointerLeave() {
    if (gesture.current) return;
    const ui = useUiStore.getState();
    if (ui.hover) ui.setHover(null);
    if (ui.linkFrom) {
      frames.current.jobs.delete("link");
      setLinkPointer(null);
    }
  }

  // ---- render ---------------------------------------------------------------
  const v = view ?? DEFAULT_VIEW;
  const tx = Math.round(v.x);
  const ty = Math.round(v.y);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gridSmall = Math.max(2, settings.gridSize * 2) * v.k;
  const gridLarge = gridSmall * 5;
  const empty = tables.length === 0;
  const linking = linkFrom !== null;

  const linkBox = linkFrom ? layout.boxes.get(linkFrom) : undefined;
  const rubber =
    linkBox && linkPointer && linkPointer.step === linkFrom
      ? { from: rectExit(linkBox, linkPointer.at), to: linkPointer.at }
      : null;
  const dropBox = band?.target ? layout.boxes.get(band.target.tableId) : undefined;
  const dropY = dropBox && band?.target ? dropBox.rowY[band.target.colId] : undefined;

  const hint =
    mode === "connecting"
      ? "Drop on the column this foreign key references."
      : linkFrom === ""
        ? "Click the table on the “one” side (the parent)."
        : linkFrom
          ? "Now click the table on the “many” side (the child that holds the foreign key)."
          : null;

  const cls = [
    styles.svg,
    linking && styles.linking,
    mode === "panning" && styles.panning,
    mode === "dragging" && styles.dragging,
    mode === "connecting" && styles.connecting,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.root}>
      <svg
        ref={svgRef}
        className={cls}
        xmlns="http://www.w3.org/2000/svg"
        role="application"
        aria-label="Diagram canvas. Drag tables to move them, drag the background to pan, Ctrl or Command and scroll to zoom."
        aria-roledescription="diagram canvas"
        data-testid="diagram-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerUp(e)}
        onPointerCancel={(e) => onPointerUp(e, true)}
        onPointerOver={onPointerOver}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => gesture.current && e.preventDefault()}
      >
        {settings.showGrid && (
          <>
            <defs>
              <pattern
                id={`${uid}-gs`}
                x={tx}
                y={ty}
                width={gridSmall}
                height={gridSmall}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M${gridSmall} 0.5H0.5V${gridSmall}`}
                  style={{ fill: "none", stroke: "var(--grid)", strokeWidth: 1 }}
                />
              </pattern>
              <pattern
                id={`${uid}-gl`}
                x={tx}
                y={ty}
                width={gridLarge}
                height={gridLarge}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M${gridLarge} 0.5H0.5V${gridLarge}`}
                  style={{ fill: "none", stroke: "var(--grid-strong)", strokeWidth: 1 }}
                />
              </pattern>
            </defs>
            {gridSmall >= 8 && <rect width="100%" height="100%" fill={`url(#${uid}-gs)`} />}
            <rect width="100%" height="100%" fill={`url(#${uid}-gl)`} />
          </>
        )}
        <g
          transform={`translate(${tx} ${ty}) scale(${v.k})`}
          style={view || empty ? undefined : { visibility: "hidden" }}
        >
          <DiagramSvg
            diagram={diagram}
            boxes={layout.boxes}
            routes={layout.routes}
            analysis={analysis}
            settings={settings}
            selection={selection}
            hover={hover}
            linkFrom={linkFrom}
            palette="screen"
            measure={sharedMeasurer()}
            interactive
          />
          <g className={styles.overlay}>
            {dropBox && dropY !== undefined && (
              <rect
                x={dropBox.x + 3.5}
                y={dropY - METRICS.ROW_H / 2 + 2.5}
                width={dropBox.w - 7}
                height={METRICS.ROW_H - 4}
                rx={3}
                style={{ fill: "var(--accent-soft)", stroke: "var(--accent)", strokeWidth: 1.5 }}
              />
            )}
            {band && (
              <>
                <path
                  d={`M${band.from.x} ${band.from.y}L${band.to.x} ${band.to.y}`}
                  style={{
                    fill: "none",
                    stroke: "var(--accent)",
                    strokeWidth: 1.5 / Math.max(v.k, 0.5),
                    strokeDasharray: "6 4",
                  }}
                />
                <circle cx={band.from.x} cy={band.from.y} r={4} style={{ fill: "var(--accent)" }} />
              </>
            )}
            {rubber && (
              <path
                d={`M${rubber.from.x} ${rubber.from.y}L${rubber.to.x} ${rubber.to.y}`}
                style={{
                  fill: "none",
                  stroke: "var(--accent)",
                  strokeWidth: 1.5 / Math.max(v.k, 0.5),
                  strokeDasharray: "6 4",
                }}
              />
            )}
          </g>
        </g>
      </svg>

      {hint && (
        <div className={styles.hint} role="status">
          {hint} <kbd>Esc</kbd> cancels.
        </div>
      )}

      {empty && (
        <div className={styles.empty}>
          <div className={styles.emptyCard}>
            <strong>Nothing here yet</strong>
            <p>
              Add a table to start sketching your schema, then link tables to show how they relate.
            </p>
          </div>
        </div>
      )}

      <div className={styles.zoom} role="group" aria-label="Zoom">
        <button
          type="button"
          className={styles.zoomBtn}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          disabled={v.k <= MIN_ZOOM + 1e-6}
          aria-label="Zoom out"
          title="Zoom out (−)"
        >
          −
        </button>
        <button
          type="button"
          className={`${styles.zoomBtn} ${styles.zoomPct}`}
          onClick={zoomReset}
          aria-label={`Zoom ${Math.round(v.k * 100)}%, reset to 100%`}
          title="Reset to 100% (1)"
        >
          {Math.round(v.k * 100)}%
        </button>
        <button
          type="button"
          className={styles.zoomBtn}
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={v.k >= MAX_ZOOM - 1e-6}
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          +
        </button>
        <button
          type="button"
          className={styles.zoomBtn}
          onClick={fit}
          disabled={empty}
          title="Fit diagram to screen (0)"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
