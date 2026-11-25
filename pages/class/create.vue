<template>
  <view class="class-page">
    <AppHeader title="新建班级" subtitle="CREATE CLASS" back />

    <view class="class-shell">
      <MicaCard v-if="!successInfo" class="class-card">
        <view class="class-card__body">
          <text class="section-title">班级信息</text>
          <text class="section-desc">创建后你会自动成为班级创建者，并生成 8 位邀请码。</text>

          <view class="field">
            <text class="field__label">班级名称</text>
            <input
              v-model="name"
              class="field__input"
              maxlength="50"
              placeholder="例如：2026 级计算机 1 班"
              placeholder-class="field__placeholder"
            />
          </view>

          <view class="field">
            <text class="field__label">邀请码有效期</text>
            <picker
              mode="selector"
              :range="validityLabels"
              :value="validityIndex"
              @change="onValidityChange"
            >
              <view class="picker-box">{{ validityLabels[validityIndex] }}</view>
            </picker>
            <text class="field__hint">过期后邀请码失效，已在班级内的成员不受影响。</text>
          </view>

          <view v-if="!isApp" class="captcha">
            <text v-if="!isApp" class="field__label">人机验证</text>
            <CaptchaGate
              ref="gateRef"
              action="create_class"
              @success="onCaptchaSuccess"
              @error="onCaptchaError"
              @expired="onCaptchaExpired"
            />
          </view>

          <button class="primary-btn" :disabled="submitting || !canSubmit" @click="submit">
            {{ submitting ? '创建中…' : '创建班级' }}
          </button>
        </view>
      </MicaCard>

      <MicaCard v-else class="class-card">
        <view class="class-card__body success">
          <view class="success__ring">✓</view>
          <text class="success__title">班级创建成功</text>
          <text class="success__desc">把下面的邀请码发给同学，对方输入后即可加入。</text>

          <view class="invite-box">
            <text class="invite-box__label">8 位邀请码</text>
            <text class="invite-box__code">{{ successInfo.invite_code }}</text>
            <text class="invite-box__expire">有效期至 {{ formatDateTime(successInfo.invite_expires_at) }}</text>
          </view>

          <button class="primary-btn" @click="copyCode">复制邀请码</button>
          <button class="ghost-btn" @click="goDetail">进入班级详情</button>
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
import { INVITE_VALIDITY_OPTIONS } from '../../utils/constants'
import { formatDateTime } from '../../utils/format'

const auth = useAuth()
const gateRef = ref(null)

const isApp = (() => {
  try {
    return uni.getSystemInfoSync().uniPlatform === 'app'
  } catch (e) {
    return false
  }
})()

const name = ref('')
const validityIndex = ref(1)
const validityLabels = INVITE_VALIDITY_OPTIONS.map(o => o.label)
const captchaToken = ref('')
const submitting = ref(false)
const successInfo = ref(null)

const canSubmit = computed(() => {
  const valid = !submitting.value && name.value.trim().length >= 1
  return valid && (isApp || !!captchaToken.value)
})

function onValidityChange(e) {
  validityIndex.value = Number(e.detail.value)
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
    uni.showToast({ title: isApp ? '请填写班级名称' : '请填写班级名称并完成人机验证', icon: 'none' })
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
      'create_class',
      {
        p_name: name.value.trim(),
        p_validity_seconds: INVITE_VALIDITY_OPTIONS[validityIndex.value].seconds,
        p_captcha_ticket: ticket
      },
      accessToken
    )
    successInfo.value = data
  } catch (e) {
    uni.showToast({ title: e.message || '创建失败', icon: 'none', duration: 2600 })
    // 失败后重新获取一次性验证票据。
    resetCaptcha()
  } finally {
    submitting.value = false
  }
}

function copyCode() {
  if (!successInfo.value) return
  uni.setClipboardData({
    data: successInfo.value.invite_code,
    success: () => uni.showToast({ title: '邀请码已复制', icon: 'success' })
  })
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
.field__placeholder {
  color: #b9a49f;
  font-size: 12px;
}
.field__hint {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  color: #b09a94;
  line-height: 1.5;
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
.ghost-btn {
  margin-top: 12px;
  height: 44px;
  line-height: 44px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid rgba(165, 21, 21, 0.18);
  color: #a51515;
  font-size: 13px;
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
  letter-spacing: 1px;
}
.success__desc {
  margin-top: 7px;
  max-width: 300px;
  font-size: 11px;
  line-height: 1.7;
  color: #9b7a72;
}
.invite-box {
  width: 100%;
  margin-top: 18px;
  padding: 16px;
  border-radius: 12px;
  background: rgba(165, 21, 21, 0.06);
  border: 1px dashed rgba(165, 21, 21, 0.22);
  box-sizing: border-box;
}
.invite-box__label {
  display: block;
  font-size: 10px;
  color: #a98a82;
}
.invite-box__code {
  display: block;
  margin-top: 6px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 4px;
  color: #a51515;
}
.invite-box__expire {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  color: #b09a94;
}
.link {
  display: block;
  margin-top: 16px;
  font-size: 12px;
  color: #a51515;
  padding: 4px 8px;
}
</style>
