"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/queries";
import type { MeResponse } from "@/lib/types";
import { FullPageSpinner } from "../ui/Spinner";
import { Button } from "../ui/Button";

const SessionContext = createContext<MeResponse | null>(null);

/** The signed-in user. Only usable below <AuthGate>. */
export function useSession(): MeResponse {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <AuthGate>");
  return session;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const unauthorized = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);

  if (me.data) return <SessionContext.Provider value={me.data}>{children}</SessionContext.Provider>;
  if (me.isError && !unauthorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-ink-500">{me.error.message}</p>
        <Button variant="secondary" onClick={() => me.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return <FullPageSpinner label={unauthorized ? "Redirecting to sign in" : "Loading your workspace"} />;
}
