BEGIN;
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ai-sail-flow-files', 'ai-sail-flow-files', false, 262144000),
       ('sop-keyframes', 'sop-keyframes', false, 20971520)
ON CONFLICT (id) DO NOTHING;
-- Match Sail's user-UUID prefix for media and profile/avatar paths.
CREATE POLICY ai_sail_flow_files_select_own ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ai-sail-flow-files' AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text));
CREATE POLICY ai_sail_flow_files_insert_own ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ai-sail-flow-files' AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text));
CREATE POLICY ai_sail_flow_files_update_own ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ai-sail-flow-files' AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text))
WITH CHECK (bucket_id = 'ai-sail-flow-files' AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text));
CREATE POLICY ai_sail_flow_files_delete_own ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ai-sail-flow-files' AND (storage.foldername(name))[1] = ((SELECT auth.uid())::text));
-- sop-keyframes is used by the backend's service-role key, with no client policy.
COMMIT;
