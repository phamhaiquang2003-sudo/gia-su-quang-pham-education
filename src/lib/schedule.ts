import { scheduleColors, scheduleStatuses, scheduleSubjects } from "../../shared/schedule.js";

export type ScheduleColor = (typeof scheduleColors)[number];
export type ScheduleStatus = (typeof scheduleStatuses)[number];
export type ScheduleSubject = (typeof scheduleSubjects)[number];
export type ScheduleView = "day" | "week" | "month";
export interface ScheduleStudent { uid: string; displayName: string; username: string }
export interface ScheduleEvent {
  id: string;
  seriesId: string;
  recurring: boolean;
  title: string;
  subject: ScheduleSubject;
  students: ScheduleStudent[];
  date: string;
  startMinute: number;
  endMinute: number;
  location: string;
  note: string;
  color: ScheduleColor;
  status: ScheduleStatus;
  revision: number;
}
export interface ScheduleList {
  from: string;
  to: string;
  events: ScheduleEvent[];
  truncated: boolean;
  serverNow: number;
}
export const scheduleColorStyles: Record<ScheduleColor, { label: string; background: string }> = {
  blue: { label: "Xanh dương", background: "#2563eb" },
  violet: { label: "Tím", background: "#7c3aed" },
  teal: { label: "Xanh ngọc", background: "#0f766e" },
  amber: { label: "Cam", background: "#b45309" },
  rose: { label: "Hồng", background: "#be185d" },
  cyan: { label: "Xanh biển", background: "#0369a1" },
};
export const scheduleStatusLabels: Record<ScheduleStatus, string> = {
  planned: "Đã xếp lịch", completed: "Đã dạy", cancelled: "Đã hủy",
};
export const scheduleDateLabel = (date: string, weekday = false) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "UTC", ...(weekday ? { weekday: "short" as const } : {}), day: "2-digit", month: "2-digit", year: "numeric",
}).format(new Date(date + "T00:00:00Z"));
