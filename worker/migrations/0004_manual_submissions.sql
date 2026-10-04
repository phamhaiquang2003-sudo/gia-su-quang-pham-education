-- Student work is private to its author and the teacher, independent of published quiz files.
ALTER TABLE quiz_attempts ADD COLUMN mutation_token TEXT NOT NULL DEFAULT '';
CREATE TABLE submission_file_links (
  attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  file_id TEXT NOT NULL UNIQUE REFERENCES quiz_files(id),
  PRIMARY KEY (attempt_id, file_id)
);
