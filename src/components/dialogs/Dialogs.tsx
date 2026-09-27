"use client";

import { useUiStore } from "@/store/ui";
import { CodeExportDialog } from "./CodeExportDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { ImportDialog } from "./ImportDialog";
import { SettingsDialog } from "./SettingsDialog";
import { ShareDialog } from "./ShareDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";

/** Renders whichever dialog the ui store says is open. */
export function Dialogs() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);
  return (
    <>
      {dialog === "settings" && <SettingsDialog onClose={close} />}
      {dialog === "import" && <ImportDialog onClose={close} />}
      {dialog === "export-code" && <CodeExportDialog onClose={close} />}
      {dialog === "share" && <ShareDialog onClose={close} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={close} />}
      <ConfirmDialog />
    </>
  );
}
