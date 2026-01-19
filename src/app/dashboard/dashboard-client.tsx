"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { calcHours, calcPay, DEFAULT_OVERTIME_RULE } from "@/lib/pay";
import { importXlsx, exportXlsx } from "@/lib/xlsx";
import { HolidayType, TimesheetRow } from "@/types/timesheet";
import { createSupabaseClient } from "@/lib/supabase/client";

interface Props {
  email: string;
}

interface OvertimeSettings {
  thresholdHours: number;
  level1Rate: number;
  level2Rate: number;
  level3Rate: number;
  baseWage: number;
}

const SETTINGS_KEY_PREFIX = "overtime-settings-";

export default function DashboardClient({ email }: Props) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [holiday, setHoliday] = useState<HolidayType>("none");
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [settings, setSettings] = useState<OvertimeSettings>({
    thresholdHours: DEFAULT_OVERTIME_RULE.thresholdHours,
    level1Rate: DEFAULT_OVERTIME_RULE.level1Rate,
    level2Rate: DEFAULT_OVERTIME_RULE.level2Rate,
    level3Rate: DEFAULT_OVERTIME_RULE.level3Rate,
    baseWage: 190
  });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseClient(), []);

  useEffect(() => {
    if (!email) return;
    const key = SETTINGS_KEY_PREFIX + email;
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        setSettings(JSON.parse(cached));
      } catch (e) {
        console.error("讀取設定失敗", e);
      }
    }
  }, [email]);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase.auth.getUser();
      const meta = data.user?.user_metadata?.overtimeSettings as Partial<OvertimeSettings> | undefined;
      if (meta) {
        setSettings((prev) => ({ ...prev, ...meta }));
      }
    };
    fetchProfile();
  }, [supabase]);

  useEffect(() => {
    if (!email) return;
    const key = SETTINGS_KEY_PREFIX + email;
    localStorage.setItem(key, JSON.stringify(settings));
  }, [email, settings]);

  const totalPay = useMemo(() => rows.reduce((sum, r) => sum + r.totalPay, 0), [rows]);

  const handleAdd = () => {
    setError(null);
    if (!date || !startTime || !endTime) {
      setError("請填寫日期與時間");
      return;
    }
    const hours = calcHours(startTime, endTime, breakMinutes);
    const { overtimePay, totalPay: pay } = calcPay({
      hours,
      wage: settings.baseWage,
      holiday,
      overtimeRule: {
        thresholdHours: settings.thresholdHours,
        level1Rate: settings.level1Rate,
        level2Rate: settings.level2Rate,
        level3Rate: settings.level3Rate
      }
    });

    const newRow: TimesheetRow = {
      id: uuid(),
      date,
      startTime,
      endTime,
      breakMinutes,
      hours,
      wage: settings.baseWage,
      overtimePay,
      totalPay: pay,
      holiday,
      note
    };
    setRows((prev) => [...prev, newRow]);
    setNote("");
  };

  const handleImport = async (file?: File | null) => {
    if (!file) return;
    try {
      const imported = await importXlsx(file);
      setRows(imported);
    } catch (e) {
      setError(e instanceof Error ? e.message : "匯入失敗");
    }
  };

  const handleExport = () => {
    if (!rows.length) {
      setError("沒有資料可以匯出");
      return;
    }
    exportXlsx(rows);
  };

  const handleDelete = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const saveSettingsToAccount = async () => {
    setSaveMessage(null);
    const { error: updateError } = await supabase.auth.updateUser({ data: { overtimeSettings: settings } });
    if (updateError) {
      setSaveMessage(updateError.message);
      return;
    }
    setSaveMessage("已儲存到帳號設定");
  };

  return (
    <main className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">工時與薪資計算</h1>
          <p className="text-sm text-slate-600">帳號：{email}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <label className="flex items-center gap-1">
            <span>基礎時薪</span>
            <input
              type="number"
              value={settings.baseWage}
              onChange={(e) => setSettings({ ...settings, baseWage: Number(e.target.value) })}
              className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
            />
          </label>
          <button
            onClick={() => handleExport()}
            className="rounded bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700"
          >
            匯出 XLSX
          </button>
          <label className="cursor-pointer rounded border border-slate-300 px-3 py-1 text-center hover:bg-slate-50">
            匯入 XLSX
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => handleImport(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      <section className="space-y-3 rounded border border-slate-200 p-4">
        <h2 className="text-lg font-semibold">輸入</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">日期
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">上班時間
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">下班時間
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">休息時間 (分鐘)
            <input
              type="number"
              min={0}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">假別
            <div className="mt-1 flex gap-3">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="holiday"
                  value="none"
                  checked={holiday === "none"}
                  onChange={() => setHoliday("none")}
                />
                <span>一般日</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="holiday"
                  value="typhoon"
                  checked={holiday === "typhoon"}
                  onChange={() => setHoliday("typhoon")}
                />
                <span>颱風假 (雙倍)</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="holiday"
                  value="national"
                  checked={holiday === "national"}
                  onChange={() => setHoliday("national")}
                />
                <span>國定假日 (雙倍)</span>
              </label>
            </div>
          </label>
          <label className="text-sm">備註
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              placeholder="選填"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>加班規則 (可自行調整，會儲存到帳號設定)</span>
          <label className="flex items-center gap-1">
            <span>8 小時後</span>
            <input
              type="number"
              value={settings.thresholdHours}
              onChange={(e) => setSettings({ ...settings, thresholdHours: Number(e.target.value) })}
              className="w-16 rounded border border-slate-300 px-2 py-1 text-right"
            />
          </label>
          <label className="flex items-center gap-1">
            <span>前 2 小時倍率</span>
            <input
              type="number"
              step="0.01"
              value={settings.level1Rate}
              onChange={(e) => setSettings({ ...settings, level1Rate: Number(e.target.value) })}
              className="w-20 rounded border border-slate-300 px-2 py-1 text-right"
            />
          </label>
          <label className="flex items-center gap-1">
            <span>再 2 小時倍率</span>
            <input
              type="number"
              step="0.01"
              value={settings.level2Rate}
              onChange={(e) => setSettings({ ...settings, level2Rate: Number(e.target.value) })}
              className="w-20 rounded border border-slate-300 px-2 py-1 text-right"
            />
          </label>
          <label className="flex items-center gap-1">
            <span>超過 12 小時倍率</span>
            <input
              type="number"
              step="0.01"
              value={settings.level3Rate}
              onChange={(e) => setSettings({ ...settings, level3Rate: Number(e.target.value) })}
              className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
            />
          </label>
          <button
            type="button"
            onClick={saveSettingsToAccount}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            儲存設定
          </button>
          {saveMessage && <span className="text-slate-600">{saveMessage}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAdd}
            className="rounded bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700"
          >
            新增一筆
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </section>

      <section className="space-y-3 rounded border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">清單</h2>
          <p className="text-sm text-slate-700">總金額：{totalPay.toLocaleString()} 元</p>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">上班</th>
                <th className="px-3 py-2">下班</th>
                <th className="px-3 py-2">休息(分)</th>
                <th className="px-3 py-2">時數</th>
                <th className="px-3 py-2">時薪</th>
                <th className="px-3 py-2">假別</th>
                <th className="px-3 py-2">加班費</th>
                <th className="px-3 py-2">總額</th>
                <th className="px-3 py-2">備註</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.startTime}</td>
                  <td className="px-3 py-2">{row.endTime}</td>
                  <td className="px-3 py-2 text-right">{row.breakMinutes}</td>
                  <td className="px-3 py-2 text-right">{row.hours}</td>
                  <td className="px-3 py-2 text-right">{row.wage}</td>
                  <td className="px-3 py-2">
                    {row.holiday === "none" ? "一般" : row.holiday === "typhoon" ? "颱風" : "國定"}
                  </td>
                  <td className="px-3 py-2 text-right">{row.overtimePay.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right">{row.totalPay.toFixed(0)}</td>
                  <td className="px-3 py-2">{row.note}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleDelete(row.id)}
                      className="text-red-600 hover:underline"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                    尚無資料，請輸入後新增或匯入 XLSX
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
