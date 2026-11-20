// utils/updateCheck.js
// H5 更新检查：只比较静态 version.json，不触碰业务数据和登录态。
import { APP_VERSION } from './config'

let checking = false

export function checkH5Update() {
  // #ifdef H5
  if (checking) return
  checking = true

  try {
    const url = new URL('static/version.json', window.location.href)
    url.searchParams.set('t', String(Date.now()))

    fetch(url.toString(), { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const latest = data && String(data.version || '')
        if (!latest || latest === APP_VERSION) return

        const promptedKey = `vu_update_prompted_${latest}`
        if (sessionStorage.getItem(promptedKey)) return
        sessionStorage.setItem(promptedKey, '1')

        uni.showModal({
          title: '发现新版本',
          content: '页面已更新，需要重新加载以获取最新版本。',
          showCancel: false,
          confirmText: '重新加载',
          success: () => {
            window.location.reload()
          }
        })
      })
      .catch(() => {})
  } catch (e) {
    // 更新检查失败不能影响正常使用
  }
  // #endif
}
