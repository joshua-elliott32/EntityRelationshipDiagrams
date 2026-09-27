"use client";

import { useEffect, useRef } from "react";
import { useToastStore, type ToastItem } from "@/hooks/useToast";
import { useUiStore } from "@/store/ui";
import styles from "./Toaster.module.css";

const DURATION = 2800;
const DURATION_WITH_ACTION = 6000;

/**
 * Bottom-centre toasts in a polite live region. Shows messages from the local
 * toast queue (which supports an action button) and from the shared ui
 * store's `showToast`.
 */
export function Toaster() {
  const queue = useToastStore((s) => s.queue);
  const show = useToastStore((s) => s.show);
  const uiToast = useUiStore((s) => s.toast);

  // Forward each new ui-store toast once (effects may run twice in dev).
  const forwarded = useRef(0);
  useEffect(() => {
    if (!uiToast || uiToast.id === forwarded.current) return;
    forwarded.current = uiToast.id;
    show(uiToast.message);
  }, [uiToast, show]);

  return (
    <div className={styles.region} role="status" aria-live="polite" aria-atomic="false">
      {queue.map((t) => (
        <ToastView key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastView({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ms = toast.action ? DURATION_WITH_ACTION : DURATION;

  const start = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dismiss(toast.id), ms);
  };
  const pause = () => clearTimeout(timer.current);

  useEffect(() => {
    timer.current = setTimeout(() => dismiss(toast.id), ms);
    return () => clearTimeout(timer.current);
  }, [dismiss, toast.id, ms]);

  return (
    <div
      className={styles.toast}
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
    >
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className={styles.action}
          aria-label={`${toast.action.label}: ${toast.message}`}
          onClick={() => {
            toast.action!.run();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
