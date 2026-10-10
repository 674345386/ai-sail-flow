#!/usr/bin/env python3
"""Enable Sail email OTP after verifying the supplied SMTP credentials."""
import datetime
import os
from pathlib import Path
import shutil
import smtplib
import ssl
import sys
import yaml

root = Path(sys.argv[1]).resolve()
secrets_path = Path(sys.argv[2]).resolve()
os.umask(0o077)
values = {}
for line in secrets_path.read_text().splitlines():
    if line and not line.startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
for key in ['SMTP_USER', 'SMTP_PASS']:
    if not values.get(key):
        raise SystemExit(f'Missing {key}; no configuration changed')
host = values.get('SMTP_HOST') or 'smtp.163.com'
port = int(values.get('SMTP_PORT') or '465')
if port == 465:
    with smtplib.SMTP_SSL(host, port, timeout=15, context=ssl.create_default_context()) as smtp:
        smtp.login(values['SMTP_USER'], values['SMTP_PASS'])
else:
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.ehlo(); smtp.starttls(context=ssl.create_default_context()); smtp.ehlo()
        smtp.login(values['SMTP_USER'], values['SMTP_PASS'])
print('SMTP authentication verified (no message sent).')
updates = {
    'SMTP_HOST': host, 'SMTP_PORT': str(port),
    'SMTP_USER': values['SMTP_USER'], 'SMTP_PASS': values['SMTP_PASS'],
    'SMTP_ADMIN_EMAIL': values.get('SMTP_ADMIN_EMAIL') or values['SMTP_USER'],
    'SMTP_SENDER_NAME': values.get('SMTP_SENDER_NAME') or 'AI-Sail Flow',
    'DISABLE_SIGNUP': 'false', 'ENABLE_EMAIL_SIGNUP': 'true',
    'ENABLE_EMAIL_AUTOCONFIRM': 'false', 'ENABLE_PHONE_SIGNUP': 'false',
    'ENABLE_ANONYMOUS_USERS': 'false', 'SITE_URL': 'https://lululib.cn',
    'ADDITIONAL_REDIRECT_URLS': 'https://lululib.cn/auth/callback,https://www.lululib.cn/auth/callback',
}
def quote(value):
    if '\n' in value or '\r' in value:
        raise ValueError('Multiline values are unsupported')
    return "'" + value.replace("'", "\\'") + "'"
for value in updates.values():
    quote(value)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = root / ('pre-email-' + stamp + '.local')
backup.mkdir(mode=0o700)
for name in ['.env', 'docker-compose.yml']:
    shutil.copy2(root / name, backup / name)
    (backup / name).chmod(0o600)
lines = []
remaining = dict(updates)
for line in (root / '.env').read_text().splitlines():
    key = line.split('=', 1)[0]
    if key in updates:
        line = key + '=' + quote(updates[key]); remaining.pop(key, None)
    lines.append(line)
lines += [key + '=' + quote(value) for key, value in remaining.items()]
(root / '.env').write_text('\n'.join(lines) + '\n')
(root / '.env').chmod(0o600)
compose_path = root / 'docker-compose.yml'
compose = yaml.safe_load(compose_path.read_text())
auth = compose['services']['auth']['environment']
auth.update({
    'GOTRUE_SMTP_MAX_FREQUENCY': '60s',
    'GOTRUE_MAILER_OTP_EXP': '600', 'GOTRUE_MAILER_OTP_LENGTH': '6',
    'GOTRUE_MAILER_TEMPLATES_CONFIRMATION': 'https://lululib.cn/auth-email/code.html',
    'GOTRUE_MAILER_TEMPLATES_MAGIC_LINK': 'https://lululib.cn/auth-email/code.html',
})
# Providers not needed for the email-only UI stay disabled.
for key in list(auth):
    if key.startswith('GOTRUE_EXTERNAL_') and key.endswith('_ENABLED') and key not in {
        'GOTRUE_EXTERNAL_EMAIL_ENABLED', 'GOTRUE_EXTERNAL_PHONE_ENABLED',
        'GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED',
    }:
        auth[key] = 'false'
compose['services']['storage']['environment']['FILE_SIZE_LIMIT'] = 262144000
compose_path.write_text(yaml.safe_dump(compose, sort_keys=False))
print('Email OTP configuration prepared; previous files retained in ' + str(backup))
print('Apply with: docker compose config --quiet && docker compose up -d --wait auth storage')
