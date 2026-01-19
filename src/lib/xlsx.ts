import { read, utils, writeFile } from "xlsx";
import { TimesheetRow, HolidayType } from "@/types/timesheet";
import { calcHours, calcPay, DEFAULT_OVERTIME_RULE } from "./pay";

const HEADER = ["日期", "上班時間", "下班時間", "休息時間", "工作時數", "時薪", "工資", "備註"];

export async function importXlsx(file: File) {
  const data = await file.arrayBuffer();
  const workbook = read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: "" });

  return rows
    .map((row, idx) => {
      const date = String(row["日期"] ?? "").trim();
      const startTime = String(row["上班時間"] ?? "").trim();
      const endTime = String(row["下班時間"] ?? "").trim();
      const breakMinutes = Number(row["休息時間"] ?? 0);
      const note = String(row["備註"] ?? "");
      if (!date || !startTime || !endTime) return null;

      const hours = row["工作時數"] ? Number(row["工作時數"]) : calcHours(startTime, endTime, breakMinutes);
      const wage = Number(row["時薪"] ?? 0);
      const holiday: HolidayType = note.includes("颱風")
        ? "typhoon"
        : note.includes("國定")
          ? "national"
          : "none";
      const { overtimePay, totalPay } = calcPay({ hours, wage, holiday, overtimeRule: DEFAULT_OVERTIME_RULE });

      return {
        id: `${idx}-${date}`,
        date,
        startTime,
        endTime,
        breakMinutes,
        hours,
        wage,
        overtimePay,
        totalPay,
        holiday,
        note
      } satisfies TimesheetRow;
    })
    .filter(Boolean) as TimesheetRow[];
}

export function exportXlsx(rows: TimesheetRow[], filename = "timesheet.xlsx") {
  const sheetData = [HEADER];
  for (const row of rows) {
    sheetData.push([
      row.date,
      row.startTime,
      row.endTime,
      String(row.breakMinutes),
      String(row.hours),
      String(row.wage),
      String(row.totalPay),
      row.note ?? ""
    ]);
  }

  const worksheet = utils.aoa_to_sheet(sheetData);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "timesheet");
  writeFile(workbook, filename);
}
