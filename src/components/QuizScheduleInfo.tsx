import {
  formatQuizTime,
  quizAvailability,
  type QuizSchedule,
} from "@/lib/quiz-schedule";

export default function QuizScheduleInfo({
  quiz,
  now,
  className = "",
}: {
  quiz: QuizSchedule;
  now?: number;
  className?: string;
}) {
  if (!quiz.opensAt && !quiz.closesAt) return null;
  const state = now === undefined ? null : quizAvailability(quiz, now);
  return (
    <div className={`space-y-1 text-xs leading-relaxed ${className}`}>
      {state && (
        <p className="font-semibold">
          {state === "upcoming"
            ? "Chưa đến giờ mở đề"
            : state === "closed"
              ? "Đề đã đóng"
              : "Đang trong giờ làm bài"}
        </p>
      )}
      {quiz.opensAt && <p>Mở đề: {formatQuizTime(quiz.opensAt)}</p>}
      {quiz.closesAt && <p>Đóng đề: {formatQuizTime(quiz.closesAt)}</p>}
      <p className="opacity-70">Giờ Việt Nam (UTC+7)</p>
    </div>
  );
}
