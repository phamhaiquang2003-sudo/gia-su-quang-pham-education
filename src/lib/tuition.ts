export interface TuitionLesson {
  id: string;
  studentUid: string;
  displayName: string;
  username: string;
  date: string;
  fee: number;
  note: string;
  revision: number;
}
export interface TuitionStudentSummary {
  studentUid: string;
  displayName: string;
  username: string;
  lessonCount: number;
  totalFee: number;
}
export interface TuitionMonth {
  month: string;
  studentFilter: string;
  lessons: TuitionLesson[];
  students: TuitionStudentSummary[];
  rates: { studentUid: string; fee: number }[];
  totals: { studentCount: number; lessonCount: number; totalFee: number };
  truncated: boolean;
}

export const tuitionMoney = (amount: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);

export function vietnamToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function tuitionDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
export function tuitionMonthLabel(month: string) {
  const [year, number] = month.split("-");
  return `${number}/${year}`;
}
