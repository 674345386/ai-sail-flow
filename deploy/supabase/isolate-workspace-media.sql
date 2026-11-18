BEGIN;
-- Retain old objects for owner review. The legacy shared catalog could put
-- another account's files under the current account's UUID.
UPDATE storage.buckets SET public = false WHERE id = 'ai-sail-flow-files';
DROP POLICY IF EXISTS ai_sail_flow_files_workspace_only ON storage.objects;
CREATE POLICY ai_sail_flow_files_workspace_only ON storage.objects AS RESTRICTIVE FOR ALL TO public
USING (
  bucket_id <> 'ai-sail-flow-files' OR (
    (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
    AND (storage.foldername(name))[2] IN ('workspace-media', 'profile')
  )
)
WITH CHECK (
  bucket_id <> 'ai-sail-flow-files' OR (
    (storage.foldername(name))[1] = ((SELECT auth.uid())::text)
    AND (storage.foldername(name))[2] IN ('workspace-media', 'profile')
  )
);
COMMIT;
