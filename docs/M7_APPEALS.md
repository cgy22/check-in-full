# M7 补签申请与审批

## 已接入

### 学生申请补签

入口：签到详情 → 已结束且未签到 → 申请补签

页面：`/pages/appeal/apply?recordId=...&eventId=...`

- 理由 10–500 字；
- App 点击提交后自动进入 Turnstile，通过后自动提交；
- H5 保持内联 Turnstile + 提交按钮；
- 最多 3 次申请；
- 待审批期间不能重复申请；
- 通过后不能再次申请。

### 学生撤回

签到详情或申请详情中，待审批申请可撤回：

- `withdraw_appeal`
- 撤回后删除该 pending 记录，可重新申请。

### 创建者审批

个人主页 → 我收到的补签申请：

- `list_received_appeals`
- 待审批 / 全部 / 已通过 / 未通过
- 点击进入申请详情。

申请详情：

- 申请人、班级、签到时间、理由、历史；
- 批准：`review_appeal(p_approve=true)`，记录改为 `present` / `makeup`；
- 拒绝：保留 `absent`，可填写备注；
- 拒绝后学生仍可再次申请，最多 3 次。

### 状态展示

- 首页签到卡片显示“补签待审 / 补签未通过”；
- 签到详情显示最近一次申请状态、次数、备注；
- 3 次机会用完显示不可申请。

## 使用 RPC

- `get_checkin_event`（新增 `my_appeals`）
- `apply_makeup`
- `withdraw_appeal`
- `list_received_appeals`（新增 `event_timezone`）
- `get_appeal_detail`
- `review_appeal`

## 需要重跑

- `02_functions.sql`：`get_checkin_event` 的 `my_appeals`、`list_received_appeals` 的 `event_timezone`
- `03_rls_grants_seed.sql`：已有补签函数授权，重新执行可确保生效
