"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const supabase = createSupabaseClient();

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;
    supabase.auth.exchangeCodeForSession(code).catch((err) => {
      console.error("exchangeCodeForSession", err);
      setError("驗證連結已失效，請重新索取重設信件。");
    });
  }, [searchParams, supabase]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (password.length < 6) {
      setError("密碼至少 6 碼");
      return;
    }
    try {
      setLoading(true);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("密碼已更新，請重新登入。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <h1 className="app-title">重設密碼</h1>
        <p className="app-subtitle mt-1">請設定新的登入密碼（至少 6 碼）</p>
      </div>
      <div className="app-card space-y-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="app-label">
            <span>新密碼</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="app-input"
              placeholder="至少 6 碼"
              minLength={6}
              required
            />
          </label>
          {error && <p className="app-alert-error">{error}</p>}
          {message && <p className="app-alert-success">{message}</p>}
          <button type="submit" disabled={loading} className="app-btn-primary w-full">
            {loading ? "更新中..." : "更新密碼"}
          </button>
        </form>
        {message && (
          <div className="text-center text-sm text-slate-600">
            <a className="app-link" href="/login">
              前往登入
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">載入中...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
