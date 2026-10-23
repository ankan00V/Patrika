"use client";

import { Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { useToggleStar } from "@/lib/queries";

export function StarButton({ id, starred, className }: { id: string; starred: boolean; className?: string }) {
  const toggle = useToggleStar();
  return (
    <button
      type="button"
      aria-label={starred ? "Unstar" : "Star"}
      aria-pressed={starred}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ id, starred: !starred }, { onError: () => toast.error("Couldn't update star") });
      }}
      className={cn("rounded-md p-1 text-ink-300 transition hover:bg-ink-100 hover:text-ink-500", className)}
    >
      <Star className={cn("size-4", starred && "fill-amber-400 text-amber-400")} />
    </button>
  );
}
