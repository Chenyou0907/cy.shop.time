import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "工時與薪資計算",
  description: "工時記錄、薪資計算、颱風假與國定假日雙倍時薪，支援 XLSX 匯入與匯出"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
