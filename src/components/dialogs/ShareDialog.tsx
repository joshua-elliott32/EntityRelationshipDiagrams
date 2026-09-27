"use client";

import { useMemo, useRef } from "react";
import { SHARE_URL_WARN_LENGTH, toShareHash } from "@/lib/io";
import { toast } from "@/hooks/useToast";
import { useDiagramStore } from "@/store/diagram";
import { CopyIcon } from "../icons";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Field";
import { copyText } from "./CodeExportDialog";
import styles from "./Dialogs.module.css";

/** Links longer than this may be cut off by some chat apps and browsers. */
const LONG_URL = SHARE_URL_WARN_LENGTH;

export function ShareDialog({ onClose }: { onClose(): void }) {
  const diagram = useDiagramStore((s) => s.diagram);
  const inputRef = useRef<HTMLInputElement>(null);

  const url = useMemo(() => {
    try {
      const hash = toShareHash(diagram);
      if (!hash) return "";
      return location.origin + location.pathname + hash;
    } catch {
      return "";
    }
  }, [diagram]);

  async function copy() {
    const ok = await copyText(url, inputRef.current);
    toast(ok ? "Link copied" : "Couldn’t copy — select the link and copy it.");
  }

  return (
    <Dialog
      title="Share a link"
      description="The whole diagram is packed into the link itself. Nothing is uploaded — whoever opens it gets their own copy to edit."
      onClose={onClose}
      testId="share-dialog"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={<CopyIcon />} disabled={!url} onClick={() => void copy()}>
            Copy link
          </Button>
        </>
      }
    >
      {url ? (
        <>
          <div className={styles.urlRow}>
            <Input
              ref={inputRef}
              value={url}
              readOnly
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              data-autofocus
            />
          </div>
          <p className={styles.meta}>
            {url.length.toLocaleString()} characters · {diagram.tables.length} table
            {diagram.tables.length === 1 ? "" : "s"}
          </p>
          {url.length > LONG_URL && (
            <p className={styles.long} role="note">
              This link is very long. Some chat apps and older browsers cut long links short — if it
              doesn’t open, export a diagram file (.json) and send that instead.
            </p>
          )}
          <p className={styles.help} style={{ marginTop: 12, marginBottom: 0 }}>
            Changes you make after copying aren’t included — copy a fresh link to share them.
          </p>
        </>
      ) : (
        <p className={styles.help}>
          Couldn’t make a share link for this diagram. Export a diagram file (.json) and send that
          instead.
        </p>
      )}
    </Dialog>
  );
}
