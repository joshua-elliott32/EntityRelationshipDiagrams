"use client";

import { useEffect, type RefObject } from "react";
import { create } from "zustand";

/**
 * Ask a field that may not be rendered yet to take focus once it mounts —
 * e.g. "Add table" focuses the new table's name field, "Add column" the new
 * column's name.
 */
interface FocusStore {
  key: string | null;
  request(key: string): void;
  clear(): void;
}

export const useFocusStore = create<FocusStore>()((set) => ({
  key: null,
  request: (key) => set({ key }),
  clear: () => set({ key: null }),
}));

export function requestFocus(key: string): void {
  useFocusStore.getState().request(key);
}

/** Focus (and select) `ref` when `key` is requested. */
export function useFocusOnRequest(
  key: string,
  ref: RefObject<HTMLInputElement | HTMLTextAreaElement | HTMLElement | null>,
): void {
  const wanted = useFocusStore((s) => s.key === key);
  useEffect(() => {
    if (!wanted) return;
    const el = ref.current;
    if (!el) return;
    useFocusStore.getState().clear();
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
    el.scrollIntoView?.({ block: "nearest" });
  }, [wanted, ref]);
}
