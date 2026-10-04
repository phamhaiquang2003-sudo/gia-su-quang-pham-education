import { displayAnswer, type QuizResult } from "@/lib/quizzes";
import QuizFile from "./QuizFile";

export default function QuizResultView({ result }: { result: QuizResult }) {
  if (result.manual)
    return (
      <div className="rounded-2xl border border-sky-300/30 bg-sky-200/10 p-6">
        {result.status === "pending" ? (
          <p className="font-semibold">Đã nộp bài · Chờ gia sư chấm</p>
        ) : (
          <>
            <p className="text-sm">Điểm theo thang 10</p>
            <p className="my-3 text-4xl font-bold">
              {result.score.toLocaleString("vi-VN")}{" "}
              <span className="text-xl opacity-70">/ 10</span>
            </p>
            {result.feedback && (
              <div className="mt-4">
                <h3 className="font-semibold">Nhận xét của gia sư</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {result.feedback}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sky-300/30 bg-sky-200/10 p-6 text-center">
        <p className="text-sm">Điểm theo thang 10</p>
        <p className="my-3 text-5xl font-bold">
          {result.score.toLocaleString("vi-VN")}
          <span className="text-xl opacity-70"> / 10</span>
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
          {detail.explanationImageId && (
            <div className="mt-3">
              <p className="mb-2 font-semibold">Ảnh đáp án / lời giải</p>
              <QuizFile
                id={detail.explanationImageId}
                imageOnly
                alt="Ảnh đáp án / lời giải"
              />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
