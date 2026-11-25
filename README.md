# 🎓 Valencia University Check-in System — DCloud Edition

A private attendance system for the fictional Valencia University, built with uni-app (Vue 3) and **uniCloud on Alipay Cloud**. It runs on H5 and Android, and is maintained as a parallel implementation alongside the Supabase edition.

> **Private.** This repository and every file in it are proprietary. No permission is granted to copy, distribute, sublicense, modify, publish, or use any part of this project without prior written authorization from Dorn Hub.

---

## 🔀 Parallel Branch

The Supabase implementation is maintained in its own branch with equal status. This README documents only the DCloud / uniCloud implementation; the Supabase backend, schema, authentication, and deployment are intentionally not repeated here.

Both branches share the same product scope, visual direction, and private license. They are independent implementations.

---

## 🚀 Quick Start

### 🌐 Open the online H5

```text
https://dornhub.eu.org/valencia/check-in-dcloud/
```

No installation is required. Register an account or sign in.

### 📱 Install the Android APK

Open the repository's **Releases** page and download:

```text
valencia-checkin-dcloud-v1.0.0.apk
```

The Release also provides the H5 archive:

```text
valencia-checkin-dcloud-h5-v1.0.0.zip
```

Allow installation from your browser or file manager, then open the app and register or sign in.

### 🛠️ Run from source

1. Use HBuilderX with Vue 3 and uniCloud support, signed in with an account that can access the target Alipay cloud space.
2. Import this project.
3. Link `uniCloud-alipay` to the `u1` space (`env-00jy729wygaj`), or create a new space and deploy the database and cloud function there.
4. Use the deployed database and `valencia-checkin` cloud function for the existing `u1` environment.
5. Run H5 in a browser, or connect an Android device and run to the device or emulator. In the run console, choose the cloud function connection.

Register one class-owner account and one student account for testing. The owner creates a class and shares the invite code; the student joins, the owner publishes a check-in, and the student submits the code. Results and appeals are available after the event ends.

---

## ☁️ Cloud Deployment

### 🗄️ Database and cloud function

1. Link `uniCloud-alipay` to the target Alipay cloud space.
2. For an empty space, right-click `uniCloud-alipay/database` and choose **Initialize cloud database**. This creates 13 collections prefixed with `vu_`, uploads their schemas and indexes, and imports 12 majors into `vu_majors`.
3. Upload `uniCloud-alipay/cloudfunctions/valencia-checkin`. Login, classes, check-ins, appeals, permissions, and image CAPTCHA share this function.
4. Re-run the client, open the login page, and load the image CAPTCHA. Then verify registration, class creation, joining, check-in, and appeals with test accounts.

### 🌐 H5 release and hosting

1. In HBuilderX, use **Release → Website-H5**; the output is written to `unpackage/dist/build/web`.
2. Deploy the complete output to:

```text
https://dornhub.eu.org/valencia/check-in-dcloud/
```

Keep `index.html`, `assets/`, and `static/`. If the path changes, update `manifest.json` → `h5.publicPath` and `h5.router.base` before rebuilding. The router uses hash mode.

3. For a custom domain or external host, add the actual frontend origin to the cloud space's **Web safe domain** configuration. Include a non-default port when applicable. The default uniCloud hosting domain and `localhost` are available for testing.
4. After deployment, open the real site, load the CAPTCHA, and verify that static resources and cloud function calls work.

Before each release, update `APP_VERSION` in `utils/config.js` and `version` in `static/version.json` to the same new value.

### 📱 Android build

1. The DCloud App ID is `__UNI__4ED33A5`. The packaging account needs access to that application.
2. Enable `Barcode` and `Geolocation` in the App modules.
3. Use **Release → Native App Cloud Packaging**, select Android, then verify login, scanning, and location permissions on a real device.

If you need to update an existing Android installation, keep its original package name and signing certificate. Changing only the DCloud App ID is not enough for an in-place update.

---

## ✨ Features

- Registration with name, enrollment year, major, and password; the system generates a 12-digit student ID (4-digit year + 2-digit major code + 6 random digits).
- Login, session restore, profile and password changes, logout, and account deletion. There is no email field and no email-based password recovery; users must keep their student ID.
- Class owners can create classes, view members, remove members, and delete classes. Students join with an 8-character invite code and can leave. Invite validity is 1 hour, 24 hours, 7 days, or 30 days.
- Owners publish check-ins for their own classes: start immediately or at a chosen local date/time and timezone, up to 7 days. Supports six-digit code, QR code, or both; surprise mode; 1 km location check; and device binding. Owners can delete not-started events or end active events early. Owners are excluded from attendance.
- The dynamic code rotates every 30 seconds, and the QR code contains the same six digits. The current and previous slices are accepted, with previous-slice use marked. Each participant gets at most five failures per slice; six digits submit automatically. Android uses native scanning; H5 uses the browser's `BarcodeDetector` when available, with manual input as fallback.
- After an event ends, a student who missed it can submit a 10–500 character appeal. Pending appeals can be withdrawn; each student may keep at most three active appeals per event. Owners approve or reject with a note; approved appeals count as attendance.
- Owners can view per-event results, class attendance, and member attendance detail. H5 downloads CSV; Android copies CSV content to the clipboard.
- The home screen groups active, upcoming, and ended events and reuses its cache when switching filters. Pull-to-refresh fetches fresh data, and the detail page always uses the server's latest result.

---

## 🛡️ CAPTCHA

| Platform | Registration | Login | Create/join class, publish, profile/password, appeal |
|---|---|---|---|
| H5 | Verify first, then form | Image CAPTCHA | Image CAPTCHA |
| Android | Verify first, then form | Image CAPTCHA | Direct operation |

The cloud function generates the image CAPTCHA. A successful verification returns a ticket valid for five minutes and usable once. Tickets are bound to the operation purpose; for signed-in operations they are also bound to the current account. The cloud function validates the session, role, and data permissions for every business operation.

---

## 🧱 Architecture and Layout

H5 and Android call `uniCloud.callFunction` to invoke `valencia-checkin`. The function runs in the Alipay cloud Node.js environment and reads/writes the cloud database. Collection permissions deny direct client reads and writes. Passwords are stored as salted `scrypt` digests; the cloud function issues and validates login sessions.

Event state and dynamic codes use server time. For absolute-time publishing, the cloud function converts the selected timezone's local date/time to UTC; pages display it in the device's local timezone. The client submits a `SHA-256` digest of the event ID, user ID, and six-digit code. Location checks use the publisher's device location as the center and a 1 km radius.

| Path | Purpose |
|---|---|
| `pages/` | Login, home, classes, check-ins, appeals, and profile |
| `components/`, `composables/` | Shared components and session state |
| `utils/authApi.js` | Cloud function call entry point |
| `uniCloud-alipay/cloudfunctions/valencia-checkin/` | Login, classes, check-ins, appeals, permissions, and image CAPTCHA |
| `uniCloud-alipay/database/` | Collection schemas, indexes, and the majors dictionary |
| `manifest.json`, `pages.json` | App, platform, page, and route configuration |
| `static/` | Icons, splash images, and H5 files |

---

## 🎨 Design

The UI uses deep red `#A51515` and warm background `#F4EFE9`, with translucent cards, serif headings, and a mobile-first layout. The app icon and login page share the same red rounded-square `Va` mark. The visual direction follows Dorn Hub's interface conventions.

---

## 🧪 Fictional Scenario Notice

“Valencia University” (瓦莱希雅大学) is a fictitious name. All example schools, classes, people, student IDs, locations, attendance records, and appeal cases are used only for demonstration, development, and testing. Any resemblance to real institutions, people, or events is purely coincidental. Do not enter real student, staff, or institutional data into demonstration environments.

---

## 🎨 Third-Party Assets

The four tab-bar images in `static/tabbar/`:

- `home.png`
- `home-active.png`
- `mine.png`
- `mine-active.png`

come from Microsoft Fluent UI Emoji, copyright Microsoft Corporation, and are used under the MIT License and its original copyright notice.

- Source: https://github.com/microsoft/fluentui-emoji
- License: https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE

These four images are **excluded from this repository's private license**. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full MIT text.

---

## 📜 License

**Private License — All Rights Reserved.**

Copyright © 2021-2026 Dorn Hub. All rights reserved.

This project and all associated source code, database structures, cloud functions, deployment scripts, documentation, visual assets, and design materials are private and proprietary. No permission is granted to copy, reproduce, distribute, sublicense, sell, modify, adapt, reverse engineer, create derivative works from, or use this project in another product, service, repository, or deployment. Access to this repository does not grant any license, ownership, or usage right.

The four Fluent UI Emoji images remain under the MIT License as described above. All other rights are reserved by Dorn Hub.

---

## ©️ Copyright

Copyright © 2021-2026 Dorn Hub. All rights reserved.

---

## 🥤 Closing

A toast with Prickly Pear juice!

Dorn Hub.

---
---

# 🎓 瓦莱希雅大学签到系统 — DCloud 版

一个面向虚构的瓦莱希雅大学的私有签到系统，基于 uni-app（Vue 3）与 **uniCloud 支付宝云**，运行在 H5 和 Android 端。本实现与 Supabase 版并行维护。

> **私有。** 本仓库及其中所有文件均为 Dorn Hub 的专有财产。未经 Dorn Hub 事先书面授权，任何人不得复制、分发、再许可、修改、发布或使用本项目的任何部分。

---

## 🔀 并行分支

Supabase 实现维护在其自己的分支中，与本分支地位相同。本 README 只介绍 DCloud / uniCloud 实现；Supabase 的后端、数据库结构、认证和部署方式不在本文重复。

两个分支共享相同的产品范围、视觉方向和私有许可证。它们是独立实现。

---

## 🚀 快速开始

### 🌐 访问在线 H5

```text
https://dornhub.eu.org/valencia/check-in-dcloud/
```

无需安装。打开地址后注册账号或直接登录。

### 📱 安装 Android APK

打开仓库的 **Releases** 页面，下载：

```text
valencia-checkin-dcloud-v1.0.0.apk
```

Release 同时提供 H5 压缩包：

```text
valencia-checkin-dcloud-h5-v1.0.0.zip
```

允许浏览器或文件管理器安装应用，然后打开 App 注册或登录。

### 🛠️ 从源码运行

1. 使用支持 Vue 3 和 uniCloud 的 HBuilderX，并登录有权访问目标支付宝云空间的 DCloud 账号。
2. 导入本项目。
3. 将 `uniCloud-alipay` 关联到 `u1` 空间（`env-00jy729wygaj`），或新建空间后部署数据库和云函数。
4. 现有 `u1` 环境可直接使用已部署的数据库和 `valencia-checkin` 云函数。
5. 在浏览器中运行 H5，或连接 Android 设备后运行到手机/模拟器。运行控制台选择云端云函数连接。

首次测试时注册一个班级创建者账号和一个学生账号。创建者建班并分享邀请码，学生加入，创建者发布签到，学生提交签到。活动结束后可以查看结果和补签。

---

## ☁️ 云端部署

### 🗄️ 数据库与云函数

1. 将 `uniCloud-alipay` 关联到目标支付宝云服务空间。
2. 空空间首次部署时，右键 `uniCloud-alipay/database`，选择「初始化云数据库」。会创建 13 个以 `vu_` 开头的集合，上传集合结构和索引，并向 `vu_majors` 导入 12 个专业。
3. 上传 `uniCloud-alipay/cloudfunctions/valencia-checkin`。登录、班级、签到、补签、权限和图片验证码共用这个云函数。
4. 重新运行客户端，打开登录页并加载图片验证码，然后用测试账号核对注册、建班、入班、签到和补签。

### 🌐 H5 发行与托管

1. 在 HBuilderX 选择「发行 → 网站-H5」，产物位于 `unpackage/dist/build/web`。
2. 将完整产物部署到：

```text
https://dornhub.eu.org/valencia/check-in-dcloud/
```

保留 `index.html`、`assets/` 和 `static/`。如果路径变化，先同步修改 `manifest.json` 的 `h5.publicPath` 和 `h5.router.base` 再重新构建。当前使用 hash 路由。

3. 使用自定义域名或外部托管时，把实际前端源加入云空间的 **Web 安全域名** 配置；使用非默认端口时一并填写。uniCloud 默认托管域名和 `localhost` 可用于测试。
4. 发布后通过实际地址打开登录页，加载验证码，确认静态资源和云函数调用正常。

发版前将 `utils/config.js` 的 `APP_VERSION` 和 `static/version.json` 的 `version` 更新为同一个新值。

### 📱 Android 打包

1. DCloud 应用标识为 `__UNI__4ED33A5`，打包账号需要拥有该应用权限。
2. 在 App 模块中启用 `Barcode` 和 `Geolocation`。
3. 在 HBuilderX 选择「发行 → 原生 App 云端打包」，选择 Android，生成 APK 后在真机验证登录、扫码和定位权限。

如果需要覆盖更新已有的 Android 安装，必须沿用原包名和签名证书。只修改 DCloud 应用标识不足以覆盖安装。

---

## ✨ 功能

- 注册时填写姓名、入学年份、专业和密码，系统生成 12 位学号（4 位入学年份 + 2 位专业代码 + 6 位随机数字）。
- 支持登录、会话恢复、修改资料和密码、退出及注销账号。没有邮箱字段，也没有邮箱找回密码；用户需要保存好学号。
- 班级创建者可以建班、查看成员、移除成员和删除班级。学生凭 8 位邀请码入班，也可以退出。邀请码有效期可选 1 小时、24 小时、7 天或 30 天。
- 创建者可以为自己的班级发布签到：发布后立即开始，或指定当地日期、时间与时区，最长 7 天。支持六位数字、二维码或两者并用；支持突击签到、1 公里位置校验和设备绑定。创建者可以删除未开始活动或提前结束进行中的活动。创建者不计入出勤统计。
- 动态签到码每 30 秒轮换，二维码包含同一组六位数字。接受当前和上一时间片，并标记上一时间片。每位参与者每个时间片最多输错 5 次；输满六位自动提交。Android 使用原生扫码；H5 在支持时使用浏览器 `BarcodeDetector`，不支持时手动输入。
- 签到结束后，漏签学生可以提交 10–500 字补签理由。待审批申请可以撤回；每名学生每场活动最多保留 3 次未撤回申请。创建者可以批准或拒绝并填写备注；批准的补签计入出勤。
- 创建者可以查看单场结果、班级出勤和成员明细。H5 下载 CSV；Android 将 CSV 内容复制到剪贴板。
- 首页按进行中、未开始、已结束分组，切换筛选时复用缓存。下拉刷新重新请求，详情页以服务端最新结果为准。

---

## 🛡️ 人机验证

| 平台 | 注册 | 登录 | 建班/入班、发布、资料/密码、补签 |
|---|---|---|---|
| H5 | 先验证，再填写表单 | 图片验证码 | 图片验证码 |
| Android | 先验证，再填写表单 | 图片验证码 | 直接操作 |

图片验证码由云函数生成。验证成功后获得一张五分钟内有效、限用一次的票据。票据绑定操作用途；已登录操作的票据还绑定当前账号。云函数在每次业务操作时校验会话、角色和数据权限。

---

## 🧱 架构与目录

H5 和 Android 都通过 `uniCloud.callFunction` 调用 `valencia-checkin`。云函数运行在支付宝云的 Node.js 环境，读写云数据库。集合权限禁止客户端直接读写。密码以加盐后的 `scrypt` 摘要保存；登录会话由云函数签发和校验。

活动状态和动态码以服务器时间为准。指定时间发布时，云函数将所选时区的日期和时间换算为 UTC；页面按设备当地时区显示。签到时客户端提交活动标识、用户标识和六位码生成的 `SHA-256` 摘要。位置校验以发布者设备位置为圆心，半径 1 公里。

| 路径 | 用途 |
|---|---|
| `pages/` | 登录、首页、班级、签到、补签和个人资料 |
| `components/`、`composables/` | 公共组件和会话状态 |
| `utils/authApi.js` | 云函数调用入口 |
| `uniCloud-alipay/cloudfunctions/valencia-checkin/` | 登录、班级、签到、补签、权限和图片验证码 |
| `uniCloud-alipay/database/` | 集合结构、索引和专业字典 |
| `manifest.json`、`pages.json` | 应用、平台、页面和路由配置 |
| `static/` | 图标、启动图和 H5 文件 |

---

## 🎨 视觉设计

界面采用深红主色 `#A51515`、暖色背景 `#F4EFE9`，使用半透明卡片、衬线标题和移动端优先布局。应用图标和登录页使用同一个红底圆角 `Va` 标记。视觉方向参考 Dorn Hub 的界面规范。

---

## 🧪 虚构情景声明

“瓦莱希雅大学”（Valencia University）为虚构名称。示例学校、班级、人员、学号、地点、签到记录及补签案例均用于演示、开发和测试。如有雷同，纯属巧合。请勿在演示环境录入真实学生、教职工或学校数据。

---

## 🎨 第三方素材

`static/tabbar/` 下的四张底部 tab 图标：

- `home.png`
- `home-active.png`
- `mine.png`
- `mine-active.png`

来自 Microsoft Fluent UI Emoji，版权归 Microsoft Corporation 所有，适用 MIT 许可证及原始版权声明。

- 仓库：https://github.com/microsoft/fluentui-emoji
- 许可证：https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE

这四张图片**不在本仓库私有许可证的声明范围内**。完整 MIT 文本见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

## 📜 许可证

**私有许可证 — 保留所有权利。**

Copyright © 2021-2026 Dorn Hub. All rights reserved.

本项目及其所有源代码、数据库结构、云函数、部署脚本、文档、视觉资产和设计材料均为 Dorn Hub 的专有财产。未经 Dorn Hub 事先书面授权，任何人不得复制、重现、分发、再许可、出售、修改、改编、翻译、逆向工程、创建衍生作品，或将本项目用于其他产品、服务、仓库或部署。访问本仓库不授予任何许可、所有权或使用权。

四张 Fluent UI Emoji 图片仍按上述 MIT 许可证使用。其余所有权利归 Dorn Hub 所有。

---

## ©️ 版权

Copyright © 2021-2026 Dorn Hub. All rights reserved.

---

## 🥤 结语

敬上一杯刺梨汁

Dorn Hub。
