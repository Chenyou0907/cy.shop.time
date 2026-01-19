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
    <main className="mx-auto max-w-md space-y-6 rounded-lg bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">重設密碼</h1>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1 text-sm">
          <span>新密碼</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            placeholder="至少 6 碼"
            minLength={6}
            required
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "更新中..." : "更新密碼"}
        </button>
      </form>
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
