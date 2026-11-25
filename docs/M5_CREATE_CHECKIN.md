# M5 发布签到

## 已实现

| 文件 | 内容 |
|---|---|
| `pages/checkin/create.vue` | 发布签到表单 |
| `utils/time.js` | IANA 时区 → UTC 转换、显示 |
| `utils/coord.js` | WGS84 → GCJ-02、Haversine |
| `pages/index/index.vue` / `pages/profile/index.vue` | `+` → 发布签到 |
| `pages/class/detail.vue` / `pages/class/list.vue` | 班级内发布签到入口 |

## 表单字段

- 活动名称（默认“所选班级名称 + 签到”，2-60 字符）
- 文字说明（可选，最多 1000 字符）
- 时区（默认设备时区；数据库存 UTC）
- 开始日期/时间
- 结束日期/时间
- 签到班级（只能选自己创建的班级）
- 启用 1 km 位置校验（默认开启）
- 突击签到
- 设备绑定（默认关闭，开启前强警告）
- 签到方式：六位数字 / 二维码 / 两者
- 弱签到提示：关闭位置校验时显示风险说明

## 位置方案

按用户要求，**不做地点搜索**，不接高德/百度：

- 发布时如果启用 1 km 校验，调用 `uni.getLocation({ type: 'gcj02' })` 获取发布者设备定位；
- 该坐标作为圆心保存到 `checkin_events.location_lat/lng`；
- 签到者提交时，服务端用 Haversine 计算距离 ≤ 1000 m；
- H5 浏览器定位是 WGS84，客户端用 `wgs84ToGcj02` 转换后再提交；
- App 直接取 GCJ-02；
- 发布者拒绝定位且开启位置校验时，发布失败，提示允许定位或关闭校验。

## 时间与时区

- `utils/time.js` 用 `Intl.DateTimeFormat` 把“所选时区的墙上时间”转成 UTC；
- 数据库 `start_at/end_at` 是 `timestamptz`，Supabase 内部 UTC；
- 页面预览、成功页按活动时区显示；
- 客户端校验：开始不早于当前时间 5 分钟、结束晚于开始、最长 7 天；
- 服务端会再次校验。

## 服务端 RPC

`create_checkin_event(...)`：

- 校验 owner、时区、时间、地点/设备/方式；
- 插入 event；
- 生成 `checkin_secrets.secret`；
- 给班级当前所有成员预生成 `checkin_records(status='absent')`；
- 写审计日志。

## 设备绑定警告

打开“设备绑定”开关会弹 Modal：

> 启用后首次成功签到会绑定当前设备；换手机、清数据、重装 App 或换浏览器都可能无法签到。普通签到不建议开启。

取消则保持关闭。数据库默认也是 `require_device=false`。

## H5 测试步骤

1. 先创建一个班级。
2. 首页右上角 `+` → 发布签到。
3. 填名称/说明，选时区、开始/结束时间。
4. 选择自己创建的班级。
5. 保持“1 km 位置校验”开启，允许浏览器定位。
6. 选择签到方式。
7. 发布。
8. 成功页应显示活动名称、班级、时区时间、方式、位置/突击/设备标签。

如果浏览器不允许定位：

- 可以关闭“1 km 位置校验”，以弱签到发布；
- 或允许定位后重试。

### 验证数据库

```sql
select id, title, class_id, creator_id, timezone, start_at, end_at,
       location_lat, location_lng, is_surprise, require_location, require_device, method
from public.checkin_events
order by created_at desc
limit 5;

select event_id, user_id, status
from public.checkin_records
where event_id = '<刚发布的活动 id>';
```

应看到：

- event 的 `start_at/end_at` 是 UTC；
- `checkin_records` 已给班级全部成员生成 `absent`。

## 已知未做

- “我发布的签到”列表仍是 M6 接入；发布成功后先回首页/再发一场。
- 实时 6 位码、二维码、扫码签到是 M6。
- 出勤统计/CSV 是 M8。
- 地图搜索按用户要求不做。
- Android 真机定位等待后续测试。

## Android 定位补充（2026-11-19）

`manifest.json` 已增加：

```json
"modules" : {
  "Geolocation" : {}
}
```

因此修改后需要：

1. HBuilderX 重新编译运行；
2. 如果使用自定义调试基座，重新制作包含 Geolocation 的基座；
3. 首次发布位置签到允许定位权限。

客户端定位逻辑：

- H5：浏览器 WGS84 → 转 GCJ-02；
- App：优先 `uni.getLocation({ type: 'wgs84' })`；
- App 失败时回退 `plus.geolocation.getCurrentPosition`；
- 失败弹窗会显示具体原因，不再只有“无法获取定位”。
## 时间模式（2026-11-19）

发布签到现在有两种平行模式：

1. **从发布起**（默认）
   - 输入持续分钟数（1–10080）；
   - 点击发布时先取服务器时间；
   - `start_at = 服务器当前时间`，`end_at = start_at + X 分钟`；
   - 发布成功后立即进入正在签到。
2. **指定时间**
   - 原来的时区 + 开始/结束日期时间；
   - 按 `UTC` 存入数据库。

两种模式用页签切换，默认“从发布起”。

相对模式不新增数据库参数；使用现有 `get_server_time` RPC 获取服务器时间，再调用 `create_checkin_event`。