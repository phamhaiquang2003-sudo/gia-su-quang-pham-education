import { displayAnswer, type QuizResult } from "@/lib/quizzes";

export default function QuizResultView({ result }: { result: QuizResult }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sky-300/30 bg-sky-200/10 p-6 text-center">
        <p className="text-sm">Điểm theo thang 10</p>
        <p className="my-3 text-5xl font-bold">
          {result.score.toLocaleString("vi-VN")}
          <span className="text-xl opacity-70"> / 10</span>
        </p>
        <p className="text-sm">
          Đúng hoàn toàn {result.correctCount}/{result.questionCount} câu · Chưa
          hoàn tất {result.unansweredCount} câu
        </p>
        <p className="mt-2 text-xs opacity-70">
          Điểm được tính theo trọng số giáo viên đặt cho mỗi câu.
        </p>
      </div>
      {result.details.map((detail, index) => (
        <article
          key={detail.id}
          className="rounded-xl border border-current/15 p-4 text-sm"
        >
          <div className="flex justify-between gap-3">
            <h3 className="font-semibold">Câu {index + 1}</h3>
            <span>
              {detail.points.toLocaleString("vi-VN")} / {detail.maxPoints} điểm
            </span>
          </div>
          <p className="mt-3 break-words">
            Bạn trả lời: <strong>{displayAnswer(detail.response)}</strong>
          </p>
          {detail.expected !== undefined && (
            <p className="mt-2 break-words">
              Đáp án: <strong>{displayAnswer(detail.expected)}</strong>
            </p>
          )}
          {detail.explanation && (
            <p className="mt-3 whitespace-pre-wrap break-words opacity-80">
              Lời giải: {detail.explanation}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
