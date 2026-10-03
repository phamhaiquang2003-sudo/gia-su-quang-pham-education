CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','published','hidden')),
  revision INTEGER NOT NULL DEFAULT 1,
  save_token TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS quizzes_catalogue ON quizzes(status,subject,created_at);
CREATE TABLE IF NOT EXISTS quiz_files (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS quiz_file_links (
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES quiz_files(id),
  PRIMARY KEY(quiz_id,file_id)
);
CREATE INDEX IF NOT EXISTS quiz_file_access ON quiz_file_links(file_id,quiz_id);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id),
  user_uid TEXT NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL,
  user_role TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}',
  flagged TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  submitted_at INTEGER,
  result TEXT,
  UNIQUE(quiz_id,user_uid)
);
CREATE INDEX IF NOT EXISTS quiz_results ON quiz_attempts(quiz_id,submitted_at);
CREATE INDEX IF NOT EXISTS quiz_expiry ON quiz_attempts(submitted_at,deadline_at);
CREATE TABLE IF NOT EXISTS attempt_file_links (
  attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id),
  file_id TEXT NOT NULL REFERENCES quiz_files(id),
  PRIMARY KEY(attempt_id,file_id)
);
