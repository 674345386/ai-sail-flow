# Alibaba ECS Supabase (minimal)

Target: `ai-sail-flow-prod` (`admin@47.254.32.230`), independent directory `/home/admin/supabase`.
Public URL: `https://supabase-47-254-32-230.sslip.io` (temporary IP-based domain).
Upstream revision: `8617532ae1a41571d5d557cd24c6f5f2565d9230`.

Seven containers: PostgreSQL 17, Auth, PostgREST, Storage, postgres-meta, Studio and Envoy. Realtime, Edge Functions, analytics, image transformations and Supavisor are disabled. This is a small development deployment on a 2 GB machine shared with Sail; use a larger ECS before increasing workload.

`configure.py` takes the official repository's `docker/` directory and a public HTTPS URL, generates fresh secrets, configures loopback ports and memory/log limits, and removes unused services. It requires Python 3 and PyYAML and refuses to overwrite an existing `.env`. Do not rerun against an initialized database or rotate PostgreSQL credentials by merely editing `.env`.

```sh
python3 configure.py /home/admin/supabase https://supabase-47-254-32-230.sslip.io
cd /home/admin/supabase
docker compose config --quiet
docker compose pull
docker compose up -d --wait --wait-timeout 180
```

The API gateway binds to `127.0.0.1:18000`; PostgreSQL binds to `127.0.0.1:15432`. Caddy provides HTTPS on existing ports 80/443. Studio uses generated HTTP Basic credentials; passwords and API keys live in `/home/admin/supabase/.env` (0600). Anon is a client key; service-role bypasses RLS and must stay server-side. Enable RLS on tables exposed to clients.

Auth site URL is `https://lululib.cn`. Sail now uses this instance with email OTP and the existing 163 SMTP account. Signup is enabled with email confirmation required. Confirmation and Magic Link templates display a six-digit code, valid for 10 minutes with a 60-second resend interval. OAuth/SMS login is not part of this deployment. Existing users and cloud files were not migrated; verification accounts/files have been removed. Source schema audit/export is complete: the only public table, `health_check`, has been recreated empty with its sequence/primary key and owner-only access; the four private-file policies match the source exactly. Provider-managed internal schemas and quota triggers are excluded. See `MIGRATION.md` and `verify-schema.py`.

Routine operations:

```sh
ssh ai-sail-flow-prod
cd /home/admin/supabase
docker compose ps
docker compose logs --tail 50 auth storage rest
docker compose up -d            # apply reviewed configuration changes
./backup.sh                    # manual backup
```

Database access through an SSH tunnel:

```sh
ssh -N -L 15432:127.0.0.1:15432 ai-sail-flow-prod
```

Connect to localhost:15432, database `postgres`, username `postgres`, using the generated PostgreSQL password. If this local port is busy choose another local port.

Backups run daily at 10:00 UTC (03:00 PDT / 02:00 PST), stored with private permissions under `/home/admin/supabase-backups`, retaining approximately seven days. Each includes a custom-format database dump, global roles, Storage files and deployment configuration. Archive readability is checked, but a complete restore has not been rehearsed. They reside on the same ECS; offsite backup is not configured. Live uploads can change during the file archive; pause application writes for a coordinated recovery point. Snippets/Edge Functions are not included. Back up before updates and pin image versions; avoid automatic upstream upgrades.

For recovery, preserve the current installation, use the same upstream revision and a separate target, restore the private configuration and Storage files, initialize PostgreSQL, and restore the globals/database with matching roles and extensions. Do not use `docker compose down -v` or Supabase reset scripts on an installation containing data.

Deployment checks passed: all seven containers healthy; public HTTPS returns 401 without Studio credentials and 200 after authentication; Auth settings returns 200; REST schema endpoint and Storage bucket API return 200 with service-role credentials; existing Sail HTTPS returns 200. The official gateway deliberately restricts REST OpenAPI discovery (`/rest/v1/`) to service-role keys, so anon returning 403 for that root endpoint is expected.

Private local delivery file: `deploy/supabase/access.local` (0600, ignored by Git). It contains the dashboard credentials, legacy client/server API keys and PostgreSQL password. Keep the service-role key and database password private. The server `.env` remains the source of truth.
