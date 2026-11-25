<template>
  <view class="participants-page">
    <AppHeader title="应签到人员" subtitle="PARTICIPANTS" back />

    <view class="participants-shell">
      <view v-if="loading" class="state">
        <view class="state__spinner"></view>
        <text class="state__text">正在加载人员…</text>
      </view>

      <MicaCard v-else-if="errorText" class="state-card">
        <view class="state">
          <text class="state__icon">!</text>
          <text class="state__title">加载失败</text>
          <text class="state__text">{{ errorText }}</text>
          <button class="state__btn" @click="load">重试</button>
        </view>
      </MicaCard>

      <template v-else-if="event">
        <MicaCard class="summary-card">
          <view class="summary-card__body">
            <view class="summary-head">
              <view class="summary-main">
                <text class="summary-title">{{ event.title }}</text>
                <text class="summary-class">{{ event.class_name }}</text>
              </view>
              <text class="summary-status" :class="`summary-status--${eventStatus}`">
                {{ statusLabel(eventStatus) }}
              </text>
            </view>
            <text class="summary-time">{{ startText }} → {{ endText }}（本地时间）</text>
            <view class="summary-counts">
              <view class="count">
                <text class="count__num">{{ arrived }}</text>
                <text class="count__label">已签到</text>
              </view>
              <view class="count">
                <text class="count__num">{{ counts.absent || 0 }}</text>
                <text class="count__label">未签到</text>
              </view>
              <view class="count">
                <text class="count__num">{{ counts.total || 0 }}</text>
                <text class="count__label">应签到</text>
              </view>
            </view>

            <button v-if="eventStatus === 'active'" class="end-btn" :disabled="ending" @click="endEvent">
              {{ ending ? '结束中…' : '提前结束签到' }}
            </button>
            <text v-if="eventStatus === 'upcoming'" class="summary-hint">
              签到开始后，创建者可以手动调整成员状态。
            </text>
            <text v-else class="summary-hint">
              手动调整会记录审计日志；设为已签到后不计入扫码/数字码人数。
            </text>
          </view>
        </MicaCard>

        <MicaCard class="list-card">
          <view class="list-card__body">
            <text class="list-title">应签到名单</text>

            <view v-if="items.length === 0" class="empty">
              <text class="empty__text">当前没有应签到成员。</text>
            </view>

            <view v-for="item in items" :key="item.record_id" class="member-row">
              <view class="member-row__main">
                <text class="member-row__name">{{ item.full_name }}</text>
                <text class="member-row__meta">{{ item.student_id }} · {{ item.enrollment_year }} 级 · {{ item.major_name }}</text>
                <text v-if="item.checked_in_at" class="member-row__time">
                  {{ formatTime(item.checked_in_at) }}
                  <text v-if="item.method === 'makeup'"> · 补签/手动</text>
                </text>
              </view>
              <view class="member-row__right">
                <text class="member-row__status" :class="`member-row__status--${item.status}`">
                  {{ item.status === 'present' ? '已签到' : '未签到' }}
                </text>
                <button
                  v-if="canEdit"
                  class="manual-btn"
                  :class="{ 'manual-btn--danger': item.status === 'present' }"
                  :disabled="updatingId === item.user_id"
                  @click="toggleStatus(item)"
                >
                  {{ updatingId === item.user_id ? '处理中…' : (item.status === 'present' ? '设为未签到' : '设为已签到') }}
                </button>
              </view>
            </view>
          </view>
        </MicaCard>

        <text class="hint">下拉刷新获取最新名单与状态</text>
      </template>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import { useAuth } from '../../composables/useAuth'
import { rpc } from '../../utils/authApi'
import { formatDeviceDateTime } from '../../utils/time'
import { resetHomeCache } from '../../utils/homeCache'

const auth = useAuth()
const eventId = ref('')
const event = ref(null)
const counts = ref({})
const items = ref([])
const loading = ref(true)
const errorText = ref('')
const ending = ref(false)
const updatingId = ref('')

const eventStatus = computed(() => {
  if (!event.value) return 'ended'
  const now = Date.now()
  if (now < new Date(event.value.start_at).getTime()) return 'upcoming'
  if (now <= new Date(event.value.end_at).getTime()) return 'active'
  return 'ended'
})

const canEdit = computed(() => eventStatus.value !== 'upcoming')
const arrived = computed(() => Number(counts.value.present || 0) + Number(counts.value.makeup || 0))
const startText = computed(() => formatDeviceDateTime(event.value && event.value.start_at))
const endText = computed(() => formatDeviceDateTime(event.value && event.value.end_at))

function statusLabel(status) {
  if (status === 'active') return '正在签到'
  if (status === 'upcoming') return '未开始'
  return '已结束'
}

function formatTime(value) {
  return formatDeviceDateTime(value)
}

async function load() {
  if (!eventId.value) return
  loading.value = true
  errorText.value = ''
  try {
    if (!auth.ready.value) await auth.restore()
    if (!auth.session.value || !auth.profile.value) {
      uni.reLaunch({ url: '/pages/auth/login' })
      return
    }
    const token = await auth.ensureAccessToken()
    const data = await rpc('get_event_results', { p_event_id: eventId.value }, token)
    event.value = data.event
    counts.value = data.counts || {}
    items.value = data.items || []
  } catch (e) {
    errorText.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function toggleStatus(item) {
  if (!canEdit.value || updatingId.value) return
  const present = item.status !== 'present'
  uni.showModal({
    title: present ? '设为已签到？' : '设为未签到？',
    content: present
      ? `将 ${item.full_name} 标记为已签到，方式记录为补签/手动。`
      : `将 ${item.full_name} 改为未签到，原有签到信息会被清除。`,
    confirmText: present ? '设为已签到' : '设为未签到',
    confirmColor: present ? '#1a8a69' : '#b4432a',
    success: async res => {
      if (!res.confirm) return
      updatingId.value = item.user_id
      try {
        await rpc(
          'set_event_participant_status',
          {
            p_event_id: eventId.value,
            p_user_id: item.user_id,
            p_present: present
          },
          await auth.ensureAccessToken()
        )
        resetHomeCache()
        uni.showToast({ title: present ? '已设为已签到' : '已设为未签到', icon: 'success' })
        await load()
      } catch (e) {
        uni.showToast({ title: e.message || '操作失败', icon: 'none', duration: 2600 })
      } finally {
        updatingId.value = ''
      }
    }
  })
}

function endEvent() {
  if (ending.value) return
  uni.showModal({
    title: '提前结束签到',
    content: '结束后成员不能再签到，已签到记录会保留。确定结束吗？',
    confirmText: '结束签到',
    confirmColor: '#b4432a',
    success: async res => {
      if (!res.confirm) return
      ending.value = true
      try {
        await rpc('end_checkin_event', { p_event_id: eventId.value }, await auth.ensureAccessToken())
        resetHomeCache()
        uni.showToast({ title: '签到已结束', icon: 'success' })
        await load()
      } catch (e) {
        uni.showToast({ title: e.message || '结束失败', icon: 'none', duration: 2600 })
      } finally {
        ending.value = false
      }
    }
  })
}

onLoad(options => {
  eventId.value = (options && (options.id || options.eventId)) || ''
  load()
})

onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.participants-page {
  min-height: 100vh;
  background: #f4efe9;
}
.participants-shell {
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
.summary-card__body,
.list-card__body {
  padding: 18px;
}
.summary-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.summary-main {
  min-width: 0;
}
.summary-title {
  display: block;
  font-size: 19px;
  font-weight: 700;
  color: #2d1616;
  line-height: 1.3;
}
.summary-class {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: #a98a82;
}
.summary-status {
  flex-shrink: 0;
  height: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 9px;
  color: #a51515;
  background: rgba(165, 21, 21, 0.07);
}
.summary-status--upcoming {
  color: #9b6d14;
  background: rgba(201, 154, 46, 0.1);
}
.summary-status--ended {
  color: #8f7570;
  background: rgba(143, 117, 112, 0.08);
}
.summary-time {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  color: #8f7570;
}
.summary-counts {
  display: flex;
  margin-top: 13px;
  padding-top: 10px;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
}
.count {
  flex: 1;
  text-align: center;
}
.count__num {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #3b1d1d;
}
.count__label {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: #a98a82;
}
.end-btn {
  margin-top: 13px;
  height: 40px;
  line-height: 40px;
  border: 1px solid rgba(217, 72, 15, 0.2);
  border-radius: 9px;
  background: rgba(217, 72, 15, 0.05);
  color: #b4432a;
  font-size: 12px;
}
.summary-hint {
  display: block;
  margin-top: 8px;
  font-size: 9px;
  line-height: 1.5;
  color: #b09a94;
}
.list-card {
  margin-top: 10px;
}
.list-title {
  font-size: 16px;
  font-weight: 700;
  color: #2d1616;
}
.empty {
  padding: 24px 0 10px;
  text-align: center;
}
.empty__text {
  font-size: 11px;
  color: #a98a82;
}
.member-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid rgba(165, 21, 21, 0.05);
}
.member-row:last-child {
  border-bottom: none;
}
.member-row__main {
  min-width: 0;
  flex: 1;
}
.member-row__name {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #2d1616;
}
.member-row__meta {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: #a98a82;
}
.member-row__time {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  color: #b09a94;
}
.member-row__right {
  flex-shrink: 0;
  text-align: right;
}
.member-row__status {
  display: block;
  font-size: 10px;
  color: #1a8a69;
}
.member-row__status--absent {
  color: #b4432a;
}
.manual-btn {
  margin-top: 6px;
  height: 28px;
  line-height: 28px;
  padding: 0 8px;
  border: 1px solid rgba(26, 138, 105, 0.25);
  border-radius: 6px;
  background: transparent;
  color: #1a8a69;
  font-size: 9px;
}
.manual-btn--danger {
  border-color: rgba(217, 72, 15, 0.22);
  color: #b4432a;
}
.hint {
  display: block;
  margin-top: 8px;
  text-align: center;
  font-size: 9px;
  color: #b6a39d;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
