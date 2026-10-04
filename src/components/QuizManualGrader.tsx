import { useState, type FormEvent } from "react";
import { quizApi, type Attempt } from "@/lib/quizzes";
import QuizManualReview from "./QuizManualReview";

export default function QuizManualGrader({
  attempt,
  onSaved,
}: {
  attempt: Attempt;
  onSaved: (attempt: Attempt) => void;
}) {
  const [score, setScore] = useState(
    attempt.result?.status === "graded" ? String(attempt.result.score) : "",
  );
  const [feedback, setFeedback] = useState(attempt.result?.feedback || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function grade(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await quizApi<{ attempt: Attempt }>("manualGrade", {
        id: attempt.id,
        revision: attempt.revision,
        score: Number(score.replace(",", ".")),
        feedback,
      });
      onSaved({ ...attempt, ...data.attempt });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa lưu được điểm.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {attempt.quiz && (
        <QuizManualReview attempt={attempt} quiz={attempt.quiz} />
      )}
      {attempt.submittedAt !== null && (
        <form
          onSubmit={(event) => void grade(event)}
          className="space-y-4 rounded-xl border border-slate-200 p-4"
        >
          <label className="account-label">
            Điểm (thang 10)
            <input
              className="account-input"
              type="number"
              min={0}
              max={10}
              step={0.01}
              required
              disabled={busy}
              value={score}
              onChange={(event) => {
                setScore(event.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className="account-label">
            Nhận xét của gia sư
            <textarea
              className="account-input min-h-28"
              maxLength={5000}
              disabled={busy}
              value={feedback}
              onChange={(event) => {
                setFeedback(event.target.value);
                setSaved(false);
              }}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm text-emerald-700">
              Đã lưu điểm và nhận xét cho học sinh.
            </p>
          )}
          <button type="submit" className="account-button" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu điểm và nhận xét"}
          </button>
        </form>
      )}
    </div>
  );
}
