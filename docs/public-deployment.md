# Public deployment on Tencent Lighthouse

The public configuration runs the existing Express API behind Caddy. Caddy terminates HTTPS; the application binds only to `127.0.0.1:4317`. Project JSON and uploaded/generated files live in the persistent `./data` directory. Supabase handles login, and any authenticated Supabase account can access this deployment. All signed-in accounts currently share the same projects, media, settings, and generation credentials; the app does not provide per-user data isolation.

## Before deployment

- Use an Ubuntu Server LTS image. The current Lighthouse instance is Ubuntu Server 26.04 LTS.
- The current Alibaba Cloud US-West instance is reachable at `47.254.32.230`. Point the DNS A records for `lululib.cn` and `www.lululib.cn` to this address; Caddy obtains HTTPS certificates once DNS resolves and ports 80/443 are reachable.
- Allow inbound TCP ports 80 and 443 in Lighthouse firewall. Keep SSH (22) restricted to trusted source IPs where possible. Do not open port 4317.
- A 2 GB instance can run the service, but builds and FFmpeg work will have less headroom; 4 GB RAM is preferable. The configured app accepts up to 250 MB videos. A 3 Mbps uplink makes large media uploads slow.
- The instance's local `data/` directory is the production workspace. Do not copy development data into it unless you explicitly intend to publish those project files to this server.

## Configure and start

Copy `.env.production.example` to `.env.production` on the server and set the Supabase URL and publishable key. Add any model API keys as server-side values; never use a `VITE_` prefix for private keys. Protect this file with owner-only permissions.

Set `PUBLIC_DOMAIN=lululib.cn` and `SOP_ALLOWED_HOSTS=lululib.cn,www.lululib.cn`. Install Node.js, npm, FFmpeg, and Caddy. Caddy installation options are in its [official Debian/Ubuntu instructions](https://caddyserver.com/docs/install). Caddy obtains and renews a certificate automatically after the hostname resolves to the instance and ports 80/443 are reachable.

Install application dependencies and build the frontend with the production Supabase settings available to Vite. Then install the two systemd units:

```sh
mkdir -p data
npm ci --include=dev
npm run build
sudo install -m 0644 Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/opt/ai-sail-flow/.env.production\n' | sudo tee /etc/systemd/system/caddy.service.d/override.conf
sudo install -m 0644 ai-sail-flow.service /etc/systemd/system/ai-sail-flow.service
sudo systemctl daemon-reload
sudo systemctl enable --now ai-sail-flow caddy
```

Check `systemctl status ai-sail-flow caddy` and `journalctl -u ai-sail-flow -n 100 --no-pager` if the service does not become ready.

## Supabase redirect URL

In Supabase Authentication URL configuration, add the exact production redirect `https://lululib.cn/auth/callback` to the allowed redirect URLs and set the production site URL to `https://lululib.cn`. If a permitted temporary preview is used, allow its matching `/auth/callback` URL as well. Email OTP sign-in uses the existing Supabase project. Enable email signups if new visitors should create accounts. Any authenticated Supabase account can access workspace APIs and media files. All accounts currently operate on the same shared workspace, so only enable signup for people you trust with its projects and uploaded content.

## Update and backup

Replace the application source with the new release, rerun `npm ci --include=dev` and `npm run build`, then restart `ai-sail-flow`. Caddy stores certificates under `/var/lib/caddy`, and `data/` persists projects and uploaded media.

## Deployment environment variables

The production environment requires `PUBLIC_DOMAIN`, `SOP_ALLOWED_HOSTS`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. The systemd service enables `SOP_REQUIRE_AUTH=true`, binds the app to loopback on port 4317, and persists application files under `data/`.

The app's current local text-to-speech and subtitle composition implementation uses macOS `say` and Swift; those specific features are not available in the Ubuntu container. Video analysis, media upload, Supabase OTP login, the media library, Gemini/Veo calls, and FFmpeg-based video processing remain server-side features.
