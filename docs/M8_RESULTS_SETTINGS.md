# M8 结果、统计与账号设置

## 我发布的签到

入口：个人主页 → 我发布的签到

- `/pages/checkin/manage`
- `list_checkin_events('created')`
- 本地筛选：全部 / 进行中 / 未开始 / 已结束
- 点击进入签到结果

## 签到结果

`/pages/checkin/result?id=...`

- `get_event_results`
- 已签到 / 未签到 / 总人数
- 成员明细：学号、姓名、状态、方式、上一轮码、补签状态
- 未开始的活动可删除（`delete_checkin_event`）
- CSV 导出

CSV：

- H5：直接下载文件；
- App：复制 CSV 文本到剪贴板，可粘贴到表格软件保存。

## 班级出勤

入口：班级详情 → 出勤统计（仅创建者）

- `/pages/class/attendance`
- `get_class_attendance`
- 普通成员每人：应签、已签、补签、未签、出勤率
- 创建者不计入
- 点击成员查看明细：`get_class_member_attendance`
- 班级 CSV 导出

## 账号设置

入口：个人主页 → 个人账号设置

`/pages/profile/settings`

### 基本资料

- 姓名（支持中文）
- 入学年份
- 专业
- 学号只读
- 保存需要 Turnstile 验证

### 修改密码

1. 本地用旧盐计算旧 hash；
2. `verify_my_password` 用 `auth.users.encrypted_password` 校验旧密码；
3. App 自动完成 Turnstile，H5 使用内联 Turnstile；
4. `updatePassword` 更新 Supabase Auth；
5. `set_password_salt` 写入新盐。

不使用安全问题。

## 需要重跑 SQL

```text
02_functions.sql
03_rls_grants_seed.sql
```

新增/修改：

- `verify_my_password(text)`
- `get_home_checkins()`
- `get_event_results` 排除发布者
- `get_class_attendance` 排除 owner
- `get_class_member_attendance` 增加 `timezone`

表结构不变。
