-- Failed access-code checks are bounded per authenticated user and quiz.
CREATE TABLE quiz_access_failures (
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL,
  quiz_revision INTEGER NOT NULL,
  failures INTEGER NOT NULL,
  retry_after INTEGER NOT NULL,
  PRIMARY KEY (quiz_id, user_uid)
);
