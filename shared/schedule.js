export const scheduleColors = ["blue", "violet", "teal", "amber", "rose", "cyan"];
export const scheduleStatuses = ["planned", "completed", "cancelled"];
export const scheduleSubjects = ["toan", "vat-ly", "khtn", "tsa-hsa-spt", "giai-tri", "khac"];
const DAY = 86_400_000;

// Calendar dates and clock times are Vietnam wall time, never the device's timezone.
export function validScheduleDate(value) {
  if (typeof value !== "string" || !/^(20\d{2}|2100)-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function addScheduleDays(date, count) {
  return new Date(Date.parse(date + "T00:00:00Z") + count * DAY).toISOString().slice(0, 10);
}
export function scheduleWeekday(date) {
  return new Date(date + "T00:00:00Z").getUTCDay() || 7;
}
export function scheduleMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
export function scheduleTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function scheduleDates(date, repeat) {
  if (!validScheduleDate(date)) throw new Error("Ngày học không hợp lệ (năm 2000–2100).");
  if (!repeat) return [date];
  if (!validScheduleDate(repeat.until) || repeat.until < date ||
      Date.parse(repeat.until) - Date.parse(date) > 180 * DAY)
    throw new Error("Ngày kết thúc lặp phải từ ngày bắt đầu đến tối đa 180 ngày sau.");
  if (!Array.isArray(repeat.weekdays) || !repeat.weekdays.length || repeat.weekdays.length > 7 ||
      repeat.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) ||
      new Set(repeat.weekdays).size !== repeat.weekdays.length)
    throw new Error("Chọn các thứ cần lặp trong tuần.");
  const dates = [];
  for (let current = date; current <= repeat.until; current = addScheduleDays(current, 1)) {
    if (repeat.weekdays.includes(scheduleWeekday(current))) dates.push(current);
  }
  if (!dates.length || dates.length > 100) throw new Error("Một lần tạo lịch cần từ 1 đến 100 buổi. Hãy thu ngắn khoảng lặp.");
  return dates;
}
export function scheduleRange(anchor, view) {
  if (view === "day") return { from: anchor, to: anchor, days: [anchor] };
  const first = view === "month" ? anchor.slice(0, 7) + "-01" : anchor;
  const from = addScheduleDays(first, 1 - scheduleWeekday(first));
  const days = Array.from({ length: view === "month" ? 42 : 7 }, (_, i) => addScheduleDays(from, i));
  return { from, to: days.at(-1), days };
}
export function scheduleOverlaps(a, b) {
  return a.id !== b.id && a.date === b.date && a.status !== "cancelled" && b.status !== "cancelled" &&
    a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}
// Interval partitioning keeps simultaneous lessons side-by-side, including overlap chains.
export function layoutScheduleEvents(events) {
  const ordered = [...events].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.id.localeCompare(b.id));
  const result = [];
  let group = [], ends = [], groupEnd = -1;
  const flush = () => { result.push(...group.map(item => ({ ...item, lanes: ends.length }))); group = []; ends = []; };
  for (const event of ordered) {
    if (event.startMinute >= groupEnd) flush();
    let lane = ends.findIndex(end => end <= event.startMinute);
    if (lane < 0) lane = ends.length;
    ends[lane] = event.endMinute;
    group.push({ event, lane });
    groupEnd = Math.max(groupEnd, event.endMinute);
  }
  flush();
  return result;
}
