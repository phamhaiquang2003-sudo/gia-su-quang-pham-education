import { useId, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { getSubject, subjects, type SubjectId } from "@/lib/subjects";
import type { QuizSummary } from "@/lib/quizzes";

export interface QuizCatalogFilters {
  search: string;
  subject: SubjectId | "";
  category: string;
  status: QuizSummary["status"] | "";
  grading: "auto" | "manual" | "";
  sort: "newest" | "oldest" | "title" | "updated";
}
export const defaultQuizCatalogFilters: QuizCatalogFilters = {
  search: "",
  subject: "",
  category: "",
  status: "",
  grading: "",
  sort: "newest",
};
const titleOrder = new Intl.Collator("vi", {
  numeric: true,
  sensitivity: "base",
});
function searchable(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/gi, "d")
    .toLocaleLowerCase("vi");
}
function orderedCategories(subject: SubjectId, values: string[]) {
  const preferred: readonly string[] = getSubject(subject).categories;
  return [...new Set(values)].sort((a, b) => {
    const aIndex = preferred.indexOf(a),
      bIndex = preferred.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1)
      return (
        (aIndex === -1 ? preferred.length : aIndex) -
          (bIndex === -1 ? preferred.length : bIndex) ||
        titleOrder.compare(a, b)
      );
    return titleOrder.compare(a, b);
  });
}

export default function QuizAdminCatalog({
  quizzes,
  filters,
  onFiltersChange,
  busy,
  renderQuiz,
}: {
  quizzes: QuizSummary[];
  filters: QuizCatalogFilters;
  onFiltersChange: (filters: QuizCatalogFilters) => void;
  busy: boolean;
  renderQuiz: (quiz: QuizSummary) => ReactNode;
}) {
  const id = useId();
  const scoped = quizzes.filter(
    (quiz) => !filters.subject || quiz.subject === filters.subject,
  );
  const categories = filters.subject
    ? orderedCategories(
        filters.subject,
        scoped.map((quiz) => quiz.category),
      )
    : [...new Set(scoped.map((quiz) => quiz.category))].sort(
        titleOrder.compare,
      );
  if (filters.category && !categories.includes(filters.category))
    categories.push(filters.category);
  const terms = searchable(filters.search).trim().split(/\s+/).filter(Boolean);
  const filtered = quizzes
    .filter(
      (quiz) =>
        (!filters.subject || quiz.subject === filters.subject) &&
        (!filters.category || quiz.category === filters.category) &&
        (!filters.status || quiz.status === filters.status) &&
        (!filters.grading ||
          (quiz.gradingMode || "auto") === filters.grading) &&
        terms.every((term) =>
          searchable(
            `${quiz.title} ${getSubject(quiz.subject).label} ${quiz.category} ${quiz.id}`,
          ).includes(term),
        ),
    )
    .sort((a, b) => {
      const order =
        filters.sort === "title"
          ? titleOrder.compare(a.title, b.title)
          : filters.sort === "oldest"
            ? a.createdAt - b.createdAt
            : filters.sort === "updated"
              ? b.updatedAt - a.updatedAt
              : b.createdAt - a.createdAt;
      return (
        order ||
        titleOrder.compare(a.title, b.title) ||
        a.id.localeCompare(b.id)
      );
    });
  const active = Boolean(
    filters.search.trim() ||
    filters.subject ||
    filters.category ||
    filters.status ||
    filters.grading,
  );
  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={`${id}-title`} className="font-semibold">
            Danh sách bài tập
          </h3>
          <p role="status" className="mt-1 text-sm text-slate-600">
            Hiển thị {filtered.length}/{quizzes.length} đề · Phân theo môn học
            và danh mục
          </p>
        </div>
        {active && (
          <button
            type="button"
            className="account-button-secondary text-xs"
            disabled={busy}
            onClick={() => onFiltersChange({ ...defaultQuizCatalogFilters })}
          >
            <X className="size-4" />
            Xóa bộ lọc
          </button>
        )}
      </div>
      <fieldset
        disabled={busy}
        className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <legend className="sr-only">Tìm kiếm và phân loại bài tập</legend>
        <label className="account-label min-w-0">
          <span className="flex items-center gap-2">
            <Search className="size-4" />
            Tìm bài tập
          </span>
          <input
            className="account-input min-w-0"
            type="search"
            value={filters.search}
            onChange={(event) =>
              onFiltersChange({ ...filters, search: event.target.value })
            }
            placeholder="Tên đề, môn, lớp hoặc mã đề…"
          />
        </label>
        <label className="account-label min-w-0">
          Môn học
          <select
            className="account-input min-w-0"
            aria-label="Lọc môn học"
            value={filters.subject}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                subject: event.target.value as QuizCatalogFilters["subject"],
                category: "",
              })
            }
          >
            <option value="">Tất cả môn học</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.label}
              </option>
            ))}
          </select>
        </label>
        <label className="account-label min-w-0">
          Danh mục / lớp
          <select
            className="account-input min-w-0"
            aria-label="Lọc danh mục hoặc lớp"
            value={filters.category}
            onChange={(event) =>
              onFiltersChange({ ...filters, category: event.target.value })
            }
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="account-label min-w-0">
          Trạng thái đề
          <select
            className="account-input min-w-0"
            aria-label="Lọc trạng thái đề"
            value={filters.status}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                status: event.target.value as QuizCatalogFilters["status"],
              })
            }
          >
            <option value="">Tất cả trạng thái</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Bản nháp</option>
            <option value="hidden">Đã ẩn</option>
          </select>
        </label>
        <label className="account-label min-w-0">
          Loại bài tập
          <select
            className="account-input min-w-0"
            aria-label="Lọc loại bài tập"
            value={filters.grading}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                grading: event.target.value as QuizCatalogFilters["grading"],
              })
            }
          >
            <option value="">Tất cả loại bài</option>
            <option value="auto">Trắc nghiệm · Chấm tự động</option>
            <option value="manual">Tự luận · Gia sư chấm</option>
          </select>
        </label>
        <label className="account-label min-w-0">
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            Sắp xếp trong từng nhóm
          </span>
          <select
            className="account-input min-w-0"
            aria-label="Sắp xếp bài tập"
            value={filters.sort}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                sort: event.target.value as QuizCatalogFilters["sort"],
              })
            }
          >
            <option value="newest">Mới tạo nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="updated">Vừa cập nhật</option>
            <option value="title">Tên đề A–Z</option>
          </select>
        </label>
      </fieldset>
      {!quizzes.length ? (
        <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          Chưa có đề. Bấm “Tạo đề mới” để bắt đầu.
        </p>
      ) : !filtered.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
          <p className="text-sm text-slate-600">
            Không có bài tập phù hợp với bộ lọc.
          </p>
          <button
            type="button"
            className="account-button-secondary mt-3 text-xs"
            disabled={busy}
            onClick={() => onFiltersChange({ ...defaultQuizCatalogFilters })}
          >
            Hiển thị tất cả bài tập
          </button>
        </div>
      ) : (
        subjects.map((subject) => {
          const items = filtered.filter((quiz) => quiz.subject === subject.id);
          if (!items.length) return null;
          return (
            <section
              key={subject.id}
              aria-labelledby={`${id}-${subject.id}`}
              className="space-y-4"
            >
              <h4
                id={`${id}-${subject.id}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-sky-50 px-4 py-3 font-semibold text-sky-950"
              >
                <span>{subject.label}</span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-sky-800">
                  {items.length} đề
                </span>
              </h4>
              {orderedCategories(
                subject.id,
                items.map((quiz) => quiz.category),
              ).map((category) => {
                const categoryItems = items.filter(
                  (quiz) => quiz.category === category,
                );
                return (
                  <section
                    key={category}
                    aria-label={`${subject.label} · ${category}`}
                    className="min-w-0 space-y-3"
                  >
                    <h5 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
                      {category}
                      <span className="text-xs font-normal text-slate-500">
                        · {categoryItems.length} đề
                      </span>
                    </h5>
                    {categoryItems.map(renderQuiz)}
                  </section>
                );
              })}
            </section>
          );
        })
      )}
    </section>
  );
}
