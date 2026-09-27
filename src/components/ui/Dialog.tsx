"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button, cx } from "./Button";
import { CloseIcon } from "../icons";
import styles from "./Dialog.module.css";

interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "normal" | "wide" | "narrow";
  /** Rendered as a <form method="dialog">-like form; submit calls this. */
  onSubmit?(): void;
  className?: string;
  testId?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog built on the native <dialog> element: the rest of the page is
 * inert, Escape closes it, Tab is trapped inside and focus returns to where
 * it was when the dialog closes. Mount it only while open.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  size = "normal",
  onSubmit,
  className,
  testId,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const previous = document.activeElement as HTMLElement | null;
    if (typeof dlg.showModal === "function") {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
    }
    // Focus the first field (or the first button) rather than the close button.
    const first =
      dlg.querySelector<HTMLElement>("[data-autofocus]") ??
      dlg.querySelector<HTMLElement>(
        ".dialog-body input:not([type=hidden]), .dialog-body select, .dialog-body textarea, .dialog-body button",
      );
    first?.focus();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    dlg.addEventListener("cancel", onCancel);
    return () => {
      dlg.removeEventListener("cancel", onCancel);
      if (typeof dlg.close === "function" && dlg.open) dlg.close();
      if (previous && previous.isConnected) previous.focus();
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key === "Escape") {
      // jsdom and older browsers don't fire "cancel"; handle it here too.
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const els = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const body = (
    <>
      <header className={styles.head}>
        <div>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description && (
            <p id={descId} className={styles.desc}>
              {description}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          iconOnly
          icon={<CloseIcon />}
          aria-label="Close"
          onClick={onClose}
        />
      </header>
      <div className={cx(styles.body, "dialog-body")}>{children}</div>
      {footer && <footer className={styles.foot}>{footer}</footer>}
    </>
  );

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, styles[size], className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-testid={testId}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        // A press on the backdrop (the dialog element itself, outside its box) closes it.
        if (e.target !== ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const inside =
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
        if (!inside) onClose();
      }}
    >
      {onSubmit ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {body}
        </form>
      ) : (
        <div className={styles.form}>{body}</div>
      )}
    </dialog>
  );
}
