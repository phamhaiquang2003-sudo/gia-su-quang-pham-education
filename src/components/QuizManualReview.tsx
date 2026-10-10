import type { Attempt, Quiz } from "@/lib/quizzes";
import QuizFile from "./QuizFile";
import QuizEssayAnswer from "./QuizEssayAnswer";
import QuizResultView from "./QuizResultView";

export default function QuizManualReview({
  attempt,
  quiz,
}: {
  attempt: Attempt;
  quiz: Quiz;
}) {
  return (
    <div className="space-y-5">
      {attempt.result && <QuizResultView result={attempt.result} />}
      <h2 className="font-semibold">
        {quiz.mode === "document"
          ? "Xem lại đề bài và bài làm"
          : "Xem lại câu hỏi và bài làm"}
      </h2>
      {quiz.mode === "document" ? (
        <>
          {quiz.documentIds.map((id) => (
            <QuizFile key={id} id={id} openImage />
          ))}
          <section className="rounded-xl border border-current/20 p-4">
            <h3 className="mb-4 font-semibold">Bài nộp chung cho cả đề</h3>
            <QuizEssayAnswer value={attempt.answers.__submission} readOnly />
          </section>
        </>
      ) : (
        quiz.questions.map((question, index) => (
          <section
            key={question.id}
            className="rounded-xl border border-current/20 p-4"
          >
            <h3 className="mb-3 font-semibold">Câu {index + 1}</h3>
            {question.prompt && (
              <p className="mb-3 whitespace-pre-wrap break-words">
                {question.prompt}
              </p>
            )}
            {question.imageId && (
              <div className="mb-4">
                <QuizFile id={question.imageId} imageOnly openImage />
              </div>
            )}
            <QuizEssayAnswer value={attempt.answers[question.id]} readOnly />
          </section>
        ))
      )}
    </div>
  );
}
