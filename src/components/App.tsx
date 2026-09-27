"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { DiagramCanvas } from "./canvas/DiagramCanvas";
import { useDiagramStore } from "@/store/diagram";
import { loadInitialDiagram, startAutosave, type InitialSource } from "@/store/persistence";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { toast } from "@/hooks/useToast";
import { Dialogs } from "./dialogs/Dialogs";
import { SidePanel } from "./panel/SidePanel";
import { ThemeSync } from "./ThemeSync";
import { Toolbar } from "./toolbar/Toolbar";
import { Toaster } from "./ui/Toaster";
import styles from "./App.module.css";

// App is only ever rendered in the browser (see AppLoader), so the saved
// diagram can be loaded before the first render instead of in an effect.
let booted: InitialSource | null = null;
function boot(): InitialSource {
  if (booted) return booted;
  const { diagram, source } = loadInitialDiagram();
  useDiagramStore.getState().load(diagram);
  booted = source;
  return source;
}

const PANEL_KEY = "erd-studio:panel-width";
const PANEL_MIN = 300;
const PANEL_MAX = 640;
const PANEL_DEFAULT = 360;

function readPanelWidth(): number {
  try {
    const v = Number(localStorage.getItem(PANEL_KEY));
    if (v >= PANEL_MIN && v <= PANEL_MAX) return v;
  } catch {
    // Storage blocked: use the default.
  }
  return PANEL_DEFAULT;
}

/** Application shell: toolbar, canvas, side panel, dialogs and toasts. */
export function App() {
  const source = boot();
  useEffect(() => startAutosave(), []);
  useKeyboardShortcuts();

  // A diagram opened from a share link: say so, and drop the (long) hash so a
  // reload opens the autosaved copy rather than the original link.
  const announced = useRef(false);
  useEffect(() => {
    if (source !== "share-link" || announced.current) return;
    announced.current = true;
    const name = useDiagramStore.getState().diagram.name;
    toast(`Opened “${name}” from a shared link. It’s saved in this browser now.`);
    history.replaceState(null, "", location.pathname + location.search);
  }, [source]);

  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, String(panelWidth));
    } catch {
      // Not important.
    }
  }, [panelWidth]);

  return (
    <div className={styles.app}>
      <ThemeSync />
      <Toolbar />
      <div className={styles.main} style={{ "--panel-w": `${panelWidth}px` } as CSSProperties}>
        <main className={styles.stage} data-canvas-stage="" aria-label="Diagram canvas">
          <DiagramCanvas />
        </main>
        <PanelResizer width={panelWidth} onChange={setPanelWidth} />
        <SidePanel className={styles.panel} />
      </div>
      <Dialogs />
      <Toaster />
    </div>
  );
}

function PanelResizer({ width, onChange }: { width: number; onChange(w: number): void }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const clamp = (w: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, w)));

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, w: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    onChange(clamp(drag.current.w + (drag.current.x - e.clientX)));
  }
  function onPointerUp() {
    drag.current = null;
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === "ArrowLeft") onChange(clamp(width + step));
    else if (e.key === "ArrowRight") onChange(clamp(width - step));
    else if (e.key === "Home") onChange(PANEL_MAX);
    else if (e.key === "End") onChange(PANEL_MIN);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      className={styles.resizer}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize side panel"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(PANEL_DEFAULT)}
      title="Drag to resize · double-click to reset"
    />
  );
}
