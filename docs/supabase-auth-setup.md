# AI-Sail Flow 登录与个人资料

项目使用火山 Supabase 原生 Auth，前端仅使用 anon / publishable key。当前界面提供邮箱验证码和 Google 账号登录，微信入口及授权代码已移除。

## 邮箱验证码

- `signInWithOtp({ email, options: { shouldCreateUser: true } })` 发送数字验证码，`verifyOtp(type: 'email')` 验证并建立会话。
- Email provider 开启、允许新账号注册、保持邮箱确认开启。
- Confirm Signup 和 Magic Link 邮件模板必须包含 `{{ .Token }}`，以支持首次注册和已有账号登录。
- 当前验证码为 6 位、有效期 10 分钟；界面兼容 6–10 位数字，重发冷却 60 秒。最终限流和过期由 Supabase 执行。
- SMTP 已使用用户指定的 163 发信邮箱：`smtp.163.com`、端口 `465`、SSL/TLS，Sender Name 为 `AI-Sail Flow`。SMTP 授权码只保存在 Supabase 控制台。
- SMTP 返回 `550 User has no permission` 时检查邮箱 SMTP 服务是否开启；返回 `535 authentication failed` 时检查客户端授权码。

邮件模板示例：

```html
<h2>登录 AI-Sail Flow</h2>
<p>你的登录验证码：</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px">{{ .Token }}</p>
<p>请在应用中输入验证码完成登录。若不是你本人发起，请忽略这封邮件。</p>
```

## Google 账号登录

调用 `signInWithOAuth({ provider: 'google' })`，继续使用 PKCE 授权流程。2026-10-04 查询实例公开 Auth settings：Email 已开启，Google 尚未开启；用户要求先完成代码。

配置时：

1. 在 Google Cloud 创建 OAuth 的 Web application Client ID。授权 JavaScript origin 添加 `https://lululib.cn`；若使用 www，再添加 `https://www.lululib.cn`。
2. Google 的 Authorized redirect URI 填入 Supabase Provider 页面显示的完整 Callback URL：
   `https://br-right-duck-4cebf7ce.supabase.aidap-global.cn-beijing.volces.com/auth/v1/callback`
3. 在火山 Supabase 的 Google Provider 保存 Client ID、Client Secret 并开启。Client Secret 不写入前端或代码仓库。
4. Supabase 的 Redirect URLs 添加 `https://lululib.cn/auth/callback`，使用 www 时再添加 `https://www.lululib.cn/auth/callback`。Site URL 使用正式站点地址。

前端每次打开登录窗口读取最新 Provider 开关。Google 尚未开启时保留入口并显示“暂未开通”，邮箱验证码继续可用。配置开启后重新打开窗口即可使用，无需为了更改 Provider 配置重新构建前端。

Supabase 回到应用时使用当前 origin + `/auth/callback`，SDK 交换授权码、清理回调参数并进入工作区。开发环境可添加 `http://127.0.0.1:4317/auth/callback` 与 `http://localhost:4317/auth/callback`；如需覆盖应用回调，使用 `VITE_AUTH_REDIRECT_URL` 并重新构建。

## 首次登录欢迎浮窗

仅新账号首次成功完成邮箱验证码登录或 OAuth 登录，且尚无 `user_metadata.profile_completed_at` 时，才在工作台加载完成后弹出欢迎浮窗。已有账号、重新打开首页和恢复已有会话都不会自动弹出；用户仍可从账号资料入口主动编辑。新账号判断基于 Supabase 账号创建时间与首次登录时间接近（15 分钟内）。首次设置名称默认完整邮箱地址，可以直接编辑。提供 14 个本地 SVG 配色头像，也支持上传 JPG、PNG、WebP 图片（最大 5 MB），上传前居中裁成 256 × 256 JPEG。

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
