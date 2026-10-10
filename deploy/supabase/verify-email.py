#!/usr/bin/env python3
"""Verify one real OTP email and Storage permissions; never print credentials."""
import base64
import email
import imaplib
import json
import os
from pathlib import Path
import re
import secrets
import ssl
import sys
import time
import urllib.error
import urllib.request
import uuid

root = Path(__file__).parent

def env_file(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines() if line and not line.startswith('#') and '=' in line)

keys = env_file(root / 'access.local')
smtp = env_file(root / 'migration-secrets.local')
base = keys['SUPABASE_PUBLIC_URL'].rstrip('/')


def request(path, *, method='GET', token=None, admin=False, body=None, raw=None, expected=(200,)):
    key = keys['SERVICE_ROLE_KEY'] if admin else keys['ANON_KEY']
    headers = {'apikey': key, 'Authorization': 'Bearer ' + (token or key)}
    payload = None
    if body is not None:
        headers['Content-Type'] = 'application/json'; payload = json.dumps(body).encode()
    if raw is not None:
        headers['Content-Type'] = 'image/png'; payload = raw
    req = urllib.request.Request(base + path, method=method, headers=headers, data=payload)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status, data = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, data = error.code, error.read()
    if status not in expected:
        # Error codes are safe to log; tokens/email/template content are not.
        try: code = json.loads(data).get('error_code') or json.loads(data).get('code')
        except Exception: code = None
        raise RuntimeError(f'{method} {path.split("?")[0]} failed: HTTP {status}, code={code}')
    try: return json.loads(data)
    except Exception: return data

settings = request('/auth/v1/settings')
assert settings['external']['email'] and not settings['disable_signup']
print('AUTH_EMAIL_AND_SIGNUP_OK')
with urllib.request.urlopen('https://lululib.cn/auth-email/code.html', timeout=10) as response:
    assert b'{{ .Token }}' in response.read()
print('OTP_TEMPLATE_OK')

received = root / 'received-otp.local'
if received.exists():
    code = received.read_text().strip()
else:
    imaplib.Commands['ID'] = ('NONAUTH', 'AUTH', 'SELECTED')
    mail = imaplib.IMAP4_SSL('imap.163.com', 993, ssl_context=ssl.create_default_context(), timeout=15)
    mail._simple_command('ID', '("name" "AI-Sail migration" "version" "1.0" "vendor" "AI-Sail Flow" "contact" "' + smtp['SMTP_USER'] + '")')
    mail.login(smtp['SMTP_USER'], smtp['SMTP_PASS'])
    mail.select('INBOX', readonly=True)
    _, rows = mail.uid('search', None, 'ALL')
    last = max([int(value) for value in rows[0].split()] or [0])
    request('/auth/v1/otp', method='POST', body={'email': smtp['SMTP_USER'], 'create_user': True})
    print('OTP_SEND_ACCEPTED')
    code = None
    for attempt in range(12):
        mail.select('INBOX', readonly=True)
        _, rows = mail.uid('search', None, '(UID ' + str(last + 1) + ':* FROM "' + smtp['SMTP_USER'] + '")')
        for uid in rows[0].split():
            if int(uid) <= last:
                continue
            _, chunks = mail.uid('fetch', uid, '(BODY.PEEK[])')
            message = email.message_from_bytes(next(chunk[1] for chunk in chunks if isinstance(chunk, tuple)))
            for part in message.walk():
                if part.get_content_type() not in ('text/plain', 'text/html'):
                    continue
                content = (part.get_payload(decode=True) or b'').decode(part.get_content_charset() or 'utf-8', errors='replace')
                if 'AI-Sail Flow' not in content:
                    continue
                match = re.search(r'>\s*(\d{6})\s*<', content)
                if match:
                    code = match.group(1); break
            if code:
                break
        if code:
            break
        time.sleep(3)
    mail.logout()
    assert code, 'OTP email not received within the bounded wait'
print('OTP_EMAIL_RECEIVED')
session = request('/auth/v1/verify', method='POST', body={'email': smtp['SMTP_USER'], 'token': code, 'type': 'email'})
assert session.get('access_token') and session['user']['email'].lower() == smtp['SMTP_USER'].lower()
received.unlink(missing_ok=True)
print('OTP_LOGIN_OK')
session = request('/auth/v1/token?grant_type=refresh_token', method='POST', body={'refresh_token': session['refresh_token']})
token = session['access_token']; owner = session['user']['id']
request('/auth/v1/user', token=token)
print('SESSION_REFRESH_AND_USER_OK')

bucket = 'ai-sail-flow-files'
object_name = owner + '/profile/migration-check-' + str(uuid.uuid4()) + '.png'
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=')
peer_id = None
uploaded = False
try:
    request('/storage/v1/object/' + bucket + '/' + object_name, method='POST', token=token, raw=png)
    uploaded = True
    signed = request('/storage/v1/object/sign/' + bucket + '/' + object_name, method='POST', token=token, body={'expiresIn': 60})
    with urllib.request.urlopen(base + '/storage/v1' + signed['signedURL'], timeout=10) as response:
        assert response.read() == png
    print('OWNER_UPLOAD_AND_SIGNED_DOWNLOAD_OK')
    peer_email = 'sail-migration-check-' + uuid.uuid4().hex + '@example.invalid'
    peer_password = secrets.token_hex(24)
    peer = request('/auth/v1/admin/users', method='POST', admin=True, body={'email': peer_email, 'password': peer_password, 'email_confirm': True})
    peer_id = peer['id']
    peer_session = request('/auth/v1/token?grant_type=password', method='POST', body={'email': peer_email, 'password': peer_password})
    peer_token = peer_session['access_token']
    visible = request('/storage/v1/object/list/' + bucket, method='POST', token=peer_token, body={'prefix': owner + '/profile/', 'limit': 100, 'offset': 0})
    assert visible == [], 'Other user could list private files'
    request('/storage/v1/object/sign/' + bucket + '/' + object_name, method='POST', token=peer_token, body={'expiresIn': 60}, expected=(400, 403, 404))
    request('/storage/v1/object/' + bucket + '/' + owner + '/migration-denied.png', method='POST', token=peer_token, raw=png, expected=(400, 403))
    print('CROSS_USER_LIST_SIGN_AND_UPLOAD_DENIED')
finally:
    if uploaded:
        request('/storage/v1/object/' + bucket, method='DELETE', token=token, body={'prefixes': [object_name]})
    if peer_id:
        request('/auth/v1/admin/users/' + peer_id, method='DELETE', admin=True)
print('TEST_OBJECT_AND_TEMP_USER_REMOVED')
os.umask(0o077)
output = root / 'verification-session.local'
output.write_text(json.dumps({'access_token': token, 'refresh_token': session['refresh_token'], 'user_id': owner, 'email': smtp['SMTP_USER']}))
output.chmod(0o600)
print('PRIVATE_SESSION_SAVED_FOR_SAIL_CUTOVER_CHECK')
