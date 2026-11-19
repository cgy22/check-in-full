<template>
  <view class="turnstile" :class="{ 'turnstile--failed': failed, 'turnstile--bare': !isH5 && !appTrigger }">
    <view v-if="isH5" :id="containerId" class="turnstile__box"></view>

    <web-view
      v-if="!isH5 && appOpen"
      :src="appCaptchaUrl"
      @message="onAppMessage"
    ></web-view>

    <view v-if="!isH5 && appTrigger" class="turnstile__app">
      <text class="turnstile__hint">
        {{ appToken ? '已通过人机验证' : '将通过安全验证确认操作' }}
      </text>
      <button class="turnstile__open" @click="openAppCaptcha">
        {{ appToken ? '重新验证' : '打开人机验证' }}
      </button>
    </view>

    <view v-if="failed" class="turnstile__fail">
      <text class="turnstile__fail-text">人机验证加载失败，请刷新页面后重试</text>
      <button class="turnstile__refresh" @click="refreshPage">刷新本页面</button>
    </view>
  </view>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  TURNSTILE_SITE_KEY,
  TURNSTILE_ENABLED,
  CAPTCHA_URL
} from '../utils/config'

const props = defineProps({
  action: { type: String, default: 'auth' },
  theme: { type: String, default: 'light' },
  language: { type: String, default: 'zh-cn' },
  // App 自动提交表单时设为 false：不显示“打开人机验证”按钮，
  // 由提交按钮调用 open() 直接进入验证页。
  appTrigger: { type: Boolean, default: true }
})

const emit = defineEmits(['success', 'error', 'expired', 'ready'])

const isH5 = (() => {
  try {
    const p = uni.getSystemInfoSync().uniPlatform
    return p === 'h5' || p === 'web' || !p
  } catch (e) {
    return true
  }
})()

const containerId = `cf-turnstile-${Date.now()}-${Math.floor(Math.random() * 100000)}`
const failed = ref(false)
const appOpen = ref(false)
const appToken = ref('')
const appCaptchaUrl = ref('')
let widgetId = null
let scriptPromise = null
let nonce = ''
let pending = null

function makeNonce() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function loadScript() {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Turnstile 脚本加载失败'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

async function renderWidget() {
  if (!TURNSTILE_ENABLED) return
  try {
    await loadScript()
    const el = document.getElementById(containerId)
    if (!el) throw new Error('Turnstile 容器不存在')
    if (!window.turnstile) throw new Error('Turnstile 未就绪')
    widgetId = window.turnstile.render(el, {
      sitekey: TURNSTILE_SITE_KEY,
      action: props.action,
      theme: props.theme,
      language: props.language,
      callback(token) {
        failed.value = false
        emit('success', token)
      },
      'error-callback'(code) {
        failed.value = true
        emit('error', `人机验证失败（${code || 'unknown'}）`)
      },
      'expired-callback'() {
        emit('expired')
      },
      'timeout-callback'() {
        emit('expired')
      }
    })
    emit('ready', widgetId)
  } catch (e) {
    failed.value = true
    emit('error', e.message || '人机验证加载失败')
  }
}

function buildAppUrl() {
  const base = CAPTCHA_URL.replace(/\/+$/, '')
  return (
    `${base}?sitekey=${encodeURIComponent(TURNSTILE_SITE_KEY)}` +
    `&action=${encodeURIComponent(props.action)}` +
    `&theme=${encodeURIComponent(props.theme)}` +
    `&language=${encodeURIComponent(props.language)}` +
    `&nonce=${encodeURIComponent(nonce)}` +
    `&t=${Date.now()}`
  )
}

function clearPending(reason) {
  if (!pending) return
  const p = pending
  pending = null
  if (p.timer) clearTimeout(p.timer)
  if (reason) {
    try {
      p.reject(reason instanceof Error ? reason : new Error(String(reason)))
    } catch (e) {}
  }
}

function open() {
  if (isH5) return Promise.resolve('')
  if (pending) return pending.promise
  if (!CAPTCHA_URL) {
    failed.value = true
    const err = new Error('手机端人机验证地址未配置')
    emit('error', err.message)
    return Promise.reject(err)
  }

  nonce = makeNonce()
  appToken.value = ''
  appCaptchaUrl.value = buildAppUrl()
  appOpen.value = true
  failed.value = false

  const promise = new Promise((resolve, reject) => {
    pending = { promise: null, resolve, reject, timer: null }
    pending.timer = setTimeout(() => {
      const p = pending
      pending = null
      appOpen.value = false
      failed.value = true
      emit('error', '人机验证超时，请重试')
      if (p) p.reject(new Error('人机验证超时，请重试'))
    }, 120000)
  })
  pending.promise = promise
  return promise
}

function openAppCaptcha() {
  open().catch(e => {
    failed.value = true
    emit('error', e.message || '人机验证失败')
  })
}

function onAppMessage(event) {
  let data = event && event.detail ? event.detail.data : null
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (e) {}
  }
  const msg = Array.isArray(data) ? data[data.length - 1] : data
  if (!msg || !msg.nonce || msg.nonce !== nonce) return
  if (msg.type === 'VU_CAPTCHA_SUCCESS' && msg.token) {
    appToken.value = msg.token
    appOpen.value = false
    failed.value = false
    const p = pending
    pending = null
    if (p && p.timer) clearTimeout(p.timer)
    emit('success', msg.token)
    if (p) p.resolve(msg.token)
  } else if (msg.type === 'VU_CAPTCHA_ERROR') {
    appOpen.value = false
    failed.value = true
    const message = msg.message || '人机验证失败'
    clearPending(new Error(message))
    emit('error', message)
  }
}

function reset() {
  failed.value = false
  appToken.value = ''
  appOpen.value = false
  clearPending(new Error('人机验证已取消'))
  if (isH5 && widgetId && window.turnstile) {
    try {
      window.turnstile.reset(widgetId)
    } catch (e) {}
  }
}

function refreshPage() {
  failed.value = false
  if (isH5 && typeof window !== 'undefined') {
    window.location.reload()
    return
  }
  const pages = getCurrentPages()
  const cur = pages[pages.length - 1]
  const route = cur ? `/${cur.route}` : '/pages/auth/login'
  uni.reLaunch({ url: route })
}

onMounted(() => {
  if (!isH5) return
  nextTick(() => {
    setTimeout(renderWidget, 50)
  })
})

onBeforeUnmount(() => {
  appOpen.value = false
  clearPending(new Error('人机验证已取消'))
  if (isH5 && widgetId && window.turnstile) {
    try {
      window.turnstile.remove(widgetId)
    } catch (e) {}
  }
})

defineExpose({ open, reset, refreshPage })
</script>

<style scoped>
.turnstile.turnstile--bare {
  min-height: 0;
}
.turnstile {
  width: 100%;
  min-height: 68px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
}
.turnstile__box {
  min-height: 65px;
  width: 100%;
  display: flex;
  justify-content: center;
}
.turnstile__app {
  padding: 14px;
  border-radius: 10px;
  background: rgba(165, 21, 21, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.turnstile__hint {
  font-size: 13px;
  color: #7a6a6a;
  line-height: 1.5;
}
.turnstile__open {
  margin: 0;
  height: 38px;
  line-height: 38px;
  border-radius: 8px;
  background: #a51515;
  color: #fff;
  border: none;
  font-size: 13px;
}
.turnstile__fail {
  margin-top: 10px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(217, 72, 15, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.turnstile__fail-text {
  font-size: 13px;
  color: #b4432a;
}
.turnstile__refresh {
  margin: 0;
  padding: 0 14px;
  height: 34px;
  line-height: 34px;
  font-size: 13px;
  color: #fff;
  background: #a51515;
  border-radius: 8px;
  border: none;
}
</style>
