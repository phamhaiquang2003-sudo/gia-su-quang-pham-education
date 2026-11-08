-- Teaching plans are independent of attendance and tuition charges.
CREATE TABLE IF NOT EXISTS schedule_calendars (
  teacher_uid TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  save_token TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS schedule_batches (
  id TEXT PRIMARY KEY,
  teacher_uid TEXT NOT NULL,
  mutation_token TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS schedule_events (
  id TEXT PRIMARY KEY,
  teacher_uid TEXT NOT NULL,
  batch_id TEXT NOT NULL REFERENCES schedule_batches(id),
  recurring INTEGER NOT NULL DEFAULT 0 CHECK(recurring IN (0,1)),
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  students TEXT NOT NULL DEFAULT '[]',
  event_date TEXT NOT NULL,
  start_minute INTEGER NOT NULL CHECK(start_minute >= 0 AND start_minute < 1440),
  end_minute INTEGER NOT NULL CHECK(end_minute > start_minute AND end_minute < 1440),
  location TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planned','completed','cancelled')),
  revision INTEGER NOT NULL DEFAULT 1,
  mutation_token TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS schedule_teacher_date ON schedule_events(teacher_uid,event_date,start_minute);
CREATE INDEX IF NOT EXISTS schedule_teacher_batch ON schedule_events(teacher_uid,batch_id);
