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
    <main className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <h1 className="app-title">登入</h1>
        <p className="app-subtitle mt-1">歡迎回來，登入後即可開始計算工時與薪資</p>
      </div>
      <div className="app-card space-y-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="app-label">
            <span>Email</span>
          <input
            name="email"
            type="email"
            className="app-input"
            placeholder="you@example.com"
            required
          />
          </label>
          <label className="app-label">
            <span>密碼</span>
          <input
            name="password"
            type="password"
            className="app-input"
            placeholder="至少 6 碼"
            minLength={6}
            required
          />
          </label>
          {error && <p className="app-alert-error">{error}</p>}
          <button type="submit" disabled={loading} className="app-btn-primary w-full">
            {loading ? "登入中..." : "登入"}
          </button>
        </form>
        <div className="flex items-center justify-between text-sm text-slate-600">
          <a className="app-link" href="/forgot">
            忘記密碼？
          </a>
          <a className="app-link" href="/register">
            註冊新帳號
          </a>
        </div>
      </div>
    </main>
  );
}
