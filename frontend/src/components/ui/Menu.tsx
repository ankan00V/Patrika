"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface MenuProps {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode;
  label: string;
  align?: "left" | "right";
  triggerClassName?: string;
  panelClassName?: string;
}

/** Small accessible dropdown: closes on outside click, Escape, or picking an item. */
export function Menu({ trigger, children, label, align = "left", triggerClassName, panelClassName }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn("flex cursor-pointer", triggerClassName)}
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => (e.target as HTMLElement).closest("[role=menuitem]") && setOpen(false)}
          className={cn(
            "absolute z-50 mt-1.5 min-w-48 animate-slide-up rounded-xl border border-ink-200 bg-white p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  disabled,
  active,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-100 disabled:opacity-50",
        active && "bg-brand-50 font-medium text-brand-700 hover:bg-brand-100",
      )}
    >
      {icon && <span className="text-ink-400">{icon}</span>}
      {children}
    </button>
  );
}
