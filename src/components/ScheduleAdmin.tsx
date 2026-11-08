import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, RefreshCw, Repeat2, Trash2, Users } from "lucide-react";
import { accountError, type AccountProfile } from "@/lib/accounts";
import { quizApi } from "@/lib/quizzes";
import { vietnamToday } from "@/lib/tuition";
import { subjects } from "@/lib/subjects";
import { scheduleColorStyles, scheduleDateLabel, scheduleStatusLabels, type ScheduleColor, type ScheduleEvent, type ScheduleList, type ScheduleStatus, type ScheduleSubject, type ScheduleView } from "@/lib/schedule";
import { addScheduleDays, layoutScheduleEvents, scheduleColors, scheduleDates, scheduleMinutes, scheduleOverlaps, scheduleRange, scheduleStatuses, scheduleTime, scheduleWeekday, validScheduleDate } from "../../shared/schedule.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

interface Props {
  uid: string;
  students: AccountProfile[];
  loadingStudents: boolean;
  hasMoreStudents: boolean;
  onLoadMoreStudents: () => void;
  onRefreshStudents: () => void;
  onBusyChange: (busy: boolean) => void;
}
interface Draft {
  id: string; revision: number; title: string; date: string; startTime: string; endTime: string;
  subject: ScheduleSubject; studentUids: string[]; location: string; note: string;
  color: ScheduleColor; status: ScheduleStatus; weekly: boolean; until: string; weekdays: number[]; allowOverlap: boolean;
}
const weekdays = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];
const subjectOptions = [...subjects.map(s => ({ id: s.id as ScheduleSubject, label: s.label })), { id: "khac" as const, label: "Khác / Lịch cá nhân" }];
const HOUR_HEIGHT = 72;
const clampDate = (date: string) => date < "2000-01-01" ? "2000-01-01" : date > "2100-12-31" ? "2100-12-31" : date;
function freshDraft(date: string, minute = 17 * 60): Draft {
  const start = Math.min(22 * 60, Math.max(0, minute));
  return { id: crypto.randomUUID(), revision: 0, title: "", date, startTime: scheduleTime(start), endTime: scheduleTime(Math.min(1439, start + 90)),
    subject: "toan", studentUids: [], location: "", note: "", color: "blue", status: "planned", weekly: false,
    until: clampDate(addScheduleDays(date, 28)), weekdays: [scheduleWeekday(date)], allowOverlap: false };
}

export default function ScheduleAdmin({ uid, students, loadingStudents, hasMoreStudents, onLoadMoreStudents, onRefreshStudents, onBusyChange }: Props) {
  const [anchor, setAnchor] = useState(vietnamToday);
  const [view, setView] = useState<ScheduleView>(() => window.matchMedia("(max-width: 639px)").matches ? "day" : "week");
  const [data, setData] = useState<ScheduleList | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [filterStudent, setFilterStudent] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mutation = useRef<{ signature: string; token: string } | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(Date.now());
  const range = scheduleRange(anchor, view);
  const current = data?.from === range.from && data.to === range.to ? data : null;
  const events = current?.events || [];
  const options = new Map(events.flatMap(event => event.students).map(student => [student.uid, student]));
  editing?.students.forEach(student => options.set(student.uid, student));
  students.filter(student => student.role === "student").forEach(student => options.set(student.uid, student));
  const accounts = [...options.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "vi"));
  const visible = events.filter(event => (!filterStudent || event.students.some(student => student.uid === filterStudent)) &&
    (!filterStatus || event.status === filterStatus) && (!search.trim() || `${event.title} ${event.location} ${event.students.map(student => student.displayName).join(" ")}`.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi"))));
  const today = vietnamToday();
  const now = new Date(clock + 7 * 3600000);
  const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  let repeatDates: string[] = [], repeatError = "";
  if (draft) {
    try { repeatDates = scheduleDates(draft.date, draft.weekly ? { until: draft.until, weekdays: draft.weekdays } : null); }
    catch (failure) { repeatError = accountError(failure); }
  }
  const start = draft ? scheduleMinutes(draft.startTime) : null, end = draft ? scheduleMinutes(draft.endTime) : null;
  const overlaps = draft && start !== null && end !== null ? events.filter(event => repeatDates.some(date => scheduleOverlaps(event, { id: draft.id, date, startMinute: start, endMinute: end, status: draft.status }))) : [];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    quizApi<ScheduleList>("scheduleList", { from: range.from, to: range.to })
      .then(result => { if (!cancelled) setData(result); })
      .catch(failure => { if (!cancelled) { setError(accountError(failure)); setData(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid, range.from, range.to, reload]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(timer); }, []);

  function openNew(date = anchor, minute = 17 * 60) {
    if (!validScheduleDate(date) || busyRef.current) return;
    setDraft(freshDraft(date, minute)); setEditing(null); setFormError(""); mutation.current = null;
  }
  function openEdit(event: ScheduleEvent) {
    if (busyRef.current) return;
    setEditing(event);
    setDraft({ ...freshDraft(event.date), id: event.id, revision: event.revision, title: event.title,
      date: event.date, startTime: scheduleTime(event.startMinute), endTime: scheduleTime(event.endMinute),
      subject: event.subject, studentUids: event.students.map(student => student.uid), location: event.location,
      note: event.note, color: event.color, status: event.status });
    setFormError(""); mutation.current = null;
  }
  function update(change: Partial<Draft>) { setDraft(previous => previous ? { ...previous, ...change } : previous); }
  function move(direction: number) {
    if (view === "month") {
      const date = new Date(anchor.slice(0, 7) + "-01T00:00:00Z"); date.setUTCMonth(date.getUTCMonth() + direction);
      setAnchor(clampDate(date.toISOString().slice(0, 10)));
    } else setAnchor(clampDate(addScheduleDays(anchor, direction * (view === "week" ? 7 : 1))));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busyRef.current) return;
    if (repeatError) { setFormError(repeatError); return; }
    const payload = { id: draft.id, revision: draft.revision, title: draft.title, date: draft.date,
      startTime: draft.startTime, endTime: draft.endTime, subject: draft.subject, studentUids: draft.studentUids,
      location: draft.location, note: draft.note, color: draft.color, status: draft.status, allowOverlap: draft.allowOverlap,
      repeat: draft.weekly ? { until: draft.until, weekdays: draft.weekdays } : null };
    const signature = JSON.stringify(payload);
    if (!mutation.current || mutation.current.signature !== signature) mutation.current = { signature, token: crypto.randomUUID() };
    busyRef.current = true; setBusy(true); setFormError(""); setMessage("");
    try {
      const result = await quizApi<{ events: ScheduleEvent[]; savedCount: number }>("scheduleSave", { ...payload, mutationToken: mutation.current.token });
      setMessage(editing ? "Đã cập nhật buổi học." : `Đã xếp ${result.savedCount} buổi học. Lịch được lưu online.`);
      if (result.events[0]) setAnchor(result.events[0].date);
      setDraft(null); setEditing(null); mutation.current = null; setReload(value => value + 1);
    } catch (failure) { setFormError(accountError(failure)); setReload(value => value + 1); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function remove() {
    if (!editing || busyRef.current || !window.confirm(`Xóa buổi “${editing.title}” ngày ${scheduleDateLabel(editing.date)}? Chỉ xóa buổi này, không thay đổi học phí.`)) return;
    busyRef.current = true; setBusy(true); setFormError("");
    try {
      await quizApi("scheduleDelete", { id: editing.id, revision: editing.revision });
      setDraft(null); setEditing(null); setMessage("Đã xóa buổi học khỏi lịch. Học phí không thay đổi."); setReload(value => value + 1);
    } catch (failure) { setFormError(accountError(failure)); setReload(value => value + 1); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const firstHour = Math.min(7, ...visible.map(event => Math.floor(event.startMinute / 60)));
  const lastHour = Math.max(22, ...visible.map(event => Math.ceil(event.endMinute / 60)));
  const gridHeight = (lastHour - firstHour) * HOUR_HEIGHT;
  const days = view === "day" ? [anchor] : range.days;
  const rangeTitle = view === "month" ? `Tháng ${Number(anchor.slice(5, 7))}/${anchor.slice(0, 4)}` : view === "day" ? scheduleDateLabel(anchor, true) : `${scheduleDateLabel(range.from)} – ${scheduleDateLabel(range.to)}`;

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-xl font-bold">Lịch học</h2><p className="mt-2 text-sm text-slate-600">Xếp lịch dạy theo ngày, tuần, tháng · Giờ Việt Nam (UTC+7).</p></div>
        <button type="button" className="account-button" disabled={busy} onClick={() => openNew()}><Plus className="size-4" />Thêm buổi học</button>
      </header>
      <p className="text-xs leading-relaxed text-slate-500">Lịch chỉ dành cho quản trị viên. Xếp lịch, đánh dấu đã dạy hoặc hủy buổi không tự ghi buổi học hay tính học phí.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="account-button-secondary" aria-label="Kỳ trước" disabled={busy || anchor === "2000-01-01"} onClick={() => move(-1)}><ChevronLeft className="size-4" /></button>
        <button className="account-button-secondary" disabled={busy} onClick={() => setAnchor(today)}>Hôm nay</button>
        <button className="account-button-secondary" aria-label="Kỳ sau" disabled={busy || anchor === "2100-12-31"} onClick={() => move(1)}><ChevronRight className="size-4" /></button>
        <label className="min-w-0"><span className="sr-only">Ngày xem lịch</span><input type="date" aria-label="Ngày xem lịch" className="account-input !mt-0 min-w-0" min="2000-01-01" max="2100-12-31" value={anchor} disabled={busy} onChange={e => { if (validScheduleDate(e.target.value)) setAnchor(e.target.value); }} /></label>
        <div className="flex flex-wrap gap-1 sm:ml-auto" role="group" aria-label="Chế độ xem lịch">
          {([['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} className={view === value ? "account-button" : "account-button-secondary"} disabled={busy} onClick={() => setView(value)}>{label}</button>)}
          <button type="button" className="account-button-secondary" aria-label="Tải lại lịch" disabled={busy || loading} onClick={() => { setReload(value => value + 1); onRefreshStudents(); }}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <label className="account-label min-w-0">Tìm buổi học<input className="account-input min-w-0" type="search" maxLength={100} placeholder="Tên buổi học, học sinh…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label className="account-label min-w-0">Lọc học sinh<select className="account-input min-w-0" value={filterStudent} onChange={e => setFilterStudent(e.target.value)}><option value="">Tất cả học sinh</option>{accounts.map(student => <option key={student.uid} value={student.uid}>{student.displayName} · @{student.username}</option>)}</select></label>
        <label className="account-label min-w-0">Lọc trạng thái<select className="account-input min-w-0" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">Tất cả trạng thái</option>{scheduleStatuses.map(status => <option key={status} value={status}>{scheduleStatusLabels[status]}</option>)}</select></label>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
      {current?.truncated && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Khoảng xem có quá nhiều buổi. Chuyển sang Ngày hoặc Tuần để xem đầy đủ.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{rangeTitle}</h3><p role="status" className="text-sm text-slate-500">{loading ? "Đang tải lịch…" : `${visible.length} buổi · ${(visible.filter(e => e.status !== 'cancelled').reduce((total, e) => total + e.endMinute - e.startMinute, 0) / 60).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`}</p></div>
      {!loading && !error && !visible.length && <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Chưa có buổi học trong khoảng này{filterStudent || filterStatus || search ? " phù hợp bộ lọc" : ""}. Bấm “Thêm buổi học” hoặc chọn ô trống trên lịch để xếp lịch.</p>}
      {view === "month" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200" role="region" aria-label="Lịch học theo tháng" tabIndex={0}>
          <div className="grid min-w-[700px] grid-cols-7">
            {weekdays.map(day => <div key={day} className="border-b border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold text-slate-500">{day}</div>)}
            {range.days.map(date => {
              const items = visible.filter(event => event.date === date);
              return <div key={date} className={`min-h-32 border-b border-r border-slate-200 p-2 ${date === today ? "bg-amber-50" : date.slice(0,7) === anchor.slice(0,7) ? "bg-white" : "bg-slate-50 text-slate-500"}`}>
                <div className="mb-2 flex items-center justify-between"><button type="button" className="rounded px-1 text-sm font-semibold hover:bg-slate-100" aria-label={`Xem ngày ${scheduleDateLabel(date)}`} onClick={() => { if (validScheduleDate(date)) { setAnchor(date); setView('day'); } }}>{Number(date.slice(8))}</button><button type="button" className="rounded p-1 hover:bg-slate-100" aria-label={`Thêm buổi học ngày ${scheduleDateLabel(date)}`} disabled={!validScheduleDate(date)} onClick={() => openNew(date)}><Plus className="size-3.5" /></button></div>
                {items.slice(0,3).map(event => <button type="button" key={event.id} onClick={() => openEdit(event)} className="mb-1 block w-full truncate rounded px-1.5 py-1 text-left text-xs text-white" style={{ background: event.status === 'cancelled' ? '#64748b' : scheduleColorStyles[event.color].background }} title={`${event.title} · ${scheduleTime(event.startMinute)}–${scheduleTime(event.endMinute)}`}><span className={event.status === 'cancelled' ? 'line-through' : ''}>{scheduleTime(event.startMinute)} {event.title}</span></button>)}
                {items.length > 3 && <button type="button" className="px-1 text-xs font-semibold text-sky-700" onClick={() => { setAnchor(date); setView('day'); }}>+{items.length-3} buổi khác</button>}
              </div>;
            })}
          </div>
        </div>
      ) : (
        <div className="max-h-[70svh] overflow-auto rounded-xl border border-slate-200" role="region" aria-label={view === 'week' ? 'Lịch học theo tuần' : 'Lịch học theo ngày'} tabIndex={0}>
          <div style={{ minWidth: view === 'week' ? 980 : 260 }}>
            <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="sticky left-0 bg-slate-50 p-2 text-[10px] text-slate-500">UTC+7</div>
              {days.map(date => <div key={date} className={`border-l border-slate-200 px-1 py-3 text-center text-xs font-semibold ${date === today ? 'bg-amber-50 text-amber-900' : 'text-slate-600'}`}>{weekdays[scheduleWeekday(date)-1]} {Number(date.slice(8))}/{Number(date.slice(5,7))}</div>)}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50" style={{ height: gridHeight }}>
                {Array.from({length:lastHour-firstHour},(_,i) => <span key={i} className="absolute right-2 text-[11px] tabular-nums text-slate-500" style={{top:i*HOUR_HEIGHT+4}}>{scheduleTime((firstHour+i)*60)}</span>)}
              </div>
              {days.map(date => <div key={date} className={`relative border-r border-slate-200 ${date === today ? 'bg-amber-50/30' : 'bg-white'}`} style={{height:gridHeight, backgroundImage:`repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT-1}px, #e2e8f0 ${HOUR_HEIGHT-1}px, #e2e8f0 ${HOUR_HEIGHT}px)`}}>
                <button type="button" className="absolute inset-0 w-full hover:bg-sky-100/20" aria-label={`Thêm buổi học ngày ${scheduleDateLabel(date)}`} onClick={e => { const r=e.currentTarget.getBoundingClientRect(); const minute=e.detail===0?9*60:Math.floor(((e.clientY-r.top)/HOUR_HEIGHT*60+firstHour*60)/30)*30; openNew(date,minute); }} />
                {layoutScheduleEvents(visible.filter(event => event.date === date)).map(({event,lane,lanes}) => {
                  const height=(event.endMinute-event.startMinute)/60*HOUR_HEIGHT;
                  return <button key={event.id} type="button" onClick={() => openEdit(event)} aria-label={`${event.title}, ${scheduleDateLabel(date)}, ${scheduleTime(event.startMinute)}–${scheduleTime(event.endMinute)}`} title={`${event.title}\n${scheduleTime(event.startMinute)}–${scheduleTime(event.endMinute)} · ${scheduleStatusLabels[event.status]}\n${event.students.map(s=>s.displayName).join(', ')}\n${event.location}`} className="absolute overflow-hidden rounded-md px-1.5 text-left text-xs text-white shadow-sm outline-offset-2 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-sky-900" style={{ top:(event.startMinute-firstHour*60)/60*HOUR_HEIGHT, height:Math.max(2,height-2), left:`calc(${lane/lanes*100}% + 2px)`, width:`calc(${100/lanes}% - 4px)`, background:event.status==='cancelled'?'#64748b':scheduleColorStyles[event.color].background }}>
                    {height >= 36 && <span className="block truncate font-semibold">{scheduleTime(event.startMinute)}–{scheduleTime(event.endMinute)}</span>}
                    <span className={`block truncate font-semibold ${event.status==='cancelled'?'line-through':''}`}>{event.status==='completed'?'✓ ':''}{event.title}</span>
                    {height >= 72 && event.location && <span className="mt-1 flex min-w-0 items-center gap-1 opacity-90"><MapPin className="size-3 shrink-0" /><span className="truncate">{event.location}</span></span>}
                    {height >= 90 && !!event.students.length && <span className="mt-1 block truncate opacity-90">{event.students.map(s=>s.displayName).join(', ')}</span>}
                  </button>;
                })}
                {date===today && nowMinute>=firstHour*60 && nowMinute<lastHour*60 && <div className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-rose-500" style={{top:(nowMinute-firstHour*60)/60*HOUR_HEIGHT}} aria-label={`Hiện tại ${scheduleTime(nowMinute)}`} />}
              </div>)}
            </div>
          </div>
        </div>
      )}
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span><CalendarDays className="mr-1 inline size-3.5" />Bấm vào buổi học để sửa</span><span><Check className="mr-1 inline size-3.5" />✓ Đã dạy</span><span className="line-through">Buổi đã hủy</span></p>
      <Dialog open={Boolean(draft)} onOpenChange={open => { if (!open && !busyRef.current) { setDraft(null); setEditing(null); } }}>
        <DialogContent className="account-page max-h-[90svh] max-w-2xl overflow-y-auto">
          <DialogTitle>{editing ? 'Chỉnh sửa buổi học' : 'Thêm buổi học'}</DialogTitle>
          <DialogDescription>Đặt lịch theo giờ Việt Nam (UTC+7). Không tự ghi học phí.</DialogDescription>
          {draft && <form onSubmit={save} className="min-w-0">
            <fieldset disabled={busy} className="mt-5 min-w-0 space-y-4">
              <label className="account-label">Tên buổi học<input className="account-input" required maxLength={160} placeholder="Ví dụ: Toán 11 – Bảo Hân" value={draft.title} onChange={e => update({title:e.target.value})} /></label>
              <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                <label className="account-label min-w-0">Ngày học<input type="date" className="account-input min-w-0" required min="2000-01-01" max="2100-12-31" value={draft.date} onChange={e => update({date:e.target.value, ...(!editing && !draft.weekly && validScheduleDate(e.target.value) ? {weekdays:[scheduleWeekday(e.target.value)],until:clampDate(addScheduleDays(e.target.value,28))} : {})})} /></label>
                <label className="account-label min-w-0">Giờ bắt đầu<input type="time" className="account-input min-w-0" required value={draft.startTime} onChange={e => update({startTime:e.target.value})} /></label>
                <label className="account-label min-w-0">Giờ kết thúc<input type="time" className="account-input min-w-0" required value={draft.endTime} onChange={e => update({endTime:e.target.value})} /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="account-label">Môn học<select className="account-input" value={draft.subject} onChange={e => update({subject:e.target.value as ScheduleSubject})}>{subjectOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
                <label className="account-label">Trạng thái<select className="account-input" value={draft.status} onChange={e => update({status:e.target.value as ScheduleStatus})}>{scheduleStatuses.map(s => <option key={s} value={s}>{scheduleStatusLabels[s]}</option>)}</select></label>
              </div>
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3"><legend className="max-w-full px-1 text-sm font-semibold"><Users className="mr-1 inline size-4" />Học sinh tham gia (tùy chọn)</legend>
                <p className="mb-3 text-xs text-slate-500">Chọn tối đa 30 học sinh; để trống nếu là lịch cá nhân hoặc nhóm chưa có tài khoản.</p>
                <div className="max-h-40 space-y-2 overflow-y-auto">{accounts.map(student => <label key={student.uid} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.studentUids.includes(student.uid)} onChange={e => update({studentUids:e.target.checked?[...draft.studentUids,student.uid]:draft.studentUids.filter(id=>id!==student.uid)})} />{student.displayName} <span className="text-xs text-slate-500">@{student.username}</span></label>)}{!accounts.length && <p className="text-sm text-slate-500">{loadingStudents?'Đang tải học sinh…':'Chưa có học sinh trong danh sách.'}</p>}</div>
                {hasMoreStudents && <button type="button" className="mt-3 text-sm font-semibold text-sky-700" disabled={loadingStudents} onClick={onLoadMoreStudents}>{loadingStudents?'Đang tải…':'Tải thêm học sinh'}</button>}
              </fieldset>
              <label className="account-label">Địa điểm / Link học online<input className="account-input" maxLength={300} placeholder="Tại nhà, Zoom, Google Meet…" value={draft.location} onChange={e => update({location:e.target.value})} /></label>
              <label className="account-label">Ghi chú<textarea className="account-input min-h-20" maxLength={1000} value={draft.note} onChange={e => update({note:e.target.value})} /></label>
              <fieldset><legend className="account-label mb-2">Màu lịch</legend><div className="flex flex-wrap gap-2">{scheduleColors.map(color => <button type="button" key={color} aria-label={scheduleColorStyles[color].label} aria-pressed={draft.color===color} onClick={() => update({color})} className={`flex h-9 w-9 items-center justify-center rounded-full text-white outline-offset-2 ${draft.color===color?'ring-2 ring-slate-900 ring-offset-2':''}`} style={{background:scheduleColorStyles[color].background}}>{draft.color===color && <Check className="size-4" />}</button>)}</div></fieldset>
              {!editing ? <div className="rounded-xl border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.weekly} onChange={e => update({weekly:e.target.checked})} /><Repeat2 className="size-4" />Lặp lại hằng tuần</label>
                {draft.weekly && <div className="mt-4 space-y-3"><fieldset><legend className="account-label mb-2">Các ngày trong tuần</legend><div className="flex flex-wrap gap-3">{weekdays.map((day,i) => <label className="flex items-center gap-1 text-sm" key={day}><input type="checkbox" checked={draft.weekdays.includes(i+1)} onChange={e => update({weekdays:e.target.checked?[...draft.weekdays,i+1]:draft.weekdays.filter(d=>d!==i+1)})} />{day}</label>)}</div></fieldset>
                  <label className="account-label">Lặp đến hết ngày<input type="date" className="account-input" required min={draft.date} max={validScheduleDate(draft.date)?clampDate(addScheduleDays(draft.date,180)):'2100-12-31'} value={draft.until} onChange={e => update({until:e.target.value})} /></label>
                  <p className="text-xs text-slate-600">{repeatError || `Sẽ tạo ${repeatDates.length} buổi. Tối đa 100 buổi trong 180 ngày. Sau khi tạo, bạn có thể sửa/xóa từng buổi riêng.`}</p>
                </div>}
              </div> : editing.recurring && <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900">Buổi thuộc lịch lặp. Chỉnh sửa hoặc xóa chỉ áp dụng cho buổi này; các buổi khác được giữ nguyên.</p>}
              {!!overlaps.length && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Clock3 className="mr-1 inline size-4" />Trùng với {overlaps.length} buổi trong khoảng lịch đang xem: {overlaps.slice(0,3).map(e=>e.title).join(', ')}. Máy chủ cũng sẽ kiểm tra các buổi lặp ngoài khoảng này.</p>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.allowOverlap} onChange={e => update({allowOverlap:e.target.checked})} />Cho phép trùng giờ</label>
              {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                {editing && <button type="button" className="account-button-secondary mr-auto text-red-700" onClick={() => void remove()}><Trash2 className="size-4" />Xóa buổi này</button>}
                <button type="button" className="account-button-secondary" onClick={() => { setDraft(null); setEditing(null); }}>Đóng</button>
                <button type="submit" className="account-button" disabled={busy || Boolean(repeatError)}>{busy?'Đang lưu…':editing?'Lưu thay đổi':`Lưu ${repeatDates.length || 1} buổi học`}</button>
              </div>
            </fieldset>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
