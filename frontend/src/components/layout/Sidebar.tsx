"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Clock3, Send, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStats } from "@/lib/queries";
import { Logo } from "../ui/Logo";
import { SlackCard } from "../slack/SlackCard";
import { SenderUsage } from "./SenderUsage";
import { UserMenu } from "./UserMenu";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const stats = useStats();

  const nav = [
    { href: "/dashboard/scheduled", label: "Scheduled", icon: Clock3, count: stats.data?.scheduled },
    {
      href: "/dashboard/sent",
      label: "Sent",
      icon: Send,
      count: stats.data ? stats.data.sent + stats.data.failed : undefined,
    },
  ];

  return (
    <>
      <div
        className={cn("fixed inset-0 z-30 bg-ink-900/20 backdrop-blur-[2px] lg:hidden", open ? "block" : "hidden")}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col overflow-y-auto bg-white px-4 pt-5 pb-4 transition-transform duration-200",
          "border-r border-ink-200 lg:border-r-0 lg:translate-x-0",
          open ? "translate-x-0 shadow-pop" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <Link href="/dashboard/scheduled" onClick={onClose} aria-label="Patrika home">
            <Logo />
          </Link>
          <button className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5">
          <UserMenu />
        </div>

        <Link
          href="/compose"
          onClick={onClose}
          className="mt-4 flex h-10 items-center justify-center rounded-full border border-brand-500 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
        >
          Compose
        </Link>

        <nav className="mt-6">
          <p className="px-3 pb-1.5 text-[11px] font-medium tracking-wide text-ink-400 uppercase">Core</p>
          <ul className="space-y-0.5">
            {nav.map(({ href, label, icon: Icon, count }) => {
              const active = pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      active ? "bg-brand-100 font-semibold text-ink-900" : "text-ink-700 hover:bg-ink-100",
                    )}
                  >
                    <Icon className="size-4" strokeWidth={active ? 2.25 : 1.75} />
                    {label}
                    <span className="ml-auto text-xs text-ink-500 tabular-nums">
                      {count === undefined ? "" : count.toLocaleString()}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto space-y-3 pt-8">
          <SenderUsage />
          <SlackCard />
          <a
            href="/admin/queues"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
          >
            <Activity className="size-3.5" />
            Live queue dashboard
          </a>
        </div>
      </aside>
    </>
  );
}
