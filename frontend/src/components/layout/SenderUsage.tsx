"use client";

import { cn } from "@/lib/cn";
import { useSenders } from "@/lib/queries";

/** Live per-sender usage against the hourly cap (Redis counters). */
export function SenderUsage() {
  const { data } = useSenders();
  if (!data || data.senders.length === 0) return null;
  const limit = data.hourlyLimitPerSender;

  return (
    <div className="rounded-xl border border-ink-200 p-3">
      <p className="mb-2.5 text-[11px] font-medium tracking-wide text-ink-400 uppercase">Sender usage · this hour</p>
      <ul className="space-y-2">
        {data.senders.map((s) => {
          const pct = Math.min(100, (s.sentThisHour / limit) * 100);
          return (
            <li key={s.id} title={s.email}>
              <div className="mb-1 flex justify-between gap-2 text-[11px]">
                <span className="truncate text-ink-500">{s.email}</span>
                <span className="shrink-0 text-ink-700 tabular-nums">
                  {s.sentThisHour}/{limit}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-ink-100">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-500",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
