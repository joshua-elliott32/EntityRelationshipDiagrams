"use client";

import { useEffect } from "react";
import { DiagramCanvas } from "./canvas/DiagramCanvas";
import { useDiagramStore } from "@/store/diagram";
import { loadInitialDiagram, startAutosave } from "@/store/persistence";

// App is only ever rendered in the browser (see AppLoader), so the saved
// diagram can be loaded before the first render instead of in an effect.
let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  useDiagramStore.getState().load(loadInitialDiagram().diagram);
}

/**
 * Application shell: toolbar, canvas, side panel, dialogs.
 * OWNER: shell subagent. Replace this placeholder layout.
 */
export function App() {
  boot();
  useEffect(() => startAutosave(), []);
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <DiagramCanvas />
    </div>
  );
}
