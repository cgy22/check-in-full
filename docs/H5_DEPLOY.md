# H5 部署说明

目标地址：

```text
https://<your-host>/<base-path>/
```

## 已配置

[manifest.json](F:/check-in-full/manifest.json)：

```json
"h5": {
  "title": "瓦莱希雅大学签到系统",
  "publicPath": "/<base-path>/",
  "router": {
    "mode": "hash",
    "base": "/<base-path>/"
  }
}
```

- `publicPath`：JS/CSS/字体/图片从 `/<base-path>/` 加载；
- `router.base`：H5 路由基于 `/<base-path>/`；
- `mode: "hash"`：使用 `#` 路由，不需要服务器配置 history 回退。

访问示例：

```text
https://<your-host>/<base-path>/#/pages/index/index
```

## 构建

HBuilderX：

```text
发行
  → 网站-H5手机版
  → 发行
```

产物目录：

```text
unpackage/dist/build/h5
```

把该目录中的**全部内容**上传到：

```text
/<base-path>/
```

最终服务器结构：

```text
/<base-path>/index.html
/<base-path>/assets/...
/<base-path>/static/...
```

不要只上传 `index.html`。

## 服务器配置

Hash 模式不需要 `try_files`。

只需要保证：

- `/<base-path>/` 返回 `index.html`；
- `/<base-path>/assets/` 和 `/<base-path>/static/` 可访问；
- 不要强制把 `/<base-path>/*` 重写到根目录。

如果服务器自动把目录重定向到带斜杠地址，使用：

```text
https://<your-host>/<base-path>/
```

不要省略末尾 `/`。

## Turnstile

Cloudflare Turnstile 的 Site Key 必须允许：

```text
<your-host>
```

本地开发再加：

```text
localhost
127.0.0.1
```

否则 H5 页面上的 Turnstile 会报域名不匹配。

## Supabase

H5 使用 Supabase REST/Auth，默认允许跨域。

如果浏览器控制台出现 CORS：

- 检查 Supabase 项目的 CORS/Allowed Origins；
- 确认 `https://<your-host>` 已允许；
- 不要使用 service_role key。

## 验证

1. 打开：
   ```text
   https://<your-host>/<base-path>/
   ```
2. 确认登录页样式和图标正常。
3. 登录、注册、Turnstile 正常。
4. 刷新页面后仍在子路径下。
5. 首页、详情、补签、结果、出勤、设置页面都能打开。
6. 控制台无资源 404。
7. 检查网络请求中的 JS/CSS 均来自：
   ```text
   /<base-path>/
   ```
8. 如果 H5 直连 Supabase 失败，检查 iframe/Worker 桥接。

## 版本检查与缓存

H5 启动后会请求：

```text
/static/version.json
```

并与 `utils/config.js` 中的 `APP_VERSION` 比较。版本不一致时会提示重新加载。

发版时：

1. 修改 `utils/config.js` 的 `APP_VERSION`；
2. 修改 `static/version.json` 的 `version`；
3. 重新构建 H5；
4. 上传完整产物；
5. 清理 Cloudflare 缓存。

建议 `version.json` 和 `index.html` 不缓存：

```http
Cache-Control: no-cache, no-store, must-revalidate
```

`assets/` 下的 hash 文件可以长缓存。

注意：版本检查只能提示更新，不能替代正确的 HTTP 缓存配置。若 `index.html` 被长期缓存，旧页面仍会先加载，然后才提示更新。

## 浏览器 HTTP 缓存

如果 F12 勾选 **Disable cache** 后正常，取消勾选又异常，问题就是 HTTP 缓存，不是 localStorage。

必须保证：

```http
# index.html
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0

# assets/ 下的 hash 文件
Cache-Control: public, max-age=31536000, immutable

# version.json
Cache-Control: no-cache, no-store, must-revalidate
```

Apache 只能改 `.htaccess` 时，直接使用：

[deploy/h5.htaccess](../deploy/h5.htaccess)

把文件改名为 `.htaccess`，上传到：

```text
/valencia/check-in/.htaccess
```

必须与 `index.html` 同级。路径必须和实际部署路径一致；如果不在 `/valencia/check-in/`，要改 `SetEnvIf` 里的路径。

上传后检查 `index.html` 响应头，应为：

```http
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
```

如果仍是旧值，通常是 `.htaccess` 没有生效、`AllowOverride` 未开启，或 `mod_headers` 未加载。

Nginx 示例：

```nginx
location = /valencia/check-in/index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
}

location = /valencia/check-in/static/version.json {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}

location ^~ /valencia/check-in/assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

Cloudflare：

- `index.html` 和 `version.json`：Bypass cache；
- `assets/*`：允许长缓存；
- 每次发版 purge `/valencia/check-in/*`。

检查响应头：

```http
Cache-Control
ETag
Last-Modified
CF-Cache-Status
Age
```

如果 `index.html` 返回 `max-age`、`CF-Cache-Status: HIT`，说明它仍被缓存。
