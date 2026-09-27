import { normalizeDiagram, sampleDiagram, type Diagram } from "@/lib/model";
import { fromShareHash } from "@/lib/io";
import { useDiagramStore } from "./diagram";

export const DRAFT_KEY = "erd-studio:diagram";

export type InitialSource = "share-link" | "draft" | "sample";

/** Pick the diagram to open: a share link in the URL, then the saved draft, then the example. */
export function loadInitialDiagram(): { diagram: Diagram; source: InitialSource } {
  if (typeof window !== "undefined" && window.location.hash) {
    const shared = fromShareHash(window.location.hash);
    if (shared) return { diagram: shared, source: "share-link" };
  }
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { diagram: normalizeDiagram(JSON.parse(raw)), source: "draft" };
  } catch {
    // Corrupt or unavailable storage: fall through to the example.
  }
  return { diagram: sampleDiagram(), source: "sample" };
}

/** Save the diagram to localStorage shortly after every change. Returns an unsubscribe. */
export function startAutosave(delay = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(useDiagramStore.getState().diagram));
    } catch {
      // Quota exceeded or storage blocked — nothing useful to do.
    }
  };
  const unsub = useDiagramStore.subscribe((s, prev) => {
    if (s.diagram === prev.diagram) return;
    clearTimeout(timer);
    timer = setTimeout(save, delay);
  });
  const flush = () => {
    clearTimeout(timer);
    save();
  };
  window.addEventListener("pagehide", flush);
  return () => {
    unsub();
    window.removeEventListener("pagehide", flush);
    flush();
  };
}
