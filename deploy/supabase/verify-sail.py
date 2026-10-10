#!/usr/bin/env python3
"""Check deployed Sail against the real OTP session from verify-email.py."""
import http.cookiejar
import json
from pathlib import Path
import re
import urllib.error
import urllib.request

root = Path(__file__).parent
session = json.loads((root / 'verification-session.local').read_text())
keys = dict(l.split('=',1) for l in (root / 'access.local').read_text().splitlines() if '=' in l)
base = 'https://lululib.cn'
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(path, method='GET', token=True, short=False):
    headers = {'Authorization':'Bearer '+session['access_token']} if token else {}
    if short:headers['Range']='bytes=0-31'
    req = urllib.request.Request(base+path, method=method, headers=headers)
    try:
        with client.open(req,timeout=20) as response:
            return response.status,response.read(64) if short else response.read(),response.headers
    except urllib.error.HTTPError as error:
        return error.code,error.read(),error.headers

code,html,_=call('/',token=False)
assert code==200
script=re.search(rb'<script[^>]*src="([^"]+)"',html).group(1).decode()
code,bundle,_=call(script,token=False)
assert code==200 and keys['SUPABASE_PUBLIC_URL'].encode() in bundle
assert b'br-right-duck-4cebf7ce' not in bundle
assert keys['SERVICE_ROLE_KEY'].encode() not in bundle
assert '使用 Google 账号登录'.encode() not in bundle
print('LIVE_FRONTEND_TARGET_AND_EMAIL_ONLY_OK')
assert call('/api/projects',token=False)[0]==401
print('LIVE_ANONYMOUS_API_DENIED')
for path in ('/api/projects','/api/workspace/projects','/api/media-library'):
    code,body,_=call(path)
    assert code==200,path
    print('LIVE_AUTHENTICATED_API_OK',path,'items='+str(len(json.loads(body))))
code,_,headers=call('/api/auth/session',method='POST')
assert code==204 and 'Secure' in headers['Set-Cookie'] and 'HttpOnly' in headers['Set-Cookie']
print('LIVE_HTTPS_SESSION_COOKIE_OK')
_,body,_=call('/api/media-library')
items=json.loads(body)
if items:
    assert call(items[0]['url'],token=False,short=True)[0] in (200,206)
    print('LIVE_AUTHENTICATED_MEDIA_OK')
code,_,headers=call('/api/auth/session',method='DELETE')
assert code==204 and 'Max-Age=0' in headers['Set-Cookie']
print('LIVE_SESSION_COOKIE_CLEARED')
req=urllib.request.Request(keys['SUPABASE_PUBLIC_URL']+'/auth/v1/logout?scope=local',method='POST',headers={'apikey':keys['ANON_KEY'],'Authorization':'Bearer '+session['access_token']})
with urllib.request.urlopen(req,timeout=15) as response:assert response.status==204
req=urllib.request.Request(keys['SUPABASE_PUBLIC_URL']+'/auth/v1/token?grant_type=refresh_token',method='POST',headers={'apikey':keys['ANON_KEY'],'Content-Type':'application/json'},data=json.dumps({'refresh_token':session['refresh_token']}).encode())
try:
    urllib.request.urlopen(req,timeout=15)
    raise AssertionError('Refresh token remained valid after logout')
except urllib.error.HTTPError as error:assert error.code in (400,401)
print('AUTH_LOGOUT_REVOKED_REFRESH_TOKEN')
(root/'verification-session.local').unlink()
print('PRIVATE_TEST_SESSION_REMOVED')
