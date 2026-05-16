"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/workflows";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        router.push("/workflows");
        return;
      }
      const supabase = createClient();
      if (!supabase) throw new Error("Auth unavailable");
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError("Invalid email or password");
        return;
      }
      router.push("/workflows");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="canvas-dot-grid flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[400px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-10 shadow-[0_8px_40px_#00000055]">
        <p className="mb-8 text-center font-mono text-2xl text-[var(--text-primary)]">
          Sayerflow
        </p>
        <h1 className="text-lg font-medium text-[var(--text-primary)]">
          Welcome back
        </h1>
        <p className="mb-6 mt-1 text-[13px] text-[var(--text-secondary)]">
          Sign in to your account
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="field-label">Email</span>
            <input
              type="email"
              required
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="field-label">Password</span>
            <input
              type="password"
              required
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="rounded-md border border-[var(--error)] bg-[#f8717115] px-3 py-2 text-[11px] text-[var(--error)]">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-[12px] text-[var(--text-secondary)]">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-[var(--accent)] underline">
            Sign up
          </Link>
        </p>
        {!isSupabaseConfigured() && (
          <p className="mt-4 text-center text-[11px] text-[var(--text-tertiary)]">
            Supabase not configured — continuing in local storage mode.
          </p>
        )}
      </div>
    </div>
  );
}
