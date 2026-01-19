"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("請輸入有效的 email"),
  password: z.string().min(6, "密碼至少 6 碼")
});

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? "")
    };

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "請填寫完整");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登入失敗");
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-md space-y-6 rounded-lg bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">登入</h1>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "登入中..." : "登入"}
        </button>
      </form>
      <div className="text-sm text-slate-600">
        <a className="text-blue-600" href="/forgot">
          忘記密碼？
        </a>
        <span className="px-2">·</span>
        <a className="text-blue-600" href="/register">
          註冊新帳號
        </a>
      </div>
    </main>
  );
}
