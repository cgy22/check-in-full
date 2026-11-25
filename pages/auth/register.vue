<template>
  <view class="register-page">
    <BridgeHost page-path="pages/auth/register" />
    <view class="register-orb register-orb--one"></view>
    <view class="register-orb register-orb--two"></view>

    <view class="register-shell">
      <view class="brand">
        <view class="brand__mark">Va</view>
        <text class="brand__title">瓦莱希雅大学</text>
        <text class="brand__sub">新生注册 · CREATE ACCOUNT</text>
      </view>

      <MicaCard v-if="successInfo" class="register-card">
        <view class="register-card__body success">
          <view class="success__ring">
            <view class="success__check">✓</view>
          </view>
          <text class="success__title">注册成功</text>
          <text class="success__sub">请立即保存你的学号</text>

          <view class="id-card">
            <text class="id-card__label">你的登录学号</text>
            <text class="id-card__value">{{ successInfo.studentId }}</text>
            <button class="copy-btn" @click="copyStudentId">复制学号</button>
          </view>

          <view class="warning">
            <text class="warning__title">⚠ 学号丢失将无法登录</text>
            <text class="warning__text">
              系统没有绑定手机或邮箱，也没有“忘记密码”找回入口。忘记学号或密码后，账号将无法恢复。请现在复制、截图或抄写到安全位置。
            </text>
          </view>

          <view class="verify-id">
            <text class="verify-id__label">第 2 步：再次输入学号确认</text>
            <input
              v-model="studentIdCheck"
              class="verify-id__input"
              type="number"
              maxlength="12"
              placeholder="再次输入上方 12 位学号"
              placeholder-class="form__placeholder"
            />
          </view>

          <view class="agree" @click="savedConfirmed = !savedConfirmed">
            <view class="agree__box" :class="{ 'agree__box--on': savedConfirmed }">✓</view>
            <text class="agree__text">我已抄写或保存学号，并理解丢失后无法找回</text>
          </view>

          <button
            class="primary-btn"
            :class="{ 'primary-btn--disabled': !canEnter }"
            :disabled="!canEnter"
            @click="enterApp"
          >
            进入签到系统
          </button>

          <text class="auth-note">建议把学号保存在密码管理器或只有你能看到的地方</text>
        </view>
      </MicaCard>

      <MicaCard v-else-if="!captchaPassed" class="register-card">
        <view class="register-card__body gate">
          <text class="step">STEP 01</text>
          <text class="gate__title">先完成人机验证</text>
          <text class="gate__desc">
            为防止机器批量注册，进入填写表单前需要先通过 Cloudflare Turnstile。
          </text>
          <view class="gate__captcha">
            <TurnstileGate
              ref="gateRef"
              action="register"
              @success="onCaptchaSuccess"
              @error="onCaptchaError"
              @expired="onCaptchaExpired"
            />
          </view>
          <text class="gate__note">验证通过后才会显示注册表单；失败请点上方“刷新本页面”。</text>
          <text class="auth-link" @click="backToLogin">返回登录</text>
        </view>
      </MicaCard>

      <MicaCard v-else class="register-card">
        <view class="register-card__body">
          <view class="form-head">
            <view>
              <text class="step">STEP 02</text>
              <text class="form-title">填写注册信息</text>
            </view>
            <text class="verified">已验证</text>
          </view>

          <view class="field">
            <text class="field__label">姓名</text>
            <input
              v-model="form.fullName"
              class="field__input"
              maxlength="50"
              placeholder="请输入真实姓名（支持中文）"
              placeholder-class="field__placeholder"
            />
          </view>

          <view class="field-row">
            <view class="field field--half">
              <text class="field__label">入学年份</text>
              <picker
                mode="selector"
                :range="yearLabels"
                :value="yearIndex"
                @change="onYearChange"
              >
                <view class="picker-box">{{ yearLabels[yearIndex] }}</view>
              </picker>
            </view>
            <view class="field field--half">
              <text class="field__label">专业</text>
              <picker
                mode="selector"
                :range="MAJORS"
                range-key="name"
                :value="majorIndex"
                @change="onMajorChange"
              >
                <view class="picker-box">{{ MAJORS[majorIndex].name }}</view>
              </picker>
            </view>
          </view>

          <view class="field">
            <text class="field__label">学号</text>
            <view class="student-id-box">
              <text class="student-id-box__hint">提交后自动生成 12 位学号</text>
              <text class="student-id-box__format">YYYY + 专业 2 位 + 6 位随机</text>
            </view>
          </view>

          <view class="field">
            <text class="field__label">设置密码</text>
            <view class="field__password">
              <input
                v-model="form.password"
                class="field__input field__input--password"
                :password="!showPassword"
                maxlength="64"
                placeholder="至少 8 位，同时包含字母和数字"
                placeholder-class="field__placeholder"
              />
              <text class="field__eye" @click="showPassword = !showPassword">
                {{ showPassword ? '隐藏' : '显示' }}
              </text>
            </view>
          </view>

          <view class="field">
            <text class="field__label">确认密码</text>
            <input
              v-model="form.confirmPassword"
              class="field__input"
              :password="!showPassword"
              maxlength="64"
              placeholder="请再次输入密码"
              placeholder-class="field__placeholder"
            />
          </view>

          <view class="rule">
            <text class="rule__dot"></text>
            <text class="rule__text">密码至少 8 位，必须同时包含字母和数字，不能有空格</text>
          </view>

          <button class="primary-btn" :disabled="auth.busy.value || submitting" @click="submit">
            {{ auth.busy.value ? '注册中…' : (submitting ? '验证中…' : '生成学号并注册') }}
          </button>

          <text class="auth-link auth-link--center" @click="backToLogin">已有账号？返回登录</text>
          <text class="auth-note">注册成功后请牢记学号，这是你唯一的登录账号</text>
        </view>
      </MicaCard>

      <text class="footer">Valencia University · Check-in Platform</text>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import MicaCard from '../../components/MicaCard.vue'
import TurnstileGate from '../../components/TurnstileGate.vue'
import { useAuth } from '../../composables/useAuth'
import { ENROLLMENT_YEARS, MAJORS } from '../../utils/constants'
import { validateRegisterForm } from '../../utils/validators'

const auth = useAuth()
const captchaPassed = ref(false)
const captchaToken = ref('')
const submitting = ref(false)

const gateRef = ref(null)
const showPassword = ref(false)
const successInfo = ref(null)
const savedConfirmed = ref(false)
const studentIdCheck = ref('')

const yearLabels = ENROLLMENT_YEARS.map(y => `${y} 级`)
const yearIndex = ref(Math.max(0, ENROLLMENT_YEARS.indexOf(new Date().getFullYear())))
const majorIndex = ref(0)

const form = reactive({
  fullName: '',
  enrollmentYear: ENROLLMENT_YEARS[yearIndex.value],
  majorCode: MAJORS[0].code,
  password: '',
  confirmPassword: ''
})

function onCaptchaSuccess(token) {
  captchaToken.value = token
  captchaPassed.value = true
}

function onCaptchaError() {
  captchaToken.value = ''
  uni.showToast({ title: '人机验证失败，请刷新页面重试', icon: 'none' })
}

function onCaptchaExpired() {
  captchaToken.value = ''
  captchaPassed.value = false
  uni.showToast({ title: '人机验证已过期，请重新验证', icon: 'none' })
}

function onYearChange(e) {
  yearIndex.value = Number(e.detail.value)
  form.enrollmentYear = ENROLLMENT_YEARS[yearIndex.value]
}

function onMajorChange(e) {
  majorIndex.value = Number(e.detail.value)
  form.majorCode = MAJORS[majorIndex.value].code
}

function resetGate() {
  captchaToken.value = ''
  captchaPassed.value = false
  if (gateRef.value && gateRef.value.reset) gateRef.value.reset()
}

async function submit() {
  if (submitting.value) return
  const check = validateRegisterForm(form)
  if (!check.ok) {
    uni.showToast({ title: check.message, icon: 'none', duration: 2500 })
    return
  }

  submitting.value = true
  try {
    const token = captchaToken.value
    if (!token) {
      captchaPassed.value = false
      uni.showToast({ title: '请先完成人机验证', icon: 'none' })
      submitting.value = false
      return
    }

    const result = await auth.register(
      {
        fullName: form.fullName,
        enrollmentYear: form.enrollmentYear,
        majorCode: form.majorCode,
        password: form.password,
        confirmPassword: form.confirmPassword
      },
      token
    )
    successInfo.value = result
    savedConfirmed.value = false
    studentIdCheck.value = ''
  } catch (e) {
    uni.showToast({ title: e.message || '注册失败', icon: 'none', duration: 2800 })
    if (e.code === 'CAPTCHA_FAILED' || e.code === 'STUDENT_ID_TAKEN' || e.code === 'EMAIL_CONFIRM_ON') {
      resetGate()
    }
  } finally {
    submitting.value = false
  }
}

function copyStudentId() {
  if (!successInfo.value) return
  uni.setClipboardData({
    data: successInfo.value.studentId,
    success: () => {
      uni.showToast({ title: '学号已复制，请妥善保存', icon: 'success' })
    }
  })
}

const canEnter = computed(() => {
  return !!successInfo.value && savedConfirmed.value && studentIdCheck.value === successInfo.value.studentId
})

function enterApp() {
  if (!canEnter.value) return
  uni.switchTab({ url: '/pages/index/index' })
}

function backToLogin() {
  uni.reLaunch({ url: '/pages/auth/login' })
}

onShow(() => {
  if (!successInfo.value && auth.session.value && auth.profile.value) {
    uni.switchTab({ url: '/pages/index/index' })
  }
})
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background: #f4efe9;
  padding: calc(var(--status-bar-height, 0px) + 30px) 22px 30px;
  box-sizing: border-box;
}
.register-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(10px);
  opacity: 0.5;
  pointer-events: none;
}
.register-orb--one {
  width: 300px;
  height: 300px;
  right: -130px;
  top: -100px;
  background: radial-gradient(circle, rgba(165, 21, 21, 0.25), rgba(165, 21, 21, 0));
}
.register-orb--two {
  width: 260px;
  height: 260px;
  left: -110px;
  bottom: 20px;
  background: radial-gradient(circle, rgba(255, 181, 0, 0.2), rgba(255, 181, 0, 0));
}
.register-shell {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  animation: authIn 0.7s cubic-bezier(0.05, 0.7, 0.1, 1) both;
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 22px;
}
.brand__mark {
  width: 48px;
  height: 48px;
  border-radius: 15px;
  background: linear-gradient(145deg, #a51515, #6f0c0c);
  color: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 23px;
  font-weight: 700;
  line-height: 48px;
  text-align: center;
  box-shadow: 0 10px 24px rgba(165, 21, 21, 0.26);
  margin-bottom: 12px;
}
.brand__title {
  font-family: 'Songti SC', 'Noto Serif SC', 'STSong', serif;
  font-size: 24px;
  letter-spacing: 4px;
  color: #3b1d1d;
  font-weight: 700;
}
.brand__sub {
  margin-top: 7px;
  font-size: 9px;
  letter-spacing: 2px;
  color: #9b7a72;
}
.register-card__body {
  padding: 24px 22px 22px;
}
.step {
  display: block;
  font-size: 10px;
  letter-spacing: 2px;
  color: #b08a80;
  margin-bottom: 8px;
}
.gate__title {
  display: block;
  font-size: 21px;
  font-weight: 700;
  color: #2d1616;
  letter-spacing: 1px;
}
.gate__desc {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: #8f7570;
}
.gate__captcha {
  margin-top: 18px;
}
.gate__note {
  display: block;
  margin-top: 12px;
  font-size: 11px;
  color: #b09a94;
  line-height: 1.6;
}
.form-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 4px;
}
.form-title {
  display: block;
  font-size: 21px;
  font-weight: 700;
  color: #2d1616;
  letter-spacing: 1px;
}
.verified {
  font-size: 11px;
  color: #1a9e7a;
  background: rgba(26, 158, 122, 0.1);
  padding: 4px 10px;
  border-radius: 999px;
}
.field {
  margin-top: 15px;
}
.field-row {
  display: flex;
  gap: 12px;
}
.field--half {
  flex: 1;
  min-width: 0;
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
.field__placeholder {
  color: #b9a49f;
  font-size: 12px;
}
.field__password {
  position: relative;
}
.field__input--password {
  padding-right: 54px;
}
.field__eye {
  position: absolute;
  right: 13px;
  top: 0;
  height: 44px;
  line-height: 44px;
  font-size: 12px;
  color: #a51515;
}
.picker-box {
  height: 44px;
  line-height: 44px;
  padding: 0 13px;
  border-radius: 10px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.72);
  font-size: 14px;
  color: #2d1616;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.student-id-box {
  padding: 11px 13px;
  border-radius: 10px;
  background: rgba(165, 21, 21, 0.05);
  border: 1px dashed rgba(165, 21, 21, 0.22);
}
.student-id-box__hint {
  display: block;
  font-size: 13px;
  color: #7b4b43;
  font-weight: 600;
}
.student-id-box__format {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #a98a82;
}
.rule {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 12px;
}
.rule__dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: #a51515;
  margin-top: 6px;
  flex-shrink: 0;
}
.rule__text {
  font-size: 11px;
  line-height: 1.6;
  color: #9b7a72;
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
.primary-btn--disabled {
  background: #d8c6c2;
  box-shadow: none;
  color: #fff;
}
.auth-link {
  display: block;
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: #a51515;
  padding: 4px 8px;
}
.auth-link--center {
  margin-top: 14px;
}
.auth-note {
  display: block;
  margin-top: 10px;
  text-align: center;
  font-size: 11px;
  color: #b09a94;
  line-height: 1.5;
}
.footer {
  margin-top: 22px;
  text-align: center;
  font-size: 10px;
  letter-spacing: 1.5px;
  color: #b6a39d;
}

/* 注册成功页 */
.success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.success__ring {
  width: 64px;
  height: 64px;
  border-radius: 999px;
  background: rgba(26, 158, 122, 0.1);
  border: 1px solid rgba(26, 158, 122, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}
.success__check {
  width: 42px;
  height: 42px;
  line-height: 42px;
  border-radius: 999px;
  background: #1a9e7a;
  color: #fff;
  font-size: 22px;
  font-weight: 700;
}
.success__title {
  font-size: 24px;
  font-weight: 700;
  color: #2d1616;
  letter-spacing: 2px;
}
.success__sub {
  margin-top: 6px;
  font-size: 12px;
  color: #8f7570;
}
.id-card {
  width: 100%;
  margin-top: 18px;
  padding: 16px 14px;
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(165, 21, 21, 0.08), rgba(255, 255, 255, 0.65));
  border: 1px solid rgba(165, 21, 21, 0.16);
  box-sizing: border-box;
}
.id-card__label {
  display: block;
  font-size: 11px;
  letter-spacing: 1px;
  color: #a98a82;
}
.id-card__value {
  display: block;
  margin-top: 6px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #a51515;
  word-break: break-all;
}
.copy-btn {
  margin: 12px 0 0;
  height: 34px;
  line-height: 34px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid rgba(165, 21, 21, 0.2);
  color: #a51515;
  font-size: 12px;
}
.warning {
  width: 100%;
  margin-top: 14px;
  padding: 12px 13px;
  border-radius: 10px;
  background: rgba(217, 72, 15, 0.08);
  border: 1px solid rgba(217, 72, 15, 0.18);
  box-sizing: border-box;
  text-align: left;
}
.warning__title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #b4432a;
}
.warning__text {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.7;
  color: #9a5b49;
}
.agree {
  width: 100%;
  margin-top: 14px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
}
.agree__box {
  width: 18px;
  height: 18px;
  line-height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(165, 21, 21, 0.3);
  background: #fff;
  color: transparent;
  font-size: 12px;
  text-align: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.agree__box--on {
  background: #a51515;
  border-color: #a51515;
  color: #fff;
}
.agree__text {
  font-size: 11px;
  line-height: 1.6;
  color: #7b5b55;
}
.verify-id {
  width: 100%;
  margin-top: 14px;
  text-align: left;
}
.verify-id__label {
  display: block;
  font-size: 11px;
  color: #7b5b55;
  margin-bottom: 7px;
}
.verify-id__input {
  width: 100%;
  height: 42px;
  line-height: 42px;
  padding: 0 13px;
  box-sizing: border-box;
  border-radius: 9px;
  border: 1px solid rgba(165, 21, 21, 0.18);
  background: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  letter-spacing: 1px;
  color: #2d1616;
}
.form__placeholder {
  color: #b9a49f;
  font-size: 12px;
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
