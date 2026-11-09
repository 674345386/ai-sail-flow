# AI-Sail Flow 登录与个人资料

项目通过 Supabase Auth 提供邮箱验证码和 Google OAuth 登录，前端仅使用 anon / publishable key。认证服务为阿里云自托管实例 `https://supabase-47-254-32-230.sslip.io`。Google 登录入口和 PKCE 回调已接入；2026-11-08 已在认证服务配置 Google OAuth 凭据并启用 provider，邮箱登录同时保持开启。生产邮箱登录与文件存储已切换并验证；SMTP 已配置。源库结构已导出核对：唯一 public 表 `health_check` 已按结构迁入为空表，4 条私有文件策略已同步；火山平台内部表与配额触发器不迁入。原用户记录与文件不迁入。

## Google 登录

当前服务端配置已生效：`supabase-auth` 健康，公开 Auth settings 返回 `external.google: true` 和 `external.email: true`。OAuth 发起接口返回 302 至 Google，已确认客户端 ID 与用户提供的 Web OAuth 凭据一致，回调地址匹配。应用回调白名单包含正式域名和 `http://127.0.0.1:4317/auth/callback`、`http://localhost:4317/auth/callback`。尚需用户在浏览器中完成一次真实账号授权，才能验证登录全流程。本次只更新认证服务，未发布本地前端代码。变更前配置备份保存在服务器 `/home/admin/supabase/pre-google-20261108T090134Z.local/`，凭据仅保存于服务端私密配置。

1. 在 Google Cloud Console 配置 OAuth 同意屏幕，创建类型为「Web 应用」的 OAuth 客户端，仅需基本的邮箱和个人资料权限。若应用处于测试模式，先添加测试用户；对外开放前按 Google 要求发布同意屏幕。
2. Google 客户端的「已获授权的重定向 URI」填写 `https://lululib.cn/auth/v1/callback`。这是认证服务的品牌域名入口，与下面的应用回调地址不同；原临时域名回调保留用于回退。
3. 在服务器 `/home/admin/supabase/.env`（权限 0600）中保存 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET`。不要添加到 `VITE_*`、提交到 Git 或发送到聊天中。
4. 在服务器 `docker-compose.yml` 的 `services.auth.environment` 配置：

   ```yaml
   GOTRUE_EXTERNAL_GOOGLE_ENABLED: 'true'
   GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
   GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_CLIENT_SECRET}
   GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: https://lululib.cn/auth/v1/callback
   ```

5. 保留应用回调白名单 `https://lululib.cn/auth/callback` 和 `https://www.lululib.cn/auth/callback`。本地调试时额外添加实际使用的 origin，例如 `http://127.0.0.1:4317/auth/callback`。前端默认返回发起登录的当前 origin，避免丢失 PKCE 校验信息和 Agent 草稿；不要在本地将 `VITE_AUTH_REDIRECT_URL` 指向生产域名。
6. 备份配置后执行 `docker compose config --quiet` 和 `docker compose up -d --no-deps auth`。通过 `/auth/v1/settings`（使用 publishable key）确认 `external.google` 为 `true`，再由用户完成一次真实 Google 授权验证。

登录弹窗每次打开时检查 provider 状态；点击 Google 按钮时再次检查，然后通过 `signInWithOAuth(provider: 'google')` 进入账号选择页。SDK 使用 PKCE 自动处理 `/auth/callback`，复用原有会话保存、首次登录资料设置和服务端会话同步。邮箱验证码输入和重发流程独立保留。Agent 首页的待创作内容保存在同源 sessionStorage 中，授权返回后继续进入创作流程。

`configure-email.py` 只更新邮箱配置，并保留单独配置的 OAuth providers。Google Client Secret 始终由认证服务保管，前端不需要任何新增密钥。

### OAuth 回调页面与品牌域名

本地服务允许 `GET /auth/callback` 的跨站顶层页面跳转（`Sec-Fetch-Mode: navigate`、`Sec-Fetch-Dest: document`），供 Google 授权返回。此路由只返回前端页面，授权码由浏览器 SDK 使用 PKCE 交换；API、媒体、跨站 fetch 和 POST 不使用此例外。已通过 HTTP 检查确认：回调页面返回 200 HTML，跨站 API、回调 fetch 和回调 POST 仍返回 403。

Google 授权页面此前显示 `sslip.io`，因为 provider 回调使用临时认证域名。2026-11-08 已在生产 Caddy 配置 `https://lululib.cn/auth/v1/callback`，将该路径转发到原认证网关；用户确认已在 Google 客户端追加并保存该地址后，已将认证服务的 `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` 切换至此地址，并仅重启 Auth，服务健康。切换前配置备份为 `/home/admin/supabase/pre-google-branded-20261108T093024Z.local/`，原临时域名仍可用于回退。应用返回地址仍是当前浏览器 origin 下的 `/auth/callback`，无需迁移 Supabase 用户、存储或更换前端 Supabase URL。真实账号授权后的页面显示和登录结果仍需用户验证。

切换后已通过 HTTP 核对：OAuth 发起接口返回 302 至 Google，`redirect_uri` 为 `https://lululib.cn/auth/v1/callback`；Google 和邮箱 provider 同时开启，本地跨站回调页面返回 200 HTML。

若希望授权页显示 `AI-Sail Flow` 品牌名称和 Logo，需要在 Google Auth Platform 的 Branding 中设置，并按 Google 要求完成品牌验证；前端无法直接修改 Google 托管的授权页。

## 邮箱验证码

- `signInWithOtp({ email, options: { shouldCreateUser: true } })` 发送数字验证码，`verifyOtp(type: 'email')` 验证并建立会话。
- Email provider 开启、允许新账号注册、保持邮箱确认开启。
- Confirm Signup 和 Magic Link 邮件模板必须包含 `{{ .Token }}`，以支持首次注册和已有账号登录。
- 当前验证码为 6 位、有效期 10 分钟；界面兼容 6–10 位数字，重发冷却 60 秒。最终限流和过期由 Supabase 执行。
- 发信配置沿用用户指定的 163 邮箱：`smtp.163.com`、端口 `465`、SSL/TLS，Sender Name 为 `AI-Sail Flow`。真实授权码仅保存在私密配置中。`deploy/supabase/configure-email.py` 在写入配置前校验 SMTP 登录，配置六位、10 分钟有效的验证码与 60 秒重发间隔。
- SMTP 返回 `550 User has no permission` 时检查邮箱 SMTP 服务是否开启；返回 `535 authentication failed` 时检查客户端授权码。

邮件模板示例：

```html
<h2>登录 AI-Sail Flow</h2>
<p>你的登录验证码：</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px">{{ .Token }}</p>
<p>请在应用中输入验证码完成登录。若不是你本人发起，请忽略这封邮件。</p>
```

## 邮箱模板与回调配置

注册确认和已有账号登录均使用 `public/auth-email/code.html`，必须显示 `{{ .Token }}`。Auth 对应的模板 URL 为 `https://lululib.cn/auth-email/code.html`，随应用部署。

Site URL 使用 `https://lululib.cn`，Redirect URLs 保留 `https://lululib.cn/auth/callback` 和 `https://www.lululib.cn/auth/callback`。浏览器通过 SDK 保存和刷新会话，并向 Sail 后端同步登录状态。新的 Supabase 实例使用独立签名密钥，原会话需重新登录。

## 首次登录欢迎浮窗

仅新账号首次成功完成登录，且尚无 `user_metadata.profile_completed_at` 时，才在工作台加载完成后弹出欢迎浮窗。已有账号、重新打开首页和恢复已有会话都不会自动弹出；用户仍可从账号资料入口主动编辑。新账号判断基于 Supabase 账号创建时间与首次登录时间接近（15 分钟内）。首次设置名称默认完整邮箱地址，可以直接编辑。提供 14 个本地 SVG 配色头像，也支持上传 JPG、PNG、WebP 图片（最大 5 MB），上传前居中裁成 256 × 256 JPEG。

点击“完成，开始创作”后通过 `auth.updateUser` 持久化：

| 字段 | 内容 |
| --- | --- |
| `display_name` | 用户选择的名称 |
| `avatar_url` | 默认头像的静态路径；上传头像时为 null |
| `avatar_path` | 自定义头像的 Storage 对象路径；默认头像时为 null |
| `profile_completed_at` | 首次完成设置的时间 |

自定义头像复用 `VITE_SUPABASE_STORAGE_BUCKET`（默认 `ai-sail-flow-files`），对象路径为 `<user UUID>/profile/avatar-<UUID>.jpg`，沿用以用户 UUID 为首级目录的私有 Storage 权限。素材清单只枚举首级文件，头像子目录不会进入“所有媒体”。不要为头像将 bucket 改为公开。

显示自定义头像时创建有效期 1 小时的签名 URL，每 50 分钟刷新；用户资料只存对象路径，不保存会过期的签名 URL。替换头像成功后删除旧对象，资料保存失败时清理本次新上传对象。资料与完成标记跟随 Supabase 账号跨设备保留；账号窗口提供“编辑个人资料”入口。

不需要新增数据库表。浏览器通过 Supabase SDK 保留和刷新会话，退出使用 `scope: 'local'`。`user_metadata` 仅用于个人资料显示，不用作管理员权限或访问控制。
