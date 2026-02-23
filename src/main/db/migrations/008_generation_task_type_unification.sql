UPDATE work_queue
SET task_type = 'generation.image'
WHERE task_type IN ('generation.local.image', 'generation.remote.image');
