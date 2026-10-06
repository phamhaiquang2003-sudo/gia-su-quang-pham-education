-- Preserve attempt numbering without retaining released answers or results.
CREATE TABLE quiz_attempt_counters (
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL,
  last_attempt_number INTEGER NOT NULL,
  PRIMARY KEY (quiz_id, user_uid)
);
INSERT INTO quiz_attempt_counters(quiz_id,user_uid,last_attempt_number)
SELECT quiz_id,user_uid,MAX(attempt_number) FROM quiz_attempts GROUP BY quiz_id,user_uid;

CREATE TABLE retake_cleanup_files AS
SELECT l.file_id FROM attempt_file_links l JOIN quiz_attempts a ON a.id=l.attempt_id WHERE a.is_current=0
UNION SELECT l.file_id FROM submission_file_links l JOIN quiz_attempts a ON a.id=l.attempt_id WHERE a.is_current=0;
DELETE FROM quiz_attempts WHERE is_current=0;
DELETE FROM quiz_files WHERE id IN (SELECT file_id FROM retake_cleanup_files)
  AND NOT EXISTS(SELECT 1 FROM quiz_file_links WHERE file_id=quiz_files.id)
  AND NOT EXISTS(SELECT 1 FROM attempt_file_links WHERE file_id=quiz_files.id)
  AND NOT EXISTS(SELECT 1 FROM submission_file_links WHERE file_id=quiz_files.id);
DROP TABLE retake_cleanup_files;
