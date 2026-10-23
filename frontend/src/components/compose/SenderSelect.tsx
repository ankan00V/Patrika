"use client";

import { ChevronDown, Shuffle } from "lucide-react";
import { useSenders } from "@/lib/queries";
import { Menu, MenuItem } from "../ui/Menu";

/** "From" pill. Empty value = rotate across every sender mailbox (more throughput per hour). */
export function SenderSelect({ value, onChange }: { value: string; onChange: (senderId: string) => void }) {
  const { data } = useSenders();
  const senders = data?.senders ?? [];
  const selected = senders.find((s) => s.id === value);
  const label = selected ? selected.email : senders.length ? `All mailboxes (${senders.length}, rotating)` : "Loading…";

  return (
    <Menu
      label="From"
      trigger={(open) => (
        <span className="flex h-8 items-center gap-1.5 rounded-lg bg-ink-100 px-3 text-sm text-ink-900 transition hover:bg-ink-200/70">
          {!selected && <Shuffle className="size-3.5 text-ink-500" />}
          <span className="max-w-[60vw] truncate">{label}</span>
          <ChevronDown className={`size-3.5 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      )}
      panelClassName="w-80"
    >
      <MenuItem active={!value} icon={<Shuffle className="size-4" />} onSelect={() => onChange("")}>
        <span>
          All mailboxes
          <span className="block text-xs font-normal text-ink-500">Rotate senders, {data?.hourlyLimitPerSender ?? "–"}/h each</span>
        </span>
      </MenuItem>
      {senders.map((s) => (
        <MenuItem key={s.id} active={s.id === value} onSelect={() => onChange(s.id)}>
          <span className="min-w-0">
            <span className="block truncate">{s.email}</span>
            <span className="block text-xs font-normal text-ink-500">
              {s.name} · {s.sentThisHour}/{data?.hourlyLimitPerSender} this hour
            </span>
          </span>
        </MenuItem>
      ))}
    </Menu>
  );
}
