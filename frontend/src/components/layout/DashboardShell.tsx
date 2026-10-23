"use client";

import { useState, type ReactNode } from "react";
import { Menu as MenuIcon } from "lucide-react";
import { Logo } from "../ui/Logo";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Mobile top bar; on desktop the sidebar carries the brand and user card. */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <MenuIcon className="size-5" />
        </button>
        <Logo className="text-xl" />
        <div className="ml-auto">
          <UserMenu compact />
        </div>
      </header>

      <main className="lg:pl-[260px]">
        <div className="px-4 pt-4 pb-10 sm:px-6 lg:pt-5">{children}</div>
      </main>
    </div>
  );
}
