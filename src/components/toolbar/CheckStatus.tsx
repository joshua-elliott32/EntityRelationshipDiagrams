"use client";

import { useAnalysis } from "@/hooks/useAnalysis";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { AlertIcon, CheckIcon } from "../icons";
import { cx } from "../ui/Button";
import btn from "../ui/Button.module.css";
import styles from "./Toolbar.module.css";

/** Summary of the checks, e.g. "Meets 3NF" or "4 issues". Opens the Checks tab. */
export function useCheckSummary(): { text: string; tone: "clean" | "flagged" | "off" } {
  const analysis = useAnalysis();
  const target = useSettingsStore((s) => s.settings.targetNormalForm);
  const n = analysis.issues.length;
  if (n) return { text: `${n} issue${n === 1 ? "" : "s"}`, tone: "flagged" };
  if (target === "none") return { text: "Checks off", tone: "off" };
  return { text: `Meets ${target}`, tone: "clean" };
}

export function CheckStatus() {
  const { text, tone } = useCheckSummary();
  const setTab = useUiStore((s) => s.setTab);
  return (
    <>
      <button
        type="button"
        className={cx(btn.btn, styles.check, styles[tone])}
        onClick={() => setTab("issues")}
        title="Open the Checks tab"
        data-testid="check-status"
      >
        {tone === "flagged" ? <AlertIcon /> : tone === "clean" ? <CheckIcon /> : null}
        <span>{text}</span>
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {`Checks: ${text}`}
      </span>
    </>
  );
}
