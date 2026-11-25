# H5 部署说明

H5 通过项目关联的 uniCloud 支付宝云调用 `valencia-checkin`。当前项目的服务空间为 `u1`，网站路径为 `/valencia/check-in/`。首次配置后端请先完成 [uniCloud 接入与部署](UNICLOUD_DEPLOY.md)。

## 本地运行与构建

1. 用 HBuilderX 导入项目，确认 `uniCloud-alipay` 已关联目标空间。
2. 调试时选择「运行到浏览器」，在控制台切换为连接云端云函数。浏览器使用 HBuilderX 给出的 `localhost` 地址。
3. 在「发行」菜单选择网站发行。当前构建输出为 `unpackage/dist/build/web`。 [DCloud 网站发行说明](https://uniapp.dcloud.net.cn/quickstart-hx)

当前 [manifest.json](../manifest.json) 的相关配置如下。

```json
"h5": {
  "title": "瓦莱希雅大学签到系统",
  "publicPath": "/valencia/check-in/",
  "router": {
    "mode": "hash",
    "base": "/valencia/check-in/"
  }
}
```

`h5.publicPath` 决定静态资源前缀，`h5.router.base` 决定页面路由前缀。部署路径变更时，同步修改这两项并重新构建。

## 上传与配置域名

- 使用 uniCloud 前端网页托管时，将构建目录中的全部内容上传到托管空间的 `/valencia/check-in/` 路径。使用其他静态网站服务器时，将同一批产物发布到站点对应子目录。
- 访问站点时使用 `/valencia/check-in/`，保留末尾斜杠。服务器应为该路径返回 `index.html`，并直接提供 `assets/`、`static/` 等静态文件。当前路由使用 `#`，浏览器会在页面内处理路由。缺失的脚本和样式应返回 404。
- 使用自定义域名、其他站点域名或局域网地址时，在目标业务空间的「跨域配置」添加实际页面使用的「Web 安全域名」。非默认端口需一并填写。`localhost` 和同空间前端网页托管的默认域名可用于联调。 [DCloud 前端网页托管与跨域说明](https://doc.dcloud.net.cn/uniCloud/hosting.html)
- 正式访问使用 HTTPS，使定位、扫码等浏览器功能可按权限使用。 [DCloud H5 定位与浏览器要求](https://uniapp.dcloud.net.cn/api/location/location.html)

## 验证与排查

| 检查 | 预期或处理方法 |
| --- | --- |
| 打开站点子路径 | 登录页样式、图标和按钮能正常加载，资源请求位于配置的子路径下 |
| 点击「加载验证码」 | 云函数返回图片验证码，输入正确字符后可以完成验证 |
| 页面能打开，但验证码加载失败 | 核对构建关联的服务空间、`valencia-checkin` 部署状态和当前页面域名的跨域配置，再查看浏览器网络错误及云函数日志 |
| 静态资源返回 404 或脚本返回 HTML | 核对完整产物、发布目录、资源前缀和服务器重写规则 |
| 登录后刷新、前进或后退 | 页面仍处于正确子路径，登录会话按预期恢复 |
| 相机与定位 | 允许权限后验证对应功能，拒绝时检查提示。H5 扫码依赖 `BarcodeDetector`，允许数字签到的活动可以手动输入 |

完整业务流程见 [发布验收与测试清单](PRODUCTION_TEST_CHECKLIST.md)。

## 版本与缓存

发版时将 `utils/config.js` 的 `APP_VERSION` 与 `static/version.json` 的 `version` 改为同一个新值，然后重新构建并上传完整产物。网页会请求 `/valencia/check-in/static/version.json`，如与当前构建版本不同便提示重新加载。

- `index.html` 和 `static/version.json` 配置为禁止缓存或每次校验。
- 带内容摘要的 `assets/` 文件可以长时间缓存。发布时保留旧页面仍可能引用的资源，直至旧版本页面完成更新。
- 页面仍停留在旧版本时，检查响应头、浏览器缓存和托管或反向代理缓存。

使用 Apache 时可参考仓库的缓存配置，将它以 `.htaccess` 的文件名放在 `index.html` 同级目录。该示例对入口、版本文件和脚本样式均采用禁止缓存。 [Apache 缓存配置示例](../deploy/h5.htaccess)
