"use client";

import { useState } from "react";
import { z } from "zod";

const schema = z.object({ email: z.string().email("請輸入有效的 email") });

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    const payload = { email: String(formData.get("email") ?? "") };

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "請填寫完整");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "寄送失敗");
      setMessage("已寄出重設連結，請至 Email 查看。");
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "寄送失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-md space-y-6 rounded-lg bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">忘記密碼</h1>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <input
            name="email"
            type="email"
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            placeholder="you@example.com"
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
          {loading ? "寄送中..." : "寄送重設連結"}
        </button>
      </form>
      <div className="text-sm text-slate-600">
        <a className="text-blue-600" href="/login">
          返回登入
        </a>
      </div>
    </main>
  );
}
