# M3 桥接部署说明

## 需要上传的文件

把 `deploy/` 下的 4 个文件上传到：

```text
https://dornhub.eu.org/.private/check-in/
```

| 文件 | 作用 |
|---|---|
| `bridge.html` | App 端 web-view / H5 兜底 iframe 的 Supabase 转发页 |
| `captcha.html` | Turnstile 人机验证页（App 端 web-view 使用） |
| `uni.webview.js` | DCloud 官方 web-view 通信脚本，`bridge.html` / `captcha.html` 都依赖它 |
| `proxy.php` | 服务器端 Supabase 转发；上传到 `.private/proxy.php`（已被反爬放行的路径） |

上传后确认可以直接打开：

```text
https://dornhub.eu.org/.private/check-in/bridge.html
https://dornhub.eu.org/.private/check-in/captcha.html
https://dornhub.eu.org/.private/check-in/uni.webview.js
https://dornhub.eu.org/.private/proxy.php
```

`bridge.html` 直接打开会显示“缺少请求参数”，这是正常的；它只接受 App/iframe 带参数调用。

## 前端配置

`utils/config.js` 已配置：

```js
export const BRIDGE_BASE = 'https://dornhub.eu.org/.private/check-in'
export const CAPTCHA_URL = 'https://dornhub.eu.org/.private/check-in/captcha.html'
```

如果你上传到别的目录，只改这两行。

## Turnstile 域名

到 Cloudflare Turnstile 控制台，把以下 hostname 加入 widget：

- `dornhub.eu.org`
- `localhost`
- `127.0.0.1`
- H5 实际部署域名（如果有）

原因：

- **H5** 使用页面内联 Turnstile，hostname 必须是 H5 页面自身域名；开发环境需加 `localhost` / `127.0.0.1`。
- **App** 使用 `captcha.html` 的 web-view，hostname 是 `dornhub.eu.org`。

> 不要用 iframe 在 H5 里嵌 `captcha.html`：Cloudflare 的挑战页在第三方 iframe 里拿不到 cookie，会出现 “Cookies are not enabled”。

当前 `utils/config.js` 使用 dornhub 现有项目的真实 Site Key：

```js
export const TURNSTILE_SITE_KEY = '0x4AAAAAAC2E9TsjP-02HPpE'
```

对应的 Secret 在 `部署主机上的 verify_turnstile.php`，请只把它放进：

- Supabase Edge Function 的 `TURNSTILE_SECRET`
- 如果启用 Supabase Auth CAPTCHA，再放到 Auth 的 CAPTCHA Secret

**不要**把 Secret 放进 `bridge.html`、`captcha.html`、`utils/config.js`。

## 桥接安全边界

- `bridge.html` 不硬编码 service_role；它只转发请求头里的 **publishable/anon key** 或用户 JWT。
- `proxy.php` 只允许 `/auth/v1/`、`/rest/v1/`、`/functions/v1/`，转发 anon key/用户 JWT，不使用 service_role。
- 转发目标只允许：

```text
https://hisewqjyxadmezeiwnzc.supabase.co/auth/v1/*
https://hisewqjyxadmezeiwnzc.supabase.co/rest/v1/*
https://hisewqjyxadmezeiwnzc.supabase.co/functions/v1/*
```

（以实际 `SUPABASE_URL` 为准；脚本里做了 origin + path 白名单。）

- 请求头只允许 `apikey`、`authorization`、`content-type`、`prefer`、`accept`、`x-client-info`。
- 不记录 token、不写入 localStorage、不做持久 session。
- 所有 RLS / RPC 鉴权仍在 Supabase 内完成。

## H5 与 App 的路径

- **H5**：先 `uni.request` 直连 Supabase；只有网络失败才创建隐藏 iframe 加载 `bridge.html`。401/403/422 不会走桥接，避免掩盖真实错误。
- **App**：所有请求先 `uni.navigateTo('/pages/bridge/bridge?payload=...')`；桥接页用 `<web-view>` 加载 `bridge.html`，结果通过 `uni.$emit('vu-bridge-result')` 回到请求方，然后 `navigateBack`。
- 请求在 `utils/http.js` 中串行化，避免同时打开多个 bridge 页。

## 手动验证

1. 上传 3 个文件。
2. H5：正常注册/登录（直连）。
3. H5 兜底：浏览器 DevTools → Network → 把 Supabase 请求 block 掉，再登录；应看到 iframe 桥接请求，且能成功。
4. App：HBuilderX 运行到 Android 真机；登录时点“打开人机验证”，`captcha.html` 应正常显示 Turnstile；通过后回到登录页并完成登录。
5. 如果 App 报“桥接请求超时”，检查：
   - `bridge.html` 是否可被手机浏览器直接打开；
   - `uni.webview.js` 是否 200；
   - `bridge.html` 的 `fetch` 是否能访问 Supabase（可在手机浏览器控制台看）；
   - `BRIDGE_BASE` 是否带 `/check-in` 路径。

## 已知限制

- `bridge.html` 是纯前端转发，不能解决“手机完全无法访问 supabase.co”的网络层封锁；它只改变发起请求的 WebView 环境。如果 web-view 也访问不了 Supabase，需要在服务器侧做代理（Cloudflare Worker / PHP），那不属于当前静态 HTML 桥接方案。
- App 端 Turnstile 需要 web-view 能加载 `challenges.cloudflare.com`；如果国内网络不稳定，会显示“验证加载失败”，需要换网络或后续换验证码服务。

## bridge → proxy.php 模式

`bridge.html` **不再从手机直连 Supabase**，而是请求已放行的：

```text
../proxy.php?path=/rest/v1/...
```

由服务器 cURL 访问 Supabase。这与 lost-found 项目的桥接方式一致，能避开手机 WebView 到 Supabase 的网络/CORS 问题。

日志会显示：

```text
[VU Bridge] proxy request POST /rest/v1/rpc/get_login_salt
[VU Bridge] proxy response 200
```

如果 `proxy.php` 返回 404/500，检查：

- `proxy.php` 是否上传到 `.private/proxy.php`；
- 服务器是否执行 PHP；
- 服务器是否能访问 `https://hisewqjyxadmezeiwnzc.supabase.co`。

`proxy.php` 不使用 service_role，只转发 anon key / 用户 JWT；RLS 仍然生效。

### 与参考 proxy.php 的差异

另一个项目的 `proxy.php` 固定使用 anon key，适合匿名 RPC；本项目 RPC 依赖 `auth.uid()`，所以：

- `proxy.php` 优先读取 `Authorization` 或 `X-User-Token` 里的用户 JWT；
- 没有用户 JWT 时才回退到 anon key；
- `apikey` 始终使用服务器端配置的 publishable key；
- 不使用 service_role。

`bridge.html` 会同时发送 `Authorization` 和 `X-User-Token`，防止 Apache 丢弃 `Authorization`。
## 反爬拦截后的 Cloudflare Worker 方案（当前主路径）

服务器对 PHP 返回 `aes.js` + `__test` cookie 的 JS 挑战页。`fetch` 不会执行这段 JS，所以 PHP 代理不可靠。

当前 `bridge.html`：

```js
var WORKER_PROXY_URL = 'https://dornhub.eu.org/checkin-api'
```

优先请求 Worker；Worker 失败才回退 PHP。

### 部署步骤（绑定 dornhub 子路径，推荐）

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → Worker。
2. 名称例如 `vu-checkin-proxy`。
3. 粘贴 `deploy/worker.js` 内容，Deploy。
4. 进入该 Worker → **Settings → Triggers → Routes** → Add route：
   ```text
   dornhub.eu.org/checkin-api*
   ```
5. 保存。现在：
   ```text
   https://dornhub.eu.org/checkin-api?path=...
   ```
   会由 Worker 处理，不再经过服务器 PHP 反爬。
6. 重新上传最新 `deploy/bridge.html`。

### 方式 B：workers.dev

如果不用 dornhub 路由，可以部署后拿到：

```text
https://vu-checkin-proxy.<your-subdomain>.workers.dev
```

然后把 `bridge.html` 改成：

```js
var WORKER_PROXY_URL = 'https://vu-checkin-proxy.<your-subdomain>.workers.dev'
```

### 日志

```text
[VU Bridge] worker request POST /rest/v1/rpc/get_login_salt
[VU Bridge] worker response 200 true
```

如果 Worker 失败，会回退 PHP；PHP 被挑战时会显示错误。

Worker 不使用 `service_role`，只转发 anon key / 用户 JWT。

## 为什么覆盖 `.private/proxy.php`

参考项目的 `.private/proxy.php` 路径已被服务器反爬放行；新建的 `.private/check-in/proxy.php` 会被挑战。

因此：

- `bridge.html` 仍然在 `.private/check-in/`；
- 它调用 `../proxy.php`；
- 你把本项目的 `proxy.php` 覆盖到 `.private/proxy.php`。

本项目的 `proxy.php` 与参考实现兼容：

- 没有用户 JWT 时回退 anon key，lost-found 的匿名请求仍然能用；
- 有用户 JWT 时转发 JWT，本项目的 `auth.uid()` 才能正常工作。

## 错误：Cannot add trigger to a Worker that only has static assets

含义：当前创建的是 **Static Assets Worker**，只有静态文件，没有代码入口，Cloudflare 不允许给它加 Route。

解决：重新创建一个 **有代码入口的普通 Worker**。

### Dashboard

1. Workers & Pages → Create。
2. 选择 **Worker** / **Hello World** 模板，**不要**选静态站点/上传资产。
3. 命名 `vu-checkin-proxy`。
4. 把 `deploy/worker.js` 粘贴到代码编辑器。
5. Deploy。
6. Settings → Triggers → Routes → 添加：
   ```text
   dornhub.eu.org/checkin-api*
   ```
7. 保存。

### Wrangler

在 `deploy/` 目录：

```bash
npx wrangler deploy
```

`wrangler.toml` 已配置：

```toml
name = "vu-checkin-proxy"
main = "worker.js"
compatibility_date = "2026-11-19"
routes = [{ pattern = "dornhub.eu.org/checkin-api*", zone_name = "dornhub.eu.org" }]
```

关键：必须有 `main = "worker.js"`，不能只有 `assets` 配置。

如果路由仍然无法添加，先用 workers.dev 地址：

```js
var WORKER_PROXY_URL = 'https://vu-checkin-proxy.<your-subdomain>.workers.dev'
```
## Worker 的“路由/触发器”在哪里

Cloudflare 新版 Dashboard 里，Worker 的 **Routes 不在 “Triggers → Cron/Queues/Email” 里**。

正确位置：

1. Workers & Pages → 选择 `vu-checkin-proxy`。
2. 顶部 **Settings**。
3. 找 **Domains & Routes**（域名与路由）。
4. 点 **Add**：
   - **Custom Domain**：推荐，填 `checkin-api.dornhub.eu.org`；
   - **Route**：填 `dornhub.eu.org/checkin-api*`。

如果 Worker 页面没有 Domains & Routes：

- 去 Cloudflare 首页 → **Websites** → `dornhub.eu.org`；
- 左侧找 **Workers Routes**（也可能在 Rules / Traffic 下）；
- Add route：`dornhub.eu.org/checkin-api*`，选择 `vu-checkin-proxy`。

### 用 Custom Domain（最简单）

1. Worker → Settings → Domains & Routes → Add → Custom Domain。
2. 输入：
   ```text
   checkin-api.dornhub.eu.org
   ```
3. 等 DNS/证书生效。
4. 手机浏览器打开：
   ```text
   https://checkin-api.dornhub.eu.org?path=%2Fauth%2Fv1%2Fhealth
   ```
   返回 JSON 即成功。
5. `bridge.html` 改：
   ```js
   var WORKER_PROXY_URL = 'https://checkin-api.dornhub.eu.org'
   ```
6. 重新上传 `bridge.html`。

Custom Domain 是跨域的，Worker 已带 CORS；bridge 会发 OPTIONS，Worker 已处理。