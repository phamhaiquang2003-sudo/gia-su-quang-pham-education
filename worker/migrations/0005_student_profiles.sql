CREATE TABLE student_profiles (
  user_uid TEXT PRIMARY KEY,
  avatar_mime TEXT NOT NULL,
  avatar_data BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
