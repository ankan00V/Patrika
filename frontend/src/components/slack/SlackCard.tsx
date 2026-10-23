"use client";

import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useDisconnectSlack, useTestSlack } from "@/lib/queries";
import { useSession } from "../layout/AuthGate";
import { buttonClasses, Button } from "../ui/Button";

export function SlackCard() {
  const { slack } = useSession();
  const disconnect = useDisconnectSlack();
  const test = useTestSlack();

  return (
    <div className="rounded-xl border border-ink-200 p-3">
      <div className="flex items-center gap-2.5">
        <SlackLogo />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-900">Slack alerts</p>
          <p className="truncate text-[11px] text-ink-500">
            {slack.connected ? `${slack.channel} · ${slack.teamName}` : "Get pinged when a limit is hit"}
          </p>
        </div>
        {slack.connected && <span className="ml-auto size-2 shrink-0 rounded-full bg-brand-500" title="Connected" />}
      </div>

      {slack.connected ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={test.isPending}
            onClick={() =>
              test.mutate(undefined, {
                onSuccess: () => toast.success("Test message sent to Slack"),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            Send test
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={disconnect.isPending}
            onClick={() =>
              disconnect.mutate(undefined, {
                onSuccess: () => toast.success("Slack disconnected"),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            Disconnect
          </Button>
        </div>
      ) : (
        // Full-page navigation into Slack's OAuth consent screen.
        <a href="/api/slack/install" className={buttonClasses("secondary", "sm", "mt-3 w-full")}>
          Connect Slack
        </a>
      )}
    </div>
  );
}

function SlackLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 shrink-0 rounded-lg bg-white p-1 ring-1 ring-ink-200" aria-hidden>
      <path fill="#E01E5A" d="M5.04 15.17a2.53 2.53 0 1 1-2.52-2.53h2.52v2.53zm1.27 0a2.53 2.53 0 0 1 5.05 0v6.31a2.53 2.53 0 1 1-5.05 0v-6.31z" />
      <path fill="#36C5F0" d="M8.83 5.04a2.53 2.53 0 1 1 2.53-2.52v2.52H8.83zm0 1.27a2.53 2.53 0 0 1 0 5.05H2.52a2.53 2.53 0 0 1 0-5.05h6.31z" />
      <path fill="#2EB67D" d="M18.96 8.83a2.53 2.53 0 1 1 2.52 2.53h-2.52V8.83zm-1.27 0a2.53 2.53 0 0 1-5.05 0V2.52a2.53 2.53 0 1 1 5.05 0v6.31z" />
      <path fill="#ECB22E" d="M15.17 18.96a2.53 2.53 0 1 1-2.53 2.52v-2.52h2.53zm0-1.27a2.53 2.53 0 0 1 0-5.05h6.31a2.53 2.53 0 1 1 0 5.05h-6.31z" />
    </svg>
  );
}
