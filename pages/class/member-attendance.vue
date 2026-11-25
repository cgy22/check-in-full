<template>
  <view class="member-attendance-page">
    <AppHeader :title="member.full_name || memberName || '成员出勤'" subtitle="MEMBER ATTENDANCE" back />

    <view class="detail-shell">
      <view v-if="loading" class="state">
        <view class="state__spinner"></view>
        <text class="state__text">正在加载…</text>
      </view>

      <MicaCard v-else-if="errorText" class="state-card">
        <view class="state">
          <text class="state__icon">!</text>
          <text class="state__title">加载失败</text>
          <text class="state__text">{{ errorText }}</text>
          <button class="state__btn" @click="load">重试</button>
        </view>
      </MicaCard>

      <template v-else>
        <MicaCard class="member-card">
          <view class="member-card__body">
            <text class="member-name">{{ member.full_name }}</text>
            <text class="member-meta">
              {{ member.student_id }} · {{ member.enrollment_year }} 级 · {{ member.major_name }}
            </text>
            <view class="member-stats">
              <view class="stat">
                <text class="stat__num">{{ items.length }}</text>
                <text class="stat__label">已结束签到</text>
              </view>
              <view class="stat">
                <text class="stat__num">{{ presentCount }}</text>
                <text class="stat__label">已签到</text>
              </view>
              <view class="stat">
                <text class="stat__num">{{ absentCount }}</text>
                <text class="stat__label">未签到</text>
              </view>
            </view>
          </view>
        </MicaCard>

        <MicaCard class="list-card">
          <view class="list-card__body">
            <text class="list-title">签到明细</text>

            <view v-if="items.length === 0" class="empty">
              <text class="empty__text">暂无已结束的签到记录。</text>
            </view>

            <view v-for="item in items" :key="item.event_id" class="event-row">
              <view class="event-row__main">
                <text class="event-row__title">{{ item.title }}</text>
                <text class="event-row__time">{{ formatTime(item.start_at) }}</text>
                <text v-if="item.checked_in_at" class="event-row__checked">
                  签到于 {{ formatTime(item.checked_in_at) }}
                  <text v-if="item.is_late_slice"> · 上一轮码</text>
                </text>
              </view>
              <view class="event-row__right">
                <text class="event-row__status" :class="`event-row__status--${item.status}`">
                  {{ statusLabel(item) }}
                </text>
                <text v-if="item.appeal_status" class="event-row__appeal">
                  {{ appealStatusLabel(item.appeal_status) }}
                </text>
              </view>
            </view>
          </view>
        </MicaCard>
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

const auth = useAuth()
const classId = ref('')
const userId = ref('')
const memberName = ref('')
const member = ref({})
const items = ref([])
const loading = ref(true)
const errorText = ref('')

const presentCount = computed(() => items.value.filter(x => x.status === 'present').length)
const absentCount = computed(() => items.value.filter(x => x.status === 'absent').length)

function formatTime(value) {
  return formatDeviceDateTime(value)
}

function statusLabel(item) {
  if (item.status !== 'present') return '未签到'
  if (item.method === 'makeup') return '补签'
  return '已签到'
}

function appealStatusLabel(status) {
  if (status === 'pending') return '补签待审'
  if (status === 'approved') return '补签通过'
  return '补签未通过'
}

async function load() {
  if (!classId.value || !userId.value) return
  loading.value = true
  errorText.value = ''
  try {
    if (!auth.ready.value) await auth.restore()
    if (!auth.session.value || !auth.profile.value) {
      uni.reLaunch({ url: '/pages/auth/login' })
      return
    }
    const token = await auth.ensureAccessToken()
    const data = await rpc(
      'get_class_member_attendance',
      { p_class_id: classId.value, p_user_id: userId.value },
      token
    )
    member.value = data.member || {}
    items.value = data.items || []
  } catch (e) {
    errorText.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  classId.value = (options && (options.id || options.classId)) || ''
  userId.value = (options && (options.userId || options.user_id)) || ''
  memberName.value = (options && options.name) ? decodeURIComponent(options.name) : ''
  load()
})

onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.member-attendance-page {
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
.member-card__body,
.list-card__body {
  padding: 18px;
}
.member-name {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #2d1616;
}
.member-meta {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: #a98a82;
}
.member-stats {
  display: flex;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
}
.stat {
  flex: 1;
  text-align: center;
}
.stat__num {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #3b1d1d;
}
.stat__label {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: #a98a82;
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
.event-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid rgba(165, 21, 21, 0.05);
}
.event-row:last-child {
  border-bottom: none;
}
.event-row__main {
  min-width: 0;
}
.event-row__title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #2d1616;
}
.event-row__time {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: #a98a82;
}
.event-row__checked {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  color: #b09a94;
}
.event-row__right {
  flex-shrink: 0;
  text-align: right;
}
.event-row__status {
  display: block;
  font-size: 10px;
  color: #1a8a69;
}
.event-row__status--absent {
  color: #b4432a;
}
.event-row__appeal {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  color: #9b6d14;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
