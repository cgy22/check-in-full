# H5 部署说明

目标地址：

```text
https://dornhub.eu.org/valencia/check-in/
```

## 已配置

[manifest.json](F:/check-in-full/manifest.json)：

```json
"h5": {
  "title": "瓦莱希雅大学签到系统",
  "publicPath": "/valencia/check-in/",
  "router": {
    "mode": "hash",
    "base": "/valencia/check-in/"
  }
}
```

- `publicPath`：JS/CSS/字体/图片从 `/valencia/check-in/` 加载；
- `router.base`：H5 路由基于 `/valencia/check-in/`；
- `mode: "hash"`：使用 `#` 路由，不需要服务器配置 history 回退。

访问示例：

```text
https://dornhub.eu.org/valencia/check-in/#/pages/index/index
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
/valencia/check-in/
```

最终服务器结构：

```text
/valencia/check-in/index.html
/valencia/check-in/assets/...
/valencia/check-in/static/...
```

不要只上传 `index.html`。

## 服务器配置

Hash 模式不需要 `try_files`。

只需要保证：

- `/valencia/check-in/` 返回 `index.html`；
- `/valencia/check-in/assets/` 和 `/valencia/check-in/static/` 可访问；
- 不要强制把 `/valencia/check-in/*` 重写到根目录。

如果服务器自动把目录重定向到带斜杠地址，使用：

```text
https://dornhub.eu.org/valencia/check-in/
```

不要省略末尾 `/`。

## Turnstile

Cloudflare Turnstile 的 Site Key 必须允许：

```text
dornhub.eu.org
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
- 确认 `https://dornhub.eu.org` 已允许；
- 不要使用 service_role key。

## 验证

1. 打开：
   ```text
   https://dornhub.eu.org/valencia/check-in/
   ```
2. 确认登录页样式和图标正常。
3. 登录、注册、Turnstile 正常。
4. 刷新页面后仍在子路径下。
5. 首页、详情、补签、结果、出勤、设置页面都能打开。
6. 控制台无资源 404。
7. 检查网络请求中的 JS/CSS 均来自：
   ```text
   /valencia/check-in/
   ```
8. 如果 H5 直连 Supabase 失败，检查 iframe/Worker 桥接。
