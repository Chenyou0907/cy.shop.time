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
    const formEl = event.currentTarget; // capture before await to avoid pooled event surprises
    const formData = new FormData(formEl);
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
      formEl.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "寄送失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <h1 className="app-title">忘記密碼</h1>
        <p className="app-subtitle mt-1">輸入註冊信箱，我們會寄出重設連結</p>
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
          {error && <p className="app-alert-error">{error}</p>}
          {message && <p className="app-alert-success">{message}</p>}
          <button type="submit" disabled={loading} className="app-btn-primary w-full">
            {loading ? "寄送中..." : "寄送重設連結"}
          </button>
        </form>
        <div className="text-center text-sm text-slate-600">
          <a className="app-link" href="/login">
            返回登入
          </a>
        </div>
      </div>
    </main>
  );
}
