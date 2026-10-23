"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";

const MESSAGES: Record<string, () => void> = {
  connected: () => toast.success("Slack connected. You'll be notified when a sender hits its hourly limit."),
  cancelled: () => toast.info("Slack connection cancelled."),
  error: () => toast.error("Couldn't connect Slack. Please try again."),
};

/** The Slack OAuth round-trip lands back on the dashboard with ?slack=connected|cancelled|error. */
export function SlackResultToast() {
  const client = useQueryClient();
  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("slack");
    if (!status) return;
    MESSAGES[status]?.();
    void client.invalidateQueries({ queryKey: queryKeys.me });
    url.searchParams.delete("slack");
    window.history.replaceState(null, "", url);
  }, [client]);
  return null;
}
