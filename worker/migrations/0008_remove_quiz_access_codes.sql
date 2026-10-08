-- Retire quiz passwords without changing questions, grades or active revisions.
UPDATE quizzes
SET body=json_remove(body,'$.accessCode','$.requiresAccessCode')
WHERE json_type(body,'$.accessCode') IS NOT NULL
   OR json_type(body,'$.requiresAccessCode') IS NOT NULL;

UPDATE quiz_attempts
SET snapshot=json_remove(snapshot,'$.accessCode','$.requiresAccessCode')
WHERE json_type(snapshot,'$.accessCode') IS NOT NULL
   OR json_type(snapshot,'$.requiresAccessCode') IS NOT NULL;

DROP TABLE IF EXISTS quiz_access_failures;
