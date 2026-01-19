"use client";

import { useState } from "react";
import { z } from "zod";

const schema = z
  .object({
    email: z.string().email("請輸入有效的 email"),
    password: z.string().min(6, "密碼至少 6 碼"),
    confirm: z.string().min(6)
  })
  .refine((data) => data.password === data.confirm, {
    message: "兩次密碼不一致",
    path: ["confirm"]
  });

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const formEl = event.currentTarget; // capture before await to avoid React pooling issues
    const formData = new FormData(formEl);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("confirm") ?? "")
    };

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "請填寫完整");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "註冊失敗");
      setMessage("註冊成功，請至 Email 收信並完成驗證。");
      formEl.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "註冊失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-md space-y-6 rounded-lg bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">註冊</h1>
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
        <label className="block space-y-1 text-sm">
          <span>密碼</span>
          <input
            name="password"
            type="password"
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            placeholder="至少 6 碼"
            minLength={6}
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>再次輸入密碼</span>
          <input
            name="confirm"
            type="password"
            className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            placeholder="請再次輸入"
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
          {loading ? "送出中..." : "建立帳號"}
        </button>
      </form>
      <div className="text-sm text-slate-600">
        <a className="text-blue-600" href="/login">
          已有帳號？登入
        </a>
      </div>
    </main>
  );
}
