import { TABLE_COLORS, type TableColor } from "@/lib/model";
import { MONO_FALLBACK, SANS_FALLBACK } from "./measure";

/**
 * Colours and fonts used to draw the diagram. The "screen" palette uses the
 * theme variables from globals.css (so light/dark switch without re-render);
 * "print" uses fixed light-theme hex values so exported images look the
 * same whatever theme the user is in.
 */
export interface Palette {
  kind: "screen" | "print";
  paper: string;
  card: string;
  ink: string;
  soft: string;
  faint: string;
  rule: string;
  border: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  hl: string;
  hlInk: string;
  headBg: string;
  headFg: string;
  line: string;
  sans: string;
  mono: string;
  head(color: string | null): string;
}

const isTableColor = (c: string | null): c is TableColor =>
  !!c && (TABLE_COLORS as readonly string[]).includes(c);

export const SCREEN: Palette = {
  kind: "screen",
  paper: "var(--paper)",
  card: "var(--card)",
  ink: "var(--ink)",
  soft: "var(--ink-soft)",
  faint: "var(--ink-faint)",
  rule: "var(--rule)",
  border: "var(--line)",
  accent: "var(--accent)",
  accentInk: "var(--accent-ink)",
  accentSoft: "var(--accent-soft)",
  hl: "var(--hl)",
  hlInk: "var(--hl-ink)",
  headBg: "var(--head-bg)",
  headFg: "var(--head-fg)",
  line: "var(--line)",
  sans: "var(--sans)",
  mono: "var(--mono)",
  head: (c) => (isTableColor(c) ? `var(--t-${c})` : "var(--head-bg)"),
};

const PRINT_HEADS: Record<TableColor, string> = {
  slate: "#1C2B3A",
  teal: "#0F6E6E",
  blue: "#1D4F91",
  violet: "#5B3F9C",
  rose: "#9C2F55",
  amber: "#8A5A00",
  green: "#2F6B2F",
};

export const PRINT_SANS = `"Instrument Sans", ${SANS_FALLBACK}`;
export const PRINT_MONO = `"JetBrains Mono", ${MONO_FALLBACK}`;

export const PRINT: Palette = {
  kind: "print",
  paper: "#FFFFFF",
  card: "#FFFFFF",
  ink: "#1C2B3A",
  soft: "#5B6B77",
  faint: "#8A98A2",
  rule: "#D3DBD5",
  border: "#1C2B3A",
  accent: "#1F6E8C",
  accentInk: "#FFFFFF",
  accentSoft: "#DDEBF0",
  hl: "#F7DF45",
  hlInk: "#2B2300",
  headBg: "#1C2B3A",
  headFg: "#F4F7F4",
  line: "#1C2B3A",
  sans: PRINT_SANS,
  mono: PRINT_MONO,
  head: (c) => (isTableColor(c) ? PRINT_HEADS[c] : "#1C2B3A"),
};
