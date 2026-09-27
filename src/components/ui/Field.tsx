"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./Button";
import styles from "./Field.module.css";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Put the label and the control on one line. */
  inline?: boolean;
}

/** A labelled form control. The control must be the (only) child so the label wraps it. */
export function Field({ label, hint, children, className, inline }: FieldProps) {
  return (
    <label className={cx(styles.field, inline && styles.inline, className)}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(styles.input, className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={cx(styles.input, styles.select, className)} {...rest} />;
  },
);

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(styles.input, styles.textarea, className)} {...rest} />;
});

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  label: ReactNode;
  hint?: ReactNode;
  onChange(checked: boolean): void;
}

export function Checkbox({ label, hint, onChange, className, ...rest }: CheckboxProps) {
  return (
    <label className={cx(styles.check, className)}>
      <input type="checkbox" onChange={(e) => onChange(e.target.checked)} {...rest} />
      <span className={styles.checkText}>
        <span>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
    </label>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(v: T): void;
  /** Hide the visible legend (it stays as the group's accessible name). */
  hideLabel?: boolean;
  size?: "normal" | "small";
}

/** A radio group styled as a segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
  size = "normal",
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className={styles.segField}>
      <legend className={hideLabel ? "visually-hidden" : styles.label}>{label}</legend>
      <div className={cx(styles.seg, size === "small" && styles.segSmall)}>
        {options.map((o) => (
          <label key={o.value} className={styles.segItem}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
