<template>
  <view class="settings-page">
    <BridgeHost page-path="pages/profile/settings" />
    <AppHeader title="账号设置" subtitle="ACCOUNT SETTINGS" back />

    <view class="settings-shell">
      <view class="tabs">
        <view class="tab" :class="{ 'tab--active': tab === 'basic' }" @click="switchTab('basic')">
          基本资料
        </view>
        <view class="tab" :class="{ 'tab--active': tab === 'password' }" @click="switchTab('password')">
          修改密码
        </view>
      </view>

      <MicaCard v-if="tab === 'basic'" class="form-card">
        <view class="form-card__body">
          <text class="section-title">基本资料</text>
          <text class="section-desc">姓名支持中文；学号生成后不可修改。</text>

          <view class="field">
            <text class="field__label">姓名</text>
            <input
              v-model="basic.fullName"
              class="field__input"
              maxlength="50"
              placeholder="请输入真实姓名"
              placeholder-class="field__placeholder"
            />
          </view>

          <view class="field-row">
            <view class="field field--half">
              <text class="field__label">入学年份</text>
              <picker mode="selector" :range="yearLabels" :value="yearIndex" @change="onYearChange">
                <view class="picker-box">{{ yearLabels[yearIndex] }}</view>
              </picker>
            </view>
            <view class="field field--half">
              <text class="field__label">专业</text>
              <picker mode="selector" :range="MAJORS" range-key="name" :value="majorIndex" @change="onMajorChange">
                <view class="picker-box">{{ MAJORS[majorIndex].name }}</view>
              </picker>
            </view>
          </view>

          <view class="field">
            <text class="field__label">学号</text>
            <view class="readonly-box">{{ profile.student_id }}</view>
          </view>

          <view class="captcha" :class="{ 'captcha--auto': isApp }">
            <text v-if="!isApp" class="field__label">人机验证</text>
            <TurnstileGate
              ref="basicGateRef"
              action="profile_update"
              :app-trigger="false"
              @success="basicToken = $event"
              @error="basicToken = ''"
              @expired="basicToken = ''"
            />
          </view>

          <button class="primary-btn" :disabled="savingBasic || !canSaveBasic" @click="saveBasic">
            {{ savingBasic ? '保存中…' : '保存基本资料' }}
          </button>
        </view>
      </MicaCard>

      <MicaCard v-else class="form-card">
        <view class="form-card__body">
          <text class="section-title">修改密码</text>
          <text class="section-desc">新密码至少 8 位，必须同时包含字母和数字。修改后旧密码立即失效。</text>

          <view class="field">
            <text class="field__label">旧密码</text>
            <input
              v-model="password.oldPassword"
              class="field__input"
              :password="!showOld"
              maxlength="64"
              placeholder="请输入当前密码"
              placeholder-class="field__placeholder"
            />
            <text class="eye" @click="showOld = !showOld">{{ showOld ? '隐藏' : '显示' }}</text>
          </view>

          <view class="field">
            <text class="field__label">新密码</text>
            <input
              v-model="password.newPassword"
              class="field__input"
              :password="!showNew"
              maxlength="64"
              placeholder="至少 8 位，字母 + 数字"
              placeholder-class="field__placeholder"
            />
            <text class="eye" @click="showNew = !showNew">{{ showNew ? '隐藏' : '显示' }}</text>
          </view>

          <view class="field">
            <text class="field__label">确认新密码</text>
            <input
              v-model="password.confirmPassword"
              class="field__input"
              :password="!showNew"
              maxlength="64"
              placeholder="再次输入新密码"
              placeholder-class="field__placeholder"
            />
          </view>

          <view class="captcha" :class="{ 'captcha--auto': isApp }">
            <text v-if="!isApp" class="field__label">人机验证</text>
            <TurnstileGate
              ref="passwordGateRef"
              action="change_password"
              :app-trigger="false"
              @success="passwordToken = $event"
              @error="passwordToken = ''"
              @expired="passwordToken = ''"
            />
          </view>

          <button class="primary-btn" :disabled="savingPassword || !canSavePassword" @click="savePassword">
            {{ savingPassword ? '修改中…' : '修改密码' }}
          </button>
        </view>
      </MicaCard>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import TurnstileGate from '../../components/TurnstileGate.vue'
import { useAuth } from '../../composables/useAuth'
import { useCaptcha } from '../../composables/useCaptcha'
import { getLoginSalt, rpc, updatePassword } from '../../utils/authApi'
import { randomHex, sha256Hex } from '../../utils/crypto'
import { ENROLLMENT_YEARS, MAJORS } from '../../utils/constants'
import { isValidName, isValidPassword } from '../../utils/validators'

const auth = useAuth()
const captcha = useCaptcha()
const profile = computed(() => auth.profile.value || {})

const tab = ref('basic')
const basicGateRef = ref(null)
const passwordGateRef = ref(null)
const basicToken = ref('')
const passwordToken = ref('')
const savingBasic = ref(false)
const savingPassword = ref(false)
const showOld = ref(false)
const showNew = ref(false)

const isApp = (() => {
  try {
    return uni.getSystemInfoSync().uniPlatform === 'app'
  } catch (e) {
    return false
  }
})()

const yearLabels = ENROLLMENT_YEARS.map(y => `${y} 级`)
const yearIndex = ref(0)
const majorIndex = ref(0)

const basic = reactive({
  fullName: '',
  enrollmentYear: ENROLLMENT_YEARS[0]
})

const password = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const canSaveBasic = computed(() => {
  return (
    !savingBasic.value &&
    isValidName(basic.fullName) &&
    (isApp || !!basicToken.value)
  )
})

const canSavePassword = computed(() => {
  return (
    !savingPassword.value &&
    password.oldPassword.length >= 8 &&
    isValidPassword(password.newPassword) &&
    password.newPassword === password.confirmPassword &&
    (isApp || !!passwordToken.value)
  )
})

function switchTab(next) {
  if (tab.value === next) return
  tab.value = next
  basicToken.value = ''
  passwordToken.value = ''
}

function syncForm() {
  const p = profile.value
  if (!p || !p.id) return
  basic.fullName = p.full_name || ''
  const yi = ENROLLMENT_YEARS.indexOf(Number(p.enrollment_year))
  yearIndex.value = yi >= 0 ? yi : Math.max(0, ENROLLMENT_YEARS.indexOf(new Date().getFullYear()))
  basic.enrollmentYear = ENROLLMENT_YEARS[yearIndex.value]
  const mi = MAJORS.findIndex(m => m.code === p.major_code)
  majorIndex.value = mi >= 0 ? mi : 0
}

function onYearChange(e) {
  yearIndex.value = Number(e.detail.value)
  basic.enrollmentYear = ENROLLMENT_YEARS[yearIndex.value]
}

function onMajorChange(e) {
  majorIndex.value = Number(e.detail.value)
}

function resetBasicGate() {
  basicToken.value = ''
  if (basicGateRef.value && basicGateRef.value.reset) basicGateRef.value.reset()
}

function resetPasswordGate() {
  passwordToken.value = ''
  if (passwordGateRef.value && passwordGateRef.value.reset) passwordGateRef.value.reset()
}

async function saveBasic() {
  if (!canSaveBasic.value) {
    uni.showToast({ title: isApp ? '请填写正确的姓名' : '请填写姓名并完成人机验证', icon: 'none' })
    return
  }
  savingBasic.value = true
  try {
    let token = basicToken.value
    if (isApp) token = await basicGateRef.value.open()
    const ticket = await captcha.issue('profile_update', token)
    const data = await rpc(
      'update_profile',
      {
        p_full_name: basic.fullName.trim(),
        p_enrollment_year: basic.enrollmentYear,
        p_major_code: MAJORS[majorIndex.value].code,
        p_captcha_ticket: ticket
      },
      await auth.ensureAccessToken()
    )
    auth.profile.value = data
    uni.showToast({ title: '资料已保存', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e.message || '保存失败', icon: 'none', duration: 2600 })
    resetBasicGate()
  } finally {
    savingBasic.value = false
  }
}

async function savePassword() {
  if (!canSavePassword.value) {
    uni.showToast({ title: '请检查旧密码、新密码和确认密码', icon: 'none' })
    return
  }
  if (password.oldPassword === password.newPassword) {
    uni.showToast({ title: '新密码不能和旧密码相同', icon: 'none' })
    return
  }

  savingPassword.value = true
  try {
    const accessToken = await auth.ensureAccessToken()
    const studentId = profile.value.student_id

    // 1) 本地用旧盐计算旧 hash，再由 RPC 用 auth.users 的 bcrypt 校验
    const oldSalt = await getLoginSalt(studentId)
    const oldHash = sha256Hex(`${oldSalt}|${password.oldPassword}`)
    await rpc('verify_my_password', { p_password_hash: oldHash }, accessToken)

    // 2) 验证真人，拿一次性 ticket
    let token = passwordToken.value
    if (isApp) token = await passwordGateRef.value.open()
    const ticket = await captcha.issue('change_password', token)

    // 3) 生成新盐/新 hash，先更新 Supabase Auth，再保存新盐
    const newSalt = randomHex(16)
    const newHash = sha256Hex(`${newSalt}|${password.newPassword}`)
    await updatePassword(newHash, accessToken)
    await rpc(
      'set_password_salt',
      { p_new_salt: newSalt, p_captcha_ticket: ticket },
      accessToken
    )

    password.oldPassword = ''
    password.newPassword = ''
    password.confirmPassword = ''
    resetPasswordGate()
    uni.showToast({ title: '密码已修改', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: e.message || '修改失败', icon: 'none', duration: 3000 })
    resetPasswordGate()
  } finally {
    savingPassword.value = false
  }
}

onShow(() => {
  if (!auth.session.value) {
    uni.reLaunch({ url: '/pages/auth/login' })
    return
  }
  syncForm()
})
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: #f4efe9;
}
.settings-shell {
  max-width: 540px;
  margin: 0 auto;
  padding: 8px 18px 30px;
}
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.tab {
  flex: 1;
  padding: 8px 0;
  text-align: center;
  border-radius: 8px;
  font-size: 11px;
  color: #8f7570;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.65);
}
.tab--active {
  color: #a51515;
  background: rgba(165, 21, 21, 0.07);
  border-color: rgba(165, 21, 21, 0.16);
  font-weight: 600;
}
.form-card__body {
  padding: 18px;
}
.section-title {
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: #2d1616;
}
.section-desc {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  line-height: 1.6;
  color: #a98a82;
}
.field {
  position: relative;
  margin-top: 14px;
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
  margin-bottom: 7px;
  font-size: 11px;
  color: #7b5b55;
}
.field__input,
.picker-box,
.readonly-box {
  width: 100%;
  height: 44px;
  line-height: 44px;
  padding: 0 13px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  color: #2d1616;
}
.readonly-box {
  color: #8f7570;
  background: rgba(255, 255, 255, 0.4);
}
.field__placeholder {
  color: #b9a49f;
  font-size: 11px;
}
.eye {
  position: absolute;
  right: 12px;
  bottom: 13px;
  font-size: 10px;
  color: #a98a82;
}
.captcha {
  margin-top: 16px;
}
.captcha--auto {
  margin-top: 0;
}
.primary-btn {
  margin-top: 18px;
  height: 46px;
  line-height: 46px;
  border: none;
  border-radius: 10px;
  background: #a51515;
  color: #fff;
  font-size: 13px;
}
.primary-btn[disabled] {
  opacity: 0.45;
}
</style>
