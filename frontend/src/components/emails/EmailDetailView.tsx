"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import DOMPurify from "dompurify";
import { AlertTriangle, ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useEmail } from "@/lib/queries";
import type { EmailDetail } from "@/lib/types";
import { useSession } from "../layout/AuthGate";
import { AttachmentCard } from "../ui/AttachmentCard";
import { Avatar } from "../ui/Avatar";
import { buttonClasses } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Menu } from "../ui/Menu";
import { StarButton } from "./StarButton";
import { DeferredChip, StatusChip } from "./StatusChip";

export function EmailDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useSession();
  const { data: email, isPending, isError, error } = useEmail(id);
  const backHref = email && (email.status === "sent" || email.status === "failed") ? "/dashboard/sent" : "/dashboard/scheduled";

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-100 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push(backHref))}
          className="rounded-lg p-1.5 text-ink-900 hover:bg-ink-100"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        {isPending ? (
          <div className="skeleton h-5 w-64" />
        ) : (
          <h1 className="min-w-0 truncate text-lg font-medium text-ink-900 sm:text-xl">{email?.subject ?? "Email"}</h1>
        )}
        <div className="ml-auto flex items-center gap-1">
          {email && <StarButton id={email.id} starred={email.starred} className="p-2" />}
          {email?.previewUrl && (
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-2 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              title="Open in Ethereal"
              aria-label="Open in Ethereal"
            >
              <ExternalLink className="size-4" />
            </a>
          )}
          <span className="mx-2 h-5 w-px bg-ink-200" aria-hidden />
          <Avatar name={user.name} src={user.avatarUrl} className="size-8" />
        </div>
      </header>

      {isPending ? (
        <DetailSkeleton />
      ) : isError ? (
        <EmptyState
          icon={<AlertTriangle className="size-6 text-red-500" />}
          title="Couldn't open this email"
          description={error.message}
          action={
            <Link href="/dashboard/scheduled" className={buttonClasses("secondary")}>
              Back to dashboard
            </Link>
          }
        />
      ) : (
        <EmailBody email={email} />
      )}
    </div>
  );
}

function EmailBody({ email }: { email: EmailDetail }) {
  // Already sanitized by the backend; sanitize again before injecting into the page.
  const html = useMemo(() => DOMPurify.sanitize(email.body, { ADD_ATTR: ["target"] }), [email.body]);
  const when = email.sentAt ?? email.failedAt ?? email.scheduledAt;

  return (
    <article className="mx-auto max-w-[880px] animate-fade-in px-4 py-6 sm:px-6">
      <div className="flex items-start gap-3">
        <Avatar name={email.senderName} className="size-9 bg-brand-500 text-white" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink-900">{email.senderName}</span>
            <span className="truncate text-xs text-ink-500">&lt;{email.senderEmail}&gt;</span>
          </div>
          <Menu
            label="Message details"
            trigger={() => (
              <span className="flex items-center gap-0.5 text-xs text-ink-500 hover:text-ink-900">
                to {email.recipient}
                <ChevronDown className="size-3" />
              </span>
            )}
            panelClassName="w-80 p-3"
          >
            <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-ink-500">from</dt>
              <dd className="truncate">{email.senderEmail}</dd>
              <dt className="text-ink-500">to</dt>
              <dd className="truncate">{email.recipient}</dd>
              <dt className="text-ink-500">scheduled</dt>
              <dd>{formatDateTime(email.scheduledAt)}</dd>
              {email.sentAt && (
                <>
                  <dt className="text-ink-500">sent</dt>
                  <dd>{formatDateTime(email.sentAt)}</dd>
                </>
              )}
              <dt className="text-ink-500">attempts</dt>
              <dd>{email.attempts}</dd>
              {email.messageId && (
                <>
                  <dt className="text-ink-500">message id</dt>
                  <dd className="truncate font-mono text-[11px]" title={email.messageId}>
                    {email.messageId}
                  </dd>
                </>
              )}
            </dl>
          </Menu>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <time dateTime={when} title={formatRelative(when)} className="text-xs text-ink-500">
            {formatDateTime(when)}
          </time>
          <div className="flex gap-1.5">
            <DeferredChip deferrals={email.status === "scheduled" ? email.deferrals : 0} />
            <StatusChip email={email} />
          </div>
        </div>
      </div>

      {email.status === "failed" && email.error && (
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 sm:ml-12">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {email.error}
        </div>
      )}

      <div className="email-body mt-6 sm:pl-12" dangerouslySetInnerHTML={{ __html: html }} />

      {email.attachments.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3 sm:pl-12">
          {email.attachments.map((a) => {
            const url = `/api/attachments/${a.id}`;
            return (
              <AttachmentCard
                key={a.id}
                name={a.filename}
                size={a.size}
                href={url}
                previewUrl={a.contentType.startsWith("image/") ? url : undefined}
              />
            );
          })}
        </div>
      )}
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[880px] space-y-6 px-4 py-6 sm:px-6" aria-busy>
      <div className="flex gap-3">
        <div className="skeleton size-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-56" />
          <div className="skeleton h-3 w-32" />
        </div>
      </div>
      <div className="space-y-2.5 sm:pl-12">
        {[90, 75, 82, 40].map((w) => (
          <div key={w} className="skeleton h-3.5" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
