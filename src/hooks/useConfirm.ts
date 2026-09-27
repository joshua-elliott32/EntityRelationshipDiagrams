"use client";

import { create } from "zustand";

/** A promise-based confirmation dialog, rendered by <ConfirmDialog>. */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface ConfirmStore {
  request: (ConfirmOptions & { resolve(ok: boolean): void }) | null;
  ask(opts: ConfirmOptions): Promise<boolean>;
  settle(ok: boolean): void;
}

export const useConfirmStore = create<ConfirmStore>()((set, get) => ({
  request: null,
  ask(opts) {
    get().request?.resolve(false);
    return new Promise<boolean>((resolve) => set({ request: { ...opts, resolve } }));
  },
  settle(ok) {
    const r = get().request;
    set({ request: null });
    r?.resolve(ok);
  },
}));

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(opts);
}
