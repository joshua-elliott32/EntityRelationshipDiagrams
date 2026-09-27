"use client";

import { useDiagramStore, useCanRedo, useCanUndo } from "@/store/diagram";
import { useUiStore } from "@/store/ui";
import { addTableAtCentre, tidyUp } from "../actions";
import { KEYS } from "../shortcuts";
import { Button } from "../ui/Button";
import {
  GearIcon,
  LinkIcon,
  PlusIcon,
  RedoIcon,
  ShareIcon,
  TidyIcon,
  UndoIcon,
  UploadIcon,
} from "../icons";
import { CheckStatus } from "./CheckStatus";
import { ExportMenu } from "./ExportMenu";
import { MoreMenu } from "./MoreMenu";
import styles from "./Toolbar.module.css";

export function Toolbar() {
  const name = useDiagramStore((s) => s.diagram.name);
  const rename = useDiagramStore((s) => s.rename);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const linking = useUiStore((s) => s.linkFrom !== null);
  const startLink = useUiStore((s) => s.startLink);
  const cancelLink = useUiStore((s) => s.cancelLink);
  const openDialog = useUiStore((s) => s.openDialog);

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">
          <svg viewBox="0 0 20 20" width="20" height="20">
            <rect x="1.5" y="2.5" width="8" height="6" rx="1.5" />
            <rect x="10.5" y="11.5" width="8" height="6" rx="1.5" />
            <path d="M5.5 8.5v5.5h5" fill="none" />
          </svg>
        </span>
        <input
          className={styles.name}
          value={name}
          onChange={(e) => rename(e.target.value)}
          onBlur={(e) => {
            if (!e.target.value.trim()) rename("Untitled diagram");
          }}
          aria-label="Diagram name"
          spellCheck={false}
          autoComplete="off"
          maxLength={120}
        />
      </div>

      <div className={styles.tools} role="toolbar" aria-label="Diagram tools">
        <div className={styles.group}>
          <Button
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => addTableAtCentre()}
            title={`Add a table (${KEYS.addTable})`}
          >
            Add table
          </Button>
          <Button
            icon={<LinkIcon />}
            aria-pressed={linking}
            collapseLabel
            onClick={() => (linking ? cancelLink() : startLink())}
            title={`Click the “one” side, then the other table (${KEYS.link})`}
          >
            Link tables
          </Button>
        </div>

        <div className={styles.group}>
          <Button
            iconOnly
            variant="ghost"
            icon={<UndoIcon />}
            aria-label="Undo"
            title={`Undo (${KEYS.undo})`}
            disabled={!canUndo}
            onClick={undo}
          />
          <Button
            iconOnly
            variant="ghost"
            icon={<RedoIcon />}
            aria-label="Redo"
            title={`Redo (${KEYS.redo})`}
            disabled={!canRedo}
            onClick={redo}
          />
          <Button
            icon={<TidyIcon />}
            collapseLabel
            onClick={tidyUp}
            title="Arrange the tables automatically"
          >
            Tidy up
          </Button>
        </div>

        <div className={styles.group}>
          <CheckStatus />
        </div>

        <div className={styles.group}>
          <ExportMenu />
          <Button
            icon={<UploadIcon />}
            collapseLabel
            onClick={() => openDialog("import")}
            title="Open a diagram file or SQL script"
          >
            Import
          </Button>
          <Button
            icon={<ShareIcon />}
            collapseLabel
            onClick={() => openDialog("share")}
            title="Share a link to this diagram"
          >
            Share
          </Button>
          <Button
            iconOnly
            variant="ghost"
            icon={<GearIcon />}
            aria-label="Settings"
            title="Settings"
            onClick={() => openDialog("settings")}
          />
          <MoreMenu />
        </div>
      </div>
    </header>
  );
}
