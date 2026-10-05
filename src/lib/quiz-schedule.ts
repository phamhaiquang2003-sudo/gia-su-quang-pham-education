export interface QuizSchedule {
  opensAt?: number | null;
  closesAt?: number | null;
}
export function quizAvailability(quiz: QuizSchedule, now: number) {
  if (quiz.closesAt && now >= quiz.closesAt) return "closed";
  if (quiz.opensAt && now < quiz.opensAt) return "upcoming";
  return "open";
}
const displayFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const inputFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function formatQuizTime(timestamp: number) {
  return displayFormat.format(timestamp);
}
export function scheduleInputValue(timestamp?: number | null) {
  if (!timestamp || !Number.isFinite(timestamp)) return "";
  const parts = Object.fromEntries(
    inputFormat.formatToParts(timestamp).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function scheduleTimestamp(value: string) {
  return value ? Date.parse(`${value}+07:00`) : null;
}
