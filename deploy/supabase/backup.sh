#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /home/admin/supabase
backup_root=/home/admin/supabase-backups
mkdir -p "$backup_root"
chmod 700 "$backup_root"
backup_dir=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
trap 'echo "Backup failed: $backup_dir" >&2' ERR
docker compose exec -T db pg_dump -U postgres -d postgres -Fc > "$backup_dir/postgres.dump"
docker compose exec -T db pg_dumpall -U postgres --globals-only | gzip > "$backup_dir/globals.sql.gz"
tar -czf "$backup_dir/files-and-config.tar.gz" --exclude=volumes/db/data .env docker-compose.yml SOURCE_REVISION volumes/storage volumes/api volumes/db
# Verify the archives can be read; a full restore is a separate procedure.
docker compose exec -T db pg_restore --list < "$backup_dir/postgres.dump" > /dev/null
gzip -t "$backup_dir/globals.sql.gz"
tar -tzf "$backup_dir/files-and-config.tar.gz" > /dev/null
touch "$backup_dir/COMPLETE"
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -mtime +7 -name '20*T*-*' -exec rm -rf -- {} +
echo "Backup completed: $backup_dir"
