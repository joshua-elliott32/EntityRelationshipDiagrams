/** Keyboard shortcut labels, shared by tooltips and the shortcuts dialog. */

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");

export const MOD = isMac ? "⌘" : "Ctrl";

export const KEYS = {
  undo: `${MOD}+Z`,
  redo: isMac ? "⌘+Shift+Z" : "Ctrl+Y",
  addTable: "N",
  link: "L",
  duplicate: `${MOD}+D`,
  save: `${MOD}+S`,
  delete: "Delete",
  help: "?",
};

export interface ShortcutGroup {
  title: string;
  items: { keys: string[]; label: string }[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Editing",
    items: [
      { keys: ["N"], label: "Add a table" },
      { keys: ["L"], label: "Link tables (toggle)" },
      { keys: ["Delete", "Backspace"], label: "Delete the selected table or relationship" },
      { keys: [`${MOD}+D`], label: "Duplicate the selected table" },
      { keys: [`${MOD}+Z`], label: "Undo" },
      { keys: [`${MOD}+Shift+Z`, "Ctrl+Y"], label: "Redo" },
      { keys: ["Esc"], label: "Cancel linking, then clear the selection" },
    ],
  },
  {
    title: "Canvas",
    items: [
      { keys: ["+", "−"], label: "Zoom in / out" },
      { keys: ["0"], label: "Fit the diagram to the screen" },
      { keys: ["1"], label: "Zoom to 100%" },
      {
        keys: ["←", "↑", "→", "↓"],
        label: "Nudge the selected table (hold Shift for bigger steps)",
      },
      { keys: ["Drag"], label: "Move tables; drag the background to pan" },
      { keys: ["Scroll", "Pinch"], label: "Zoom" },
    ],
  },
  {
    title: "Files and help",
    items: [
      { keys: [`${MOD}+S`], label: "Download the diagram file (.json)" },
      { keys: ["?"], label: "Show these shortcuts" },
    ],
  },
];
