"use client";

import { useConfirmStore } from "@/hooks/useConfirm";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

/** Renders the pending `confirmAction()` request, if any. */
export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const settle = useConfirmStore((s) => s.settle);
  if (!request) return null;
  return (
    <Dialog
      title={request.title}
      size="narrow"
      onClose={() => settle(false)}
      onSubmit={() => settle(true)}
      footer={
        <>
          <Button onClick={() => settle(false)}>Cancel</Button>
          <Button type="submit" variant={request.danger ? "danger" : "primary"} data-autofocus>
            {request.confirmLabel ?? "OK"}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{request.message}</p>
    </Dialog>
  );
}
