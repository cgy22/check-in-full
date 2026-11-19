<template>
  <web-view
    v-if="isApp && visible && url"
    :src="url"
    class="bridge-host"
    @message="onMessage"
  ></web-view>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { clearBridgeHandler, setBridgeHandler } from '../utils/bridgeHost'

const props = defineProps({
  pagePath: { type: String, default: '' }
})

const isApp = (() => {
  try {
    return uni.getSystemInfoSync().uniPlatform === 'app'
  } catch (e) {
    return false
  }
})()

const visible = ref(false)
const url = ref('')
let nonce = ''
let timer = null

function currentRoute() {
  try {
    const pages = getCurrentPages()
    const cur = pages[pages.length - 1]
    return cur ? cur.route || cur.__route__ || '' : ''
  } catch (e) {
    return ''
  }
}

function clear() {
  visible.value = false
  url.value = ''
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function onRequest(payload) {
  if (!isApp || !payload || !payload.url) return false
  const route = currentRoute()
  if (props.pagePath && route && route !== props.pagePath) return false

  // 同一个 nonce 重复入队时只加载一次
  if (visible.value && payload.nonce && payload.nonce === nonce) return true

  nonce = payload.nonce || ''
  url.value = payload.url
  visible.value = true

  // 兜底：如果 web-view 没回消息，32 秒后清空，让 http.js 自己超时。
  if (timer) clearTimeout(timer)
  timer = setTimeout(clear, 32000)
  return true
}

function onMessage(event) {
  let data = event && event.detail ? event.detail.data : null
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (e) {}
  }
  const msg = Array.isArray(data) ? data[data.length - 1] : data
  if (!msg || msg.type !== 'VU_BRIDGE_RESULT') return
  if (msg.nonce && nonce && msg.nonce !== nonce) return

  clear()
  try {
    uni.$emit('vu-bridge-result', msg)
  } catch (e) {}
}

onMounted(() => {
  setBridgeHandler(onRequest)
})

onBeforeUnmount(() => {
  clearBridgeHandler(onRequest)
  clear()
})
</script>

<style scoped>
.bridge-host {
  position: fixed;
  width: 1px;
  height: 1px;
  left: -10px;
  top: -10px;
  opacity: 0;
  pointer-events: none;
  z-index: -1;
}
</style>
