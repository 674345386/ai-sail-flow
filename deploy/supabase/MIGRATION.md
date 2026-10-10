# Sail schema and email-login migration

Scope: custom table schema and related indexes/constraints/functions/triggers/RLS; email OTP; empty private buckets; frontend/backend connection configuration. No source table rows, Auth user records, or file contents are copied.

Source: the existing Volcengine Supabase instance. Target: `/home/admin/supabase` on `ai-sail-flow-prod`.

Prepared:

- Email-only Sail UI, and the public six-digit email template at `/auth-email/code.html`.
- `sail-storage.sql`: empty media/keyframe buckets and authenticated user-prefix policies.
- `configure-email.py`: verify supplied SMTP credentials over TLS before preparing Auth configuration; six-digit OTP, 600 seconds validity, 60 seconds resend interval, signup enabled with confirmation required.
- Target Storage global limit raised to 250 MiB, matching the app's accepted video size.
- Local production bundle built against the target public URL and anon key.

Schema migration completed (2026-10-10):

- The user restored the source Workspace. Authorized read-only SQL catalog queries were run in `BEGIN READ ONLY` / `ROLLBACK` and exported as CSV. Private parsed exports are `source-catalog.json.local` and `source-public-details.json.local`.
- All non-system schemas were inventoried. The source public schema contains only `health_check` (two columns, integer sequence, primary key). There are no Sail business tables, public custom functions, enum/domain types, or business triggers. The current app stores project/workspace records on ECS and profile fields in Auth user metadata.
- `source-schema.sql.local` reconstructs the public table/sequence/primary key from the exported metadata and synchronizes the four source Storage policy names and expressions. Source owner `cloud_admin` maps to target `postgres`; owner-only access is preserved by removing target default grants. No rows or source sequence value are imported.
- Volcengine-managed `_agent`, `_ai_gateway`, `_edge_function`, `_sandbox_compute`, `postgrest`, Neon infrastructure, extension-owned objects and their quota triggers are excluded. Target Auth/Storage platform schemas remain managed by the installed Supabase versions.
- A pre-migration backup was created at `/home/admin/supabase-backups/20261010T105007Z-Wxg643`. The initial transaction encountered Storage ownership restrictions and fully rolled back. The corrected migration then committed using `supabase_admin`, the database administrator role, with the imported table owned by `postgres`.
- `verify-schema.py` passed catalog comparisons for columns, constraints/index, sequence options, exact Storage policies, empty migrated table and client permissions. The private verification report is `schema-verification.json.local`. The migration SQL runs once; do not rerun it on the migrated target.
- Local `.env` now uses the target client/server connection settings as well. The old local environment is retained privately as `source-env-before.local`.

Completed configuration and cutover:

- The existing 163 SMTP credentials were recovered and validated over TLS; no SMTP input is outstanding. Private credentials are held in `migration-secrets.local` and the target server configuration.
- Frontend build and backend runtime use the Alibaba Supabase URL and corresponding client/server keys. The original `/app/data` mount and unrelated model configuration are preserved.
- The public six-digit email template, empty private buckets, folder-based storage policies, and email-only UI are live. Target Storage supports the app's 250 MiB limit.
- The deployment retains the previous container/image, records the uncommitted source digest, and persists configuration for subsequent releases. No Git commit has been made.

Status: email login is deployed on Sail and passed real SMTP email delivery, OTP verification, refresh, owner upload/signed download, cross-user access denial, live protected APIs, secure cookies, authenticated media access, and logout revocation checks. Test files and test accounts were removed. Sail now uses the Alibaba Supabase URL; its original ECS data mount is preserved. The old container is retained for rollback. The deployed image records the base Git revision plus a source snapshot digest; local source changes are uncommitted.

The Volcengine REST OpenAPI reports no exposed table definitions and only the root path. This does not establish that all source schemas are empty. Source schema audit/export and the applicable public schema migration are complete; `verify-schema.py` passed. Built-in Auth/Storage tables are initialized in the target, and empty buckets/policies have been created.
