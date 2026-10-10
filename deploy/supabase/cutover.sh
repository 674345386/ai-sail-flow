#!/usr/bin/env bash
# Run on the ECS after the staged candidate has passed authentication checks.
set -euo pipefail
umask 077
project=/home/admin/ai-sail-flow
release="$project/releases/email-migration"
backup="ai-sail-flow-before-email-migration-$(date -u +%Y%m%dT%H%M%SZ)"
exec 9>"$project/deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
switched=0
rollback() {
  result=$?
  trap - EXIT
  if [[ "$result" -ne 0 && "$switched" == 1 ]]; then
    docker stop ai-sail-flow >/dev/null 2>&1 || true
    docker rename ai-sail-flow "ai-sail-flow-email-failed-$(date -u +%Y%m%dT%H%M%SZ)" 2>/dev/null || true
    docker rename "$backup" ai-sail-flow
    docker start ai-sail-flow >/dev/null
    echo 'ROLLBACK_RESTORED'
  fi
  exit "$result"
}
trap rollback EXIT
python3 - <<'PY'
from pathlib import Path
import json
for p in Path('/home/admin/ai-sail-flow/data/projects').glob('*.json'):
    row = json.loads(p.read_text())
    if (row.get('job') or {}).get('status') == 'running' or (row.get('workflow') or {}).get('status') in ('running', 'pausing'):
        raise SystemExit('Active production task detected; cutover deferred')
PY
docker inspect ai-sail-flow:email-migration >/dev/null
# Protect small project/config records; media remain on the unchanged data mount.
python3 - <<'PY'
from pathlib import Path
import tarfile
root=Path('/home/admin/ai-sail-flow/data')
with tarfile.open('/home/admin/ai-sail-flow/releases/email-migration/app-records-before.tar.gz', 'w:gz') as tar:
    for p in sorted(root.glob('*.json')):
        tar.add(p,arcname=str(p.relative_to(root)))
    for name in ('projects','workspace-projects'):
        p=root/name
        if p.exists():tar.add(p,arcname=name)
PY
docker stop ai-sail-flow-email-candidate >/dev/null
docker stop ai-sail-flow >/dev/null
docker rename ai-sail-flow "$backup"
switched=1
docker run -d --name ai-sail-flow --restart unless-stopped \
  --env-file "$release/runtime.target.env.private" \
  -p 127.0.0.1:4317:4317 -v "$project/data:/app/data" \
  ai-sail-flow:email-migration >/dev/null
ready=0
for attempt in {1..20}; do
  if curl --noproxy '*' -fsS --connect-timeout 2 --max-time 3 -H 'Host: lululib.cn' http://127.0.0.1:4317/api/status > "$release/status.json" 2>/dev/null; then
    if python3 - "$release/status.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
assert s.get('local') is False and s.get('configured') is True
assert s.get('keyframeStorage',{}).get('configured') is True
assert s['keyframeStorage']['url']=='https://supabase-47-254-32-230.sslip.io'
PY
    then ready=1;break;fi
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'Readiness failed' >&2;exit 1; }
curl --noproxy '*' -fsS --max-time 10 https://lululib.cn/ -o /dev/null
printf '%s\n' "$backup" > "$release/ROLLBACK_CONTAINER"
python3 - <<'PY'
import json,subprocess
from pathlib import Path
j=json.loads(subprocess.check_output(['docker','inspect','ai-sail-flow']))[0]
labels=j['Config']['Labels']
manifest={'base_git_revision':labels.get('org.opencontainers.image.revision'),'source_state':labels.get('io.sail.source-state'),'source_sha256':labels.get('io.sail.source-sha256'),'supabase_url':'https://supabase-47-254-32-230.sslip.io','scope':'email-login cutover; source custom schema audit pending'}
Path('/home/admin/ai-sail-flow/EMAIL_MIGRATION.json').write_text(json.dumps(manifest,indent=2)+'\n')
PY
# Persist changed source files and public template for the next release.
cp "$release/source/src/App.tsx" "$project/src/App.tsx"
cp "$release/source/src/AuthDialog.tsx" "$project/src/AuthDialog.tsx"
cp "$release/source/src/auth.ts" "$project/src/auth.ts"
mkdir -p "$project/public/auth-email"
cp "$release/source/dist/auth-email/code.html" "$project/public/auth-email/code.html"
# Keep the server deployment file consistent without copying unrelated keys to output.
python3 - <<'PY'
from pathlib import Path
p=Path('/home/admin/ai-sail-flow/.env.production')
keys={'VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_STORAGE_BUCKET','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SOP_KEYFRAME_BUCKET','VITE_REQUIRE_AUTH','SOP_REQUIRE_AUTH'}
new=dict(l.split('=',1) for l in Path('/home/admin/ai-sail-flow/releases/email-migration/runtime.target.env.private').read_text().splitlines() if '=' in l)
old=p.read_text().splitlines() if p.exists() else []
if p.exists():
    backup=Path('/home/admin/ai-sail-flow/releases/email-migration/server-env-before.local')
    backup.write_text(p.read_text());backup.chmod(0o600)
remaining=set(keys);lines=[]
for l in old:
    key=l.split('=',1)[0]
    if key in keys:l=key+'='+new[key];remaining.discard(key)
    lines.append(l)
lines += [key+'='+new[key] for key in sorted(remaining)]
p.write_text('\n'.join(lines)+'\n');p.chmod(0o600)
PY
switched=0
echo 'EMAIL_LOGIN_DEPLOYED'
echo "ROLLBACK_CONTAINER=$backup"
echo 'READINESS=ok HTTPS=ok'
