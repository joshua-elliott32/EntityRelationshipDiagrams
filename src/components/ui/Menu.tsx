"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, cx, type ButtonVariant } from "./Button";
import styles from "./Menu.module.css";

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  /** Looks disabled but still runs onSelect (so it can explain why, e.g. with a toast). */
  softDisabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect(): void;
}

interface MenuProps {
  label: string;
  icon?: ReactNode;
  variant?: ButtonVariant;
  collapseLabel?: boolean;
  iconOnly?: boolean;
  title?: string;
  items: MenuItem[];
  /** Which edge of the trigger the popover lines up with. */
  align?: "left" | "right";
  /** Test hook / styling hook for the trigger button. */
  triggerTestId?: string;
}

/**
 * An accessible dropdown menu: button + role="menu" popover with arrow-key
 * navigation, Escape to close (focus returns to the trigger) and click-outside.
 */
export function Menu({
  label,
  icon,
  variant,
  collapseLabel,
  iconOnly,
  title,
  items,
  align = "right",
  triggerTestId,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const focusFirst = useRef<"first" | "last" | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open || !focusFirst.current) return;
    const els = menuItems();
    const el = focusFirst.current === "last" ? els[els.length - 1] : els[0];
    focusFirst.current = null;
    el?.focus();
  }, [open]);

  function menuItems(): HTMLButtonElement[] {
    return Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [],
    );
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusFirst.current = e.key === "ArrowDown" ? "first" : "last";
      if (open) {
        const els = menuItems();
        (e.key === "ArrowDown" ? els[0] : els[els.length - 1])?.focus();
      } else setOpen(true);
    }
  }

  function onMenuKey(e: KeyboardEvent) {
    const els = menuItems();
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div
      className={styles.root}
      ref={rootRef}
      onKeyDown={(e) => {
        // Escape with focus still on the trigger (e.g. opened by mouse).
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <Button
        ref={triggerRef}
        variant={variant}
        icon={icon}
        collapseLabel={collapseLabel}
        iconOnly={iconOnly}
        title={title}
        aria-label={iconOnly || collapseLabel ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid={triggerTestId}
        onClick={() => {
          focusFirst.current = open ? null : "first";
          setOpen((o) => !o);
        }}
        onKeyDown={onTriggerKey}
      >
        {label}
      </Button>
      {open && (
        <div
          id={menuId}
          ref={listRef}
          role="menu"
          aria-label={label}
          className={cx(styles.pop, align === "left" && styles.left)}
          onKeyDown={onMenuKey}
        >
          {items.map((it) => (
            <div key={it.id} role="none">
              {it.separatorBefore && <div role="separator" className={styles.sep} />}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={cx(styles.item, it.danger && styles.danger)}
                aria-disabled={it.softDisabled || undefined}
                onClick={() => {
                  close(true);
                  it.onSelect();
                }}
              >
                {it.icon && <span className={styles.icon}>{it.icon}</span>}
                <span className={styles.text}>
                  <span className={styles.itemLabel}>{it.label}</span>
                  {it.hint && <small className={styles.hint}>{it.hint}</small>}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
