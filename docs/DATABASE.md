# M1 数据库说明

本目录是“瓦莱希雅大学签到系统”的数据库第一版。**不使用迁移工具**，全部为新建表；在 Supabase SQL Editor 中按顺序执行即可。

## 1. 执行顺序

| 顺序 | 文件 | 作用 |
|---|---|---|
| 1 | `supabase/sql/01_schema.sql` | 13 张表、索引、触发器、`handle_new_user` |
| 2 | `supabase/sql/02_functions.sql` | 通用 helper + 全部业务 RPC |
| 3 | `supabase/sql/03_rls_grants_seed.sql` | RLS 策略、最小授权、12 个专业 |
| 4 | `supabase/sql/04_verify.sql` | 只读检查（表/RLS/RPC/冒烟） |

## 2. 表清单（13）

| 表 | 说明 |
|---|---|
| `majors` | 专业字典 |
| `profiles` | 用户资料；`id = auth.users.id`；12 位学号 |
| `auth_secrets` | 密码盐；RLS 全拒绝 |
| `classes` | 班级；创建者唯一 |
| `class_members` | 班级成员；owner 由触发器自动写入 |
| `class_invites` | 8 位邀请码与有效期；仅创建者可读 |
| `checkin_events` | 签到活动；UTC 时间；突击/设备/位置/方式 |
| `checkin_secrets` | 动态码 HMAC 密钥；RLS 全拒绝 |
| `checkin_records` | 参与记录；创建活动时预生成 `absent` |
| `checkin_attempts` | 同一时间片失败限流 |
| `appeals` | 补签申请；每条记录最多 3 次 |
| `audit_logs` | 审批/签到/班级操作审计；RLS 全拒绝 |
| `captcha_tickets` | 业务人机验证票据；RLS 全拒绝 |

## 3. 关键设计

### 3.1 学号

- 12 位数字：`YYYY + 专业2位 + 6位随机`，如 `202608000001`。
- 客户端生成；`profiles.student_id` 唯一约束兜底；冲突重试。
- 触发器校验：学号前缀必须等于 `enrollment_year` 与 `major_code`。
- 学号不可修改（触发器 `profiles_prevent_student_id_change`）。

### 3.2 注册/密码

- 注册界面不出现邮箱；Supabase Auth 内部使用 `<学号>@student.valencia.edu` 作为合成标识。
- 客户端生成随机盐 `password_salt`，计算 `authHash = SHA-256(salt + '|' + password)`。
- Supabase Auth 在服务端用 bcrypt 再哈希；明文密码不离开设备。
- `handle_new_user` 触发器在 `auth.users` 插入后创建 `profiles` 和 `auth_secrets`。
- 登录前用 `get_login_salt(学号)` 取盐；未知学号返回确定性假盐，避免账号枚举。
- 修改密码：旧密码验证 → `updateUser({password: 新 authHash})` → `set_password_salt(新盐, 票据)`。

### 3.3 动态签到码

- 每个活动一个随机 `secret`，存 `checkin_secrets`。
- 时间片：`floor(epoch(now()) / 30)`。
- `code = HMAC-SHA256(secret, slice)` 取前 4 字节 → `mod 1,000,000` → 6 位补零。
- 服务端验证当前片与上一片；上一片允许但 `is_late_slice=true`。
- 数据库只存 `code_hash = SHA-256(event_id|user_id|code)`，不存明文码。
- 不依赖 cron：状态、过期、突击可见性全部由 `now()` 推导。

### 3.4 签到提交

`submit_checkin` 的顺序：

1. 登录用户 + 参与记录存在。
2. 已签到 → `ALREADY_CHECKED_IN`。
3. 服务器时间在 `[start_at, end_at]`。
4. 活动允许的签到方式（code/qr）。
5. 可选设备绑定（`require_device`）。
6. 可选 1 km 地理围栏（`require_location`）。
7. 同一时间片失败 ≥5 次 → 限流。
8. 当前/上一时间片哈希匹配。
9. 更新记录、写 attempt、写 audit。

### 3.5 补签

- 活动结束后，未签到记录仍在 `absent`。
- `apply_makeup`：本人、已结束、非创建者、理由 10-500 字、最多 3 次、不能有 pending。
- `review_appeal`：只有活动创建者；批准后记录变 `present + method=makeup`；拒绝保持 `absent`。
- 统计口径：正常出勤率只算 `code/qr`；补签单列，不计入正常出勤率。

### 3.6 删除/踢人

- `kick_class_member`：owner 踢普通成员；保留历史记录，删除未来活动的参与记录。
- `delete_class`：owner 删除班级；级联删除成员/邀请/活动/记录/补签/密钥。
- `leave_class`：普通成员退出；owner 必须删除班级。
- `delete_checkin_event`：创建者只能删除“未开始”的活动；已开始不能删。
- `withdraw_appeal`：申请人可撤回 pending 补签（不消耗 3 次机会）。

## 4. RLS 摘要

| 表 | 读策略 | 写 |
|---|---|---|
| `majors` | 所有人可读 | 无 |
| `profiles` | 只读自己 | 无（触发器/RPC） |
| `classes` | owner 或成员 | 无（RPC） |
| `class_members` | 自己或班级 owner | 无（RPC） |
| `class_invites` | 仅班级 owner | 无（RPC） |
| `checkin_events` | 创建者；成员且非突击/已开始 | 无（RPC） |
| `checkin_records` | 本人或活动创建者，且活动可见 | 无（RPC） |
| `appeals` | 本人或活动创建者，且活动可见 | 无（RPC） |
| `auth_secrets` / `checkin_secrets` / `checkin_attempts` / `captcha_tickets` / `audit_logs` | 无 policy，全拒绝 | 仅 definer/Edge Function |

所有表 `enable row level security`；没有 `for all` 策略；`authenticated` 没有 insert/update/delete 权限；写操作只走 `SECURITY DEFINER` RPC，RPC 内部逐项鉴权。

## 5. 手动执行步骤（Supabase）

1. 打开 <https://supabase.com/dashboard>，进入项目；没有项目则新建一个（区域选离你近的，如 Singapore / Tokyo）。
2. 左侧 **SQL Editor** → **New query**。
3. 粘贴 `01_schema.sql` 全部内容 → **Run**。成功后应无报错。
4. 新建 query → 粘贴 `02_functions.sql` → **Run**。
5. 新建 query → 粘贴 `03_rls_grants_seed.sql` → **Run**。
6. 新建 query → 粘贴 `04_verify.sql` → **Run**，检查：
   - 表清单 13 行；
   - “没有 RLS 的表” 0 行；
   - `major_count = 12`；
   - `get_login_salt('000000000000')` 返回 `ok: true`；
   - `get_server_time()` 返回 UTC 时间。
7. 左侧 **Authentication → Providers → Email**：
   - 关闭 **Confirm email**（否则注册不返回 session，且合成邮箱收不到信）；
   - 密码策略设为最低 6 位、无复杂度（真正的 8 位字母+数字在客户端校验；传过去的是 64 位哈希）。
8. **Project Settings → API**：复制 `Project URL` 和 `anon public` / `publishable` key，下一步 M2 填入 `utils/config.js`。**不要把 `service_role` 发给任何人或写进前端。**
9. 如果任何一步报错，把 **完整红色错误文本** 发给我；不要只发“失败了”。

## 6. 已知未做（后续阶段）

- 注册/登录 UI、Turnstile 组件、学生 ID 生成器：M2。
- 桥接 HTML、captcha.html、map-picker.html：M3。
- 地图搜索：按你的要求暂缓，M5 再定；当前保留 `location_name/lat/lng` 字段与“使用当前定位/手动名称”的降级入口。
- 设备绑定：字段已留，默认关闭；M5 前端启用前必须二次确认警告。
- 真实短信/邮件通知：不做；补签结果靠页面状态展示。
- 测试用户：等 M2 注册流程完成后创建；现在不要用 Dashboard 手动建无 metadata 的用户（不会生成 profile）。

## 7. M1 自测结果（嵌入式 PostgreSQL 验证）

已在 PGlite + pgcrypto 中执行 01/02/03，并跑通以下流程：

- 注册触发器建 `profiles` + `auth_secrets`。
- 建班、生成邀请码、加入班级。
- 创建签到、派生 6 位码、提交签到。
- 上一时间片允许且 `lateslice=true`；3 片前拒绝；重复提示已签到。
- 设备绑定不匹配拒绝；1 km 外拒绝、1 km 内成功。
- 补签申请、审批通过/拒绝；3 次拒绝后第 4 次拒绝；撤回不消耗次数。
- 踢人、退出、删除未开始签到、删除班级。
- RLS：A 不能读 B 的资料/班级/邀请码；成员不能读邀请码；突击签到开始前参与者不可见；直接 insert/update 表被拒绝。

注意：PGlite 不是 Supabase 生产环境，`auth.users` 触发器、`auth.uid()`、角色是本地 stub；真实 Supabase 上仍需执行 `04_verify.sql` 做最终确认。
## 8. 授权修正（2026-11-19）

Supabase 的默认权限会把新建函数直接授给 `anon` 和 `authenticated`，只 `REVOKE ... FROM PUBLIC` 撤不掉。最新 `03_rls_grants_seed.sql` 已增加：

```sql
只撤销本项目函数名的 EXECUTE（DO 块按白名单逐个 REVOKE，不会影响 lost-found 的 publish_lostfound）
```

然后只重新授予：

- `anon`：`get_login_salt`、`get_server_time`（以及 `majors` 的 SELECT）
- `authenticated`：业务 RPC + RLS 辅助函数

重新执行 `03_rls_grants_seed.sql` 后，`04_verify.sql` 第 9 段应只剩 `get_login_salt` / `get_server_time` 两个 anon 可执行函数。
## 9. 位置方案变更（2026-11-19）

- 暂不做地图搜索 / 地点选择；不引入高德或任何需要 Key 的地图服务。
- 发布签到时，如果启用 1 km 位置校验，**圆心取发布者设备的当前定位**（发布时采集一次）。
- 数据库仍保留 `location_name/address/lat/lng/coord_system` 字段，方便后续接入地图时复用；M5 表单只显示“使用当前定位作为圆心”，不显示地点搜索框。
- 签到者的设备定位仍需在 1 km 内；服务端用 Haversine 校验，客户端只做提示。
- 发布者拒绝定位且启用了位置校验时，发布失败并提示开启权限；未启用位置校验时不需要圆心。
## 10. 注销账号 RPC（2026-11-19 追加）

`delete_my_account(p_student_id text, p_confirm_text text)`：

- 必须 `auth.uid()` 已登录；
- `p_student_id` 必须等于当前 `profiles.student_id`；
- `p_confirm_text` 必须严格等于 `注销账号`；
- 写 `audit_logs`；
- 删除 `auth.users` 行，级联删除 profile / classes / class_members / checkin_events / checkin_records / appeals / checkin_secrets / captcha_tickets；`audit_logs.actor_id` 会置空，但日志保留；
- 已加入 `02_functions.sql`、`03_rls_grants_seed.sql` 白名单、`04_verify.sql` 的 authenticated 检查列表。

前端入口：`pages/profile/delete-account.vue`，要求输入完整学号 + “注销账号” + 勾选确认 + 二次 Modal。