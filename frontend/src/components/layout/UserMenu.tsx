"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { useLogout } from "@/lib/queries";
import { Avatar } from "../ui/Avatar";
import { Menu, MenuItem } from "../ui/Menu";
import { useSession } from "./AuthGate";

/** User card from the design: avatar, name and email, with a dropdown holding Log out. */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user } = useSession();
  const router = useRouter();
  const logout = useLogout();

  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => router.replace("/login"),
      onError: () => toast.error("Couldn't log out. Please try again."),
    });

  return (
    <Menu
      align={compact ? "right" : "left"}
      trigger={(open) =>
        compact ? (
          <span className="flex rounded-full ring-offset-2 transition hover:ring-2 hover:ring-ink-200">
            <Avatar name={user.name} src={user.avatarUrl} className="size-8" />
          </span>
        ) : (
          <span className="flex w-full items-center gap-2.5 rounded-xl bg-ink-100 px-2.5 py-2 text-left transition hover:bg-ink-200/70">
            <Avatar name={user.name} src={user.avatarUrl} className="size-8" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm leading-tight font-medium text-ink-900">{user.name}</span>
              <span className="block truncate text-[11px] leading-tight text-ink-500">{user.email}</span>
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-ink-400 transition-transform", open && "rotate-180")} />
          </span>
        )
      }
      triggerClassName={compact ? undefined : "w-full"}
      label="Account menu"
    >
      {compact && (
        <div className="border-b border-ink-100 px-3 pt-2 pb-2.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-ink-500">{user.email}</p>
        </div>
      )}
      <MenuItem icon={<LogOut className="size-4" />} onSelect={signOut} disabled={logout.isPending}>
        Log out
      </MenuItem>
    </Menu>
  );
}
