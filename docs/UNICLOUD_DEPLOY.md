# uniCloud 接入与部署

H5 和 Android 通过 `uniCloud.callFunction` 调用支付宝云中的 `valencia-checkin`。本项目已部署到服务空间 `u1`（`env-00jy729wygaj`），当前 DCloud 应用标识为 `__UNI__4ED33A5`。

## 关联服务空间

1. 在 HBuilderX 导入项目，登录有权访问目标支付宝云空间的 DCloud 账号。
2. 右键 `uniCloud-alipay`，在「关联云服务空间」里确认目标空间。
3. 使用已部署的 `u1` 时可直接运行。切换到空空间时按下一节初始化数据库并上传云函数。

## 初始化及更新后端

1. 首次部署到空空间时，右键 `uniCloud-alipay/database`，选择「初始化云数据库」。部署会创建 13 个 `vu_` 集合并导入 12 条专业数据。使用中的空间按需更新目标集合的结构、索引或字典数据。 [DCloud 数据库初始化说明](https://doc.dcloud.net.cn/uniCloud/hellodb.html#init-db)
2. 右键 `uniCloud-alipay/cloudfunctions/valencia-checkin`，上传云函数。账号、班级、签到、补签、统计和图片验证码共用这个入口。
3. 在目标空间确认集合和云函数均已上传。可以用 HBuilderX 的「上传并运行」传入 `{"method":"get_server_time"}`，检查返回的 `ok` 为 `true`，并包含 `epoch_ms`。后端维护时也可以在客户端加载图片验证码，确认实际连接目标空间。

## 运行与发行

- H5 调试通过 HBuilderX 运行到浏览器，并使用生成的 `localhost` 地址。正式发行的子目录、跨域配置、缓存和验收见 [H5 部署说明](H5_DEPLOY.md)。
- Android 调试通过 HBuilderX 运行到手机或模拟器。正式发行前确认应用标识、包名、版本、签名，以及 `Barcode` 和 `Geolocation` 模块，随后使用原生应用云端打包。 [DCloud 应用运行与发行说明](https://uniapp.dcloud.net.cn/quickstart-hx)
- 两端联调时，在 HBuilderX 运行控制台选择连接云端云函数。打开登录页并加载图片验证码，再用测试账号验证业务流程。 [DCloud 云函数运行与调试说明](https://doc.dcloud.net.cn/uniCloud/rundebug.html)

此前使用 `__UNI__565F905` 发行的 Android 应用若需覆盖更新，需取得该应用的项目成员权限，并沿用原包名和签名。

## 首次使用与验收

注册两个测试账号，分别作为班级创建者和学生。创建者建班后分享邀请码。学生加入班级后参与签到。活动结束后再用漏签学生申请补签，由创建者审批并核对出勤统计。 [发布验收与测试清单](PRODUCTION_TEST_CHECKLIST.md)

旧 Supabase 的账号、班级和签到记录尚未迁移。旧登录凭据和业务数据需要单独迁移。测试和新部署可以直接在 uniCloud 注册账号。

集合用途、数据权限和签到记录口径见 [云数据库说明](DATABASE.md)。
