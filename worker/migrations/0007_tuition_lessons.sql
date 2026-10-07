CREATE TABLE tuition_lessons (
  id TEXT PRIMARY KEY,
  teacher_uid TEXT NOT NULL,
  student_uid TEXT NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL,
  lesson_date TEXT NOT NULL,
  fee_vnd INTEGER NOT NULL CHECK(typeof(fee_vnd)='integer' AND fee_vnd>=0 AND fee_vnd<=1000000000),
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  mutation_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX tuition_month ON tuition_lessons(teacher_uid,lesson_date,student_uid);
CREATE INDEX tuition_student_month ON tuition_lessons(teacher_uid,student_uid,lesson_date);
CREATE TABLE tuition_student_rates (
  teacher_uid TEXT NOT NULL,
  student_uid TEXT NOT NULL,
  fee_vnd INTEGER NOT NULL CHECK(typeof(fee_vnd)='integer' AND fee_vnd>=0 AND fee_vnd<=1000000000),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(teacher_uid,student_uid)
);
