"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
    cyclesPerMonth: 2,
    paydays: [20, 5]
  });
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseClient(), []);

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const getUserId = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("取得使用者資訊失敗", error);
      return null;
    }
    return data.user?.id ?? null;
  }, [supabase]);

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

  // 從 Supabase DB 載入工時資料（跨裝置同步），localStorage 作為離線備援
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const loadFromLocal = () => {
      const cached = localStorage.getItem(ROWS_KEY_PREFIX + email);
      if (!cancelled && cached) {
        try {
          const parsed = JSON.parse(cached) as TimesheetRow[];
          if (Array.isArray(parsed)) {
            // 確保 id 是 UUID（避免後續寫入 DB 失敗）
            const normalized = parsed.map((r) => ({ ...r, id: isUuid(r.id) ? r.id : uuid() }));
            setRows(normalized);
          }
        } catch (e) {
          console.error("讀取工時資料失敗", e);
        }
      }
    };
    const load = async () => {
      const uid = await getUserId();
      if (!uid) {
        loadFromLocal();
        return;
      }

      const { data, error } = await supabase
        .from("timesheet_rows")
        .select("id, work_date, start_time, end_time, break_minutes, hours, wage, overtime_pay, total_pay, holiday, note")
        .eq("user_id", uid)
        .order("work_date", { ascending: true });

      if (!cancelled && !error && data && data.length > 0) {
        const mapped: TimesheetRow[] = data.map((r: any) => ({
          id: String(r.id),
          date: String(r.work_date),
          startTime: String(r.start_time),
          endTime: String(r.end_time),
          breakMinutes: Number(r.break_minutes ?? 0),
          hours: Number(r.hours ?? 0),
          wage: Number(r.wage ?? 0),
          overtimePay: Number(r.overtime_pay ?? 0),
          totalPay: Number(r.total_pay ?? 0),
          holiday: (r.holiday as HolidayType) ?? "none",
          note: r.note ?? ""
        }));
        setRows(mapped);
        localStorage.setItem(ROWS_KEY_PREFIX + email, JSON.stringify(mapped));
        return;
      }

      if (error) {
        console.error("從 Supabase 讀取工時資料失敗", error);
      }

      // DB 沒資料（或錯誤）時 fallback to localStorage（避免把本機資料洗掉）
      loadFromLocal();
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [email, getUserId, supabase]);

  // 從 Supabase DB 載入發薪設定（跨裝置同步），localStorage 作為離線備援
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const loadFromLocal = () => {
      const cached = localStorage.getItem(PAY_SETTINGS_KEY_PREFIX + email);
      if (!cancelled && cached) {
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
    };
    const load = async () => {
      const uid = await getUserId();
      if (!uid) {
        loadFromLocal();
        return;
      }

      const { data, error } = await supabase
        .from("pay_settings")
        .select("cycles_per_month, paydays")
        .eq("user_id", uid)
        .maybeSingle();

      if (!cancelled && !error && data) {
        const next: PaySettings = {
          cyclesPerMonth: Math.min(Math.max(Number(data.cycles_per_month ?? 2), 1), 4),
          paydays: Array.isArray(data.paydays) ? data.paydays : (data.paydays ?? [20, 5])
        };
        setPaySettings(next);
        localStorage.setItem(PAY_SETTINGS_KEY_PREFIX + email, JSON.stringify(next));
        return;
      }

      if (error) console.error("從 Supabase 讀取發薪設定失敗", error);

      loadFromLocal();
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [email, getUserId, supabase]);

  // 不再從 Supabase user_metadata 讀取設定，避免標頭過大
  // 設定僅從 localStorage 讀取

  useEffect(() => {
    if (!email) return;
    const key = SETTINGS_KEY_PREFIX + email;
    localStorage.setItem(key, JSON.stringify(settings));
  }, [email, settings]);

  // 同步工時資料到 localStorage
  useEffect(() => {
    if (!email) return;
    const key = ROWS_KEY_PREFIX + email;
    localStorage.setItem(key, JSON.stringify(rows));
  }, [email, rows]);

  // 同步發薪設定到 localStorage + Supabase DB
  useEffect(() => {
    if (!email) return;
    const key = PAY_SETTINGS_KEY_PREFIX + email;
    localStorage.setItem(key, JSON.stringify(paySettings));
    // fire-and-forget upsert
    (async () => {
      const uid = await getUserId();
      if (!uid) return;
      const { error } = await supabase.from("pay_settings").upsert({
        user_id: uid,
        cycles_per_month: paySettings.cyclesPerMonth,
        paydays: paySettings.paydays
      });
      if (error) console.error("同步發薪設定到 Supabase 失敗", error);
    })();
  }, [email, getUserId, paySettings, supabase]);

  const monthTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) {
      if (!r.date) continue;
      const month = r.date.slice(0, 7); // YYYY-MM
      map[month] = Math.round((map[month] ?? 0) + r.totalPay);
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

  // 當日期改變時，檢查該日期是否已有記錄，如果有就自動載入
  useEffect(() => {
    if (!date) {
      // 如果日期清空，也清空編輯狀態
      setEditingRowId(null);
      return;
    }
    const existingRow = rows.find((r) => r.date === date);
    if (existingRow) {
      // 找到該日期的記錄，載入資料
      setEditingRowId(existingRow.id);
      setStartTime(existingRow.startTime);
      setEndTime(existingRow.endTime);
      setBreakMinutes(existingRow.breakMinutes);
      setHoliday(existingRow.holiday);
      setNote(existingRow.note || "");
    } else {
      // 沒有記錄，清空編輯狀態和表單
      setEditingRowId(null);
      setStartTime("");
      setEndTime("");
      setBreakMinutes(0);
      setHoliday("none");
      setNote("");
    }
  }, [date, rows]);

  const totalPay = useMemo(() => Math.round(rows.reduce((sum, r) => sum + r.totalPay, 0)), [rows]);
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
    const cycles = paySettings.cyclesPerMonth;
    const ranges: { index: number; startDay: number; endDay: number; payday: number }[] = [];
    
    if (cycles === 1) {
      ranges.push({ index: 0, startDay: 1, endDay: lastDayOfMonth, payday: paySettings.paydays[0] ?? 5 });
    } else if (cycles === 2) {
      // 第1次：1-15號，發薪日期是 paydays[0]
      ranges.push({ index: 0, startDay: 1, endDay: 15, payday: paySettings.paydays[0] ?? 20 });
      // 第2次：16-月底，發薪日期是 paydays[1]
      ranges.push({ index: 1, startDay: 16, endDay: lastDayOfMonth, payday: paySettings.paydays[1] ?? 5 });
    } else if (cycles === 3) {
      const split1 = Math.floor(lastDayOfMonth / 3);
      const split2 = Math.floor((lastDayOfMonth * 2) / 3);
      ranges.push({ index: 0, startDay: 1, endDay: split1, payday: paySettings.paydays[0] ?? 5 });
      ranges.push({ index: 1, startDay: split1 + 1, endDay: split2, payday: paySettings.paydays[1] ?? 5 });
      ranges.push({ index: 2, startDay: split2 + 1, endDay: lastDayOfMonth, payday: paySettings.paydays[2] ?? 5 });
    } else if (cycles === 4) {
      const split1 = Math.floor(lastDayOfMonth / 4);
      const split2 = Math.floor((lastDayOfMonth * 2) / 4);
      const split3 = Math.floor((lastDayOfMonth * 3) / 4);
      ranges.push({ index: 0, startDay: 1, endDay: split1, payday: paySettings.paydays[0] ?? 5 });
      ranges.push({ index: 1, startDay: split1 + 1, endDay: split2, payday: paySettings.paydays[1] ?? 5 });
      ranges.push({ index: 2, startDay: split2 + 1, endDay: split3, payday: paySettings.paydays[2] ?? 5 });
      ranges.push({ index: 3, startDay: split3 + 1, endDay: lastDayOfMonth, payday: paySettings.paydays[3] ?? 5 });
    }
    
    return ranges;
  }, [paySettings, selectedMonth]);

  const payPerCycle = useMemo(() => {
    if (!selectedMonth || payCyclesForMonth.length === 0) return [];
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return [];

    return payCyclesForMonth.map((cycle) => {
      // 計算該週期內所有工時記錄的總金額
      const cycleTotal = Math.round(rows.reduce((sum, row) => {
        if (!row.date) return sum;
        const rowDate = new Date(row.date);
        const rowYear = rowDate.getFullYear();
        const rowMonth = rowDate.getMonth() + 1; // getMonth() returns 0-11
        const rowDay = rowDate.getDate();

        // 檢查是否在選定的月份和週期範圍內
        if (rowYear === year && rowMonth === month && rowDay >= cycle.startDay && rowDay <= cycle.endDay) {
          return sum + row.totalPay;
        }
        return sum;
      }, 0));

      return {
        ...cycle,
        amount: cycleTotal
      };
    });
  }, [payCyclesForMonth, rows, selectedMonth]);

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

    const persistRowToDb = async (row: TimesheetRow) => {
      const uid = await getUserId();
      if (!uid) return;
      // 用 (user_id, work_date) unique 做 upsert，避免 id 型別問題
      const { error } = await supabase.from("timesheet_rows").upsert(
        {
        user_id: uid,
        work_date: row.date,
        start_time: row.startTime,
        end_time: row.endTime,
        break_minutes: row.breakMinutes,
        hours: row.hours,
        wage: row.wage,
        overtime_pay: row.overtimePay,
        total_pay: row.totalPay,
        holiday: row.holiday,
        note: row.note ?? ""
        },
        { onConflict: "user_id,work_date" }
      );
      if (error) console.error("同步工時到 Supabase 失敗", error);
    };

    if (editingRowId) {
      // 如果正在編輯現有記錄，則更新該記錄
      const updated: TimesheetRow = {
        id: editingRowId,
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
      setRows((prev) =>
        prev.map((row) =>
          row.id === editingRowId
            ? {
                ...row,
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
              }
            : row
        )
      );
      void persistRowToDb(updated);
    } else {
      // 新增記錄
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
      void persistRowToDb(newRow);
    }
    setNote("");
  };

  const handleImport = async (file?: File | null) => {
    if (!file) return;
    try {
      const imported = await importXlsx(file);
      // 確保 id 是 UUID（xlsx 匯入的 id 可能不是 UUID）
      const normalized = imported.map((r) => ({ ...r, id: isUuid(r.id) ? r.id : uuid() }));
      setRows(normalized);
      // 匯入後同步到 Supabase（批次 upsert）
      const uid = await getUserId();
      if (uid) {
        // Supabase / Postgres：同一批 upsert 不能包含重複的 (user_id, work_date)
        // 若匯入檔同一天有多筆，這裡以「最後一筆為準」去重
        const byDate = new Map<string, TimesheetRow>();
        for (const row of normalized) byDate.set(row.date, row);
        const payload = Array.from(byDate.values()).map((row) => ({
          user_id: uid,
          work_date: row.date,
          start_time: row.startTime,
          end_time: row.endTime,
          break_minutes: row.breakMinutes,
          hours: row.hours,
          wage: row.wage,
          overtime_pay: row.overtimePay,
          total_pay: row.totalPay,
          holiday: row.holiday,
          note: row.note ?? ""
        }));
        const { error } = await supabase.from("timesheet_rows").upsert(payload, { onConflict: "user_id,work_date" });
        if (error) console.error("匯入同步到 Supabase 失敗", error);
      }
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

  const handleDelete = (id: string) => {
    const target = rows.find((r) => r.id === id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    // 同步刪除到 Supabase
    void (async () => {
      const uid = await getUserId();
      if (!uid) return;
      // 優先用日期刪（避免 id 不一致）
      const q = supabase.from("timesheet_rows").delete().eq("user_id", uid);
      const { error } = target ? await q.eq("work_date", target.date) : await q.eq("id", id);
      if (error) console.error("刪除同步到 Supabase 失敗", error);
    })();
    // 如果刪除的是正在編輯的記錄，清空表單
    if (editingRowId === id) {
      setEditingRowId(null);
      setStartTime("");
      setEndTime("");
      setBreakMinutes(0);
      setHoliday("none");
      setNote("");
    }
  };

  const saveSettingsToAccount = async () => {
    setSaveMessage(null);
    // 加班規則目前只存本地（可選擇之後也存 DB）
    setSaveMessage("設定已儲存到本地");
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 pb-4 sm:pb-8">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6 px-3 py-4 sm:px-4 sm:py-6 lg:px-8">
      <header className="app-surface border-slate-200/80 bg-white/80 backdrop-blur-sm px-4 py-4 sm:px-6 sm:py-5 shadow-lg shadow-slate-200/50">
        <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-xl sm:text-2xl font-bold tracking-tight text-transparent">
              工時與薪資計算
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-600">
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-100 to-indigo-100 px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs font-medium text-blue-700 shadow-sm truncate max-w-[200px] sm:max-w-none">
                {email}
              </span>
              <span className="text-slate-500 whitespace-nowrap">已登入</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium text-slate-700">
              <span className="whitespace-nowrap hidden sm:inline">基礎時薪</span>
              <span className="whitespace-nowrap sm:hidden">時薪</span>
              <input
                type="number"
                value={settings.baseWage}
                onChange={(e) => setSettings({ ...settings, baseWage: Number(e.target.value) })}
                className="w-20 sm:w-32 rounded-lg border border-slate-300 bg-white px-2 sm:px-3 py-1.5 sm:py-2 text-right text-sm font-semibold shadow-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
            <button 
              onClick={() => handleExport()} 
              className="app-btn bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-md shadow-emerald-200/50 transition-all hover:from-emerald-700 hover:to-emerald-800 hover:shadow-lg hover:shadow-emerald-300/50 text-xs sm:text-sm px-3 sm:px-4"
            >
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">匯出 XLSX</span>
              <span className="sm:hidden">匯出</span>
            </button>
            <label className="app-btn cursor-pointer border border-slate-300 bg-white text-slate-800 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 hover:shadow-md text-xs sm:text-sm px-3 sm:px-4">
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="hidden sm:inline">匯入 XLSX</span>
              <span className="sm:hidden">匯入</span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleImport(e.target.files?.[0])}
              />
            </label>
            <button 
              onClick={handleSignOut} 
              className="app-btn-ghost transition-all hover:border-slate-400 hover:shadow-sm text-xs sm:text-sm px-3 sm:px-4"
            >
              登出
            </button>
          </div>
        </div>
        <div className="mt-4 sm:mt-5 flex gap-2 border-t border-slate-200 pt-3 sm:pt-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setView("timesheet")}
            className={`app-btn px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
              view === "timesheet"
                ? "bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md shadow-slate-300/50"
                : "border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 hover:shadow-md"
            }`}
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="ml-1 sm:ml-0">工時輸入</span>
          </button>
          <button
            type="button"
            onClick={() => setView("payroll")}
            className={`app-btn px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
              view === "payroll"
                ? "bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md shadow-slate-300/50"
                : "border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 hover:shadow-md"
            }`}
          >
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="ml-1 sm:ml-0 hidden sm:inline">薪資設定 / 每月總額</span>
            <span className="ml-1 sm:hidden">薪資</span>
          </button>
        </div>
      </header>

      {view === "timesheet" && (
        <>
      <section className="app-surface border-slate-200/80 bg-white/80 backdrop-blur-sm p-4 shadow-lg shadow-slate-200/50 sm:p-6 sm:p-8">
        <div className="mb-4 sm:mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">工時輸入</h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">新增一筆工時，系統會依加班規則自動計算</p>
          </div>
          {editingRowId && (
            <div className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg bg-blue-50 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-blue-700">
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              編輯模式
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <label className="app-label">
            <span className="font-medium text-slate-700">日期</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="app-input mt-1.5 transition-all focus:border-blue-400 focus:ring-blue-500/30"
            />
          </label>
          <label className="app-label">
            <span className="font-medium text-slate-700">上班時間</span>
            <div className="mt-1.5 flex gap-2">
              <select
                className="app-input transition-all focus:border-blue-400 focus:ring-blue-500/30"
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
                className="app-input transition-all focus:border-blue-400 focus:ring-blue-500/30"
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
          <label className="app-label">
            <span className="font-medium text-slate-700">下班時間</span>
            <div className="mt-1.5 flex gap-2">
              <select
                className="app-input transition-all focus:border-blue-400 focus:ring-blue-500/30"
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
                className="app-input transition-all focus:border-blue-400 focus:ring-blue-500/30"
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
          <label className="app-label">
            <span className="font-medium text-slate-700">休息時間 (分鐘)</span>
            <input
              type="number"
              min={0}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
              className="app-input mt-1.5 transition-all focus:border-blue-400 focus:ring-blue-500/30"
            />
          </label>
          <label className="app-label">
            <span className="font-medium text-slate-700">假別</span>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all hover:border-blue-300 hover:bg-blue-50/50">
                <input
                  type="radio"
                  name="holiday"
                  value="none"
                  checked={holiday === "none"}
                  onChange={() => setHoliday("none")}
                  className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
                />
                <span className="font-medium">一般日</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all hover:border-blue-300 hover:bg-blue-50/50">
                <input
                  type="radio"
                  name="holiday"
                  value="typhoon"
                  checked={holiday === "typhoon"}
                  onChange={() => setHoliday("typhoon")}
                  className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
                />
                <span className="font-medium">颱風假 (雙倍)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all hover:border-blue-300 hover:bg-blue-50/50">
                <input
                  type="radio"
                  name="holiday"
                  value="national"
                  checked={holiday === "national"}
                  onChange={() => setHoliday("national")}
                  className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
                />
                <span className="font-medium">國定假日 (雙倍)</span>
              </label>
            </div>
          </label>
          <label className="app-label">
            <span className="font-medium text-slate-700">備註</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="app-input mt-1.5 transition-all focus:border-blue-400 focus:ring-blue-500/30"
              placeholder="選填"
            />
          </label>
        </div>
        <div className="mt-6 sm:mt-8 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 sm:p-5">
          <div className="mb-3 sm:mb-4 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <svg className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span className="text-sm sm:text-base font-semibold text-slate-800">加班規則</span>
            <span className="text-xs text-slate-500 hidden sm:inline">(可自行調整，並儲存到帳號設定)</span>
          </div>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">8 小時後</span>
              <input
                type="number"
                value={settings.thresholdHours}
                onChange={(e) => setSettings({ ...settings, thresholdHours: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right font-semibold shadow-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">前 2 小時倍率</span>
              <input
                type="number"
                step="0.01"
                value={settings.level1Rate}
                onChange={(e) => setSettings({ ...settings, level1Rate: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right font-semibold shadow-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">再 2 小時倍率</span>
              <input
                type="number"
                step="0.01"
                value={settings.level2Rate}
                onChange={(e) => setSettings({ ...settings, level2Rate: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right font-semibold shadow-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">超過 12 小時倍率</span>
              <input
                type="number"
                step="0.01"
                value={settings.level3Rate}
                onChange={(e) => setSettings({ ...settings, level3Rate: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right font-semibold shadow-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
          </div>
          <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={saveSettingsToAccount}
              className="app-btn-ghost text-xs sm:text-sm transition-all hover:border-slate-400 hover:shadow-sm px-3 sm:px-4 py-1.5 sm:py-2"
            >
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              儲存設定
            </button>
            {saveMessage && (
              <span className={`text-xs sm:text-sm font-medium ${saveMessage === "已儲存到帳號設定" ? "text-emerald-600" : "text-red-600"}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>
        <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
          <button 
            onClick={handleAdd} 
            className={`app-btn-primary text-sm sm:text-base font-semibold shadow-md shadow-blue-200/50 transition-all hover:shadow-lg hover:shadow-blue-300/50 w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 ${
              editingRowId 
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700" 
                : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
            }`}
          >
            {editingRowId ? (
              <>
                <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                更新記錄
              </>
            ) : (
              <>
                <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                新增一筆
              </>
            )}
          </button>
          {error && <p className="app-alert-error font-medium text-xs sm:text-sm flex-1 min-w-0">{error}</p>}
        </div>
      </section>

      <section className="app-surface border-slate-200/80 bg-white/80 backdrop-blur-sm p-4 shadow-lg shadow-slate-200/50 sm:p-6 sm:p-8">
        <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">工時清單</h2>
          <div className="flex items-center gap-2 sm:gap-3 rounded-xl bg-gradient-to-r from-emerald-50 to-blue-50 px-3 sm:px-4 py-2 sm:py-2.5">
            <svg className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs sm:text-sm font-medium text-slate-600 whitespace-nowrap">總金額：</span>
            <span className="text-lg sm:text-xl font-bold text-emerald-700">{totalPay.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}</span>
            <span className="text-xs sm:text-sm font-medium text-slate-600 whitespace-nowrap">元</span>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm -mx-2 sm:mx-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-blue-50/50">
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-700 whitespace-nowrap">日期</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-700 whitespace-nowrap">上班</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-700 whitespace-nowrap">下班</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-slate-700 whitespace-nowrap hidden sm:table-cell">休息(分)</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-slate-700 whitespace-nowrap">時數</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-slate-700 whitespace-nowrap hidden lg:table-cell">時薪</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-700 whitespace-nowrap">假別</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-slate-700 whitespace-nowrap hidden md:table-cell">加班費</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-slate-700 whitespace-nowrap">總額</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left font-semibold text-slate-700 whitespace-nowrap hidden lg:table-cell">備註</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-center font-semibold text-slate-700 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => (
                  <tr 
                    key={row.id} 
                    className={`transition-colors hover:bg-blue-50/30 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                  >
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium text-slate-900 whitespace-nowrap">{row.date}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-slate-700 whitespace-nowrap">{row.startTime}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-slate-700 whitespace-nowrap">{row.endTime}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-medium text-slate-700 whitespace-nowrap hidden sm:table-cell">{row.breakMinutes}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-medium text-slate-700 whitespace-nowrap">{row.hours.toFixed(2)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-medium text-slate-700 whitespace-nowrap hidden lg:table-cell">{row.wage}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className={`inline-flex items-center rounded-full px-2 sm:px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
                        row.holiday === "none" 
                          ? "bg-slate-100 text-slate-700" 
                          : row.holiday === "typhoon"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {row.holiday === "none" ? "一般" : row.holiday === "typhoon" ? "颱風" : "國定"}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-blue-700 whitespace-nowrap hidden md:table-cell">{row.overtimePay.toFixed(0)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-emerald-700 whitespace-nowrap">{row.totalPay.toFixed(0)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-slate-600 hidden lg:table-cell max-w-[120px] truncate">{row.note || "-"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                      <button
                        onClick={() => handleDelete(row.id)}
                        className="inline-flex items-center gap-0.5 sm:gap-1 rounded-lg px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-xs font-medium text-red-600 transition-all hover:bg-red-50 hover:text-red-700 touch-manipulation"
                      >
                        <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span className="hidden sm:inline">刪除</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm font-medium">尚無資料，請輸入後新增或匯入 XLSX</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
        </>
      )}

      {view === "payroll" && (
        <section className="app-surface border-slate-200/80 bg-white/80 backdrop-blur-sm space-y-4 sm:space-y-6 p-4 sm:p-6 shadow-lg shadow-slate-200/50 sm:p-8">
          <div className="space-y-1 sm:space-y-2">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">薪資設定與每月總薪資</h2>
            <p className="text-xs sm:text-sm text-slate-600">
              設定每月發薪次數與日期，並查看各月份的薪資總額。
            </p>
          </div>

          <div className="space-y-4 sm:space-y-5 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 sm:p-6 shadow-sm">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <svg className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm sm:text-base font-bold text-slate-800">發薪設定</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span>每月發薪次數</span>
                <select
                  className="app-input w-24"
                  value={paySettings.cyclesPerMonth}
                  onChange={(e) => {
                    const cycles = Math.min(Math.max(Number(e.target.value) || 1, 1), 4);
                    setPaySettings((prev) => {
                      const defaults = cycles === 2 ? [20, 5] : Array(cycles).fill(5);
                      const existing = prev.paydays.slice(0, cycles);
                      return {
                        cyclesPerMonth: cycles,
                        paydays: existing.length === cycles ? existing : defaults.slice(0, cycles)
                      };
                    });
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
            <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 text-xs sm:text-sm">
              {Array.from({ length: paySettings.cyclesPerMonth }, (_, i) => {
                const value = paySettings.paydays[i] ?? 5;
                return (
                  <label key={i} className="app-label">
                    <span className="text-xs sm:text-sm">第 {i + 1} 次發薪日期 (幾號)</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      className="app-input text-sm sm:text-base"
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
            <div className="mt-4 sm:mt-5 space-y-2 rounded-lg bg-white/60 p-3 sm:p-4">
              <p className="text-xs sm:text-sm font-semibold text-slate-700">
                以目前選擇月份 <span className="text-blue-700">{selectedMonth || "（無資料）"}</span> 計算區間：
              </p>
              {!selectedMonth && (
                <p className="text-xs sm:text-sm text-slate-500">尚無工時資料，新增工時後會自動產生月份。</p>
              )}
              {selectedMonth && (
                <div className="mt-2 sm:mt-3 space-y-2">
                  {payPerCycle.map((c) => (
                    <div 
                      key={c.index} 
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                    >
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-blue-100 text-xs sm:text-sm font-bold text-blue-700 flex-shrink-0">
                          {c.index + 1}
                        </span>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                          <span className="text-xs sm:text-sm font-medium text-slate-700 whitespace-nowrap">
                            {selectedMonth.slice(5)}/{c.startDay.toString().padStart(2, "0")} ~{" "}
                            {selectedMonth.slice(5)}/{c.endDay.toString().padStart(2, "0")}
                          </span>
                          <span className="text-xs text-slate-500 whitespace-nowrap">• {c.payday}號發薪</span>
                        </div>
                      </div>
                      <span className="text-base sm:text-lg font-bold text-emerald-700 whitespace-nowrap">
                        {Math.round(c.amount).toLocaleString("zh-TW", { maximumFractionDigits: 0 })} 元
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 sm:space-y-5 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-emerald-50/30 p-4 sm:p-6 shadow-sm">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <svg className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className="text-sm sm:text-base font-bold text-slate-800">每月總薪資</h3>
            </div>
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
            <div className="rounded-xl bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200/50 px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-emerald-100 flex-shrink-0">
                    <svg className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-slate-600">選擇月份總薪資</p>
                    <p className="text-xl sm:text-2xl font-bold text-emerald-700 truncate">
                      {Math.round(selectedMonthTotal).toLocaleString("zh-TW", { maximumFractionDigits: 0 })} <span className="text-sm sm:text-base font-normal text-slate-600">元</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
      </div>
    </main>
  );
}
