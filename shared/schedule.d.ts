export const scheduleColors: readonly ["blue", "violet", "teal", "amber", "rose", "cyan"];
export const scheduleStatuses: readonly ["planned", "completed", "cancelled"];
export const scheduleSubjects: readonly ["toan", "vat-ly", "khtn", "tsa-hsa-spt", "giai-tri", "khac"];
export interface ScheduleRepeat { until: string; weekdays: number[] }
export interface ScheduleInterval { id: string; date: string; startMinute: number; endMinute: number; status: string }
export function validScheduleDate(value: unknown): value is string;
export function addScheduleDays(date: string, count: number): string;
export function scheduleWeekday(date: string): number;
export function scheduleMinutes(value: unknown): number | null;
export function scheduleTime(minutes: number): string;
export function scheduleDates(date: string, repeat?: ScheduleRepeat | null): string[];
export function scheduleRange(anchor: string, view: "day" | "week" | "month"): { from: string; to: string; days: string[] };
export function scheduleOverlaps(a: ScheduleInterval, b: ScheduleInterval): boolean;
export function layoutScheduleEvents<T extends ScheduleInterval>(events: T[]): { event: T; lane: number; lanes: number }[];
