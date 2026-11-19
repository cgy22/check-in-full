// utils/http.js
// 网络层：H5 先直连 Supabase，网络失败自动切 iframe 桥接；
// App 走当前页面内 BridgeHost 的隐藏 web-view 桥接，不跳转页面。
import { BRIDGE_BASE } from './config'
import { requestBridge } from './bridgeHost'

const BRIDGE_URL = BRIDGE_BASE ? `${BRIDGE_BASE}/bridge.html` : ''
let bridgeQueue = Promise.resolve()

export function makeError(code, message, extra = {}) {
  const err = new Error(message || code || '请求失败')
  err.code = code || 'REQUEST_FAILED'
  err.extra = extra
  return err
}

export function normalizeHttpError(statusCode, data) {
  const d = data || {}
  const message =
    d.error_description ||
    d.msg ||
    d.message ||
    d.error ||
    d.hint ||
    `请求失败（HTTP ${statusCode}）`
  const code = d.error_code || d.code || d.error || `HTTP_${statusCode}`
  return makeError(String(code), String(message), { statusCode, data: d })
}

function getPlatform() {
  try {
    return uni.getSystemInfoSync().uniPlatform || 'h5'
  } catch (e) {
    return 'h5'
  }
}

function makeNonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function buildPayload(options) {
  return {
    url: options.url,
    method: (options.method || 'GET').toUpperCase(),
    data: options.data === undefined ? null : options.data,
    header: options.header || {}
  }
}

function directRequest({ url, method = 'GET', data, header = {}, timeout = 15000 }) {
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method,
      data,
      header,
      timeout,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(normalizeHttpError(res.statusCode, res.data))
        }
      },
      fail(err) {
        const msg = err && err.errMsg ? err.errMsg : '网络请求失败'
        reject(makeError('NETWORK_ERROR', msg, { raw: err }))
      }
    })
  })
}

function requestViaIframe(options) {
  return new Promise((resolve, reject) => {
    if (!BRIDGE_URL || typeof window === 'undefined' || typeof document === 'undefined') {
      reject(makeError('BRIDGE_UNAVAILABLE', '服务地址未配置或当前环境不支持'))
      return
    }

    const nonce = makeNonce()
    const payload = buildPayload(options)
    const iframe = document.createElement('iframe')
    iframe.style.cssText =
      'position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;border:0;pointer-events:none;'
    iframe.src = `${BRIDGE_URL}?nonce=${encodeURIComponent(nonce)}&payload=${encodeURIComponent(
      JSON.stringify(payload)
    )}`

    let done = false
    let timer = null

    function cleanup() {
      if (timer) clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }

    function onMessage(event) {
      const d = event && event.data
      if (!d || d.type !== 'VU_BRIDGE_RESULT' || d.nonce !== nonce) return
      if (done) return
      done = true
      cleanup()
      if (d.ok) resolve(d.data)
      else reject(normalizeHttpError(d.status, d.data))
    }

    window.addEventListener('message', onMessage)
    document.body.appendChild(iframe)

    timer = setTimeout(() => {
      if (done) return
      done = true
      cleanup()
      reject(makeError('BRIDGE_TIMEOUT', '网络请求超时，请稍后重试'))
    }, 25000)
  })
}

function requestViaAppBridge(options) {
  const run = () =>
    new Promise((resolve, reject) => {
      if (!BRIDGE_URL) {
        reject(makeError('BRIDGE_UNAVAILABLE', '服务地址未配置'))
        return
      }
      const nonce = makeNonce()
      const payload = buildPayload(options)
      let done = false
      let timer = null
      let cancelBridgeRequest = null

      function cleanup() {
        if (timer) clearTimeout(timer)
        if (cancelBridgeRequest) {
          try {
            cancelBridgeRequest()
          } catch (e) {}
          cancelBridgeRequest = null
        }
        try {
          uni.$off('vu-bridge-result', onResult)
        } catch (e) {}
      }

      function finishError(err) {
        if (done) return
        done = true
        cleanup()
        reject(err)
      }

      function onResult(msg) {
        if (!msg || msg.type !== 'VU_BRIDGE_RESULT' || msg.nonce !== nonce) return
        if (done) return
        done = true
        cleanup()
        if (msg.ok) resolve(msg.data)
        else reject(normalizeHttpError(msg.status, msg.data))
      }

      try {
        uni.$on('vu-bridge-result', onResult)
      } catch (e) {
        finishError(makeError('BRIDGE_UNAVAILABLE', '当前环境不支持该操作'))
        return
      }

      timer = setTimeout(() => {
        finishError(makeError('BRIDGE_TIMEOUT', '网络请求超时，请稍后重试'))
      }, 30000)

      const bridgeUrl =
        `${BRIDGE_URL}?nonce=${encodeURIComponent(nonce)}&embed=1` +
        `&payload=${encodeURIComponent(JSON.stringify(payload))}`

      try {
        cancelBridgeRequest = requestBridge({ url: bridgeUrl, nonce })
      } catch (e) {
        finishError(makeError('BRIDGE_UNAVAILABLE', '当前环境不支持该操作'))
      }
    })

  // 串行化，避免同时加载多个 bridge 请求
  const p = bridgeQueue.then(run, run)
  bridgeQueue = p.catch(() => {})
  return p
}

export function httpRequest(options) {
  const platform = getPlatform()
  if (platform === 'app') {
    return requestViaAppBridge(options)
  }

  return directRequest(options).catch(err => {
    // 只有网络层失败才走桥接；401/403/422 等业务错误不兜底，避免掩盖真实错误。
    if (
      err &&
      err.code === 'NETWORK_ERROR' &&
      BRIDGE_URL &&
      typeof window !== 'undefined' &&
      typeof document !== 'undefined'
    ) {
      return requestViaIframe(options)
    }
    throw err
  })
}
