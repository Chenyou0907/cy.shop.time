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
    <main className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <h1 className="app-title">註冊</h1>
        <p className="app-subtitle mt-1">建立帳號後即可開始記錄工時，支援 XLSX 匯入與匯出</p>
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
          <label className="app-label">
            <span>再次輸入密碼</span>
            <input
              name="confirm"
              type="password"
              className="app-input"
              placeholder="請再次輸入"
              minLength={6}
              required
            />
          </label>
          {error && <p className="app-alert-error">{error}</p>}
          {message && <p className="app-alert-success">{message}</p>}
          <button type="submit" disabled={loading} className="app-btn-primary w-full">
            {loading ? "送出中..." : "建立帳號"}
          </button>
        </form>
        <div className="text-center text-sm text-slate-600">
          <a className="app-link" href="/login">
            已有帳號？登入
          </a>
        </div>
      </div>
    </main>
  );
}
