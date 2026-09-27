"use client";

import { Fragment } from "react";
import { SHORTCUT_GROUPS } from "../shortcuts";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import styles from "./Dialogs.module.css";

export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  return (
    <Dialog
      title="Keyboard shortcuts"
      description="Shortcuts don’t fire while you’re typing in a field."
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose} data-autofocus>
          Close
        </Button>
      }
    >
      {SHORTCUT_GROUPS.map((g) => (
        <section key={g.title} className={styles.shortcutGroup}>
          <h3>{g.title}</h3>
          <dl className={styles.shortcutList}>
            {g.items.map((it) => (
              <Fragment key={it.label}>
                <dt>
                  {it.keys.map((k, i) => (
                    <Fragment key={k}>
                      {i > 0 && <span aria-hidden="true">/</span>}
                      <kbd className={styles.kbd}>{k}</kbd>
                    </Fragment>
                  ))}
                </dt>
                <dd>{it.label}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      ))}
    </Dialog>
  );
}
