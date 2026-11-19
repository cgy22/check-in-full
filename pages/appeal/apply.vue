<template>
  <view class="appeal-page">
    <BridgeHost page-path="pages/appeal/apply" />
    <AppHeader title="申请补签" subtitle="MAKEUP APPEAL" back />

    <view class="appeal-shell">
      <view v-if="loading" class="state">
        <view class="state__spinner"></view>
        <text class="state__text">正在加载…</text>
      </view>

      <MicaCard v-else-if="errorText" class="state-card">
        <view class="state">
          <view class="state__icon">!</view>
          <text class="state__title">无法申请</text>
          <text class="state__text">{{ errorText }}</text>
          <button class="state__btn" @click="load">重试</button>
        </view>
      </MicaCard>

      <template v-else-if="event && myRecord">
        <MicaCard class="info-card">
          <view class="info-card__body">
            <text class="info-title">{{ event.title }}</text>
            <text class="info-class">{{ event.class_name }}</text>
            <view class="info-rows">
              <view class="info-row">
                <text class="info-row__label">签到时间</text>
                <text class="info-row__value">{{ startText }} → {{ endText }}</text>
              </view>
              <view class="info-row">
                <text class="info-row__label">我的状态</text>
                <text class="info-row__value info-row__value--absent">未签到</text>
              </view>
              <view class="info-row">
                <text class="info-row__label">补签机会</text>
                <text class="info-row__value">已用 {{ appeals.length }} / 3 次</text>
              </view>
            </view>
          </view>
        </MicaCard>

        <MicaCard v-if="!canApply" class="state-card">
          <view class="state">
            <text class="state__title">{{ blockedTitle }}</text>
            <text class="state__text">{{ blockedText }}</text>
            <button v-if="pendingAppeal" class="state__btn" @click="goAppealDetail">查看申请</button>
          </view>
        </MicaCard>

        <MicaCard v-else class="form-card">
          <view class="form-card__body">
            <text class="section-title">补签理由</text>
            <text class="section-desc">
              请说明未签到的原因（10–500 字），创建者会收到申请并审批。每次申请都会占用一次机会。
            </text>

            <textarea
              v-model="reason"
              class="reason-input"
              maxlength="500"
              placeholder="例如：当天手机没电，未能及时完成签到，请批准补签。"
              placeholder-class="reason-placeholder"
            />
            <text class="reason-count">至少 10 字 · {{ reason.length }}/500</text>

            <view class="captcha" :class="{ 'captcha--auto': isApp }">
              <text v-if="!isApp" class="field-label">人机验证</text>
              <TurnstileGate
                ref="gateRef"
                action="appeal"
                :app-trigger="false"
                @success="onCaptchaSuccess"
                @error="onCaptchaError"
                @expired="onCaptchaExpired"
              />
            </view>

            <button
              class="primary-btn"
              :disabled="submitting || !canSubmit"
              @click="submit"
            >
              {{ submitting ? '提交中…' : '提交补签申请' }}
            </button>
          </view>
        </MicaCard>

        <MicaCard v-if="appeals.length" class="history-card">
          <view class="history-card__body">
            <text class="section-title">申请记录</text>
            <view v-for="a in appeals" :key="a.id" class="history-item">
              <view class="history-item__top">
                <text class="history-item__no">第 {{ a.attempt_no }} 次</text>
                <text class="history-item__status" :class="`history-item__status--${a.status}`">
                  {{ appealStatusLabel(a.status) }}
                </text>
              </view>
              <text class="history-item__reason">{{ a.reason }}</text>
              <text v-if="a.review_note" class="history-item__note">审批备注：{{ a.review_note }}</text>
            </view>
          </view>
        </MicaCard>
      </template>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import TurnstileGate from '../../components/TurnstileGate.vue'
import { useAuth } from '../../composables/useAuth'
import { useCaptcha } from '../../composables/useCaptcha'
import { rpc } from '../../utils/authApi'
import { formatDeviceDateTime } from '../../utils/time'

const auth = useAuth()
const captcha = useCaptcha()
const gateRef = ref(null)

const recordId = ref('')
const eventId = ref('')
const event = ref(null)
const myRecord = ref(null)
const appeals = ref([])
const loading = ref(true)
const errorText = ref('')
const reason = ref('')
const captchaToken = ref('')
const submitting = ref(false)

const isApp = (() => {
  try {
    return uni.getSystemInfoSync().uniPlatform === 'app'
  } catch (e) {
    return false
  }
})()

const pendingAppeal = computed(() => appeals.value.find(a => a.status === 'pending') || null)
const approvedAppeal = computed(() => appeals.value.find(a => a.status === 'approved') || null)
const canApply = computed(() => {
  return (
    myRecord.value &&
    myRecord.value.status === 'absent' &&
    !pendingAppeal.value &&
    !approvedAppeal.value &&
    appeals.value.length < 3
  )
})

const canSubmit = computed(() => {
  return (
    canApply.value &&
    !submitting.value &&
    reason.value.trim().length >= 10 &&
    (isApp || !!captchaToken.value)
  )
})

const blockedTitle = computed(() => {
  if (pendingAppeal.value) return '补签申请待审批'
  if (approvedAppeal.value) return '补签已通过'
  if (appeals.value.length >= 3) return '补签机会已用完'
  return '暂不能申请'
})

const blockedText = computed(() => {
  if (pendingAppeal.value) return '创建者还没有处理你的申请，请等待审批结果。'
  if (approvedAppeal.value) return '该场签到已通过补签，无需重复申请。'
  if (appeals.value.length >= 3) return '已使用 3 次补签申请，不能继续申请。'
  return '当前签到记录不支持补签申请。'
})

const startText = computed(() => formatDeviceDateTime(event.value && event.value.start_at))
const endText = computed(() => formatDeviceDateTime(event.value && event.value.end_at))

function appealStatusLabel(status) {
  if (status === 'pending') return '待审批'
  if (status === 'approved') return '已通过'
  return '未通过'
}

async function load() {
  if (!recordId.value) {
    errorText.value = '缺少签到记录参数'
    loading.value = false
    return
  }
  loading.value = true
  errorText.value = ''
  try {
    if (!auth.ready.value) await auth.restore()
    if (!auth.session.value || !auth.profile.value) {
      uni.reLaunch({ url: '/pages/auth/login' })
      return
    }
    const token = await auth.ensureAccessToken()
    const data = await rpc('get_checkin_event', { p_event_id: eventId.value }, token)
    event.value = data.event
    myRecord.value = data.my_record
    appeals.value = data.my_appeals || []
    if (!myRecord.value || myRecord.value.id !== recordId.value) {
      errorText.value = '签到记录不存在或不属于当前账号'
      return
    }
    if (myRecord.value.status === 'present') {
      errorText.value = '你已经签到，无需补签'
    } else if (event.value && new Date(event.value.end_at).getTime() > Date.now()) {
      errorText.value = '签到还未结束，不能申请补签'
    } else if (event.value && event.value.creator_id === auth.profile.value.id) {
      errorText.value = '发布者不需要签到，也不能给自己的活动申请补签'
    }
  } catch (e) {
    errorText.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
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
  if (!canSubmit.value || submitting.value) {
    uni.showToast({ title: isApp ? '请填写至少 10 个字的理由' : '请填写理由并完成人机验证', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    let token = captchaToken.value
    if (isApp) token = await gateRef.value.open()
    const ticket = await captcha.issue('appeal', token)
    await rpc(
      'apply_makeup',
      {
        p_record_id: recordId.value,
        p_reason: reason.value.trim(),
        p_captcha_ticket: ticket
      },
      await auth.ensureAccessToken()
    )
    uni.showToast({ title: '补签申请已提交', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack({ delta: 1 })
    }, 500)
  } catch (e) {
    uni.showToast({ title: e.message || '申请失败', icon: 'none', duration: 2800 })
    resetCaptcha()
    await load()
  } finally {
    submitting.value = false
  }
}

function goAppealDetail() {
  if (!pendingAppeal.value) return
  uni.navigateTo({ url: `/pages/appeal/detail?id=${pendingAppeal.value.id}` })
}

onLoad(options => {
  recordId.value = (options && (options.recordId || options.record_id)) || ''
  eventId.value = (options && (options.eventId || options.event_id)) || ''
  load()
})
</script>

<style scoped>
.appeal-page {
  min-height: 100vh;
  background: #f4efe9;
}
.appeal-shell {
  max-width: 540px;
  margin: 0 auto;
  padding: 8px 18px 30px;
}
.state-card {
  margin-top: 8px;
}
.state {
  padding: 38px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}
.state__spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(165, 21, 21, 0.14);
  border-top-color: #a51515;
  animation: spin 0.8s linear infinite;
}
.state__icon {
  width: 40px;
  height: 40px;
  line-height: 40px;
  border-radius: 14px;
  background: rgba(165, 21, 21, 0.07);
  color: #a51515;
  font-size: 20px;
}
.state__title {
  font-size: 15px;
  font-weight: 700;
  color: #4b2a2a;
}
.state__text {
  font-size: 11px;
  line-height: 1.7;
  color: #a98a82;
}
.state__btn {
  margin-top: 6px;
  height: 36px;
  line-height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 8px;
  background: #a51515;
  color: #fff;
  font-size: 12px;
}
.info-card__body,
.form-card__body,
.history-card__body {
  padding: 18px;
}
.info-title {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #2d1616;
}
.info-class {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: #a98a82;
}
.info-rows {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
}
.info-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}
.info-row__label {
  font-size: 10px;
  color: #a98a82;
}
.info-row__value {
  font-size: 10px;
  color: #6f4c45;
  text-align: right;
}
.info-row__value--absent {
  color: #b4432a;
}
.form-card {
  margin-top: 10px;
}
.section-title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #2d1616;
}
.section-desc {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  line-height: 1.7;
  color: #a98a82;
}
.reason-input {
  width: 100%;
  min-height: 118px;
  margin-top: 12px;
  padding: 11px 12px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  line-height: 1.7;
  color: #2d1616;
}
.reason-placeholder {
  color: #b9a49f;
  font-size: 11px;
}
.reason-count {
  display: block;
  margin-top: 4px;
  text-align: right;
  font-size: 9px;
  color: #b09a94;
}
.captcha {
  margin-top: 16px;
}
.captcha--auto {
  margin-top: 0;
}
.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 11px;
  color: #7b5b55;
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
.history-card {
  margin-top: 10px;
}
.history-item {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
}
.history-item__top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.history-item__no {
  font-size: 10px;
  color: #7b5b55;
}
.history-item__status {
  font-size: 9px;
  color: #9b6d14;
}
.history-item__status--approved {
  color: #1a8a69;
}
.history-item__status--rejected {
  color: #b4432a;
}
.history-item__reason {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  line-height: 1.6;
  color: #6f4c45;
}
.history-item__note {
  display: block;
  margin-top: 4px;
  font-size: 9px;
  color: #a98a82;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
