# M4 班级管理

## 已实现

| 文件 | 内容 |
|---|---|
| `components/AppHeader.vue` | 统一页头：返回、标题、右上角 `+` |
| `components/ActionSheet.vue` | 底部动作面板：发布签到 / 新建班级 / 加入班级 |
| `components/ClassCard.vue` | 班级卡片：成员数、活动数、邀请码、有效期 |
| `pages/class/create.vue` | 新建班级：名称 + 邀请码有效期 + Turnstile |
| `pages/class/join.vue` | 加入班级：8 位邀请码 + Turnstile |
| `pages/class/list.vue` | 我创建的班级 / 我加入的班级 |
| `pages/class/detail.vue` | 班级详情、邀请码、成员、踢人、退出、删除 |
| `pages/index/index.vue` | 右上角 `+` 与快捷操作 |
| `pages/profile/index.vue` | “我创建的班级 / 我加入的班级”入口 + 右上角 `+` |

后端 RPC 已在 M1 完成并测试：

- `create_class`
- `join_class`
- `list_my_classes`
- `get_class_detail`
- `kick_class_member`
- `leave_class`
- `delete_class`

## 必须先部署 Edge Function：captcha-verify

建班/加班需要把 Turnstile token 换成一次性 `captcha_ticket`。这一步必须由服务器完成，不能放在前端。

文件：

```text
supabase/functions/captcha-verify/index.ts
```

### 方式 A：Supabase CLI（推荐）

```bash
supabase login
supabase link --project-ref hisewqjyxadmezeiwnzc
supabase secrets set TURNSTILE_SECRET=<verify_turnstile.php 里的 SECRET_KEY>
supabase functions deploy captcha-verify --no-verify-jwt
```

> 真实配对：Site Key `0x4AAAAAAC2E9TsjP-02HPpE`（已在 `utils/config.js`），Secret 用 `部署主机上的 verify_turnstile.php` 里的 `$SECRET_KEY`。
> **Site Key 和 Secret 必须是一对，不能混用；混用就是“组件成功、服务端 CAPTCHA_FAILED”。**

### 方式 B：Dashboard

1. Supabase Dashboard → **Edge Functions**。
2. 新建函数，名称必须是 `captcha-verify`。
3. 把 `supabase/functions/captcha-verify/index.ts` 的内容粘贴进去。
4. 在 Edge Functions 的 Secrets/环境变量中添加：
   - `TURNSTILE_SECRET` = `部署主机上的 verify_turnstile.php` 里的 `$SECRET_KEY`（或测试配对 Secret）
5. 部署，关闭 JWT 验证（对应 `--no-verify-jwt`），因为函数内部会手动校验用户 JWT。

Function URL 应为：

```text
https://hisewqjyxadmezeiwnzc.supabase.co/functions/v1/captcha-verify
```

如果没部署，建班/加班会报 `CAPTCHA_FAILED`、404 或桥接超时。

## Turnstile Action

前端 `TurnstileGate` 的 `action` 必须和 RPC 用途一致：

- 新建班级：`create_class`
- 加入班级：`join_class`

`captcha.html` 会把 action 传给 Turnstile；Edge Function 会校验 `verify.action === purpose`。

## 专业名称修正

`Irelav` 实际是 **𣿅语**。已修改：

- `utils/constants.js` → `{ code: '02', name: '𣿅语语言文学' }`
- `03_rls_grants_seed.sql` → `('02', '𣿅语语言文学', 2)`

如果数据库已经执行过旧版 03，重跑 03 会自动更新（`on conflict do update`）；也可以单独执行：

```sql
update public.majors
set name = '𣿅语语言文学'
where code = '02';
```

## H5 验证步骤

1. 重新执行最新 `03_rls_grants_seed.sql`（更新专业名 + 授权）。
2. 首页右上角点 `+` → 新建班级。
3. 填班级名称，选邀请码有效期。
4. 完成 Turnstile；点“创建班级”。
5. 成功后应显示 8 位邀请码；复制。
6. 退出登录，注册/登录另一个测试账号。
7. 首页 `+` → 加入班级，输入邀请码 + Turnstile。
8. 加入成功 → 班级详情。
9. 回到创建者账号：
   - 个人主页 → 我创建的班级 → 班级详情；
   - 能看到成员；
   - 点“踢出”测试；
   - 删除班级需两次确认。
10. 普通成员详情：
    - 只能看成员数量，不能看名单；
    - 可以“退出班级”；
    - 不能删除班级。

## 已知未做

- 发布签到仍是占位提示，M5 接入。
- 出勤统计仍是占位提示，M8 接入。
- Android 未真机测试；等你有线后再验。
- 建班/加班的 Turnstile 依赖 `challenges.cloudflare.com`，国内网络不稳定时会显示失败。
- Edge Function 部署是手动步骤；没部署前 M4 只能看页面，不能真正建班/加班。
