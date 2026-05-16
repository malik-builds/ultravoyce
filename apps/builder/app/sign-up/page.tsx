"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/workflows";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        setDone(true);
        return;
      }
      const supabase = createClient();
      if (!supabase) throw new Error("Auth unavailable");
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) {
        setError(authError.message);
        return;
      }
      setDone(true);
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
        {done ? (
          <p className="text-center text-[13px] text-[var(--text-secondary)]">
            Check your email to confirm your account.
          </p>
        ) : (
          <>
            <h1 className="text-lg font-medium text-[var(--text-primary)]">
              Create an account
            </h1>
            <p className="mb-6 mt-1 text-[13px] text-[var(--text-secondary)]">
              Start building voice agents
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
                  minLength={8}
                  className="field-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">Confirm password</span>
                <input
                  type="password"
                  required
                  className="field-input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              {error && (
                <p className="rounded-md border border-[var(--error)] bg-[#f8717115] px-3 py-2 text-[11px] text-[var(--error)]">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? "Creating…" : "Create account"}
              </button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-[12px] text-[var(--text-secondary)]">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-[var(--accent)] underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
