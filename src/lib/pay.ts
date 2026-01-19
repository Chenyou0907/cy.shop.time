import { differenceInMinutes, parse } from "date-fns";
import { HolidayType } from "@/types/timesheet";

export const DEFAULT_OVERTIME_RULE = {
  thresholdHours: 8,
  level1Rate: 1.33, // 前 2 小時
  level2Rate: 1.67, // 接下來 2 小時
  level3Rate: 2.67 // 超過 12 小時
};

export function toMinutes(time: string) {
  return time.split(":").reduce((acc, curr, idx) => acc + Number(curr) * (idx === 0 ? 60 : 1), 0);
}

export function calcHours(startTime: string, endTime: string, breakMinutes: number) {
  const start = parse(startTime, "HH:mm", new Date());
  const end = parse(endTime, "HH:mm", new Date());
  // If end is earlier than start (e.g. 17:00 -> 00:00), treat as crossing midnight.
  let rawMinutes = differenceInMinutes(end, start);
  if (rawMinutes < 0) rawMinutes += 24 * 60;
  let minutes = rawMinutes - breakMinutes;
  if (minutes < 0) minutes = 0;
  return Number((minutes / 60).toFixed(2));
}

export function calcPay(options: {
  hours: number;
  wage: number;
  holiday: HolidayType;
  overtimeRule?: typeof DEFAULT_OVERTIME_RULE;
}) {
  const { hours, wage, holiday, overtimeRule = DEFAULT_OVERTIME_RULE } = options;
  const baseHours = Math.min(hours, overtimeRule.thresholdHours);
  let overtimeHours = Math.max(hours - overtimeRule.thresholdHours, 0);

  if (holiday !== "none") {
    const pay = wage * hours * 2;
    return { regularPay: wage * hours, overtimePay: pay - wage * hours, totalPay: pay };
  }

  const regularPay = wage * baseHours;
  let overtimePay = 0;

  if (overtimeHours > 0) {
    const level1 = Math.min(overtimeHours, 2);
    overtimePay += level1 * wage * overtimeRule.level1Rate;
    overtimeHours -= level1;
  }

  if (overtimeHours > 0) {
    const level2 = Math.min(overtimeHours, 2);
    overtimePay += level2 * wage * overtimeRule.level2Rate;
    overtimeHours -= level2;
  }

  if (overtimeHours > 0) {
    overtimePay += overtimeHours * wage * overtimeRule.level3Rate;
  }

  return { regularPay, overtimePay, totalPay: regularPay + overtimePay };
}
