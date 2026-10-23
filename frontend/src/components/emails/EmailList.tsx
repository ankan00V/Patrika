"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Filter, Inbox, RotateCw, SearchX } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateTime, formatListTime } from "@/lib/format";
import { useEmails } from "@/lib/queries";
import type { EmailFilter, EmailListItem, EmailTab } from "@/lib/types";
import { Button, buttonClasses } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Menu, MenuItem } from "../ui/Menu";
import { SearchInput } from "./SearchInput";
import { StarButton } from "./StarButton";
import { DeferredChip, StatusChip } from "./StatusChip";

interface FilterOption {
  label: string;
  value: EmailFilter;
}

const FILTERS: Record<EmailTab, FilterOption[]> = {
  scheduled: [
    { label: "All scheduled", value: {} },
    { label: "Starred", value: { starred: true } },
    { label: "Sending now", value: { status: "sending" } },
  ],
  sent: [
    { label: "All", value: {} },
    { label: "Starred", value: { starred: true } },
    { label: "Delivered", value: { status: "sent" } },
    { label: "Failed", value: { status: "failed" } },
  ],
};

const EMPTY: Record<EmailTab, { title: string; text: string }> = {
  scheduled: {
    title: "No scheduled emails",
    text: "Compose an email, upload your leads and pick a time. Upcoming sends will line up here.",
  },
  sent: {
    title: "No sent emails yet",
    text: "Emails show up here, with their delivery status, as soon as they go out.",
  },
};

const sameFilter = (a: EmailFilter, b: EmailFilter) => a.status === b.status && !!a.starred === !!b.starred;

/** Gmail-style list shared by the Scheduled and Sent views. */
export function EmailList({ tab }: { tab: EmailTab }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EmailFilter>({});
  const { data, isPending, isError, error, refetch, isFetching } = useEmails(tab, page, query, filter);

  const onSearch = useCallback((q: string) => {
    setQuery(q);
    setPage(1);
  }, []);

  const filterActive = Boolean(filter.status || filter.starred);
  const from = data ? (page - 1) * data.pageSize + 1 : 0;
  const to = data ? from + data.items.length - 1 : 0;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-1.5">
        <SearchInput onSearch={onSearch} placeholder="Search" />

        <Menu
          label="Filter emails"
          align="right"
          trigger={() => (
            <span
              className={cn(
                "relative flex size-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900",
                filterActive && "text-brand-600",
              )}
            >
              <Filter className="size-4" />
              {filterActive && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand-500" />}
            </span>
          )}
        >
          {FILTERS[tab].map((option) => (
            <MenuItem
              key={option.label}
              active={sameFilter(option.value, filter)}
              onSelect={() => {
                setFilter(option.value);
                setPage(1);
              }}
            >
              {option.label}
            </MenuItem>
          ))}
        </Menu>

        <button
          onClick={() => refetch()}
          aria-label="Refresh"
          className="flex size-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
        >
          <RotateCw className={cn("size-4", isFetching && "animate-spin")} />
        </button>

        {data && data.total > 0 && (
          <div className="ml-auto hidden items-center gap-1 text-xs text-ink-500 sm:flex">
            <span className="mr-1 tabular-nums">
              {from.toLocaleString()}–{to.toLocaleString()} of {data.total.toLocaleString()}
            </span>
            <PagerButton label="Previous page" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" />
            </PagerButton>
            <PagerButton label="Next page" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="size-4" />
            </PagerButton>
          </div>
        )}
      </div>

      <div className="mt-3">
        {isPending ? (
          <ListSkeleton />
        ) : isError ? (
          <EmptyState
            icon={<AlertTriangle className="size-6 text-red-500" />}
            title="Couldn't load emails"
            description={error.message}
            action={
              <Button variant="secondary" onClick={() => refetch()}>
                Try again
              </Button>
            }
          />
        ) : data.items.length === 0 ? (
          query || filterActive ? (
            <EmptyState
              icon={<SearchX className="size-6" />}
              title="Nothing matches"
              description={query ? `No ${tab} emails match “${query}”.` : "No emails match this filter."}
            />
          ) : (
            <EmptyState
              icon={<Inbox className="size-6" />}
              title={EMPTY[tab].title}
              description={EMPTY[tab].text}
              action={
                <Link href="/compose" className={buttonClasses("outline", "md", "rounded-full")}>
                  Compose
                </Link>
              }
            />
          )
        ) : (
          <ul className={cn("transition-opacity", isFetching && "opacity-95")}>
            {data.items.map((email) => (
              <EmailRow key={email.id} email={email} tab={tab} />
            ))}
          </ul>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-between text-xs text-ink-500 sm:hidden">
          <span className="tabular-nums">
            {from}–{to} of {data.total}
          </span>
          <div className="flex gap-1">
            <PagerButton label="Previous page" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" />
            </PagerButton>
            <PagerButton label="Next page" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="size-4" />
            </PagerButton>
          </div>
        </div>
      )}
    </div>
  );
}

function EmailRow({ email, tab }: { email: EmailListItem; tab: EmailTab }) {
  const router = useRouter();
  const href = `/emails/${email.id}`;
  const doneAt = email.sentAt ?? email.failedAt;

  return (
    <li
      onClick={() => router.push(href)}
      className="group flex cursor-pointer items-center gap-3 border-b border-ink-100 px-3 py-3 text-[13px] transition-colors hover:bg-ink-50 sm:gap-4"
    >
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="flex items-center justify-between gap-2 sm:w-52 sm:shrink-0">
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="truncate text-ink-900"
            title={email.recipient}
          >
            <span className="text-ink-500">To: </span>
            {email.recipient}
          </Link>
          {tab === "sent" && doneAt && (
            <span className="shrink-0 text-xs text-ink-500 sm:hidden">{formatListTime(doneAt)}</span>
          )}
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-2 sm:mt-0 sm:flex-1">
          <StatusChip email={email} />
          {tab === "scheduled" && <DeferredChip deferrals={email.deferrals} />}
          <p className="min-w-0 truncate">
            <span className="font-semibold text-ink-900">{email.subject}</span>
            {email.preview && <span className="text-ink-400"> - {email.preview}</span>}
          </p>
        </div>
      </div>

      {tab === "sent" && doneAt && (
        <time
          dateTime={doneAt}
          title={formatDateTime(doneAt)}
          className="hidden shrink-0 text-xs text-ink-500 tabular-nums sm:block"
        >
          {formatListTime(doneAt)}
        </time>
      )}
      <StarButton id={email.id} starred={email.starred} className={cn(!email.starred && "sm:opacity-60 sm:group-hover:opacity-100")} />
    </li>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg text-ink-500 transition hover:bg-ink-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function ListSkeleton() {
  return (
    <ul aria-busy aria-label="Loading emails">
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="flex items-center gap-4 border-b border-ink-100 px-3 py-3.5">
          <div className="skeleton h-3.5 w-40" />
          <div className="skeleton h-4 w-24 rounded-md" />
          <div className="skeleton h-3.5 flex-1" style={{ maxWidth: `${50 + ((i * 13) % 35)}%` }} />
          <div className="skeleton ml-auto size-4 rounded" />
        </li>
      ))}
    </ul>
  );
}
