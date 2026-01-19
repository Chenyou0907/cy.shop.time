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

interface PaySettings {
  cyclesPerMonth: number; // 1~4
  paydays: number[]; // 每次發薪日期 (1~31)
}

const SETTINGS_KEY_PREFIX = "overtime-settings-";
const ROWS_KEY_PREFIX = "timesheet-rows-";
const PAY_SETTINGS_KEY_PREFIX = "pay-settings-";

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
  const [view, setView] = useState<"timesheet" | "payroll">("timesheet");
  const [paySettings, setPaySettings] = useState<PaySettings>({
    cyclesPerMonth: 1,
    paydays: [5]
  });
  const [selectedMonth, setSelectedMonth] = useState<string>("");
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
    if (!email) return;
    const key = ROWS_KEY_PREFIX + email;
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as TimesheetRow[];
        if (Array.isArray(parsed)) setRows(parsed);
      } catch (e) {
        console.error("讀取工時資料失敗", e);
      }
    }
  }, [email]);

  useEffect(() => {
    if (!email) return;
    const key = PAY_SETTINGS_KEY_PREFIX + email;
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as PaySettings;
        if (parsed && typeof parsed.cyclesPerMonth === "number" && Array.isArray(parsed.paydays)) {
          setPaySettings({
            cyclesPerMonth: Math.min(Math.max(parsed.cyclesPerMonth, 1), 4),
            paydays: parsed.paydays
          });
        }
      } catch (e) {
        console.error("讀取發薪設定失敗", e);
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

  useEffect(() => {
    if (!email) return;
    const key = ROWS_KEY_PREFIX + email;
    localStorage.setItem(key, JSON.stringify(rows));
  }, [email, rows]);

  useEffect(() => {
    if (!email) return;
    const key = PAY_SETTINGS_KEY_PREFIX + email;
    localStorage.setItem(key, JSON.stringify(paySettings));
  }, [email, paySettings]);

  const monthTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      if (!r.date) continue;
      const month = r.date.slice(0, 7); // YYYY-MM
      map[month] = (map[month] ?? 0) + r.totalPay;
    }
    return map;
  }, [rows]);

  useEffect(() => {
    if (selectedMonth) return;
    const keys = Object.keys(monthTotals).sort();
    if (keys.length > 0) {
      setSelectedMonth(keys[keys.length - 1]);
    }
  }, [monthTotals, selectedMonth]);

  const totalPay = useMemo(() => rows.reduce((sum, r) => sum + r.totalPay, 0), [rows]);
  const selectedMonthTotal = selectedMonth ? monthTotals[selectedMonth] ?? 0 : 0;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const hoursOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
  const minutesOptions = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));
  const startHour = startTime.split(":")[0] ?? "";
  const startMinute = startTime.split(":")[1] ?? "";
  const endHour = endTime.split(":")[0] ?? "";
  const endMinute = endTime.split(":")[1] ?? "";

  const payCyclesForMonth = useMemo(() => {
    if (!selectedMonth) return [];
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr); // 1-12
    if (!year || !month) return [];
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const days = paySettings.paydays
      .slice(0, paySettings.cyclesPerMonth)
      .map((d) => Math.min(Math.max(Math.round(d || 1), 1), lastDayOfMonth))
      .sort((a, b) => a - b);
    const ranges: { index: number; startDay: number; endDay: number }[] = [];
    for (let i = 0; i < days.length; i++) {
      const startDay = i === 0 ? 1 : days[i - 1] + 1;
      const endDay = days[i];
      ranges.push({ index: i, startDay, endDay });
    }
    if (ranges.length === 0) {
      ranges.push({ index: 0, startDay: 1, endDay: lastDayOfMonth });
    } else {
      const last = ranges[ranges.length - 1];
      if (last.endDay < lastDayOfMonth) {
        ranges[ranges.length - 1] = { ...last, endDay: lastDayOfMonth };
      }
    }
    return ranges;
  }, [paySettings, selectedMonth]);

  const handleAdd = () => {
    setError(null);
    if (!date || !startTime || !endTime) {
      setError("請填寫日期與時間");
      return;
    }
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(startTime) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
      setError("時間格式請使用 24 小時制 HH:mm（例如 09:30、17:00）");
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
    <main className="space-y-6">
      <header className="app-surface px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">工時與薪資計算</h1>
            <p className="mt-1 text-sm text-slate-600">
              <span className="mr-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {email}
              </span>
              已登入
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">基礎時薪</span>
              <input
                type="number"
                value={settings.baseWage}
                onChange={(e) => setSettings({ ...settings, baseWage: Number(e.target.value) })}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </label>
            <button onClick={() => handleExport()} className="app-btn bg-emerald-600 text-white hover:bg-emerald-700">
              匯出 XLSX
            </button>
            <label className="app-btn cursor-pointer border border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
              匯入 XLSX
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleImport(e.target.files?.[0])}
              />
            </label>
            <button onClick={handleSignOut} className="app-btn-ghost">
              登出
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setView("timesheet")}
            className={`app-btn px-3 py-1.5 ${view === "timesheet" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            工時輸入
          </button>
          <button
            type="button"
            onClick={() => setView("payroll")}
            className={`app-btn px-3 py-1.5 ${view === "payroll" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            薪資設定 / 每月總額
          </button>
        </div>
      </header>

      {view === "timesheet" && (
        <>
      <section className="app-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">輸入</h2>
            <p className="text-sm text-slate-600">新增一筆工時，系統會依加班規則自動計算</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="app-label">日期
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="app-input mt-1"
            />
          </label>
          <label className="app-label">上班時間
            <div className="mt-1 flex gap-2">
              <select
                className="app-input"
                value={startHour}
                onChange={(e) => setStartTime(`${e.target.value}:${startMinute || "00"}`)}
              >
                <option value="">時</option>
                {hoursOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <select
                className="app-input"
                value={startMinute}
                onChange={(e) => setStartTime(`${startHour || "00"}:${e.target.value}`)}
              >
                <option value="">分</option>
                {minutesOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="app-label">下班時間
            <div className="mt-1 flex gap-2">
              <select
                className="app-input"
                value={endHour}
                onChange={(e) => setEndTime(`${e.target.value}:${endMinute || "00"}`)}
              >
                <option value="">時</option>
                {hoursOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <select
                className="app-input"
                value={endMinute}
                onChange={(e) => setEndTime(`${endHour || "00"}:${e.target.value}`)}
              >
                <option value="">分</option>
                {minutesOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="app-label">休息時間 (分鐘)
            <input
              type="number"
              min={0}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
              className="app-input mt-1"
            />
          </label>
          <label className="app-label">假別
            <div className="mt-2 flex flex-wrap gap-4">
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
          <label className="app-label">備註
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="app-input mt-1"
              placeholder="選填"
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <span className="font-medium">加班規則</span>
          <span className="text-slate-500">(可自行調整，並儲存到帳號設定)</span>
          <label className="flex items-center gap-2">
            <span>8 小時後</span>
            <input
              type="number"
              value={settings.thresholdHours}
              onChange={(e) => setSettings({ ...settings, thresholdHours: Number(e.target.value) })}
              className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </label>
          <label className="flex items-center gap-2">
            <span>前 2 小時倍率</span>
            <input
              type="number"
              step="0.01"
              value={settings.level1Rate}
              onChange={(e) => setSettings({ ...settings, level1Rate: Number(e.target.value) })}
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </label>
          <label className="flex items-center gap-2">
            <span>再 2 小時倍率</span>
            <input
              type="number"
              step="0.01"
              value={settings.level2Rate}
              onChange={(e) => setSettings({ ...settings, level2Rate: Number(e.target.value) })}
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </label>
          <label className="flex items-center gap-2">
            <span>超過 12 小時倍率</span>
            <input
              type="number"
              step="0.01"
              value={settings.level3Rate}
              onChange={(e) => setSettings({ ...settings, level3Rate: Number(e.target.value) })}
              className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </label>
          <button
            type="button"
            onClick={saveSettingsToAccount}
            className="app-btn-ghost"
          >
            儲存設定
          </button>
          {saveMessage && <span className="text-slate-600">{saveMessage}</span>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={handleAdd} className="app-btn-primary">
            新增一筆
          </button>
          {error && <p className="app-alert-error">{error}</p>}
        </div>
      </section>

      <section className="app-surface p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight">清單</h2>
          <p className="text-sm text-slate-700">
            總金額：<span className="font-semibold">{totalPay.toLocaleString()}</span> 元
          </p>
        </div>
        <div className="mt-3 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="sticky top-0 bg-slate-100 text-left">
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
                <tr key={row.id} className="border-b last:border-b-0">
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
                      className="text-red-700 hover:underline underline-offset-4"
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
        </>
      )}

      {view === "payroll" && (
        <section className="app-surface space-y-6 p-4 sm:p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">薪資設定與每月總薪資</h2>
            <p className="text-sm text-slate-600">
              設定每月發薪次數與日期，並查看各月份的薪資總額。
            </p>
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-800">發薪設定</h3>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span>每月發薪次數</span>
                <select
                  className="app-input w-24"
                  value={paySettings.cyclesPerMonth}
                  onChange={(e) => {
                    const cycles = Math.min(Math.max(Number(e.target.value) || 1, 1), 4);
                    setPaySettings((prev) => ({
                      cyclesPerMonth: cycles,
                      paydays: prev.paydays.slice(0, cycles).concat(Array(Math.max(cycles - prev.paydays.length, 0)).fill(5))
                    }));
                  }}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} 次 / 月
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-sm">
              {Array.from({ length: paySettings.cyclesPerMonth }, (_, i) => {
                const value = paySettings.paydays[i] ?? 5;
                return (
                  <label key={i} className="app-label">
                    <span>第 {i + 1} 次發薪日期 (幾號)</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      className="app-input"
                      value={value}
                      onChange={(e) => {
                        const day = Math.min(Math.max(Number(e.target.value) || 1, 1), 31);
                        setPaySettings((prev) => {
                          const next = [...prev.paydays];
                          next[i] = day;
                          return { ...prev, paydays: next };
                        });
                      }}
                    />
                  </label>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-sm text-slate-700">
              <p className="font-medium">以目前選擇月份 {selectedMonth || "（無資料）"} 計算區間：</p>
              {!selectedMonth && <p className="text-slate-500">尚無工時資料，新增工時後會自動產生月份。</p>}
              {selectedMonth &&
                payCyclesForMonth.map((c) => (
                  <p key={c.index}>
                    第 {c.index + 1} 次：
                    {selectedMonth.slice(5)}/{c.startDay.toString().padStart(2, "0")} ~{" "}
                    {selectedMonth.slice(5)}/{c.endDay.toString().padStart(2, "0")}
                  </p>
                ))}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-800">每月總薪資</h3>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span>選擇月份</span>
                <select
                  className="app-input w-40"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                >
                  {!selectedMonth && <option value="">請先新增工時</option>}
                  {Object.keys(monthTotals)
                    .sort()
                    .map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <p className="text-slate-600">
                選擇月份總薪資：
                <span className="text-lg font-semibold text-slate-900">
                  {selectedMonthTotal.toLocaleString()}
                </span>{" "}
                元
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
