# AI-Sail Flow 登录配置

项目使用现有火山 Supabase 的原生 Auth。邮箱验证码调用 `signInWithOtp` 和 `verifyOtp(type: 'email')`；微信调用火山扩展的 `wechat` OAuth provider，PKCE 授权码由 Supabase SDK 交换为会话。前端只使用 anon / publishable key，SMTP 密码和微信 AppSecret 配置在 Supabase 控制台。

## 当前配置与待补项

2026-10-03 经用户授权配置火山 Supabase：Email provider 已启用、允许注册、Confirm email 已开启（`mailer_autoconfirm: false`），微信 provider 未启用。Confirm signup 和 Magic Link 两个中文数字验证码邮件模板已保存。Custom SMTP 已接入用户指定的 163 发件邮箱，授权码仅保存在 Supabase 控制台，刷新页面确认开关与发信参数已持久化。邮箱验证码为 6 位、有效期 600 秒，重发最小间隔 60 秒。

经用户明确授权，向其发件邮箱尝试三次登录验证码：第一次 163 SMTP 返回 `550 User has no permission`；用户开启服务后第二次返回 `535 Error: authentication failed`；用户在 Supabase 替换客户端授权码并保存后，第三次 `signInWithOtp` 请求成功。Auth 未返回发送错误，服务端已接受发信，但用户尚未确认邮箱实际收到邮件或完成验证码登录。

- 邮箱：两个邮件模板已包含 `{{ .Token }}`；SMTP 与验证码规则已保存，实际发信尚待排障确认。
- 微信：用户目前没有网站应用凭据，先保留授权流程代码，配置未开启时界面显示“暂未开通”。

## 邮箱验证码

在实例的 Authentication 配置中完成以下设置：

1. 保持 Email provider 开启，按业务需要保持允许新用户注册。
2. 配置 SMTP Host、Port、Username、Password、Sender Email，以及发件人名称 `AI-Sail Flow`。发信地址需要满足邮件服务要求。
3. 启用邮箱确认，关闭自动确认 / 跳过邮箱验证。验证码登录验证由 Supabase 执行，应用不自行创建或保存验证码。
4. 在 Magic Link 邮件模板中使用 `{{ .Token }}`。首次注册使用的 Confirm Signup 模板也加入此变量，避免仅收到跳转链接。
5. 实例已配置验证码长度 6 位、有效期 10 分钟；界面兼容 6–10 位数字。界面重发冷却时间为 60 秒，最终限流与过期由 Supabase 决定。

邮件主题：`AI-Sail Flow 登录验证码`

模板示例：

```html
<h2>登录 AI-Sail Flow</h2>
<p>你的登录验证码：</p>
<p style="font-size:28px;font-weight:600;letter-spacing:6px">{{ .Token }}</p>
<p>请在应用中输入验证码完成登录。若不是你本人发起，请忽略这封邮件。</p>
```

配置后，由用户自己的邮箱完成一次发送、收信、输入验证码与刷新后的会话恢复验证。邮件服务未接通时，应用会提示发送失败，保留在邮箱输入步骤，不会展示“已发送”。

### 当前使用：163 邮箱 SMTP

| 字段 | 已保存配置 |
| --- | --- |
| Custom SMTP | 开启 |
| Host | `smtp.163.com` |
| Port | `465`（SSL/TLS） |
| Username / Sender Email | 用户指定的 163 发件邮箱，两项相同 |
| Password | 用户提供的 SMTP 客户端授权码，仅保存在 Supabase |
| Sender Name | `AI-Sail Flow` |
| Minimum interval | `60` 秒 |

163 邮箱必须已开启 IMAP/SMTP 或 POP3/SMTP 服务；客户端授权码与邮箱登录密码不同。用户已开启 SMTP 服务，并自行在 Supabase 更新客户端授权码。更新后 Auth 接受了 OTP 请求，尚待用户确认收信。不要在代码、环境文件、文档或日志中保存授权码。

### 前期查看：阿里云 DirectMail（杭州）

用户指定使用杭州区域的阿里云邮件推送。Supabase 的 Custom SMTP 配置如下：

| 字段 | 值 |
| --- | --- |
| Host | `smtpdm.aliyun.com` |
| Port | `465`（SSL/TLS） |
| Username | DirectMail 控制台中的完整发信地址 |
| Password | 为该发信地址设置的 SMTP 密码 |
| Sender Email | 与 Username 完全相同的发信地址 |
| Sender Name | `AI-Sail Flow` |

在 DirectMail 的“发信地址”中确认地址可用、发信域名验证通过，并使用适合验证码的“触发邮件”类型。SMTP 密码为发信地址专用凭据，不能替换为阿里云控制台登录密码或 AccessKey。已有 SMTP 密码通常需要用户提供；不要自行重置供其他应用使用的密码。

经用户授权查看杭州控制台，发信域名列表和发信地址列表均为空。当时未保存不完整的 SMTP 配置。

用户随后要求代为处理域名。查看同一阿里云账号的域名列表和公网权威 DNS 列表，均无记录。2026-10-03 查询并进入单域名注册确认页：`aisailflow.com` 可注册，1 年应付费用 85 元，查询页续费价格 95 元/年；自动续费关闭，附加服务未勾选。账号无可用实名信息模板，未接受条款、未提交订单、未付款。用户明确选择“先不购买”，已关闭域名注册准备页面。

阿里云 DirectMail 必须有可验证的发信域名；用户暂不购买，随后选择使用其已有 163 邮箱，已按上节接入。仍由火山 Supabase 原生 Auth 生成、校验验证码并发送模板邮件，前端不保存发信凭据。

参考：[阿里云 SMTP 地址](https://help.aliyun.com/zh/direct-mail/smtp-endpoints)、[设置发信地址和 SMTP 密码](https://help.aliyun.com/zh/direct-mail/user-guide/setup-sender-addresses)。

## URL 与微信登录

网站应用扫码登录需要微信开放平台网站应用的 AppID、AppSecret 和审核通过的配置。在火山 Supabase 的微信 provider 中设置这些信息，敏感值不要填写到 `VITE_` 环境变量。

两个回调环节：

1. 微信 → Supabase：`https://br-right-duck-4cebf7ce.supabase.aidap-global.cn-beijing.volces.com/auth/v1/callback`，按微信及火山控制台要求配置授权回调域名。
2. Supabase → AI-Sail Flow：当前网站 origin + `/auth/callback`。将实际网站完整回调 URL 加入 Supabase 的重定向白名单。

本机开发白名单：

```text
http://127.0.0.1:4317/auth/callback
http://localhost:4317/auth/callback
```

正式环境再加入实际 HTTPS 网站地址，并设置 Site URL。前端默认使用当前 origin；如需覆盖，在项目本地环境文件设置 `VITE_AUTH_REDIRECT_URL`，并重新构建。PKCE 发起页和回调页需要使用同一浏览器与相同的应用 origin，避免无法读取授权校验信息。

微信 provider 开启后，重新打开登录窗口会读取最新开关。点击微信登录前会保存待保存的创意，再跳转至 Supabase 管理的授权页面。回调成功后进入工作区并清理 URL 的授权参数；取消或失败会返回登录窗口显示提示。

## 会话与账号

Supabase SDK 在当前浏览器保存会话、刷新 access token，并监听登录／退出事件。退出使用 `scope: 'local'`，仅退出当前浏览器会话。应用不保存密码或邮箱验证码，不把微信凭据放入前端，也不自行签发用户令牌。

当前创意记录仍在本机；素材库的本机清单按设备共用，云端文件按登录用户 UUID 目录隔离。本次登录模块不会改变这个素材归属规则。

参考：[Supabase 邮箱验证码](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[火山 Supabase 微信授权](https://www.volcengine.com/docs/87275/2288738?lang=zh)。
