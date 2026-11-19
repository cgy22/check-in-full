<template>
  <view class="result-page">
    <BridgeHost page-path="pages/checkin/result" />
    <AppHeader title="签到结果" subtitle="CHECK-IN RESULT" back />

    <view class="result-shell">
      <view v-if="loading" class="state">
        <view class="state__spinner"></view>
        <text class="state__text">正在加载结果…</text>
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
        <MicaCard class="event-card">
          <view class="event-card__body">
            <text class="event-title">{{ event.title }}</text>
            <text class="event-class">{{ event.class_name }}</text>
            <text class="event-time">{{ startText }} → {{ endText }}</text>

            <view class="counts">
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
                <text class="count__label">总人数</text>
              </view>
            </view>

            <view class="actions">
              <button class="export-btn" @click="exportResult">导出 CSV</button>
              <button v-if="isUpcoming" class="delete-btn" @click="removeEvent">删除签到</button>
            </view>
          </view>
        </MicaCard>

        <MicaCard class="list-card">
          <view class="list-card__body">
            <view class="list-head">
              <text class="list-title">成员结果</text>
              <text class="list-count">{{ items.length }} 人</text>
            </view>

            <view v-if="items.length === 0" class="empty">
              <text class="empty__text">暂无参与成员记录。</text>
            </view>

            <view v-for="item in items" :key="item.record_id" class="member-row">
              <view class="member-row__main">
                <text class="member-row__name">{{ item.full_name }}</text>
                <text class="member-row__meta">{{ item.student_id }} · {{ item.enrollment_year }} 级 · {{ item.major_name }}</text>
                <text v-if="item.checked_in_at" class="member-row__time">
                  {{ formatTime(item.checked_in_at) }}
                  <text v-if="item.is_late_slice"> · 上一轮码</text>
                </text>
              </view>
              <view class="member-row__right">
                <text class="member-row__status" :class="`member-row__status--${item.status}`">
                  {{ statusLabel(item.status, item.method) }}
                </text>
                <text v-if="item.appeal_status === 'pending'" class="member-row__appeal">补签待审</text>
                <text v-else-if="item.appeal_status === 'rejected'" class="member-row__appeal member-row__appeal--reject">补签未通过</text>
              </view>
            </view>
          </view>
        </MicaCard>
      </template>

      <text class="hint">下拉刷新获取最新结果</text>
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
import { exportCsv } from '../../utils/csv'
import { formatDeviceDateTime } from '../../utils/time'

const auth = useAuth()
const eventId = ref('')
const event = ref(null)
const counts = ref({})
const items = ref([])
const loading = ref(true)
const errorText = ref('')

const arrived = computed(() => Number(counts.value.present || 0) + Number(counts.value.makeup || 0))
const isUpcoming = computed(() => event.value && new Date(event.value.start_at).getTime() > Date.now())
const startText = computed(() => formatDeviceDateTime(event.value && event.value.start_at))
const endText = computed(() => formatDeviceDateTime(event.value && event.value.end_at))

function formatTime(value) {
  return formatDeviceDateTime(value)
}

function statusLabel(status, method) {
  if (status === 'present') return method === 'makeup' ? '补签' : '已签到'
  return '未签到'
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

function exportResult() {
  if (!event.value) return
  const headers = ['学号', '姓名', '年级', '专业', '状态', '方式', '上一轮码', '签到时间', '距离(米)', '设备', '补签状态']
  const rows = items.value.map(x => [
    x.student_id,
    x.full_name,
    x.enrollment_year,
    x.major_name,
    x.status === 'present' ? '已签到' : '未签到',
    x.method === 'makeup' ? '补签' : (x.method === 'qr' ? '二维码' : (x.method === 'code' ? '六位数字' : '')),
    x.is_late_slice ? '是' : '否',
    x.checked_in_at ? formatTime(x.checked_in_at) : '',
    x.distance_m === null || x.distance_m === undefined ? '' : Math.round(x.distance_m),
    x.device_label || '',
    x.appeal_status === 'pending' ? '待审批' : (x.appeal_status === 'approved' ? '已通过' : (x.appeal_status === 'rejected' ? '未通过' : ''))
  ])
  exportCsv(`签到结果-${event.value.title}.csv`, headers, rows)
}

function removeEvent() {
  uni.showModal({
    title: '删除签到',
    content: '只能删除未开始的签到。删除后参与记录和签到码都会消失，确定继续吗？',
    confirmText: '删除',
    confirmColor: '#b4432a',
    success: async res => {
      if (!res.confirm) return
      try {
        await rpc(
          'delete_checkin_event',
          { p_event_id: eventId.value },
          await auth.ensureAccessToken()
        )
        uni.showToast({ title: '已删除', icon: 'success' })
        setTimeout(() => uni.navigateBack({ delta: 1 }), 400)
      } catch (e) {
        uni.showToast({ title: e.message || '删除失败', icon: 'none', duration: 2600 })
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
.result-page {
  min-height: 100vh;
  background: #f4efe9;
}
.result-shell {
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
.event-card__body,
.list-card__body {
  padding: 18px;
}
.event-title {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #2d1616;
  line-height: 1.3;
}
.event-class {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: #a98a82;
}
.event-time {
  display: block;
  margin-top: 8px;
  font-size: 10px;
  color: #8f7570;
}
.counts {
  display: flex;
  margin-top: 14px;
  padding-top: 12px;
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
  margin-top: 3px;
  font-size: 9px;
  color: #a98a82;
}
.actions {
  display: flex;
  gap: 9px;
  margin-top: 14px;
}
.export-btn,
.delete-btn {
  flex: 1;
  height: 38px;
  line-height: 38px;
  border-radius: 8px;
  font-size: 11px;
  border: 1px solid rgba(165, 21, 21, 0.18);
  background: transparent;
  color: #a51515;
}
.delete-btn {
  color: #b4432a;
  border-color: rgba(217, 72, 15, 0.2);
}
.list-card {
  margin-top: 10px;
}
.list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.list-title {
  font-size: 16px;
  font-weight: 700;
  color: #2d1616;
}
.list-count {
  font-size: 10px;
  color: #a98a82;
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
  justify-content: space-between;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid rgba(165, 21, 21, 0.05);
}
.member-row:last-child {
  border-bottom: none;
}
.member-row__main {
  min-width: 0;
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
.member-row__appeal {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  color: #9b6d14;
}
.member-row__appeal--reject {
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
