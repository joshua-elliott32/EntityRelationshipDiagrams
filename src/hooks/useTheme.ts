"use client";

import { useEffect } from "react";
import type { ThemePref } from "@/lib/settings/types";
import { useSettingsStore } from "@/store/settings";

/** Apply a theme preference to <html data-theme>. "system" removes the attribute. */
export function applyTheme(theme: ThemePref): void {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/**
 * Keep <html data-theme> in step with settings.theme. The inline script in
 * layout.tsx handles the first paint; this handles every change after that.
 */
export function useThemeSync(): void {
  const theme = useSettingsStore((s) => s.settings.theme);
  useEffect(() => applyTheme(theme), [theme]);
}
