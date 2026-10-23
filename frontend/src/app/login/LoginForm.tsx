"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useEmailLogin, useMe } from "@/lib/queries";
import { Spinner } from "@/components/ui/Spinner";

const OAUTH_ERRORS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  invalid_state: "Your sign-in link expired. Please try again.",
  google_login_failed: "We couldn't sign you in with Google. Please try again.",
};

const fieldClass =
  "h-12 w-full rounded-lg bg-ink-100 px-4 text-sm text-ink-900 placeholder:text-ink-500 transition " +
  "focus:bg-white focus:ring-2 focus:ring-brand-300 focus:outline-none";

export function LoginForm() {
  const router = useRouter();
  const oauthError = useSearchParams().get("error");
  const me = useMe();
  const login = useEmailLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (me.data) router.replace("/dashboard/scheduled");
  }, [me.data, router]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => router.replace("/dashboard/scheduled") });
  };

  const error = login.isError ? errorMessage(login.error) : oauthError ? (OAUTH_ERRORS[oauthError] ?? "Sign-in failed.") : null;

  return (
    <div className="w-full max-w-[488px] animate-slide-up">
      <div className="rounded-xl border border-ink-200 bg-white px-6 py-12 sm:px-14">
        <h1 className="text-center text-[34px] leading-none font-semibold tracking-tight text-ink-900">Login</h1>

        {/* Full-page navigation: the backend runs the Google OAuth flow and sets the session cookie. */}
        <a
          href="/api/auth/google"
          className="mt-8 flex h-12 items-center justify-center gap-3 rounded-lg bg-brand-100 text-[15px] font-medium text-ink-900 transition hover:bg-brand-200"
        >
          <GoogleIcon />
          Login with Google
        </a>

        <div className="my-6 flex items-center gap-4 text-xs text-ink-400">
          <span className="h-px flex-1 bg-ink-200" />
          or sign up through email
          <span className="h-px flex-1 bg-ink-200" />
        </div>

        <form onSubmit={submit} className="space-y-3" noValidate>
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="Email ID"
            aria-label="Email ID"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="!mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 text-[15px] font-medium text-white transition hover:bg-brand-600 disabled:opacity-70"
          >
            {login.isPending && <Spinner className="size-4" />}
            Login
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-ink-400">New email? We&apos;ll create your account.</p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}
