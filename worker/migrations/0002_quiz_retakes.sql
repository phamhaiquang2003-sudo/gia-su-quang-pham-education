-- Keep every attempt while allowing a teacher to release the current slot.
CREATE TABLE quiz_attempts_v2 (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
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
  attempt_number INTEGER NOT NULL DEFAULT 1,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0,1))
);
INSERT INTO quiz_attempts_v2(id,quiz_id,user_uid,display_name,username,user_role,snapshot,answers,flagged,revision,started_at,deadline_at,submitted_at,result)
SELECT id,quiz_id,user_uid,display_name,username,user_role,snapshot,answers,flagged,revision,started_at,deadline_at,submitted_at,result FROM quiz_attempts;

CREATE TABLE attempt_file_links_v2 (
  attempt_id TEXT NOT NULL REFERENCES quiz_attempts_v2(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES quiz_files(id),
  PRIMARY KEY(attempt_id,file_id)
);
INSERT INTO attempt_file_links_v2 SELECT attempt_id,file_id FROM attempt_file_links;
DROP TABLE attempt_file_links;
DROP TABLE quiz_attempts;
ALTER TABLE quiz_attempts_v2 RENAME TO quiz_attempts;
ALTER TABLE attempt_file_links_v2 RENAME TO attempt_file_links;

CREATE UNIQUE INDEX quiz_current_attempt ON quiz_attempts(quiz_id,user_uid) WHERE is_current=1;
CREATE UNIQUE INDEX quiz_attempt_numbers ON quiz_attempts(quiz_id,user_uid,attempt_number);
CREATE INDEX quiz_results ON quiz_attempts(quiz_id,started_at);
CREATE INDEX quiz_expiry ON quiz_attempts(submitted_at,deadline_at);
CREATE INDEX attempt_file_access ON attempt_file_links(file_id,attempt_id);
