<template>
  <view class="captcha-gate">
    <text v-if="verified" class="captcha-gate__verified">✓ 人机验证已通过</text>
    <view v-else>
      <view class="captcha-gate__challenge">
        <image v-if="image" :src="image" mode="aspectFit" class="captcha-gate__image" />
        <button class="captcha-gate__button" size="mini" :disabled="busy" @click="reset">
          {{ image ? '换一张' : busy ? '加载中…' : '加载验证码' }}
        </button>
      </view>
      <view v-if="image" class="captcha-gate__answer">
        <input
          v-model="answer"
          class="captcha-gate__input"
          placeholder="输入图片中的 5 位字符"
          maxlength="5"
          :disabled="busy"
          confirm-type="done"
          @confirm="verify"
        />
        <button class="captcha-gate__button" size="mini" :disabled="busy || answer.trim().length !== 5" @click="verify">
          验证
        </button>
      </view>
      <text v-if="errorText" class="captcha-gate__error">{{ errorText }}</text>
    </view>
  </view>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { rpc } from '../utils/authApi'
import { useAuth } from '../composables/useAuth'

const props = defineProps({ action: { type: String, required: true } })
const emit = defineEmits(['success', 'error', 'expired'])
const auth = useAuth()
const image = ref('')
const answer = ref('')
const errorText = ref('')
const verified = ref(false)
const busy = ref(false)
let challenge = ''
let expiry
let disposed = false

async function accessToken() {
  if (props.action === 'login' || props.action === 'register') return null
  return auth.ensureAccessToken()
}

async function loadChallenge() {
  image.value = ''
  challenge = ''
  answer.value = ''
  const data = await rpc('captcha_create', { action: props.action }, await accessToken())
  if (disposed) return
  image.value = data.image
  challenge = data.challenge
}

async function reset() {
  if (busy.value) return
  clearTimeout(expiry)
  verified.value = false
  errorText.value = ''
  busy.value = true
  try {
    await loadChallenge()
  } catch (error) {
    errorText.value = error.message || '验证码加载失败，请重试'
  } finally {
    busy.value = false
  }
}

async function verify() {
  if (busy.value || verified.value || answer.value.trim().length !== 5) return
  busy.value = true
  errorText.value = ''
  try {
    const data = await rpc('captcha_solve', {
      action: props.action, challenge, answer: answer.value
    }, await accessToken())
    if (disposed) return
    verified.value = true
    expiry = setTimeout(() => {
      emit('expired')
      reset()
    }, Number(data.valid_for_ms) || 300000)
    emit('success', data.ticket)
  } catch (error) {
    if (disposed) return
    errorText.value = error.message || '验证失败，请重试'
    emit('error')
    try {
      await loadChallenge()
    } catch (_) {}
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(expiry)
})

defineExpose({ reset })
</script>

<style scoped>
.captcha-gate__challenge,
.captcha-gate__answer {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.captcha-gate__answer {
  margin-top: 12rpx;
}

.captcha-gate__image {
  display: block;
  width: 160px;
  height: 58px;
  border-radius: 12rpx;
}

.captcha-gate__button {
  margin: 0;
  color: #821717;
  background: #f3e5e3;
  white-space: nowrap;
}

.captcha-gate__input {
  flex: 1;
  min-width: 0;
  height: 68rpx;
  padding: 0 14rpx;
  border: 1px solid #d7baba;
  border-radius: 12rpx;
  font-size: 26rpx;
}

.captcha-gate__verified,
.captcha-gate__error {
  display: block;
  font-size: 26rpx;
}

.captcha-gate__verified { color: #285b40; }
.captcha-gate__error { color: #821717; margin-top: 10rpx; }
</style>
