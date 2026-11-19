# M2 注册 / 登录 / 会话

## 本阶段完成

- 启动页 `pages/launch/launch.vue`：恢复 session、刷新 token、拉取 profile、分流到登录/首页。
- 登录页 `pages/auth/login.vue`：学号 + 密码 + Turnstile；登录后进入签到 tab。
- 注册页 `pages/auth/register.vue`：先 Turnstile，后表单；姓名 / 入学年份 / 专业 / 密码 / 确认密码；提交后自动生成 12 位学号。
- 首页 `pages/index/index.vue`：三 tab 骨架、个人资料卡、退出登录。
- 个人主页 `pages/profile/index.vue`：资料、五个入口占位、退出登录。
- `composables/useAuth.js`：全局 session / profile / 登录 / 注册 / 登出 / 刷新。
- `utils/crypto.js`：纯 JS SHA-256（已用 Node 对空串、abc、中文、长文本做向量比对）。
- `utils/authApi.js`：直接调用 Supabase Auth 与 PostgREST RPC，不依赖 supabase-js。
- `components/TurnstileGate.vue`：H5 内联 Turnstile；App 端通过 `captcha.html` 的 web-view。

## H5 运行步骤

1. HBuilderX 打开 `项目根目录`。
2. 运行 → 运行到浏览器 → Chrome。
3. 首次进入应该是启动页，随后到登录页。
4. 点“还没有账号？注册”。
5. 先完成 Turnstile；H5 使用页面内联 Turnstile，因此 `localhost` / `127.0.0.1` 必须加入 Turnstile widget hostname。App 使用 `captcha.html` 的 web-view。
6. 填写姓名 / 入学年份 / 专业 / 密码 / 确认密码。
7. 提交；成功后进入“注册成功”页，显示 12 位学号。
8. 点“复制学号”，再次输入 12 位学号，勾选“我已保存”，再进入首页；切到“我的”，确认资料与退出登录可用。
9. 退出后用刚生成的学号 + 密码登录。

## Supabase Auth 必须配置

- **Authentication → Providers → Email**：关闭 **Confirm email**。
- 密码策略：最低 6 位、无复杂度即可（客户端已强制 8 位 + 字母 + 数字；传给 Supabase 的是 64 位哈希）。
- 如果要真正启用人机验证：**Authentication → Bot and Abuse Protection → Enable CAPTCHA**，Provider 选 Turnstile。
  - 真实 Secret 用 `部署主机上的 verify_turnstile.php` 里的 `$SECRET_KEY`；Site Key 与 Secret 必须成对。
  - 生产替换成真实 Secret；前端 `utils/config.js` 的 `TURNSTILE_SITE_KEY` 同步替换成真实 Site Key。
  - 如果不启用 CAPTCHA，前端仍会发 token，但 Supabase 会忽略；注册/登录照样可用。

## 注册/密码流程

1. 客户端生成 12 位学号：`YYYY + 专业2位 + 6位随机`。
2. 生成随机盐 `password_salt`（16 字节 hex）。
3. 计算 `authHash = SHA-256(salt + '|' + password)`。
4. `signUp` 传给 Supabase：
   - email：`<学号>@student.valencia.edu`（用户不可见）
   - password：`authHash`
   - data：`student_id / full_name / enrollment_year / major_code / password_salt`
   - captcha token
5. 数据库 `handle_new_user` 触发器校验并写入 `profiles` + `auth_secrets`。
6. 登录时先 `get_login_salt(学号)` 拿盐，再算同一个 `authHash`，调 `signInWithPassword`。

## 安全说明

- 明文密码不离开设备；但客户端 SHA-256 不能替代 HTTPS。
- `authHash` 到 Supabase 后由 GoTrue bcrypt 再哈希；数据库没有明文密码。
- `service_role` 没有出现在前端、配置或任何页面。
- 页面守卫：首页/个人主页 `onShow` 检查 session + profile；未登录 `reLaunch` 到登录页。
- App 端请求走 `pages/bridge/bridge.vue` 的 web-view 桥接；H5 网络失败自动切 iframe。

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 注册后没有进入首页 | Supabase Confirm email 没关；注册返回 session=null |
| `permission denied for function` | 03 授权脚本未重新执行；先执行最新 03 |
| `anon` 能执行所有 RPC | 旧版 03 的默认权限未撤销；执行最新 03 后 `04_verify.sql` 第 9 段应只剩 `get_login_salt/get_server_time` |
| Turnstile 一直加载失败 | 网络无法访问 `challenges.cloudflare.com`；点刷新，或换网络/代理 |
| 手机端提示桥接未配置 | 检查 `utils/config.js` 的 `BRIDGE_BASE`，以及 `.private/check-in/` 三个文件是否上传 |
| 学号冲突 | 6 位随机冲突概率约百万分之一；重新注册会生成新学号并重新验证 |

## M3 已接入（2026-11-19）

- `deploy/bridge.html`：Supabase REST/Auth/Edge 转发，校验 origin/path/header 白名单。
- `deploy/captcha.html`：Turnstile 页面，App web-view 使用。
- `deploy/uni.webview.js`：DCloud 官方通信脚本。
- `pages/bridge/bridge.vue`：App 桥接页，result 通过 `uni.$emit` 回传。
- `utils/http.js`：H5 直连失败切 iframe；App 一律走桥接页。
- `TurnstileGate.vue`：App 端点“打开人机验证”进入 `captcha.html`。

上传路径与验证步骤见 `deploy/README.md`。

## 学号保存强制确认（2026-11-19 追加）

注册成功后不再直接弹一个普通 Modal，而是进入专门的“注册成功”页：

1. 大字显示 12 位学号；
2. “复制学号”按钮；
3. 红色警告：系统未绑定手机/邮箱，忘记学号或密码将无法找回；
4. 必须再次手动输入完整 12 位学号，且与上方一致；
5. 必须勾选“我已抄写或保存学号，并理解丢失后无法找回”；
6. 以上两项都满足后，“进入签到系统”按钮才可用。

同时：

- 登录页会从本地存储预填最近一次登录/注册的学号（`vu_last_student_id`）；
- 登录页底部固定提示“学号是唯一登录账号；忘记学号或密码将无法找回”。

## 个人主页注销账号（2026-11-19 追加）

新增页面 `pages/profile/delete-account.vue`，入口在个人主页底部“账号安全 → 注销账号”。

严格确认条件：

1. 手动输入完整 12 位学号，必须与当前账号一致；
2. 手动输入“注销账号”四个字；
3. 勾选“我已知晓注销不可恢复”；
4. 点击后再弹一次最终确认 Modal。

后端 RPC：`delete_my_account(p_student_id, p_confirm_text)`。

- 校验学号 / 确认文字；
- 写 `audit_logs`；
- 删除 `auth.users` 行，级联删除 profile、班级、成员、签到、记录、补签、密钥等；
- 当前 session 失效，客户端清空本地 session 并回登录页。

> 注销是永久删除。个人主页和注销页都明确提示：如果创建了班级，班级和班级内所有签到会一起消失。

## 追加 SQL

`delete_my_account` 已加入：

- `02_functions.sql`
- `03_rls_grants_seed.sql`（白名单 + grant authenticated）
- `04_verify.sql`（authenticated 检查列表）

所以本轮需要再执行一次 **02 + 03 + 04**，让新 RPC 和授权生效。01 不需要重跑。

## 关于 04 的输出

你贴出的表是 `authenticated` 的授权结果，属于第 10 段；第 9 段 `anon` 应只剩：

```text
get_login_salt
get_server_time
```

既然 H5 注册/登录已正常，说明 `anon` 执行 `get_login_salt` 是通的。若你想再确认，单独跑第 9 段即可。