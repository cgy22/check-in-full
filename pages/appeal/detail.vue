<template>
  <view class="appeal-detail-page">
    <BridgeHost page-path="pages/appeal/detail" />
    <AppHeader title="补签申请详情" subtitle="APPEAL DETAIL" back />

    <view class="detail-shell">
      <view v-if="loading" class="state">
        <view class="state__spinner"></view>
        <text class="state__text">正在加载申请…</text>
      </view>

      <MicaCard v-else-if="errorText" class="state-card">
        <view class="state">
          <text class="state__icon">!</text>
          <text class="state__title">加载失败</text>
          <text class="state__text">{{ errorText }}</text>
          <button class="state__btn" @click="load">重试</button>
        </view>
      </MicaCard>

      <template v-else-if="appeal && event">
        <MicaCard class="main-card">
          <view class="main-card__body">
            <view class="head">
              <view class="head__main">
                <text class="title">{{ event.title }}</text>
                <text class="class-name">{{ event.class_name }}</text>
              </view>
              <text class="status" :class="`status--${appeal.status}`">
                {{ statusLabel(appeal.status) }}
              </text>
            </view>

            <view class="meta">
              <view class="meta__row">
                <text class="meta__label">申请人</text>
                <text class="meta__value">{{ applicant.full_name }} · {{ applicant.student_id }}</text>
              </view>
              <view class="meta__row">
                <text class="meta__label">年级专业</text>
                <text class="meta__value">{{ applicant.enrollment_year }} 级 · {{ applicant.major_name }}</text>
              </view>
              <view class="meta__row">
                <text class="meta__label">签到时间</text>
                <text class="meta__value">{{ startText }} → {{ endText }}</text>
              </view>
              <view class="meta__row">
                <text class="meta__label">申请次数</text>
                <text class="meta__value">第 {{ appeal.attempt_no }} 次 / 共 3 次</text>
              </view>
            </view>

            <view class="reason-box">
              <text class="reason-box__label">申请理由</text>
              <text class="reason-box__text">{{ appeal.reason }}</text>
            </view>

            <view v-if="appeal.review_note" class="review-note">
              <text class="review-note__label">审批备注</text>
              <text class="review-note__text">{{ appeal.review_note }}</text>
            </view>
          </view>
        </MicaCard>

        <MicaCard v-if="isCreator && appeal.status === 'pending'" class="action-card">
          <view class="action-card__body">
            <text class="section-title">审批</text>
            <text class="section-desc">批准后该学生将变为已签到（补签方式）；不批准会保留未签到记录。</text>

            <textarea
              v-model="reviewNote"
              class="note-input"
              maxlength="500"
              placeholder="审批备注（可选）"
              placeholder-class="note-placeholder"
            />

            <view class="action-row">
              <button class="reject-btn" :disabled="reviewing" @click="review(false)">不予批准</button>
              <button class="approve-btn" :disabled="reviewing" @click="review(true)">批准补签</button>
            </view>
          </view>
        </MicaCard>

        <MicaCard
          v-if="isApplicant && appeal.status === 'pending'"
          class="action-card"
        >
          <view class="action-card__body">
            <text class="section-title">等待审批</text>
            <text class="section-desc">创建者还没有处理。你可以撤回这次申请，再重新提交。</text>
            <button class="reject-btn" :disabled="withdrawing" @click="withdraw">
              {{ withdrawing ? '撤回中…' : '撤回申请' }}
            </button>
          </view>
        </MicaCard>

        <MicaCard class="history-card">
          <view class="history-card__body">
            <text class="section-title">申请历史</text>
            <view v-for="h in history" :key="h.attempt_no" class="history-item">
              <view class="history-item__top">
                <text class="history-item__no">第 {{ h.attempt_no }} 次</text>
                <text class="history-item__status" :class="`history-item__status--${h.status}`">
                  {{ statusLabel(h.status) }}
                </text>
              </view>
              <text class="history-item__reason">{{ h.reason }}</text>
              <text v-if="h.review_note" class="history-item__note">备注：{{ h.review_note }}</text>
              <text v-if="h.reviewed_at" class="history-item__time">{{ formatTime(h.reviewed_at) }}</text>
            </view>
          </view>
        </MicaCard>
      </template>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import { useAuth } from '../../composables/useAuth'
import { rpc } from '../../utils/authApi'
import { formatDeviceDateTime } from '../../utils/time'

const auth = useAuth()

const appealId = ref('')
const appeal = ref(null)
const event = ref(null)
const applicant = ref({})
const record = ref(null)
const history = ref([])
const loading = ref(true)
const errorText = ref('')
const reviewNote = ref('')
const reviewing = ref(false)
const withdrawing = ref(false)

const isCreator = computed(() => {
  return !!(event.value && auth.profile.value && event.value.creator_id === auth.profile.value.id)
})
const isApplicant = computed(() => {
  return !!(appeal.value && auth.profile.value && appeal.value.user_id === auth.profile.value.id)
})

const startText = computed(() => formatDeviceDateTime(event.value && event.value.start_at))
const endText = computed(() => formatDeviceDateTime(event.value && event.value.end_at))

function statusLabel(status) {
  if (status === 'pending') return '待审批'
  if (status === 'approved') return '已通过'
  return '未通过'
}

function formatTime(value) {
  return formatDeviceDateTime(value)
}

async function load() {
  if (!appealId.value) {
    errorText.value = '缺少申请参数'
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
    const data = await rpc('get_appeal_detail', { p_appeal_id: appealId.value }, token)
    appeal.value = data.appeal
    event.value = data.event
    applicant.value = data.applicant || {}
    record.value = data.record || null
    history.value = data.history || []
    reviewNote.value = ''
  } catch (e) {
    errorText.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function review(approve) {
  if (reviewing.value) return
  uni.showModal({
    title: approve ? '批准补签？' : '不予批准？',
    content: approve
      ? '批准后该学生将变为已签到，并标记为补签。'
      : '不批准会保留未签到记录，学生可以再次申请（最多 3 次）。',
    confirmText: approve ? '批准' : '不批准',
    confirmColor: approve ? '#1a8a69' : '#b4432a',
    success: async res => {
      if (!res.confirm) return
      reviewing.value = true
      try {
        await rpc(
          'review_appeal',
          {
            p_appeal_id: appealId.value,
            p_approve: approve,
            p_note: reviewNote.value.trim() || null
          },
          await auth.ensureAccessToken()
        )
        uni.showToast({ title: approve ? '已批准补签' : '已拒绝申请', icon: 'success' })
        await load()
      } catch (e) {
        uni.showToast({ title: e.message || '审批失败', icon: 'none', duration: 2800 })
      } finally {
        reviewing.value = false
      }
    }
  })
}

function withdraw() {
  if (withdrawing.value) return
  uni.showModal({
    title: '撤回申请',
    content: '撤回后这次申请记录会删除，你可以重新提交。',
    confirmText: '撤回',
    confirmColor: '#b4432a',
    success: async res => {
      if (!res.confirm) return
      withdrawing.value = true
      try {
        await rpc(
          'withdraw_appeal',
          { p_appeal_id: appealId.value },
          await auth.ensureAccessToken()
        )
        uni.showToast({ title: '已撤回申请', icon: 'success' })
        setTimeout(() => uni.navigateBack({ delta: 1 }), 400)
      } catch (e) {
        uni.showToast({ title: e.message || '撤回失败', icon: 'none', duration: 2600 })
      } finally {
        withdrawing.value = false
      }
    }
  })
}

onLoad(options => {
  appealId.value = (options && (options.id || options.appealId)) || ''
})

onShow(() => {
  load()
})

onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.appeal-detail-page {
  min-height: 100vh;
  background: #f4efe9;
}
.detail-shell {
  max-width: 540px;
  margin: 0 auto;
  padding: 8px 18px 30px;
}
.state-card {
  margin-top: 4px;
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
  line-height: 1.6;
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
.main-card__body,
.action-card__body,
.history-card__body {
  padding: 18px;
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.head__main {
  min-width: 0;
}
.title {
  display: block;
  font-size: 19px;
  font-weight: 700;
  color: #2d1616;
  line-height: 1.3;
}
.class-name {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: #a98a82;
}
.status {
  flex-shrink: 0;
  height: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 9px;
  color: #9b6d14;
  background: rgba(201, 154, 46, 0.1);
}
.status--approved {
  color: #1a8a69;
  background: rgba(26, 158, 122, 0.09);
}
.status--rejected {
  color: #b4432a;
  background: rgba(217, 72, 15, 0.07);
}
.meta {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
}
.meta__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}
.meta__label {
  font-size: 10px;
  color: #a98a82;
  flex-shrink: 0;
}
.meta__value {
  font-size: 10px;
  color: #6f4c45;
  text-align: right;
}
.reason-box {
  margin-top: 14px;
  padding: 11px 12px;
  border-radius: 9px;
  background: rgba(165, 21, 21, 0.035);
}
.reason-box__label {
  display: block;
  font-size: 9px;
  color: #a98a82;
}
.reason-box__text {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.7;
  color: #6f4c45;
  white-space: pre-wrap;
}
.review-note {
  margin-top: 10px;
  padding: 9px 11px;
  border-radius: 8px;
  background: rgba(26, 158, 122, 0.05);
}
.review-note__label {
  display: block;
  font-size: 9px;
  color: #1a8a69;
}
.review-note__text {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.6;
  color: #4b6b5f;
}
.action-card {
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
  line-height: 1.6;
  color: #a98a82;
}
.note-input {
  width: 100%;
  min-height: 72px;
  margin-top: 12px;
  padding: 9px 11px;
  box-sizing: border-box;
  border-radius: 9px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  line-height: 1.6;
  color: #2d1616;
}
.note-placeholder {
  color: #b9a49f;
  font-size: 10px;
}
.action-row {
  display: flex;
  gap: 9px;
  margin-top: 12px;
}
.reject-btn,
.approve-btn {
  flex: 1;
  height: 42px;
  line-height: 42px;
  border-radius: 9px;
  font-size: 12px;
  border: 1px solid rgba(165, 21, 21, 0.18);
  background: transparent;
  color: #b4432a;
}
.approve-btn {
  border: none;
  background: #1a8a69;
  color: #fff;
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
.history-item__time {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  color: #b09a94;
}
.reject-btn[disabled],
.approve-btn[disabled] {
  opacity: 0.5;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
