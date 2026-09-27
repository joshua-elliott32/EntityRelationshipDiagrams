"use client";

import { create } from "zustand";

/**
 * Local toast queue. The shared ui store's `showToast` only takes a message;
 * this adds an optional action button (e.g. "Undo"). The <Toaster> also
 * forwards messages sent through the ui store, so both paths show up.
 */
export interface ToastAction {
  label: string;
  run(): void;
}

export interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
}

interface ToastStore {
  queue: ToastItem[];
  show(message: string, action?: ToastAction): number;
  dismiss(id: number): void;
}

/** At most this many toasts are visible at once; older ones drop off. */
const MAX_VISIBLE = 3;
let seq = 0;

export const useToastStore = create<ToastStore>()((set) => ({
  queue: [],
  show(message, action) {
    const id = ++seq;
    set((s) => ({ queue: [...s.queue, { id, message, action }].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss(id) {
    set((s) => ({ queue: s.queue.filter((t) => t.id !== id) }));
  },
}));

/** Show a toast from anywhere (event handlers, async exports…). */
export function toast(message: string, action?: ToastAction): number {
  return useToastStore.getState().show(message, action);
}
