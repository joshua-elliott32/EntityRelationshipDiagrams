"use client";

import { useThemeSync } from "@/hooks/useTheme";

/** Renders nothing; keeps <html data-theme> in step with the Theme setting. */
export function ThemeSync() {
  useThemeSync();
  return null;
}
