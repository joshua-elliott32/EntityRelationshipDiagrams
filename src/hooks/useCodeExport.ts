"use client";

import { create } from "zustand";
import { useUiStore } from "@/store/ui";

/** Which text format the "SQL / Mermaid / DBML" export dialog shows. */
export type CodeFormat = "sql" | "mermaid" | "dbml";

interface CodeExportStore {
  format: CodeFormat;
  setFormat(f: CodeFormat): void;
}

export const useCodeExportStore = create<CodeExportStore>()((set) => ({
  format: "sql",
  setFormat: (format) => set({ format }),
}));

export function openCodeExport(format: CodeFormat): void {
  useCodeExportStore.getState().setFormat(format);
  useUiStore.getState().openDialog("export-code");
}
