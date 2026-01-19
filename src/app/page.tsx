import Link from "next/link";

export default function Home() {
  return (
    <main className="space-y-6 rounded-lg bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">工時與薪資計算</h1>
      <p className="text-sm text-slate-600">請先登入開始使用。</p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700"
        >
          登入
        </Link>
        <Link
          href="/register"
          className="rounded border border-blue-600 px-4 py-2 text-blue-700 hover:bg-blue-50"
        >
          註冊
        </Link>
      </div>
    </main>
  );
}
