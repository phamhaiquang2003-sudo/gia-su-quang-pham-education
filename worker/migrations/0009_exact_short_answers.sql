-- Current quizzes use exact short answers. Revision checks reject stale editors.
UPDATE quizzes
SET body=json_set(body,'$.questions',json((
      SELECT json_group_array(json(
        CASE WHEN json_extract(question.value,'$.type')='short'
          THEN json_set(question.value,'$.tolerance',0)
          ELSE question.value
        END
      ))
      FROM json_each(quizzes.body,'$.questions') AS question
    ))),
    revision=revision+1,
    updated_at=MAX(updated_at,unixepoch()*1000)
WHERE EXISTS (
  SELECT 1 FROM json_each(quizzes.body,'$.questions') AS question
  WHERE json_extract(question.value,'$.type')='short'
    AND COALESCE(json_extract(question.value,'$.tolerance'),0)<>0
);
