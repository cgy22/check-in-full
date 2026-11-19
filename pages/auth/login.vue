<template>
  <view class="auth-page">
    <BridgeHost page-path="pages/auth/login" />
    <view class="auth-orb auth-orb--one"></view>
    <view class="auth-orb auth-orb--two"></view>

    <view class="auth-shell">
      <view class="brand">
        <view class="brand__mark">Va</view>
        <text class="brand__title">瓦莱希雅大学</text>
        <text class="brand__sub">VALENCIA UNIVERSITY · 签到系统</text>
      </view>

      <MicaCard class="auth-card">
        <view class="auth-card__body">
          <text class="auth-heading">登录</text>
          <text class="auth-desc">使用学号和密码进入校园签到</text>

          <view class="field">
            <text class="field__label">学号</text>
            <input
              v-model="studentId"
              class="field__input"
              type="number"
              maxlength="12"
              placeholder="请输入 12 位学号"
              placeholder-class="field__placeholder"
            />
          </view>

          <view class="field">
            <text class="field__label">密码</text>
            <view class="field__password">
              <input
                v-model="password"
                class="field__input field__input--password"
                :password="!showPassword"
                maxlength="64"
                placeholder="请输入密码"
                placeholder-class="field__placeholder"
              />
              <text class="field__eye" @click="showPassword = !showPassword">
                {{ showPassword ? '隐藏' : '显示' }}
              </text>
            </view>
          </view>

          <view class="captcha" :class="{ 'captcha--auto': isApp }">
            <TurnstileGate
              ref="captchaRef"
              action="login"
              :app-trigger="false"
              @success="onCaptchaSuccess"
              @error="onCaptchaError"
              @expired="onCaptchaExpired"
            />
          </view>

          <button
            class="primary-btn"
            :class="{ 'primary-btn--disabled': !canSubmit }"
            :disabled="!canSubmit"
            :loading="busy"
            @click="submit"
          >
            {{ busy ? (auth.busy.value ? '登录中…' : '验证中…') : '进入签到系统' }}
          </button>

          <view class="auth-links">
            <text class="auth-link" @click="goRegister">还没有账号？注册</text>
          </view>

          <text class="auth-note">学号是唯一登录账号；系统未绑定手机/邮箱，忘记学号或密码将无法找回</text>
        </view>
      </MicaCard>

      <text class="footer">Valencia University · Check-in Platform</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import MicaCard from '../../components/MicaCard.vue'
import TurnstileGate from '../../components/TurnstileGate.vue'
import { useAuth } from '../../composables/useAuth'
import { loadLastStudentId } from '../../utils/session'

const auth = useAuth()
const studentId = ref(loadLastStudentId())
const password = ref('')
const showPassword = ref(false)
const captchaToken = ref('')
const captchaRef = ref(null)
const submitting = ref(false)

const isApp = (() => {
  try {
    return uni.getSystemInfoSync().uniPlatform === 'app'
  } catch (e) {
    return false
  }
})()

const busy = computed(() => auth.busy.value || submitting.value)

const canSubmit = computed(() => {
  const valid = /^\d{12}$/.test(studentId.value) && password.value.length >= 8
  return !busy.value && valid && (isApp || !!captchaToken.value)
})

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
  if (captchaRef.value && captchaRef.value.reset) captchaRef.value.reset()
}

async function submit() {
  if (!canSubmit.value || submitting.value) {
    uni.showToast({ title: isApp ? '请填写学号和密码' : '请填写学号、密码并完成人机验证', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    let token = captchaToken.value
    if (isApp) {
      token = await captchaRef.value.open()
    }
    await auth.login(studentId.value, password.value, token)
    uni.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => {
      uni.switchTab({ url: '/pages/index/index' })
    }, 350)
  } catch (e) {
    uni.showToast({ title: e.message || '登录失败', icon: 'none', duration: 2500 })
    if (e.code === 'CAPTCHA_FAILED' || e.code === 'INVALID_CREDENTIALS') resetCaptcha()
  } finally {
    submitting.value = false
  }
}

function goRegister() {
  uni.navigateTo({ url: '/pages/auth/register' })
}

onShow(() => {
  if (auth.session.value && auth.profile.value) {
    uni.switchTab({ url: '/pages/index/index' })
  }
})
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background: #f4efe9;
  padding: calc(var(--status-bar-height, 0px) + 30px) 22px 30px;
  box-sizing: border-box;
}
.auth-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(10px);
  opacity: 0.55;
  pointer-events: none;
}
.auth-orb--one {
  width: 280px;
  height: 280px;
  right: -110px;
  top: -90px;
  background: radial-gradient(circle, rgba(165, 21, 21, 0.28), rgba(165, 21, 21, 0));
}
.auth-orb--two {
  width: 260px;
  height: 260px;
  left: -110px;
  bottom: 30px;
  background: radial-gradient(circle, rgba(255, 181, 0, 0.22), rgba(255, 181, 0, 0));
}
.auth-shell {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  animation: authIn 0.7s cubic-bezier(0.05, 0.7, 0.1, 1) both;
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 26px;
}
.brand__mark {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: linear-gradient(145deg, #a51515, #6f0c0c);
  color: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 23px;
  font-weight: 700;
  line-height: 52px;
  text-align: center;
  box-shadow: 0 10px 24px rgba(165, 21, 21, 0.28);
  margin-bottom: 14px;
}
.brand__title {
  font-family: 'Songti SC', 'Noto Serif SC', 'STSong', serif;
  font-size: 26px;
  letter-spacing: 4px;
  color: #3b1d1d;
  font-weight: 700;
}
.brand__sub {
  margin-top: 8px;
  font-size: 10px;
  letter-spacing: 2.2px;
  color: #9b7a72;
}
.auth-card__body {
  padding: 26px 22px 22px;
}
.auth-heading {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #2d1616;
  letter-spacing: 2px;
}
.auth-desc {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: #8f7570;
  line-height: 1.6;
}
.field {
  margin-top: 18px;
}
.field__label {
  display: block;
  font-size: 12px;
  color: #7b5b55;
  letter-spacing: 1px;
  margin-bottom: 8px;
}
.field__input {
  width: 100%;
  height: 46px;
  line-height: 46px;
  padding: 0 14px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.72);
  font-size: 15px;
  color: #2d1616;
  transition: all 0.3s cubic-bezier(0.05, 0.7, 0.1, 1);
}
.field__input:focus {
  border-color: rgba(165, 21, 21, 0.55);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(165, 21, 21, 0.08);
}
.field__placeholder {
  color: #b9a49f;
  font-size: 13px;
}
.field__password {
  position: relative;
}
.field__input--password {
  padding-right: 58px;
}
.field__eye {
  position: absolute;
  right: 14px;
  top: 0;
  height: 46px;
  line-height: 46px;
  font-size: 12px;
  color: #a51515;
}
.captcha {
  margin-top: 16px;
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
  letter-spacing: 2px;
  border: none;
  box-shadow: 0 8px 20px rgba(165, 21, 21, 0.22);
  transition: all 0.3s cubic-bezier(0.05, 0.7, 0.1, 1);
}
.primary-btn:active {
  transform: translateY(1px) scale(0.995);
}
.primary-btn--disabled {
  background: #d8c6c2;
  box-shadow: none;
  color: #fff;
}
.auth-links {
  margin-top: 18px;
  display: flex;
  justify-content: center;
}
.auth-link {
  font-size: 13px;
  color: #a51515;
  padding: 4px 8px;
}
.auth-note {
  display: block;
  margin-top: 14px;
  text-align: center;
  font-size: 11px;
  color: #b09a94;
  line-height: 1.5;
}
.footer {
  margin-top: 26px;
  text-align: center;
  font-size: 10px;
  letter-spacing: 1.5px;
  color: #b6a39d;
}
@keyframes authIn {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
