import { cn } from "@/lib/cn";

/** Pixel wordmark, in the spirit of the "ONB" mark in the design. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[26px] leading-none font-bold tracking-tight text-ink-900", className)}>
      PATRIKA
    </span>
  );
}
