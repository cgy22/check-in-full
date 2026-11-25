<template>
  <view class="class-page">
    <AppHeader title="加入班级" subtitle="JOIN CLASS" back />

    <view class="class-shell">
      <MicaCard v-if="!successInfo" class="class-card">
        <view class="class-card__body">
          <text class="section-title">输入邀请码</text>
          <text class="section-desc">向班级创建者索取 8 位邀请码；邀请码过期后需要重新获取。</text>

          <view class="field">
            <text class="field__label">邀请码</text>
            <input
              v-model="code"
              class="field__input code-input"
              maxlength="8"
              placeholder="请输入 8 位邀请码"
              placeholder-class="field__placeholder"
              @input="normalizeCode"
            />
          </view>

          <view v-if="!isApp" class="captcha">
            <text v-if="!isApp" class="field__label">人机验证</text>
            <CaptchaGate
              ref="gateRef"
              action="join_class"
              @success="onCaptchaSuccess"
              @error="onCaptchaError"
              @expired="onCaptchaExpired"
            />
          </view>

          <button class="primary-btn" :disabled="submitting || !canSubmit" @click="submit">
            {{ submitting ? '加入中…' : '加入班级' }}
          </button>
        </view>
      </MicaCard>

      <MicaCard v-else class="class-card">
        <view class="class-card__body success">
          <view class="success__ring">✓</view>
          <text class="success__title">加入成功</text>
          <text class="success__desc">你已加入「{{ successInfo.name }}」。</text>
          <button class="primary-btn" @click="goDetail">进入班级详情</button>
          <text class="link" @click="goHome">返回首页</text>
        </view>
      </MicaCard>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import CaptchaGate from '../../components/CaptchaGate.vue'
import { useAuth } from '../../composables/useAuth'
import { rpc } from '../../utils/authApi'

const auth = useAuth()
const gateRef = ref(null)

const isApp = (() => {
  try {
    return uni.getSystemInfoSync().uniPlatform === 'app'
  } catch (e) {
    return false
  }
})()

const code = ref('')
const captchaToken = ref('')
const submitting = ref(false)
const successInfo = ref(null)

const canSubmit = computed(() => {
  const valid = /^[A-Z2-9]{8}$/.test(code.value)
  return valid && (isApp || !!captchaToken.value)
})

function normalizeCode(e) {
  const value = String((e && e.detail && e.detail.value) || code.value || '')
  code.value = value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8)
}

function onCaptchaSuccess(token) {
  captchaToken.value = token
}

function onCaptchaError() {
  captchaToken.value = ''
}

function onCaptchaExpired() {
  captchaToken.value = ''
  uni.showToast({ title: '人机验证已过期，请重新验证', icon: 'none' })
}

function resetCaptcha() {
  captchaToken.value = ''
  if (gateRef.value && gateRef.value.reset) gateRef.value.reset()
}

async function submit() {
  if (!canSubmit.value) {
    uni.showToast({ title: isApp ? '请输入 8 位邀请码' : '请输入 8 位邀请码并完成人机验证', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    let ticket = null
    if (!isApp) {
      ticket = captchaToken.value
    }
    const accessToken = await auth.ensureAccessToken()
    const data = await rpc(
      'join_class',
      { p_code: code.value, p_captcha_ticket: ticket },
      accessToken
    )
    successInfo.value = data
  } catch (e) {
    uni.showToast({ title: e.message || '加入失败', icon: 'none', duration: 2600 })
    // 失败后重新获取一次性验证票据。
    resetCaptcha()
  } finally {
    submitting.value = false
  }
}

function goDetail() {
  if (!successInfo.value) return
  uni.redirectTo({ url: `/pages/class/detail?id=${successInfo.value.class_id}` })
}

function goHome() {
  uni.switchTab({ url: '/pages/index/index' })
}

async function guard() {
  if (!auth.ready.value) await auth.restore()
  if (!auth.session.value || !auth.profile.value) {
    uni.reLaunch({ url: '/pages/auth/login' })
  }
}

onShow(() => {
  guard()
})
</script>

<style scoped>
.class-page {
  min-height: 100vh;
  background: #f4efe9;
}
.class-shell {
  max-width: 520px;
  margin: 0 auto;
  padding: 16px 18px 30px;
}
.class-card__body {
  padding: 22px 20px 22px;
}
.section-title {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #2d1616;
  letter-spacing: 1px;
}
.section-desc {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.6;
  color: #9b7a72;
}
.field {
  margin-top: 18px;
}
.field__label {
  display: block;
  font-size: 12px;
  color: #7b5b55;
  margin-bottom: 8px;
}
.field__input {
  width: 100%;
  height: 44px;
  line-height: 44px;
  padding: 0 13px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.72);
  font-size: 14px;
  color: #2d1616;
}
.code-input {
  font-family: 'SFMono-Regular', Consolas, monospace;
  letter-spacing: 3px;
  font-size: 18px;
  font-weight: 700;
}
.field__placeholder {
  color: #b9a49f;
  font-size: 12px;
}
.captcha {
  margin-top: 18px;
}
.captcha--auto {
  margin-top: 0;
}
.primary-btn {
  margin-top: 20px;
  height: 48px;
  line-height: 48px;
  border-radius: 10px;
  background: linear-gradient(135deg, #a51515, #7e0d0d);
  color: #fff;
  font-size: 15px;
  letter-spacing: 1.5px;
  border: none;
  box-shadow: 0 8px 20px rgba(165, 21, 21, 0.22);
}
.primary-btn[disabled] {
  background: #d8c6c2;
  box-shadow: none;
}
.success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.success__ring {
  width: 60px;
  height: 60px;
  line-height: 60px;
  border-radius: 999px;
  background: #1a9e7a;
  color: #fff;
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 14px;
}
.success__title {
  font-size: 21px;
  font-weight: 700;
  color: #2d1616;
}
.success__desc {
  margin-top: 7px;
  font-size: 12px;
  color: #9b7a72;
}
.link {
  display: block;
  margin-top: 16px;
  font-size: 12px;
  color: #a51515;
  padding: 4px 8px;
}
</style>
