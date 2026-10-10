#!/usr/bin/env python3
"""Configure a fresh checkout of official Supabase docker/ for a small ECS."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sys
import time
import yaml

root = Path(sys.argv[1]).resolve()
url = sys.argv[2].rstrip('/')
if (root / '.env').exists():
    raise SystemExit('Refusing to replace existing credentials')
os.umask(0o077)
secret = secrets.token_hex(32)

def b64(value):
    return base64.urlsafe_b64encode(value).decode().rstrip('=')

def jwt(role):
    now = int(time.time())
    header = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    payload = b64(json.dumps({'role': role, 'iss': 'supabase', 'iat': now, 'exp': now + 5 * 365 * 86400}, separators=(',', ':')).encode())
    message = f'{header}.{payload}'
    return message + '.' + b64(hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest())

values = {
    'POSTGRES_PASSWORD': secrets.token_hex(24), 'JWT_SECRET': secret,
    'ANON_KEY': jwt('anon'), 'SERVICE_ROLE_KEY': jwt('service_role'),
    'DASHBOARD_USERNAME': 'supabase', 'DASHBOARD_PASSWORD': secrets.token_hex(18),
    'SECRET_KEY_BASE': secrets.token_hex(48), 'REALTIME_DB_ENC_KEY': secrets.token_hex(8),
    'VAULT_ENC_KEY': secrets.token_hex(16), 'PG_META_CRYPTO_KEY': secrets.token_hex(32),
    'LOGFLARE_PUBLIC_ACCESS_TOKEN': secrets.token_hex(32),
    'LOGFLARE_PRIVATE_ACCESS_TOKEN': secrets.token_hex(32),
    'S3_PROTOCOL_ACCESS_KEY_ID': secrets.token_hex(16),
    'S3_PROTOCOL_ACCESS_KEY_SECRET': secrets.token_hex(32),
    'MINIO_ROOT_PASSWORD': secrets.token_hex(24),
    'SUPABASE_PUBLIC_URL': url, 'API_EXTERNAL_URL': url + '/auth/v1',
    'SITE_URL': 'https://lululib.cn',
    'ADDITIONAL_REDIRECT_URLS': 'https://lululib.cn/auth/callback,https://www.lululib.cn/auth/callback',
    'API_GW_HTTP_PORT': '127.0.0.1:18000', 'DISABLE_SIGNUP': 'true',
    'ENABLE_PHONE_SIGNUP': 'false', 'ENABLE_PHONE_AUTOCONFIRM': 'false',
    'SMTP_HOST': '', 'SMTP_PORT': '587', 'SMTP_USER': '', 'SMTP_PASS': '',
    'SMTP_ADMIN_EMAIL': '', 'SMTP_SENDER_NAME': 'Supabase',
    'OPENAI_API_KEY': '', 'STUDIO_DEFAULT_ORGANIZATION': 'Personal',
    'STUDIO_DEFAULT_PROJECT': 'Alibaba ECS', 'COMPOSE_FILE': 'docker-compose.yml',
}
lines = []
for line in (root / '.env.example').read_text().splitlines():
    key = line.split('=', 1)[0]
    lines.append(f'{key}={values[key]}' if key in values else line)
(root / '.env').write_text('\n'.join(lines) + '\n')
(root / '.env').chmod(0o600)
compose = yaml.safe_load((root / 'docker-compose.yml').read_text())
keep = {'studio': '384m', 'api-gw': '128m', 'auth': '128m', 'rest': '96m',
        'storage': '256m', 'meta': '128m', 'db': '512m'}
compose['services'] = {k: v for k, v in compose['services'].items() if k in keep}
for name, service in compose['services'].items():
    service['mem_limit'] = keep[name]
    service['logging'] = {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}}
    service['depends_on'] = {k: v for k, v in service.get('depends_on', {}).items() if k in keep}
    if not service['depends_on']:
        del service['depends_on']
compose['services']['api-gw']['command'] = ['--concurrency', '1']
compose['services']['storage']['environment']['ENABLE_IMAGE_TRANSFORMATION'] = 'false'
compose['services']['storage']['environment'].pop('IMGPROXY_URL', None)
compose['services']['rest']['environment']['PGRST_DB_POOL'] = '10'
compose['services']['auth']['environment']['GOTRUE_DB_MAX_POOL_SIZE'] = '10'
compose['services']['db']['ports'] = ['127.0.0.1:15432:5432']
compose['services']['db']['command'] += ['-c', 'shared_buffers=64MB', '-c', 'max_connections=60', '-c', 'work_mem=4MB', '-c', 'maintenance_work_mem=32MB']
compose['volumes'] = {'db-config': None}
(root / 'docker-compose.upstream.yml').write_text((root / 'docker-compose.yml').read_text())
(root / 'docker-compose.yml').write_text(yaml.safe_dump(compose, sort_keys=False))
# Remove DNS polling for disabled services and return a clear response for their routes.
cds = root / 'volumes/api/envoy/cds.yaml'
clusters = yaml.safe_load(cds.read_text())
clusters['resources'] = [c for c in clusters['resources'] if c.get('name') not in {'realtime', 'functions'}]
cds.write_text(yaml.safe_dump(clusters, sort_keys=False))
lds = root / 'volumes/api/envoy/lds.template.yaml'
listener = yaml.safe_load(lds.read_text())
def patch_routes(node):
    if isinstance(node, dict):
        if node.get('route', {}).get('cluster') in {'realtime', 'functions'}:
            del node['route']
            node['direct_response'] = {'status': 503, 'body': {'inline_string': 'Service disabled in this minimal deployment'}}
        for value in node.values():
            patch_routes(value)
    elif isinstance(node, list):
        for value in node:
            patch_routes(value)
patch_routes(listener)
# Keep interpolation placeholders quoted: empty API keys must remain YAML strings.
def represent_string(dumper, value):
    return dumper.represent_scalar('tag:yaml.org,2002:str', value, style="'" if '${' in value else None)
yaml.SafeDumper.add_representer(str, represent_string)
lds.write_text(yaml.safe_dump(listener, sort_keys=False))
print('Configured 7 services; credentials generated privately; database and gateway bind to localhost.')
