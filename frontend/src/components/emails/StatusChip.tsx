import { Clock3, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatChipTime, formatDateTime } from "@/lib/format";
import type { EmailListItem } from "@/lib/types";

const base = "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap";

/** Status chip from the design: peach time chip for scheduled, grey "Sent", red "Failed". */
export function StatusChip({ email }: { email: Pick<EmailListItem, "status" | "scheduledAt" | "error" | "deferrals"> }) {
  switch (email.status) {
    case "scheduled":
      return (
        <span
          className={cn(base, "bg-[#fdecdc] text-[#b5540f]")}
          title={`Scheduled for ${formatDateTime(email.scheduledAt)}${email.deferrals ? " (moved by the hourly limit)" : ""}`}
        >
          <Clock3 className="size-3" />
          {formatChipTime(email.scheduledAt)}
        </span>
      );
    case "sending":
      return (
        <span className={cn(base, "bg-sky-50 text-sky-700")}>
          <Loader2 className="size-3 animate-spin" />
          Sending
        </span>
      );
    case "sent":
      return <span className={cn(base, "bg-ink-100 text-ink-700")}>Sent</span>;
    case "failed":
      return (
        <span className={cn(base, "bg-red-50 text-red-700")} title={email.error ?? undefined}>
          Failed
        </span>
      );
  }
}

export function DeferredChip({ deferrals }: { deferrals: number }) {
  if (!deferrals) return null;
  return (
    <span className={cn(base, "bg-violet-50 text-violet-700")} title="Moved to a later hour so the hourly limit isn't exceeded">
      Rate limited
    </span>
  );
}
