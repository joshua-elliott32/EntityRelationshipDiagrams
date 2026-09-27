import { create } from "zustand";
import type { Selection } from "@/lib/model";

export type PanelTab = "edit" | "issues";

export type DialogKind = "import" | "export-code" | "settings" | "shortcuts" | "share" | null;

export interface Toast {
  id: number;
  message: string;
}

interface UiStore {
  selection: Selection;
  tab: PanelTab;
  /** Link mode: null = off; "" = waiting for the first table; otherwise the parent table id. */
  linkFrom: string | null;
  dialog: DialogKind;
  toast: Toast | null;
  /** Hovered relationship or table, for highlighting connected lines. */
  hover: Selection;

  select(sel: Selection): void;
  setTab(tab: PanelTab): void;
  startLink(fromTableId?: string): void;
  cancelLink(): void;
  openDialog(d: DialogKind): void;
  closeDialog(): void;
  showToast(message: string): void;
  setHover(h: Selection): void;
}

let toastSeq = 0;

export const useUiStore = create<UiStore>()((set) => ({
  selection: null,
  tab: "edit",
  linkFrom: null,
  dialog: null,
  toast: null,
  hover: null,

  select: (selection) => set(selection ? { selection, tab: "edit" } : { selection }),
  setTab: (tab) => set({ tab }),
  startLink: (fromTableId) => set({ linkFrom: fromTableId ?? "" }),
  cancelLink: () => set({ linkFrom: null }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  showToast: (message) => set({ toast: { id: ++toastSeq, message } }),
  setHover: (hover) => set({ hover }),
}));
