# 🎓 Valencia University Check-in System

A private, production-oriented attendance system for the fictional Valencia University, built with uni-app (Vue 3), Supabase, and Cloudflare Turnstile. It runs on H5 and Android, with a single codebase, strict database access rules, and a deep-red mica visual language.

> **Private.** This repository and every file in it are proprietary. No permission is granted to copy, distribute, sublicense, modify, publish, or use any part of this project without prior written authorization from Dorn Hub.

---

## 📖 Overview

The system solves a practical campus problem: a class creator needs to publish an attendance event, students need to check in within a controlled time window and location, and the creator needs reliable results, attendance statistics, and a review flow for missed check-ins.

The project is intentionally opinionated:

- **No email registration.** A student signs up with a name, enrollment year, major, and password. The system generates a 12-digit student ID.
- **No password recovery by email.** The student ID is the only login identifier. Users are warned repeatedly to save it.
- **CAPTCHA where it matters.** Registration and login are always protected by Cloudflare Turnstile. H5 also requires it for class creation/joining, check-in publishing, profile/password changes, and appeals. The Android app skips those non-auth challenges to keep the installed-app flow smooth, while server-side authorization and limits remain in force.
- **Server-authoritative time.** Check-in status, rotating codes, late slices, and timezone conversion are calculated by PostgreSQL, not by the phone clock.
- **Strict RLS.** Business writes happen through `SECURITY DEFINER` RPCs. Direct table writes are revoked.
- **No map dependency.** The 1 km rule uses the publisher's device location as the circle center. There is no place search, map tile, POI lookup, or map API key.
- **Mobile-first, desktop-safe.** The same H5 build works at a subpath and the Android build uses native camera and location.

---

## 🧪 Fictional Scenario Notice

All application scenarios, organizations, classes, users, student IDs, locations, attendance events, records, appeal cases, and related data depicted or supported by this project are entirely fictional and are intended only for demonstration, development, and testing.

**“Valencia University” (瓦莱希雅大学) is a fictitious name.** It does not refer to any real university, educational institution, organization, or entity. Any resemblance to an actual institution, person, or event is purely coincidental.

No real student, employee, or institutional data should be entered into demonstration environments.

---

## ✨ What It Does

### 👤 Identity and access

- Student registration with Chinese or Latin names.
- Auto-generated 12-digit student ID: enrollment year + major code + six random digits.
- Password pre-hashed on the client, then bcrypt-hashed by Supabase Auth.
- Login, session restore, token refresh, logout.
- Profile, enrollment year, major, password change, account deletion.
- No email field, no “forgot password” flow, no security questions.

### 🏫 Classes

- Create a class with an 8-character invite code.
- Invite validity: 1 hour, 24 hours, 7 days, or 30 days.
- Join by invite code.
- View members, kick a member, leave a class, delete a class.
- Owner and member views are separated.

### 📅 Check-in events

- Publish a check-in for a class the creator owns.
- Two time modes:
  - **Start from publication**: starts immediately, lasts 1–10080 minutes.
  - **Absolute time**: local wall-clock date/time plus an IANA timezone, converted to UTC by PostgreSQL.
- Title defaults to the selected class name plus “签到” (for example, “计算机 1 班签到”); description is optional. Surprise mode, location requirement, and optional device binding are configurable.
- Method: six-digit code, QR code, or both.
- Creator is not a participant and is excluded from attendance statistics.
- Delete a not-started event; end an active event early.

### 🔢 Live check-in

- 30-second rotating six-digit code derived server-side.
- QR code contains exactly the six digits.
- Previous time slice is accepted and marked as a late slice.
- Five failed attempts per slice are rate-limited.
- Client sends only `SHA-256(event_id | user_id | code)`.
- Full six-digit input submits automatically; no submit button.
- App uses native `uni.scanCode`; H5 uses `BarcodeDetector` when available and falls back to manual input.
- Optional 1 km location check with distance and accuracy preflight.
- Optional device binding with explicit risk warning.

### 📝 Appeals

- A student who missed an ended event can apply for makeup with a 10–500 character reason.
- App automates the Turnstile step; H5 keeps the inline widget.
- Maximum three attempts.
- Pending appeals can be withdrawn.
- Creator can approve or reject with a note.
- Approval changes the record to present with the `makeup` method.
- Rejection keeps the record absent and shows a clear badge.
- Students can track “My appeals”; creators can track “Received appeals”.

### 📊 Results and statistics

- “My published check-ins” list.
- Per-event result list with status, method, late-slice flag, distance, device label, and appeal state.
- Class attendance per member, including makeup.
- Member attendance detail for every ended event.
- CSV export:
  - H5: direct download.
  - Android: CSV copied to the clipboard for pasting into spreadsheet software.
- CSV formula-injection protection for cells beginning with `=`, `+`, `-`, or `@`.

### 🧊 Caching and refresh

- The home screen loads once per cold start and uses an in-memory cache for tab/filter changes.
- Pull-to-refresh explicitly fetches fresh data.
- Detail pages always load fresh data from the server.
- Detail changes are patched back into the home cache and moved between active/upcoming/ended buckets.
- App check-in detail no longer polls bridge on a timer; use pull-to-refresh or the refresh button.

---

## 🧱 Technology Stack

| Layer | Technology |
|---|---|
| Client | uni-app, Vue 3, Composition API |
| Targets | H5, Android App |
| Styling | Scoped CSS, CSS variables, mica/glass cards |
| Auth | Supabase Auth (GoTrue) |
| Database | Supabase PostgreSQL |
| Data access | PostgREST RPC + strict RLS |
| Edge | Supabase Edge Function (Deno) |
| Human verification | Cloudflare Turnstile |
| Mobile bridge | Hidden web-view, same-origin proxy, Cloudflare Worker |
| QR | Vendored QR encoder |
| CSV | Pure client-side generator |

No runtime npm dependency is required by the uni-app client.

---

## 🏗️ Architecture

```text
uni-app client
  ├── H5: direct Supabase REST/Auth
  └── Android: hidden BridgeHost web-view
        └── bridge.html
              ├── Cloudflare Worker (preferred)
              └── same-origin proxy (fallback)
                    └── Supabase REST/Auth/Edge Functions
```

### 🔐 Server-authoritative design

- All business writes go through RPCs with `SECURITY DEFINER`.
- Direct table writes are revoked from `anon` and `authenticated`.
- RLS is the final boundary for reads and helper access.
- The client never receives `service_role`.
- The bridge forwards either the anon key or the current user JWT; it never substitutes a service key.
- Check-in codes are derived from a server-only secret.
- Only a hash of the entered code is transmitted and stored.

### 🕒 Timezone model

- Wall-clock input is sent with an IANA timezone to `create_checkin_event_local`.
- PostgreSQL converts wall time to `timestamptz` with `timestamp at time zone`.
- All stored event times are UTC.
- All user-facing times are displayed in the device's local timezone, using native Android/iOS timezone lookup where available.

### 🏠 Home data model

- `get_home_checkins()` returns active, upcoming, and ended groups in one RPC.
- The client caches those three groups.
- Ended filters are applied locally.
- A detail page calls `get_checkin_event` once and receives the event, participant record, counts, server time, and creator code data in the same response.

---

The page tree contains only the Full application. The Lite shell is not part of this repository; its APK is distributed through GitHub Releases only.

---

## 🎨 Design Language

The interface follows the reference direction established for the project:

- Deep-red primary color: `#A51515`.
- Dark red gradient: `#B21B1B` → `#6F0C0C`.
- Warm paper background: `#F4EFE9`.
- Mica/glass cards with translucency, blur, fine borders, and restrained shadows.
- Serif display typography for the brand and section titles.
- Motion curve: `cubic-bezier(0.05, 0.7, 0.1, 1)`.
- Generous spacing, clear hierarchy, mobile-first layouts.
- No heavy dashboards, no unnecessary charts, no decorative noise.
- The app icon uses the same red rounded-square `Va` mark as the login page.

The design references the campus activity and enrollment platform and Dorn Hub UI conventions, while keeping this project's own identity.

---

## 📁 Repository Layout

```text
.
├── App.vue
├── main.js
├── manifest.json
├── pages.json
├── components/
│   ├── ActionSheet.vue
│   ├── AppHeader.vue
│   ├── BridgeHost.vue
│   ├── CheckinCard.vue
│   ├── ClassCard.vue
│   ├── MicaCard.vue
│   └── TurnstileGate.vue
├── composables/
│   ├── useAuth.js
│   └── useCaptcha.js
├── pages/
│   ├── launch/
│   ├── auth/
│   ├── index/
│   ├── profile/
│   ├── class/
│   ├── checkin/
│   └── appeal/
├── utils/
│   ├── authApi.js
│   ├── http.js
│   ├── crypto.js
│   ├── time.js
│   ├── location.js
│   ├── qr.js
│   ├── qrcode.js
│   ├── csv.js
│   ├── device.js
│   ├── homeCache.js
│   └── ...
├── supabase/
│   ├── sql/
│   └── functions/captcha-verify/
├── deploy/
├── hybrid/html/404.html
├── static/
├── docs/
└── README.md
```

---

## 🚀 Getting Started

### 🌐 Option 1: Open the online H5

Use the live URL listed in the repository's **About** panel or the latest **Release**:

```text
https://<online-host>/<base-path>/
```

No installation is required. Open the URL, register an account, or sign in.

### 📱 Option 2: Install an Android APK

The latest **Release** provides two Android builds:

| Build | Purpose |
|---|---|
| `valencia-checkin-full-v1.0.0.apk` | Full application with the complete native and H5 implementation |
| `valencia-checkin-lite-v1.0.0.apk` | Lightweight embedded-H5 shell for quick access |

1. Open the repository's **Releases** page.
2. Download either the Full or Lite APK.
3. On Android, allow installation from the browser/file manager you used.
4. Open the app and register or sign in.
5. If provided, verify the APK against the SHA-256 checksum in the release.

> **Release-only Lite build**
>
> The Lite project source, build output, and APK are intentionally **not stored in this repository**. The Lite APK is distributed only as a Release asset. This repository contains the Full source.
>
> The Lite build uses the same application name, icon, permissions, and H5 endpoint as the Full build; only its source distribution differs.

### 🛠️ Option 3: Build from source

Follow the prerequisites and build steps below.

### ✅ Prerequisites

- HBuilderX with a Vue 3 / uni-app project.
- A Supabase project.
- A Cloudflare Turnstile widget and secret.
- A Cloudflare Worker or a server-side proxy for the Android bridge.
- Optional: a custom Android signing certificate.

### 📥 Import

1. Open HBuilderX.
2. Import the project directory.
3. Set the DCloud AppID in `manifest.json`.
4. Set the application name, version, icon, and splash image.
5. Run to H5 or Android.

### 🔧 Configuration

Edit `utils/config.js`:

```js
export const SUPABASE_URL = 'https://<project>.supabase.co'
export const SUPABASE_ANON_KEY = '<publishable-key>'
export const TURNSTILE_SITE_KEY = '<turnstile-site-key>'
export const BRIDGE_BASE = 'https://<host>/.private/check-in'
export const CAPTCHA_URL = 'https://<host>/.private/check-in/captcha.html'
```

Only public values belong here. Never put a `service_role` key in the client.

### 🗄️ Database Setup

Run the SQL in order:

```text
01_schema.sql
02_functions.sql
03_rls_grants_seed.sql
04_verify.sql
```

For an existing installation created before `captcha_tickets` had the `create_checkin` purpose, also run:

```text
05_fix_captcha_purpose.sql
```

The SQL creates 13 app tables:

```text
majors, profiles, auth_secrets, classes, class_members,
class_invites, checkin_events, checkin_secrets,
checkin_records, checkin_attempts, appeals,
audit_logs, captcha_tickets
```

`majors` is seed data and must not be deleted during a reset.

### ☁️ Edge Function

Deploy:

```bash
supabase functions deploy captcha-verify --no-verify-jwt
supabase secrets set TURNSTILE_SECRET=<turnstile-secret>
```

The Edge Function verifies Turnstile, validates the user JWT, and writes a one-time ticket to `captcha_tickets`.

### 🌉 Android Bridge

Upload the files in `deploy/`:

```text
bridge.html
captcha.html
uni.webview.js
```

Configure either:

- a Cloudflare Worker route such as `<your-host>/checkin-api*`, or
- a same-origin proxy at `.private/check-in/proxy.php`.

The bridge is not a bypass of authentication. It forwards the user's JWT.

### 🌐 H5 Deployment

This repository uses a configurable subpath deployment. The checked-in configuration example is:

```text
/valencia/check-in/
```

Set the public URL in the repository's **About** panel or the latest **Release**. If your deployment path differs, update the matching `publicPath` and `router.base` values in `manifest.json`.

`manifest.json` currently sets:

```json
"h5": {
  "publicPath": "/valencia/check-in/",
  "router": {
    "mode": "hash",
    "base": "/valencia/check-in/"
  }
}
```

Build with HBuilderX:

```text
Release → Website-H5 mobile
```

Upload the **entire** output directory, including `assets` and `static`, to the subdirectory. Before each release, update both `APP_VERSION` in `utils/config.js` and `static/version.json`; the H5 client uses them to detect stale builds. See [docs/H5_DEPLOY.md](docs/H5_DEPLOY.md) for cache, MIME, and SPA fallback rules.

### 📱 Android Build

In `manifest.json`, enable:

- `Geolocation`
- `Barcode`

`Barcode` is required for `uni.scanCode` on release builds. `Camera&Gallery` and `Record` are not required by the current feature set.

Use a production keystore and set a valid DCloud AppID before cloud packaging.

### 🧪 Verification

Use [docs/PRODUCTION_TEST_CHECKLIST.md](docs/PRODUCTION_TEST_CHECKLIST.md) for the full release, H5, Android, concurrency, and security checklist.

At minimum verify:

- anon cannot read business tables;
- a user cannot access another user's records;
- direct table writes fail;
- direct RPC calls enforce ownership;
- Turnstile tickets are single-use;
- old time slices are accepted only when allowed;
- expired or replay codes fail;
- location and device binding fail outside their rules;
- CSV does not execute formulas;
- H5 assets return JavaScript, not HTML.

---

## 🛡️ CAPTCHA Policy

The CAPTCHA policy differs by environment:

| Environment | Registration | Login | Other sensitive actions |
|---|---|---|---|
| H5 | Turnstile | Turnstile | Turnstile |
| Android App | Turnstile before the form | Turnstile | No Turnstile UI |

### 📱 Why the Android app skips most challenges

The Android app is an installed, signed client with a native bridge. Requiring a Turnstile challenge for routine actions such as creating a class, joining a class, publishing a check-in, editing a profile, changing a password, or filing an appeal interrupts the flow repeatedly. For a small campus workflow, that friction is disproportionate.

The app therefore keeps CAPTCHA only at the two entry points where automated account abuse matters most:

- registration;
- login.

Registration is gated before the form: the app completes Turnstile first, and only then reveals the registration fields.

### 🌐 H5 remains unchanged

H5 keeps the inline Turnstile widget for all protected actions. Browser clients are easier to automate, so the stricter policy remains there.

### 🛡️ Server-side fallback

Removing a client challenge does not remove authorization:

- RLS and ownership checks still apply;
- RPCs still validate `auth.uid()`, membership, event state, and payloads;
- check-in attempts are limited to five failures per 30-second slice;
- Supabase Auth applies its own login/registration rate limits;
- one-time CAPTCHA tickets are still consumed whenever a client supplies one;
- audit logs record sensitive management actions.

For App compatibility, the affected RPCs accept a `null` ticket and skip ticket consumption. This is a deliberate usability trade-off; H5 still presents the challenge in its UI. Direct API abuse is mitigated by the server controls above, not by the absence of a client widget.

---

## 🔐 Security Model

- RLS is enabled on all 13 public tables.
- Eight tables have read policies; five sensitive tables deny all direct access:
  - `auth_secrets`
  - `checkin_secrets`
  - `checkin_attempts`
  - `captcha_tickets`
  - `audit_logs`
- Direct table writes are revoked.
- Business RPCs check `auth.uid()`, ownership, participant membership, and event state.
- `checkin_code_hash = SHA-256(event_id | user_id | code)`.
- The server stores only code hashes, never plaintext codes.
- Code slices are 30 seconds; only the current and immediately previous slice are accepted.
- Five failures per user per slice are allowed.
- Turnstile tickets are single-use and purpose-bound.
- Registration and login always require CAPTCHA. H5 also requires CAPTCHA for profile/password changes, class creation/joining, publishing, and appeals; the Android app skips those non-auth challenges.
- Destructive actions are protected by role checks, confirmations, and audit logs.
- Account deletion requires the full student ID, the confirmation text, a checkbox, and a final modal.
- No `service_role` key is present in client code.
- The bridge and proxy only allow `/auth/v1/`, `/rest/v1/`, and `/functions/v1/`.

---

## ⚠️ Known Constraints

- The 1 km location check is intentionally strict. If two devices are genuinely far apart, check-in must fail. The creator can disable location for the event or manually set a participant's status.
- H5 location accuracy depends on the browser; desktop browsers may use IP-based geolocation. Native Android GPS is preferred.
- H5 QR scanning depends on `BarcodeDetector`; unsupported browsers must use manual six-digit input.
- Android CSV export is clipboard-based, not a direct file write.
- There is no map, place search, POI, route, or map SDK.
- There is no email registration, email confirmation flow, password reset, or security question.
- The Supabase project may be shared with other applications. Never delete `auth.users` without a domain/ID filter.
- Existing events created before the timezone fix may contain incorrect UTC values and should be recreated.

---

## 🎨 Third-Party Assets

The four tab-bar images in `static/tabbar/`:

- `home.png`
- `home-active.png`
- `mine.png`
- `mine-active.png`

are derived from **Microsoft Fluent UI Emoji**, which is distributed under the MIT License.

- Source: https://github.com/microsoft/fluentui-emoji
- License: https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE
- Copyright: Microsoft Corporation.

These four images are **excluded from the private license of this repository**. They remain governed by the MIT License and their original copyright notice. The private license applies only to the rest of this project and does not limit any rights granted by the MIT License for those four images.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full MIT text.

---

## 📜 License

**Private License — All Rights Reserved.**

Copyright © 2021-2026 Dorn Hub. All rights reserved.

This project and all associated source code, database schemas, SQL functions, edge functions, deployment scripts, HTML bridge files, documentation, visual assets, and design materials are private.

No permission is granted to any person or organization to:

- copy, reproduce, or mirror this project or any part of it;
- distribute, publish, sublicense, sell, rent, or transfer it;
- modify, adapt, translate, reverse engineer, or create derivative works;
- use it in another product, service, repository, or deployment;
- remove or alter this license or copyright notice.

All rights are reserved by Dorn Hub. Access to this repository does not grant any license, ownership, or usage right.

---

## ©️ Copyright

Copyright © 2021-2026 Dorn Hub. All rights reserved.

---

## 🥤 Closing

A toast with Prickly Pear juice!

Dorn Hub.

---
---

# 🎓 瓦莱希雅大学签到系统

一个面向虚构的瓦莱希雅大学的私有化、生产级签到系统，基于 uni-app（Vue 3）、Supabase 与 Cloudflare Turnstile 构建，同时运行在 H5 与 Android 端。项目使用单一代码库、严格的数据访问规则，以及深红色云母质感视觉语言。

> **私有。** 本仓库及其中所有文件均为 Dorn Hub 的专有财产。未经 Dorn Hub 事先书面授权，任何人不得复制、分发、再许可、修改、发布或使用本项目的任何部分。

---

## 📖 项目简介

系统解决一个真实的校园问题：班级创建者需要发布签到，学生在受控的时间窗口和位置内完成签到，创建者需要可靠的结果、出勤统计，以及针对漏签的补签审批流程。

项目有几个明确的设计选择：

- **不使用邮箱注册。** 学生填写姓名、入学年份、专业和密码，系统自动生成 12 位学号。
- **不提供邮箱找回密码。** 学号是唯一登录标识，系统会反复提醒用户保存学号。
- **在必要位置进行人机验证。** 注册和登录始终受 Cloudflare Turnstile 保护。H5 端的建班、加入班级、发布签到、修改资料/密码、申请补签也需要验证。Android App 为保持已安装应用的流畅体验，跳过这些非登录/注册验证，但服务端授权与限制仍然生效。
- **时间以服务端为准。** 签到状态、动态码、上一时间片、时区换算全部由 PostgreSQL 计算，不依赖手机时钟。
- **严格 RLS。** 业务写入只通过 `SECURITY DEFINER` RPC 完成，直接写表权限被撤销。
- **不依赖地图。** 1 km 校验以发布者发布时的设备位置为圆心，不提供地点搜索、地图瓦片、POI 或地图 Key。
- **移动优先，兼容桌面。** 同一套 H5 可以部署在子目录，Android 原生使用相机与定位。

---

## 🧪 虚构情景声明

本项目涉及的所有应用情景、学校、班级、用户、学号、地点、签到活动、签到记录、补签案例及相关数据均为虚构，仅用于演示、开发和测试。

**“瓦莱希雅大学”（Valencia University）是虚构名称。** 它不对应任何真实大学、教育机构、组织或实体。如有雷同，纯属巧合。

请勿在演示环境中录入真实学生、教职工或学校数据。

---

## ✨ 功能范围

### 👤 身份与访问

- 支持中文、拉丁字符姓名注册。
- 自动生成 12 位学号：入学年份 + 专业代码 + 6 位随机数。
- 密码先在客户端预哈希，再由 Supabase Auth 使用 bcrypt 存储。
- 登录、会话恢复、token 刷新、退出。
- 个人资料、入学年份、专业、修改密码、注销账号。
- 没有邮箱字段、没有忘记密码、没有安全问题。

### 🏫 班级

- 创建班级，生成 8 位邀请码。
- 邀请码有效期：1 小时、24 小时、7 天、30 天。
- 输入邀请码加入班级。
- 查看成员、踢出成员、退出班级、删除班级。
- 创建者视图与普通成员视图分离。

### 📅 签到活动

- 只能为创建者自己的班级发布签到。
- 两种时间方式：
  - **从发布起**：发布后立即开始，持续 1–10080 分钟。
  - **指定时间**：填写当地墙上时间与 IANA 时区，由 PostgreSQL 换算成 UTC。
- 标题默认“所选班级名称 + 签到”（例如“计算机 1 班签到”），文字说明可选；支持突击签到、位置校验、可选设备绑定。
- 签到方式：六位数字、二维码、两者都允许。
- 创建者不参与签到，也不计入出勤统计。
- 未开始的签到可以删除；正在签到的签到可以提前结束。

### 🔢 实时签到

- 服务端派生 30 秒轮换的六位码。
- 二维码内容就是这六位数字。
- 允许上一时间片，并标记为上一轮码。
- 同一用户同一时间片最多 5 次失败。
- 客户端只发送 `SHA-256(event_id | user_id | code)`。
- 输入满 6 位自动提交，没有提交按钮。
- App 使用原生 `uni.scanCode`；H5 在支持时使用 `BarcodeDetector`，否则手输。
- 可选 1 km 位置校验，提交前显示距离与定位精度。
- 可选设备绑定，开启前有明确风险提示。

### 📝 补签

- 已结束且未签到的学生可以申请补签，理由 10–500 字。
- App 自动完成 Turnstile，H5 保持内联验证。
- 最多 3 次申请。
- 待审批申请可以撤回。
- 创建者可以批准或拒绝，并填写备注。
- 批准后记录变为已签到，方式为补签。
- 拒绝后保持未签到，并显示明确标识。
- 学生端“我申请的补签”和创建者端“我收到的补签申请”均可追踪。

### 📊 结果与统计

- “我发布的签到”列表。
- 单场结果：状态、方式、上一轮码、距离、设备、补签状态。
- 班级成员出勤统计，补签计入出勤。
- 成员每场签到的明细。
- CSV 导出：
  - H5：直接下载。
  - Android：复制 CSV 文本，可粘贴到表格软件。
- CSV 公式注入防护：以 `=`、`+`、`-`、`@` 开头的单元格会加前缀。

### 🧊 缓存与刷新

- 首页每个冷启动只自动加载一次，tab 与筛选切换使用内存缓存。
- 下拉刷新才重新请求。
- 详情页每次进入都从服务端获取最新数据。
- 详情变更会回写首页缓存，并在进行中/未开始/已结束之间移动。
- App 签到详情不再定时轮询 bridge；使用下拉刷新或刷新按钮。

---

## 🧱 技术栈

| 层次 | 技术 |
|---|---|
| 客户端 | uni-app、Vue 3、Composition API |
| 目标平台 | H5、Android App |
| 样式 | Scoped CSS、CSS 变量、云母/玻璃卡片 |
| 认证 | Supabase Auth（GoTrue） |
| 数据库 | Supabase PostgreSQL |
| 数据访问 | PostgREST RPC + 严格 RLS |
| 边缘函数 | Supabase Edge Function（Deno） |
| 人机验证 | Cloudflare Turnstile |
| 手机桥接 | 隐藏 web-view、同源代理、Cloudflare Worker |
| 二维码 | 内置二维码编码器 |
| CSV | 纯客户端生成 |

客户端不依赖运行时 npm 包。

---

## 🏗️ 架构

```text
uni-app 客户端
  ├── H5：直连 Supabase REST/Auth
  └── Android：隐藏 BridgeHost web-view
        └── bridge.html
              ├── Cloudflare Worker（优先）
              └── 同源代理（兜底）
                    └── Supabase REST/Auth/Edge Functions
```

### 🔐 服务端权威设计

- 所有业务写入通过 `SECURITY DEFINER` RPC。
- `anon` 与 `authenticated` 的直接写表权限被撤销。
- RLS 是读取与辅助访问的最后边界。
- 客户端永远拿不到 `service_role`。
- 桥接只转发 anon key 或当前用户 JWT，不会替换成服务端密钥。
- 签到码由服务端密钥派生。
- 只传输和存储签到码哈希。

### 🕒 时区模型

- 指定时间发布时，客户端提交墙上时间与 IANA 时区。
- 服务端使用 PostgreSQL `timestamp at time zone` 换算成 UTC。
- 数据库中的事件时间全部是 UTC。
- 用户界面按设备本地时区显示；App 优先读取原生 Android/iOS 时区。

### 🏠 首页数据模型

- `get_home_checkins()` 一次返回进行中、未开始、已结束三组数据。
- 客户端缓存三组数据，已结束筛选在本地完成。
- 详情页调用一次 `get_checkin_event`，同时拿到活动、参与记录、人数、服务器时间和创建者签到码数据。

---

本仓库页面目录只包含 Full 应用。轻量版外壳不属于本仓库，其 APK 仅通过 GitHub Releases 分发。

---

## 🎨 视觉语言

界面遵循项目最初确定的参考方向：

- 主色深红：`#A51515`。
- 深红渐变：`#B21B1B` → `#6F0C0C`。
- 暖纸底色：`#F4EFE9`。
- 云母/玻璃卡片：半透明、模糊、细边框、克制阴影。
- 品牌与大标题使用衬线字体。
- 动效曲线：`cubic-bezier(0.05, 0.7, 0.1, 1)`。
- 充足留白、清晰层级、移动优先。
- 不使用厚重仪表盘、不堆图表、不添加装饰性噪声。
- 应用图标与登录页共用红底圆角 `Va` 标记。

设计语言参考校园活动报名平台与 Dorn Hub 的 UI 规范，同时保持本项目自己的识别度。

---

## 📁 目录结构

```text
.
├── App.vue
├── main.js
├── manifest.json
├── pages.json
├── components/
├── composables/
├── pages/
├── utils/
├── supabase/
│   ├── sql/
│   └── functions/captcha-verify/
├── deploy/
├── hybrid/html/404.html
├── static/
├── docs/
└── README.md
```

---

## 🚀 快速开始

### 🌐 方式一：直接访问在线 H5

使用仓库 **About** 面板或最新 **Release** 中公布的在线地址：

```text
https://<在线域名>/<部署路径>/
```

无需安装。打开地址后注册账号或直接登录。

### 📱 方式二：下载 Android APK 安装

最新 **Release** 提供两个 Android 安装包：

| 安装包 | 用途 |
|---|---|
| `valencia-checkin-full-v1.0.0.apk` | 完整应用，包含完整的原生与 H5 实现 |
| `valencia-checkin-lite-v1.0.0.apk` | 轻量版，内嵌 H5 的快速入口 |

1. 打开仓库的 **Releases** 页面。
2. 下载 Full 或 Lite APK。
3. 在 Android 上允许当前浏览器或文件管理器安装未知来源应用。
4. 安装后打开 App，注册或登录。
5. 如 Release 提供了 SHA-256 校验值，安装前先核对。

> **轻量版仅通过 Release 分发**
>
> 轻量版源码、构建产物和 APK **不存放在本仓库中**，只作为 Release 附件分发。本仓库只包含 Full 源码。
>
> 轻量版使用与 Full 相同的应用名称、图标、权限和 H5 入口，仅源码分发方式不同。

### 🛠️ 方式三：从源码构建

按下面的前置条件与构建步骤操作。

### ✅ 前置条件

- 安装 HBuilderX。
- 准备 Supabase 项目。
- 准备 Cloudflare Turnstile Widget 与 Secret。
- 准备 Cloudflare Worker 或服务器端代理，用于 Android 桥接。
- 正式 Android 打包需要自己的签名证书。

### 📥 导入

1. 打开 HBuilderX。
2. 导入本项目目录。
3. 在 `manifest.json` 设置 DCloud AppID。
4. 设置应用名称、版本、图标、启动图。
5. 运行到 H5 或 Android。

### 🔧 配置

编辑 `utils/config.js`：

```js
export const SUPABASE_URL = 'https://<project>.supabase.co'
export const SUPABASE_ANON_KEY = '<publishable-key>'
export const TURNSTILE_SITE_KEY = '<turnstile-site-key>'
export const BRIDGE_BASE = 'https://<host>/.private/check-in'
export const CAPTCHA_URL = 'https://<host>/.private/check-in/captcha.html'
```

这里只能放公开配置。绝对不要把 `service_role` 放进客户端。

### 🗄️ 数据库

按顺序执行：

```text
01_schema.sql
02_functions.sql
03_rls_grants_seed.sql
04_verify.sql
```

如果数据库是在 `captcha_tickets` 还没有 `create_checkin` 用途时创建的，再执行：

```text
05_fix_captcha_purpose.sql
```

数据库共 13 张业务表：

```text
majors, profiles, auth_secrets, classes, class_members,
class_invites, checkin_events, checkin_secrets,
checkin_records, checkin_attempts, appeals,
audit_logs, captcha_tickets
```

`majors` 是种子字典，清空测试数据时不要删除。

### ☁️ Edge Function

```bash
supabase functions deploy captcha-verify --no-verify-jwt
supabase secrets set TURNSTILE_SECRET=<turnstile-secret>
```

函数负责校验 Turnstile、验证用户 JWT，并写入一次性 `captcha_tickets`。

### 🌉 Android 桥接

上传 `deploy/` 中的：

```text
bridge.html
captcha.html
uni.webview.js
```

并配置：

- Cloudflare Worker 路由，例如 `<your-host>/checkin-api*`；或
- 同源代理 `.private/check-in/proxy.php`。

桥接不是绕过认证，它只转发用户 JWT。

### 🌐 H5 部署

本项目使用可配置的子路径部署。当前仓库中的配置示例是：

```text
/valencia/check-in/
```

在线地址请填写在仓库 **About** 面板或最新 **Release** 中。如果实际部署路径不同，请同步修改 `manifest.json` 里的 `publicPath` 和 `router.base`。

`manifest.json` 当前配置：

```json
"h5": {
  "publicPath": "/valencia/check-in/",
  "router": {
    "mode": "hash",
    "base": "/valencia/check-in/"
  }
}
```

HBuilderX 发行：

```text
发行 → 网站-H5手机版
```

把完整产物（包含 `assets`、`static`）上传到该子目录。每次发版前同时更新 `utils/config.js` 的 `APP_VERSION` 和 `static/version.json`，H5 客户端会用它们检查旧构建。缓存、MIME、SPA 回退规则见 [docs/H5_DEPLOY.md](docs/H5_DEPLOY.md)。

### 📱 Android 打包

在 `manifest.json` 中启用：

- `Geolocation`
- `Barcode`

`Barcode` 是 `uni.scanCode` 正式包扫码所必需；`Camera&Gallery` 与 `Record` 当前不需要。

正式打包必须使用自己的 keystore，并填写有效 DCloud AppID。

### 🧪 验证

完整验收清单：

[docs/PRODUCTION_TEST_CHECKLIST.md](docs/PRODUCTION_TEST_CHECKLIST.md)

至少验证：

- 匿名用户不能读取业务表；
- 用户不能读取其他用户的数据；
- 直接写表失败；
- 直接调用 RPC 仍会校验归属；
- Turnstile 票据只能使用一次；
- 旧时间片只在允许时成功；
- 过期码和重放码失败；
- 位置与设备绑定在规则外失败；
- CSV 不执行公式；
- H5 assets 返回 JavaScript，而不是 HTML。

---

## 🛡️ 人机验证策略

不同环境采用不同策略：

| 环境 | 注册 | 登录 | 其他敏感操作 |
|---|---|---|---|
| H5 | Turnstile | Turnstile | Turnstile |
| Android App | 先验证，后显示表单 | Turnstile | 不显示验证 |

### 📱 为什么 Android App 减少验证

Android App 是已安装、已签名的客户端，并通过原生桥接访问服务。如果建班、加入班级、发布签到、修改资料、修改密码、申请补签等日常操作每次都弹 Turnstile，会频繁打断流程，对校园签到场景来说体验成本过高。

因此 App 只在两个最需要防止自动化账号滥用的入口保留验证：

- 注册；
- 登录。

注册采用“先验证、后填表”：先完成 Turnstile，通过后才显示注册表单。

### 🌐 H5 保持不变

H5 端所有受保护操作继续使用内联 Turnstile。浏览器环境更容易被自动化，因此保留更严格的策略。

### 🛡️ 服务端兜底

去掉客户端验证不等于去掉授权：

- RLS 与归属校验仍然生效；
- RPC 仍校验 `auth.uid()`、成员身份、活动状态和参数；
- 签到尝试限制为每个 30 秒时间片最多 5 次失败；
- Supabase Auth 自身有登录/注册速率限制；
- 客户端提供一次性 ticket 时仍会消费；
- 敏感管理操作写入审计日志。

为兼容 App，相关 RPC 允许 `p_captcha_ticket = null` 并跳过 ticket 消费。这是明确的体验取舍；H5 页面仍然展示验证。接口滥用由上述服务端控制兜底，而不是依赖客户端是否显示验证组件。

---

## 🔐 安全模型

- 13 张 public 表全部启用 RLS。
- 8 张表有读取策略；5 张敏感表完全拒绝直接访问：
  - `auth_secrets`
  - `checkin_secrets`
  - `checkin_attempts`
  - `captcha_tickets`
  - `audit_logs`
- 直接写表权限全部撤销。
- 业务 RPC 会校验 `auth.uid()`、创建者身份、成员身份、活动状态。
- `checkin_code_hash = SHA-256(event_id | user_id | code)`。
- 服务端只存签到码哈希，不存明文码。
- 时间片 30 秒，只接受当前和上一时间片。
- 同一用户同一时间片最多 5 次失败。
- Turnstile 票据一次性、用途绑定。
- 注册和登录始终需要人机验证。H5 端的修改资料/密码、建班、加入班级、发布签到、申请补签也需要验证；Android App 跳过这些非登录/注册验证。
- 删除类操作依赖角色校验、二次确认和审计日志。
- 注销账号必须输入完整学号、确认文字、勾选确认，并再次弹窗确认。
- 客户端代码中没有 `service_role`。
- 桥接与代理只允许 `/auth/v1/`、`/rest/v1/`、`/functions/v1/`。

---

## ⚠️ 已知限制

- 1 km 位置校验是严格的。如果两台设备确实相距很远，签到必须失败。创建者可以关闭位置校验，或手动修改成员状态。
- H5 定位精度取决于浏览器；桌面浏览器可能使用 IP 定位。Android 原生 GPS 更可靠。
- H5 扫码依赖 `BarcodeDetector`，不支持的浏览器需要手动输入六位码。
- Android CSV 是复制到剪贴板，不是直接写文件。
- 不提供地图、地点搜索、POI、路线或地图 SDK。
- 不提供邮箱注册、邮箱确认、密码找回或安全问题。
- Supabase 项目可能与其他应用共用。删除 `auth.users` 时必须按域名/ID 过滤，禁止无条件删除全表。
- 在时区修复前创建的旧活动可能保存了错误的 UTC 值，建议重新发布。

---

## 🎨 第三方素材

`static/tabbar/` 下的四张底部 tab 图标：

- `home.png`
- `home-active.png`
- `mine.png`
- `mine-active.png`

来自 **Microsoft Fluent UI Emoji**，按 MIT 协议分发。

- 仓库：https://github.com/microsoft/fluentui-emoji
- 许可证：https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE
- 版权：Microsoft Corporation.

这四张图片**不属于本仓库私有许可证的声明范围**，仍受 MIT 协议及其原始版权声明约束。本仓库的私有许可证只适用于项目其余部分，不限制 MIT 协议对这四张图片授予的任何权利。

完整 MIT 文本见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

## 📜 许可证

**私有许可证 — 保留所有权利。**

Copyright © 2021-2026 Dorn Hub. All rights reserved.

本项目及其所有源代码、数据库结构、SQL 函数、边缘函数、部署脚本、HTML 桥接文件、文档、视觉资产与设计材料均为私有。

任何人都不得：

- 复制、重现或镜像本项目或其任何部分；
- 分发、发布、再许可、出售、出租或转让本项目；
- 修改、改编、翻译、逆向工程或创建衍生作品；
- 将本项目用于其他产品、服务、仓库或部署；
- 删除或修改本许可证或版权声明。

所有权利归 Dorn Hub 所有。访问本仓库不授予任何许可、所有权或使用权。

---

## ©️ 版权

Copyright © 2021-2026 Dorn Hub. All rights reserved.

---

## 🥤 结语

敬上一杯刺梨汁

Dorn Hub。
