"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "default" | "primary" | "accent" | "danger" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "normal" | "small";
  icon?: ReactNode;
  /** Hide the text label on narrow screens (it stays as the accessible name). */
  collapseLabel?: boolean;
  /** Render as a square icon-only button; `children` becomes the aria-label if none is given. */
  iconOnly?: boolean;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "default",
    size = "normal",
    icon,
    collapseLabel,
    iconOnly,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const label =
    iconOnly && typeof children === "string" && !rest["aria-label"] ? children : undefined;
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        styles.btn,
        variant !== "default" && styles[variant],
        size === "small" && styles.small,
        iconOnly && styles.iconOnly,
        collapseLabel && styles.collapse,
        className,
      )}
      aria-label={label}
      {...rest}
    >
      {icon}
      {!iconOnly && children != null && <span className={styles.label}>{children}</span>}
    </button>
  );
});

interface ConfirmButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Label shown after the first click, e.g. "Click again to delete". */
  confirmLabel: string;
  onConfirm(): void;
}

/**
 * Two-click confirmation (the demo's `arm`): the first click changes the
 * label, a second click within 3 seconds runs the action.
 */
export function ConfirmButton({ confirmLabel, onConfirm, children, ...rest }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button
      {...rest}
      className={cx(rest.className, armed && styles.armed)}
      aria-live="polite"
      onClick={() => {
        if (armed) {
          clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setArmed(false), 3000);
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
