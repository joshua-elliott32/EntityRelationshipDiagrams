import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings/types";

export const SETTINGS_KEY = "erd-studio:settings";

interface SettingsStore {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  reset(): void;
}

/**
 * User preferences, persisted to localStorage. The inline theme script in
 * src/app/layout.tsx reads `state.settings.theme` from the same key before
 * first paint, so keep that shape stable.
 */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      reset: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: SETTINGS_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings }),
      // New settings added in later versions get their defaults.
      merge: (persisted, current) => ({
        ...current,
        settings: {
          ...DEFAULT_SETTINGS,
          ...((persisted as Partial<SettingsStore>)?.settings ?? {}),
        },
      }),
    },
  ),
);

export const useSettings = () => useSettingsStore((s) => s.settings);
