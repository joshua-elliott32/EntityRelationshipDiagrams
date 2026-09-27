import { normalizeDiagram, sampleDiagram, type Diagram } from "@/lib/model";
import { fromShareHash } from "@/lib/io";
import { useDiagramStore } from "./diagram";

export const DRAFT_KEY = "erd-studio:diagram";

/** Copy of the saved diagram taken just before a share link replaced it. */
export const BEFORE_SHARE_KEY = "erd-studio:diagram-before-share-link";

export type InitialSource = "share-link" | "draft" | "sample";

export interface InitialDiagram {
  diagram: Diagram;
  source: InitialSource;
  /**
   * When a share link is opened, the diagram that was already saved in this
   * browser. It is also copied to BEFORE_SHARE_KEY so opening a link can
   * never silently destroy someone's own work.
   */
  previous?: Diagram;
}

function readDraft(): Diagram | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? normalizeDiagram(JSON.parse(raw)) : null;
  } catch {
    // Corrupt or unavailable storage.
    return null;
  }
}

/** Keep a copy of the user's own diagram before a share link replaces it. */
export function backupBeforeShare(d: Diagram): void {
  try {
    localStorage.setItem(BEFORE_SHARE_KEY, JSON.stringify(d));
  } catch {
    // Storage full or blocked: the in-memory undo step still protects it.
  }
}

/**
 * Open a share link while the app is already running (the user pasted it
 * into the address bar of an open tab). The current diagram stays one undo
 * step away and is backed up. Returns false if the hash isn't a share link.
 */
export function openShareHash(hash: string): boolean {
  const shared = fromShareHash(hash);
  if (!shared) return false;
  const store = useDiagramStore.getState();
  backupBeforeShare(store.diagram);
  store.load(shared, { keepHistory: true });
  return true;
}

/** Pick the diagram to open: a share link in the URL, then the saved draft, then the example. */
export function loadInitialDiagram(): InitialDiagram {
  const draft = readDraft();
  if (typeof window !== "undefined" && window.location.hash) {
    const shared = fromShareHash(window.location.hash);
    if (shared) {
      if (!draft) return { diagram: shared, source: "share-link" };
      backupBeforeShare(draft);
      return { diagram: shared, source: "share-link", previous: draft };
    }
  }
  if (draft) return { diagram: draft, source: "draft" };
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
