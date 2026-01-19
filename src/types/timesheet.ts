export type HolidayType = "none" | "typhoon" | "national";

export interface TimesheetRow {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  breakMinutes: number;
  hours: number;
  wage: number;
  overtimePay: number;
  totalPay: number;
  holiday: HolidayType;
  note?: string;
}

export interface OvertimeRule {
  thresholdHours: number;
  level1Rate: number;
  level2Rate: number;
  level3Rate: number;
}
