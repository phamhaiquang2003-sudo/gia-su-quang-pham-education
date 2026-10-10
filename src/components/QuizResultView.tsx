import { displayAnswer, type Quiz, type QuizResult } from "@/lib/quizzes";
import QuizFile from "./QuizFile";

export default function QuizResultView({
  result,
  quiz,
}: {
  result: QuizResult;
  quiz?: Quiz;
}) {
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
  const questions = new Map(
    quiz?.questions.map((question) => [question.id, question]),
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
      {quiz?.mode === "document" && quiz.documentIds.length > 0 && (
        <section aria-label="Xem lại đề bài" className="space-y-4">
          <h2 className="font-semibold">Xem lại đề bài</h2>
          {quiz.documentIds.map((id) => (
            <QuizFile key={id} id={id} openImage />
          ))}
        </section>
      )}
      {quiz && <h2 className="font-semibold">Xem lại câu hỏi và bài làm</h2>}
      {result.details.map((detail, index) => {
        const question = questions.get(detail.id);
        return (
          <article
            key={detail.id}
            className="rounded-xl border border-current/15 p-4 text-sm"
          >
            <div className="flex justify-between gap-3">
              <h3 className="font-semibold">Câu {index + 1}</h3>
              <span>
                {detail.points.toLocaleString("vi-VN")} / {detail.maxPoints}{" "}
                điểm
              </span>
            </div>
            {question?.prompt && (
              <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed">
                {question.prompt}
              </p>
            )}
            {question?.imageId && (
              <div className="mt-4">
                <QuizFile
                  id={question.imageId}
                  imageOnly
                  openImage
                  alt={`Ảnh câu hỏi · Câu ${index + 1}`}
                />
              </div>
            )}
            {question?.type === "single" && (
              <ul
                aria-label={`Các lựa chọn câu ${index + 1}`}
                className="mt-4 space-y-3"
              >
                {question.choices?.map((choice, i) => {
                  const letter = "ABCD"[i];
                  const selected = detail.response === letter;
                  return (
                    <li
                      key={letter}
                      className={`flex items-start gap-3 rounded-xl border p-3 ${selected ? "border-sky-300 bg-sky-300/10" : "border-current/15"}`}
                    >
                      <span className="font-semibold">{letter}.</span>
                      <div className="min-w-0 flex-1 space-y-3">
                        {choice && (
                          <p className="whitespace-pre-wrap break-words">
                            {choice}
                          </p>
                        )}
                        {question.choiceImageIds?.[i] && (
                          <QuizFile
                            id={question.choiceImageIds[i]}
                            imageOnly
                            openImage
                            alt={`Ảnh lựa chọn ${letter} · Câu ${index + 1}`}
                          />
                        )}
                        {selected && (
                          <p className="text-xs font-semibold text-sky-200">
                            Bạn đã chọn {letter}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {question?.type === "truefalse" && (
              <ul
                aria-label={`Các ý câu ${index + 1}`}
                className="mt-4 space-y-3"
              >
                {question.statements?.map((statement, i) => {
                  const response = Array.isArray(detail.response)
                    ? detail.response[i]
                    : null;
                  return (
                    <li
                      key={i}
                      className="space-y-3 rounded-xl border border-current/15 p-3"
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {"abcd"[i]}. {statement}
                      </p>
                      {question.statementImageIds?.[i] && (
                        <QuizFile
                          id={question.statementImageIds[i]}
                          imageOnly
                          openImage
                          alt={`Ảnh ý ${"abcd"[i]} · Câu ${index + 1}`}
                        />
                      )}
                      <p className="text-xs font-semibold text-sky-200">
                        Bạn trả lời:{" "}
                        {response === true
                          ? "Đúng"
                          : response === false
                            ? "Sai"
                            : "Chưa trả lời"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
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
        );
      })}
    </div>
  );
}
