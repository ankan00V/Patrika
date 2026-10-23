"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateTime, toLocalInputValue } from "@/lib/format";
import { Spinner } from "../ui/Spinner";

interface Preset {
  label: string;
  at: () => Date;
}

const tomorrowAt = (hour: number) => () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const PRESETS: Preset[] = [
  { label: "Right now", at: () => new Date() },
  { label: "Tomorrow", at: () => new Date(Date.now() + 24 * 3600 * 1000) },
  { label: "Tomorrow, 10:00 AM", at: tomorrowAt(10) },
  { label: "Tomorrow, 11:00 AM", at: tomorrowAt(11) },
  { label: "Tomorrow, 3:00 PM", at: tomorrowAt(15) },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (startAt: Date) => void;
  submitting: boolean;
}

/** "Send Later" panel from the design: a date-time picker plus quick presets. */
export function SendLaterPopover({ open, onClose, onConfirm, submitting }: Props) {
  const [custom, setCustom] = useState("");
  const [preset, setPreset] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Date | null>(null);
  const [inPast, setInPast] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const min = useMemo(() => (open ? toLocalInputValue(new Date()) : ""), [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!ref.current?.contains(target) && !target.closest("[data-send-later-trigger]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;


  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Send later"
      className="absolute top-full right-0 z-50 mt-2 w-[min(320px,calc(100vw-2rem))] animate-slide-up rounded-xl border border-ink-200 bg-white p-4 shadow-pop"
    >
      <p className="text-sm font-medium text-ink-900">Send Later</p>

      <div className="relative mt-3 border-b border-ink-200 focus-within:border-brand-500">
        <button
          type="button"
          onClick={() => {
            const input = pickerRef.current;
            try {
              input?.showPicker();
            } catch {
              input?.focus();
            }
          }}
          className="flex w-full items-center justify-between py-1.5 text-left text-xs"
        >
          <span className={custom ? "text-ink-900" : "text-ink-400"}>
            {custom ? formatDateTime(new Date(custom)) : "Pick date & time"}
          </span>
          <CalendarDays className="size-4 text-ink-400" />
        </button>
        {/* Native picker, opened by the row above so the empty state can read "Pick date & time". */}
        <input
          ref={pickerRef}
          type="datetime-local"
          value={custom}
          min={min}
          tabIndex={-1}
          aria-label="Pick date & time"
          onChange={(e) => {
            const date = e.target.value ? new Date(e.target.value) : null;
            setCustom(e.target.value);
            setPreset(null);
            setChosen(date);
            setInPast(date !== null && date.getTime() < Date.now() - 60_000);
          }}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
      </div>

      <ul className="mt-3 space-y-0.5">
        {PRESETS.map((p) => (
          <li key={p.label}>
            <button
              type="button"
              onClick={() => {
                setPreset(p.label);
                setCustom("");
                setChosen(p.at());
                setInPast(false);
              }}
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-left text-xs text-ink-700 transition hover:bg-ink-100",
                preset === p.label && "bg-brand-100 font-medium text-brand-700 hover:bg-brand-100",
              )}
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>

      <p className={cn("mt-3 min-h-4 text-[11px]", inPast ? "text-red-600" : "text-ink-500")}>
        {chosen ? (inPast ? "That time is in the past." : `Starts ${formatDateTime(chosen)}`) : ""}
      </p>

      <div className="mt-3 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="px-2 text-sm font-medium text-ink-900 hover:text-ink-500">
          Cancel
        </button>
        <button
          type="button"
          disabled={!chosen || inPast || submitting}
          // "Right now" is resolved at click time so a popover left open doesn't schedule in the past.
          onClick={() => chosen && onConfirm(preset === "Right now" ? new Date() : chosen)}
          className="flex h-8 items-center gap-1.5 rounded-full border border-brand-500 px-5 text-sm font-medium text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting && <Spinner className="size-3.5" />}
          Done
        </button>
      </div>
    </div>
  );
}
