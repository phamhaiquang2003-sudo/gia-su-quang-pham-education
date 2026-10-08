import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Download,
  Pencil,
  RefreshCw,
  Trash2,
  Wallet,
  Users,
} from "lucide-react";
import type { AccountProfile } from "@/lib/accounts";
import { accountError } from "@/lib/accounts";
import { quizApi, QuizApiError } from "@/lib/quizzes";
import {
  tuitionDate,
  tuitionMoney,
  tuitionMonthLabel,
  vietnamToday,
  type TuitionLesson,
  type TuitionMonth,
  type TuitionReport,
} from "@/lib/tuition";

interface Props {
  uid: string;
  students: AccountProfile[];
  loadingStudents: boolean;
  hasMoreStudents: boolean;
  onLoadMoreStudents: () => void;
  onRefreshStudents: () => void;
  onBusyChange: (busy: boolean) => void;
}

export default function TuitionAdmin({
  uid,
  students,
  loadingStudents,
  hasMoreStudents,
  onLoadMoreStudents,
  onRefreshStudents,
  onBusyChange,
}: Props) {
  const today = vietnamToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<TuitionMonth | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [filterStudent, setFilterStudent] = useState("");
  const [formStudent, setFormStudent] = useState("");
  const [date, setDate] = useState(today);
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [setDefaultRate, setSaveDefaultRate] = useState(true);
  const [editing, setEditing] = useState<TuitionLesson | null>(null);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState("");
  const busyRef = useRef(false);
  const mutation = useRef<{ signature: string; token: string } | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const overview =
    data?.month === month && data.studentFilter === filterStudent ? data : null;
  const accounts = students.filter((student) => student.role === "student");
  const nameOf = (row: { studentUid: string; displayName: string }) =>
    accounts.find((student) => student.uid === row.studentUid)?.displayName ||
    row.displayName;
  const studentOptions = new Map(
    (data?.students || []).map((row) => [
      row.studentUid,
      {
        uid: row.studentUid,
        displayName: row.displayName,
        username: row.username,
      },
    ]),
  );
  accounts.forEach((student) => studentOptions.set(student.uid, student));
  if (editing && !studentOptions.has(editing.studentUid))
    studentOptions.set(editing.studentUid, {
      uid: editing.studentUid,
      displayName: editing.displayName,
      username: editing.username,
    });
  const options = [...studentOptions.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "vi"),
  );
  const summaries = (overview?.students || []).filter(
    (row) => !filterStudent || row.studentUid === filterStudent,
  );
  const lessons = (overview?.lessons || []).filter(
    (row) => !filterStudent || row.studentUid === filterStudent,
  );
  const totalLessons = summaries.reduce((sum, row) => sum + row.lessonCount, 0);
  const totalFee = summaries.reduce((sum, row) => sum + row.totalFee, 0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    quizApi<TuitionMonth>("tuitionMonth", { month, studentUid: filterStudent })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((failure) => {
        if (!cancelled) {
          setLoadError(accountError(failure));
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, month, filterStudent, reload]);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  function resetDraft(nextMonth = month) {
    setEditing(null);
    setDraftId(crypto.randomUUID());
    setFormStudent("");
    setDate(today.startsWith(nextMonth) ? today : `${nextMonth}-01`);
    setFee("");
    setNote("");
    setSaveDefaultRate(true);
    mutation.current = null;
  }
  function editLesson(row: TuitionLesson) {
    setEditing(row);
    setFormStudent(row.studentUid);
    setDate(row.date);
    setFee(String(row.fee));
    setNote(row.note);
    setSaveDefaultRate(false);
    setMessage("");
    setError("");
    mutation.current = null;
    document
      .getElementById("tuition-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const amount = Number(fee);
    if (
      !fee.trim() ||
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      amount > 1_000_000_000
    ) {
      setError("Nhập học phí là số nguyên từ 0 đến 1.000.000.000 đồng.");
      return;
    }
    const payload = {
      id: editing?.id || draftId,
      revision: editing?.revision || 0,
      studentUid: formStudent,
      date,
      fee: amount,
      note,
      setDefaultRate,
    };
    const signature = JSON.stringify(payload);
    if (!mutation.current || mutation.current.signature !== signature)
      mutation.current = { signature, token: crypto.randomUUID() };
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await quizApi("tuitionSave", {
        ...payload,
        mutationToken: mutation.current.token,
      });
      setMessage(
        editing ? "Đã cập nhật buổi học và học phí." : "Đã lưu buổi học.",
      );
      const savedMonth = date.slice(0, 7);
      if (filterStudent) setFilterStudent(formStudent);
      resetDraft(savedMonth);
      setMonth(savedMonth);
      setReload((value) => value + 1);
    } catch (failure) {
      if (failure instanceof QuizApiError && failure.status === 409) {
        resetDraft();
        setReload((value) => value + 1);
        setError(
          `${accountError(failure)} Chọn lại buổi học trong danh sách để chỉnh sửa.`,
        );
      } else setError(accountError(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function deleteLesson(row: TuitionLesson) {
    if (
      busyRef.current ||
      !window.confirm(
        `Xóa buổi học ngày ${tuitionDate(row.date)} của ${nameOf(row)}? Tổng học phí tháng sẽ được cập nhật.`,
      )
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await quizApi("tuitionDelete", { id: row.id, revision: row.revision });
      if (editing?.id === row.id) resetDraft();
      setMessage("Đã xóa buổi học và cập nhật tổng học phí.");
      setReload((value) => value + 1);
    } catch (failure) {
      if (failure instanceof QuizApiError && failure.status === 409) {
        if (editing?.id === row.id) resetDraft();
        setReload((value) => value + 1);
      }
      setError(accountError(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function exportPdf(studentUid: string) {
    if (busyRef.current || loading || !overview) return;
    busyRef.current = true;
    setBusy(true);
    setExporting(studentUid);
    setError("");
    setMessage("");
    try {
      const [report, { downloadTuitionPdf }] = await Promise.all([
        quizApi<TuitionReport>("tuitionReport", { month, studentUid }),
        import("@/lib/tuition-pdf"),
      ]);
      const name = await downloadTuitionPdf(report);
      setMessage(`Đã tạo ${name}. Bạn có thể gửi file PDF cho học sinh.`);
    } catch (failure) {
      setError(accountError(failure));
    } finally {
      setExporting("");
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h2 className="text-lg font-semibold">Thống kê buổi học</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Ghi ngày học và học phí từng buổi, tổng hợp số buổi và số tiền theo
          học sinh trong tháng.
        </p>
      </header>
      <div className="grid min-w-0 gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <label className="account-label min-w-0">
          Tháng thống kê
          <input
            className="account-input min-w-0"
            type="month"
            min="2000-01"
            max="2100-12"
            value={month}
            disabled={busy}
            onChange={(event) => {
              if (event.target.value) {
                setMonth(event.target.value);
                resetDraft(event.target.value);
                setMessage("");
                setError("");
              }
            }}
          />
        </label>
        <label className="account-label min-w-0">
          Lọc học sinh
          <select
            className="account-input min-w-0"
            value={filterStudent}
            disabled={busy}
            onChange={(event) => setFilterStudent(event.target.value)}
          >
            <option value="">Tất cả học sinh</option>
            {options.map((student) => (
              <option key={student.uid} value={student.uid}>
                {student.displayName} · @{student.username}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="account-button-secondary"
          disabled={busy || loading || loadingStudents}
          onClick={() => {
            setReload((value) => value + 1);
            onRefreshStudents();
          }}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Tải lại thống kê
        </button>
      </div>
      {(error || loadError) && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error || loadError}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}
      <section
        aria-label="Tổng học phí trong tháng"
        aria-busy={loading}
        className="grid gap-3 sm:grid-cols-3"
      >
        {[
          { label: "Số học sinh", value: summaries.length, Icon: Users },
          { label: "Số buổi học", value: totalLessons, Icon: CalendarDays },
          {
            label: "Tổng học phí",
            value: tuitionMoney(totalFee),
            Icon: Wallet,
          },
        ].map(({ label, value, Icon }) => (
          <article
            key={label}
            className="min-w-0 rounded-2xl border border-sky-100 bg-sky-50/60 p-4"
          >
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Icon className="size-4 shrink-0" />
              {label}
            </p>
            <p className="mt-3 break-words text-xl font-bold text-sky-950">
              {overview ? value : "—"}
            </p>
          </article>
        ))}
      </section>
      <section
        id="tuition-form"
        className="min-w-0 scroll-mt-6 rounded-2xl border border-slate-200 p-4 sm:p-6"
        aria-labelledby="tuition-form-title"
      >
        <h3 id="tuition-form-title" className="mb-4 font-semibold">
          {editing ? "Chỉnh sửa buổi học" : "Thêm buổi học"}
        </h3>
        <form onSubmit={saveLesson}>
          <fieldset
            disabled={busy || loadingStudents || loading || !overview}
            className="grid min-w-0 gap-4 sm:grid-cols-2"
          >
            <label className="account-label min-w-0 sm:col-span-2">
              Học sinh
              <select
                className="account-input min-w-0"
                required
                value={formStudent}
                onChange={(event) => {
                  setFormStudent(event.target.value);
                  const rate = overview?.rates.find(
                    (row) => row.studentUid === event.target.value,
                  );
                  setFee(rate ? String(rate.fee) : "");
                }}
              >
                <option value="">Chọn học sinh</option>
                {(editing ? options : accounts).map((student) => (
                  <option key={student.uid} value={student.uid}>
                    {student.displayName} · @{student.username}
                  </option>
                ))}
              </select>
            </label>
            <label className="account-label min-w-0">
              Ngày học
              <input
                className="account-input min-w-0"
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </label>
            <label className="account-label min-w-0">
              Học phí buổi này (đồng)
              <input
                className="account-input min-w-0"
                type="number"
                inputMode="numeric"
                min={0}
                max={1_000_000_000}
                step={1}
                value={fee}
                onChange={(event) => setFee(event.target.value)}
                placeholder="250000"
                required
              />
            </label>
            <label className="account-label min-w-0 sm:col-span-2">
              Ghi chú (tùy chọn)
              <textarea
                className="account-input min-h-20"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={2}
              />
            </label>
            <label className="flex items-start gap-2 text-sm leading-relaxed text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-sky-800"
                checked={setDefaultRate}
                onChange={(event) => setSaveDefaultRate(event.target.checked)}
              />
              Lưu mức phí này làm mặc định cho học sinh
            </label>
          </fieldset>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Mức phí mặc định dùng cho buổi mới; mỗi buổi học giữ số tiền đã ghi
            nhận.
          </p>
          {!loadingStudents && !accounts.length && !editing && (
            <p className="mt-3 text-sm text-slate-600">
              Chưa có học sinh trong danh sách. Cấp tài khoản tại mục Thêm tài
              khoản.
            </p>
          )}
          {hasMoreStudents && (
            <button
              type="button"
              className="mt-3 text-sm text-sky-800 underline"
              disabled={busy || loadingStudents}
              onClick={onLoadMoreStudents}
            >
              {loadingStudents ? "Đang tải học sinh…" : "Tải thêm học sinh"}
            </button>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="account-button"
              disabled={
                busy ||
                loading ||
                loadingStudents ||
                !overview ||
                (!accounts.length && !editing)
              }
            >
              {busy && !exporting
                ? "Đang lưu…"
                : editing
                  ? "Lưu thay đổi"
                  : "Lưu buổi học"}
            </button>
            {editing && (
              <button
                type="button"
                className="account-button-secondary"
                disabled={busy}
                onClick={() => resetDraft()}
              >
                Hủy chỉnh sửa
              </button>
            )}
          </div>
        </form>
      </section>
      <section aria-labelledby="tuition-summary-title" aria-busy={loading}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 id="tuition-summary-title" className="font-semibold">
            Tổng hợp học phí tháng {tuitionMonthLabel(month)}
          </h3>
          {filterStudent && (
            <button
              type="button"
              className="account-button-secondary"
              disabled={busy || loading || !overview}
              onClick={() => void exportPdf(filterStudent)}
            >
              <Download className="size-4" />
              {exporting === filterStudent
                ? "Đang tạo PDF…"
                : "Xuất PDF cho học sinh"}
            </button>
          )}
        </div>
        {overview && !summaries.length ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Chưa có buổi học trong tháng này.
          </p>
        ) : !overview ? (
          <p className="text-sm text-slate-600">
            {loading ? "Đang tải thống kê…" : "Chưa tải được thống kê."}
          </p>
        ) : (
          <div className="relative max-w-full overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[540px] text-left text-sm">
              <caption className="sr-only">
                Tổng số buổi và học phí của từng học sinh trong tháng{" "}
                {tuitionMonthLabel(month)}
              </caption>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className="p-3">
                    Học sinh
                  </th>
                  <th scope="col" className="p-3 text-center">
                    Số buổi
                  </th>
                  <th scope="col" className="p-3 text-right">
                    Tổng học phí
                  </th>
                  <th scope="col" className="p-3">
                    <span className="sr-only">Chi tiết</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map((row) => (
                  <tr key={row.studentUid}>
                    <th scope="row" className="p-3 font-normal">
                      <p className="font-semibold">{nameOf(row)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        @{row.username}
                      </p>
                    </th>
                    <td className="p-3 text-center">{row.lessonCount}</td>
                    <td className="whitespace-nowrap p-3 text-right font-semibold">
                      {tuitionMoney(row.totalFee)}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <button
                          type="button"
                          disabled={busy}
                          className="text-xs font-medium text-sky-800 underline"
                          onClick={() => setFilterStudent(row.studentUid)}
                        >
                          Xem các buổi
                        </button>
                        <button
                          type="button"
                          className="account-button-secondary whitespace-nowrap !px-3 !py-2 text-xs"
                          aria-label={`Xuất PDF học phí của ${nameOf(row)}`}
                          disabled={busy || loading}
                          onClick={() => void exportPdf(row.studentUid)}
                        >
                          <Download className="size-3.5" />
                          {exporting === row.studentUid
                            ? "Đang tạo PDF…"
                            : "Xuất PDF"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-sky-50/50 font-semibold">
                <tr>
                  <th scope="row" className="p-3">
                    Tổng cộng
                  </th>
                  <td className="p-3 text-center">{totalLessons}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {tuitionMoney(totalFee)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      <section aria-labelledby="tuition-history-title" aria-busy={loading}>
        <h3 id="tuition-history-title" className="mb-4 font-semibold">
          Chi tiết các buổi học
        </h3>
        {overview?.truncated && (
          <p className="mb-3 text-sm text-slate-600">
            Hiển thị tối đa 1000 buổi gần nhất. Lọc theo học sinh để xem chi
            tiết; tổng học phí vẫn tính đầy đủ.
          </p>
        )}
        {overview && !lessons.length ? (
          <p className="text-sm text-slate-600">
            Chưa có buổi học để hiển thị.
          </p>
        ) : (
          overview && (
            <div className="relative max-w-full overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[660px] text-left text-sm">
                <caption className="sr-only">
                  Ngày học và học phí từng buổi tháng {tuitionMonthLabel(month)}
                </caption>
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th scope="col" className="p-3">
                      Ngày học
                    </th>
                    <th scope="col" className="p-3">
                      Học sinh
                    </th>
                    <th scope="col" className="p-3 text-right">
                      Học phí/buổi
                    </th>
                    <th scope="col" className="p-3">
                      Ghi chú
                    </th>
                    <th scope="col" className="p-3">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lessons.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap p-3">
                        <time dateTime={row.date}>{tuitionDate(row.date)}</time>
                      </td>
                      <th scope="row" className="p-3 font-normal">
                        <p className="font-medium">{nameOf(row)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          @{row.username}
                        </p>
                      </th>
                      <td className="whitespace-nowrap p-3 text-right">
                        {tuitionMoney(row.fee)}
                      </td>
                      <td className="max-w-64 break-words p-3 text-slate-600">
                        {row.note || "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="account-button-secondary !p-2"
                            aria-label={`Sửa buổi học ${tuitionDate(row.date)} của ${nameOf(row)}`}
                            disabled={busy}
                            onClick={() => editLesson(row)}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="account-button-secondary !p-2 text-red-700"
                            aria-label={`Xóa buổi học ${tuitionDate(row.date)} của ${nameOf(row)}`}
                            disabled={busy}
                            onClick={() => void deleteLesson(row)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
}
