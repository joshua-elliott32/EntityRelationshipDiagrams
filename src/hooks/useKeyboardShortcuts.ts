"use client";

import { useEffect } from "react";
import { useDiagramStore } from "@/store/diagram";
import { useUiStore } from "@/store/ui";
import {
  addTableAtCentre,
  deleteSelection,
  duplicateSelectedTable,
  exportJson,
} from "@/components/actions";

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);

/** Typing into this element: native text editing (incl. its own undo) wins. */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Any form control: single-letter shortcuts are ignored here. */
export function isFormControl(el: Element | null): boolean {
  if (!el) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

function modalOpen(): boolean {
  return !!document.querySelector("dialog[open]") || useUiStore.getState().dialog !== null;
}

/**
 * Global keyboard shortcuts. Canvas keys (+ − 0 1 and arrows) are handled by
 * the canvas itself.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = (e.target instanceof Element ? e.target : null) ?? document.activeElement;
      const typing = isTextEntry(target);
      const inControl = isFormControl(target);
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const store = useDiagramStore.getState();
      const ui = useUiStore.getState();

      if (modalOpen()) return;

      if (mod && !e.altKey) {
        if (key === "s") {
          e.preventDefault();
          exportJson();
          return;
        }
        if (typing) return;
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
          return;
        }
        if (key === "y" && !e.shiftKey) {
          e.preventDefault();
          store.redo();
          return;
        }
        if (key === "d" && !e.shiftKey) {
          if (ui.selection?.kind === "table") {
            e.preventDefault();
            duplicateSelectedTable();
          }
          return;
        }
        return;
      }

      if (e.key === "Escape") {
        if (ui.linkFrom !== null) {
          e.preventDefault();
          ui.cancelLink();
        } else if (!inControl && ui.selection) {
          e.preventDefault();
          ui.select(null);
        }
        return;
      }

      if (inControl || e.altKey) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (deleteSelection()) e.preventDefault();
        return;
      }
      if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        addTableAtCentre();
        return;
      }
      if (key === "l" && !e.shiftKey) {
        e.preventDefault();
        if (ui.linkFrom !== null) ui.cancelLink();
        else ui.startLink();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        ui.openDialog("shortcuts");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
