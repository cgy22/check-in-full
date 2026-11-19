# M6 签到流程

## 已接入

### 首页三 tab

- 正在签到：`list_checkin_events('active')`
- 未开始：`list_checkin_events('upcoming')`
- 已结束：`list_checkin_events('ended', status)`
  - 全部 / 已签到 / 未签到
  - 服务端按时间排序

点击卡片进入：

```text
/pages/checkin/detail?id=<event_id>
```

### 签到详情

- `get_checkin_event` 读取活动、我的记录、人数统计；
- 创建者显示动态签到码 + 二维码；
- 参与者显示输入框 / 扫码按钮；
- 结束且未签到显示“补签申请将在 M7 接入”。

### 动态码

- `get_checkin_code` 只允许创建者；
- 服务端按 30 秒时间片派生六位码；
- 二维码内容就是这六位码；
- 页面每秒更新倒计时，到期自动刷新；
- 开始前 5 分钟才生成，结束后清空。

### 提交

- 客户端把 `SHA-256(event_id|user_id|code)` 发给 `submit_checkin`；
- 服务端只存 hash；
- 支持当前时间片和上一时间片（`late_slice`）；
- 输入满 6 位自动提交，没有提交按钮；
- 扫码成功也自动提交；
- 位置要求：`getCurrentGcj02()`；
- 设备要求：`utils/device.js` 的稳定本机 ID；
- 服务端限流：同一时间片最多 5 次失败。

### 扫码

- Android App：`uni.scanCode` 原生扫码；
- H5：优先 `BarcodeDetector` + 相机图片；不支持时提示手动输入六位码；
- 二维码只包含六位数字。

## 不需要 SQL 变更

M6 只使用既有 RPC：

- `list_checkin_events`
- `get_checkin_event`
- `get_checkin_code`
- `submit_checkin`
- `get_server_time`

不需要重跑 `01/02/03`。

## 测试建议

1. 创建者在首页看到“正在签到”；
2. 进入详情，动态码每 30 秒变化，二维码可扫；
3. 成员在另一台设备进入详情，输入六位码，满 6 位自动提交；
4. 过 30 秒再用旧码，应成功但标记“上一轮码”；
5. 错误码连续 5 次，应提示等待下一轮；
6. 开启 1 km 后，关闭定位应失败；
7. 已结束 tab 的已签到/未签到筛选应正确排序。

## 创建者流程补充（2026-11-19）

- 新建签到选择“从发布起”时，发布成功后直接 `redirectTo` 到签到详情页，不再停留在成功页。
- 详情页创建者区显示动态码和二维码。
- 创建者详情页每 5 秒刷新一次 `counts`（已签到/未签到/总人数）。
- 创建者不需要签到：
  - `create_checkin_event` 不再给创建者预生成 `checkin_records`；
  - 详情页不显示创建者的签到输入框；
  - 统计和已结束筛选都排除创建者。
- 需要重新执行 `02_functions.sql` 中的 `create_checkin_event` / 统计函数；不需要改表结构。
## 首页缓存策略（2026-11-19）

- App 启动时 `App.onLaunch` 清空首页缓存；
- 首次进入主页时并行拉取：
  - active / upcoming / ended(all)
- 写入内存缓存；
- 之后：
  - 切换“正在签到 / 未开始 / 已结束”不请求；
  - 已结束的“全部 / 已签到 / 未签到”在本地过滤；
  - 只有下拉刷新才重新拉取三组数据。
- 登录、注册、退出、注销、发布签到会清空缓存，下一次进入主页重新拉取。
- 缓存只在当前 App 进程内有效，不写磁盘。
## 时区与刷新修正（最新）

- 指定时间发布改走服务端 `create_checkin_event_local`：
  - 客户端提交 `p_start_local` / `p_end_local`（所选时区的墙上时间）和 `p_timezone`；
  - 服务端用 PostgreSQL `timestamp at time zone` 换算 UTC；
  - 不再依赖 App WebView 的 `Intl` 时区支持。
- 所有用户端时间展示统一改为设备本地时区，不再按活动时区显示。
- 详情页取消 5 秒人数轮询和 30 秒自动换码请求，改为下拉刷新；签到码仍有倒计时，过期后提示下拉刷新。
- 设备绑定开关取消时立即恢复为关闭状态。