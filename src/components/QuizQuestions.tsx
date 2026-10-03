import { Flag } from "lucide-react";
import QuizFile from "./QuizFile";
import type { Answers, Question } from "@/lib/quizzes";

export default function QuizQuestions({
  questions,
  answers,
  flagged,
  onAnswer,
  onFlag,
  disabled = false,
  onActive,
}: {
  questions: Question[];
  answers: Answers;
  flagged: string[];
  onAnswer: (id: string, value: Answers[string]) => void;
  onFlag: (id: string) => void;
  disabled?: boolean;
  onActive?: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      {questions.map((q, index) => (
        <section
          key={q.id}
          id={`question-${q.id}`}
          tabIndex={-1}
          onFocus={() => onActive?.(q.id)}
          onMouseEnter={() => onActive?.(q.id)}
          className="exercise-panel scroll-mt-32 p-5 outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:p-6"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">
              Câu {index + 1}{" "}
              <span className="ml-2 text-xs font-normal text-slate-300">
                {q.points} điểm trọng số
              </span>
            </h2>
            <button
              type="button"
              onClick={() => onFlag(q.id)}
              aria-pressed={flagged.includes(q.id)}
              disabled={disabled}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${flagged.includes(q.id) ? "border-amber-300/60 bg-amber-300/15 text-amber-200" : "border-white/20 text-slate-200"}`}
            >
              <Flag className="size-4" />
              {flagged.includes(q.id) ? "Đã đánh dấu" : "Đánh dấu xem lại"}
            </button>
          </div>
          {q.prompt && (
            <p className="mb-5 whitespace-pre-wrap break-words leading-relaxed">
              {q.prompt}
            </p>
          )}
          {q.imageId && (
            <div className="mb-5">
              <QuizFile id={q.imageId} imageOnly />
            </div>
          )}
          <fieldset
            disabled={disabled}
            aria-label={`Trả lời câu ${index + 1}`}
            className="space-y-3"
          >
            {q.type === "single" &&
              q.choices?.map((choice, i) => {
                const letter = "ABCD"[i];
                return (
                  <label
                    key={letter}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed ${answers[q.id] === letter ? "border-sky-300 bg-sky-300/10" : "border-white/15 hover:bg-white/5"}`}
                  >
                    <input
                      className="mt-1 size-4 shrink-0 accent-sky-300"
                      type="radio"
                      name={`answer-${q.id}`}
                      value={letter}
                      checked={answers[q.id] === letter}
                      onChange={() => onAnswer(q.id, letter)}
                    />
                    <span className="font-semibold">{letter}.</span>
                    <span className="whitespace-pre-wrap break-words">
                      {choice}
                    </span>
                  </label>
                );
              })}
            {q.type === "truefalse" &&
              q.statements?.map((statement, i) => {
                const a = Array.isArray(answers[q.id])
                  ? (answers[q.id] as (boolean | null)[])
                  : [null, null, null, null];
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-white/15 p-4"
                  >
                    <p className="mb-3 whitespace-pre-wrap break-words text-sm">
                      {"abcd"[i]}. {statement}
                    </p>
                    <div className="flex gap-5">
                      {[true, false].map((value) => (
                        <label
                          key={String(value)}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="radio"
                            name={`answer-${q.id}-${i}`}
                            checked={a[i] === value}
                            className="size-4 accent-sky-300"
                            onChange={() =>
                              onAnswer(
                                q.id,
                                a.map((old, j) => (j === i ? value : old)),
                              )
                            }
                          />
                          {value ? "Đúng" : "Sai"}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            {q.type === "short" && (
              <label className="block text-sm">
                Kết quả của bạn
                <input
                  value={
                    typeof answers[q.id] === "string"
                      ? (answers[q.id] as string)
                      : ""
                  }
                  onChange={(e) => onAnswer(q.id, e.target.value)}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="Nhập đáp án ngắn…"
                  className="exercise-input mt-2"
                />
              </label>
            )}
          </fieldset>
        </section>
      ))}
    </div>
  );
}
