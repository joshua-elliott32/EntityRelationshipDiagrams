import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { useSettingsStore } from "@/store/settings";
import { ThemeSync } from "../ThemeSync";
import { SettingsDialog } from "./SettingsDialog";

const settings = () => useSettingsStore.getState().settings;

beforeEach(() => useSettingsStore.getState().reset());
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

describe("SettingsDialog", () => {
  it("updates the settings store live", async () => {
    const user = userEvent.setup();
    render(<SettingsDialog onClose={() => {}} />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(settings().theme).toBe("dark");

    await user.click(screen.getByRole("radio", { name: "Curved" }));
    expect(settings().lineStyle).toBe("curved");

    await user.click(screen.getByRole("checkbox", { name: /Show grid/ }));
    expect(settings().showGrid).toBe(false);

    await user.selectOptions(screen.getByLabelText(/Target normal form/), "BCNF");
    expect(settings().targetNormalForm).toBe("BCNF");
    expect(screen.getByText(/every column that decides another is itself a key/i)).toBeTruthy();

    await user.selectOptions(screen.getByLabelText(/Naming convention/), "snake_case");
    expect(settings().namingConvention).toBe("snake_case");

    await user.selectOptions(screen.getByLabelText(/Grid size/), "20");
    expect(settings().gridSize).toBe(20);

    await user.selectOptions(screen.getByLabelText(/Default SQL dialect/), "sqlite");
    expect(settings().sqlDialect).toBe("sqlite");
  });

  it("resets to defaults", async () => {
    const user = userEvent.setup();
    useSettingsStore.getState().update({ theme: "light", notation: "numeric", snapToGrid: false });
    render(<SettingsDialog onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(settings()).toEqual(DEFAULT_SETTINGS);
  });

  it("closes on Escape and on Done", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId("settings-dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("applies the theme to <html> through ThemeSync", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ThemeSync />
        <SettingsDialog onClose={() => {}} />
      </>,
    );
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
