<template>
  <view class="attendance-page">
    <AppHeader :title="className || '出勤统计'" subtitle="ATTENDANCE" back />

    <view class="attendance-shell">
      <view v-if="loading" class="state">
        <view class="state__spinner"></view>
        <text class="state__text">正在统计…</text>
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
        <MicaCard class="summary-card">
          <view class="summary-card__body">
            <text class="summary-title">班级出勤概览</text>
            <text class="summary-desc">只统计已结束的签到，发布者不计入。</text>
            <view class="summary-grid">
              <view class="summary-item">
                <text class="summary-num">{{ items.length }}</text>
                <text class="summary-label">成员</text>
              </view>
              <view class="summary-item">
                <text class="summary-num">{{ totalPresent }}</text>
                <text class="summary-label">已签到人次</text>
              </view>
              <view class="summary-item">
                <text class="summary-num">{{ averageRate }}</text>
                <text class="summary-label">平均出勤率</text>
              </view>
            </view>
            <button class="export-btn" @click="exportAttendance">导出班级出勤 CSV</button>
          </view>
        </MicaCard>

        <MicaCard class="list-card">
          <view class="list-card__body">
            <view class="list-head">
              <text class="list-title">成员出勤</text>
              <text class="list-count">{{ items.length }} 人</text>
            </view>

            <view v-if="items.length === 0" class="empty">
              <text class="empty__text">班级里还没有普通成员，或还没有已结束的签到。</text>
            </view>

            <view v-for="item in items" :key="item.user_id" class="member-row" @click="openMember(item)">
              <view class="member-row__main">
                <text class="member-row__name">{{ item.full_name }}</text>
                <text class="member-row__meta">{{ item.student_id }} · {{ item.enrollment_year }} 级 · {{ item.major_name }}</text>
              </view>
              <view class="member-row__right">
                <text class="member-row__rate">{{ rateText(item.attendance_rate) }}</text>
                <text class="member-row__detail">
                  已签 {{ Number(item.present || 0) + Number(item.makeup || 0) }} / {{ item.total || 0 }}
                </text>
              </view>
              <text class="member-row__arrow">›</text>
            </view>
          </view>
        </MicaCard>

        <text class="hint">下拉刷新获取最新统计</text>
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
import { exportCsv } from '../../utils/csv'

const auth = useAuth()
const classId = ref('')
const className = ref('')
const items = ref([])
const loading = ref(true)
const errorText = ref('')

const totalPresent = computed(() =>
  items.value.reduce((sum, x) => sum + Number(x.present || 0) + Number(x.makeup || 0), 0)
)
const averageRate = computed(() => {
  if (!items.value.length) return '0%'
  const total = items.value.reduce((sum, x) => sum + Number(x.total || 0), 0)
  const present = items.value.reduce((sum, x) => sum + Number(x.present || 0) + Number(x.makeup || 0), 0)
  return total ? `${Math.round((present / total) * 100)}%` : '0%'
})

function rateText(rate) {
  return `${Math.round(Number(rate || 0) * 100)}%`
}

async function load() {
  if (!classId.value) return
  loading.value = true
  errorText.value = ''
  try {
    if (!auth.ready.value) await auth.restore()
    if (!auth.session.value || !auth.profile.value) {
      uni.reLaunch({ url: '/pages/auth/login' })
      return
    }
    const token = await auth.ensureAccessToken()
    const data = await rpc('get_class_attendance', { p_class_id: classId.value }, token)
    items.value = (data && data.items) || []
  } catch (e) {
    errorText.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function openMember(item) {
  uni.navigateTo({
    url: `/pages/class/member-attendance?id=${classId.value}&userId=${item.user_id}&name=${encodeURIComponent(item.full_name || '')}`
  })
}

function exportAttendance() {
  const headers = ['学号', '姓名', '年级', '专业', '应签次数', '已签次数', '补签次数', '未签次数', '出勤率']
  const rows = items.value.map(x => [
    x.student_id,
    x.full_name,
    x.enrollment_year,
    x.major_name,
    x.total || 0,
    x.present || 0,
    x.makeup || 0,
    x.absent || 0,
    rateText(x.attendance_rate)
  ])
  exportCsv(`班级出勤-${className.value || classId.value}.csv`, headers, rows)
}

onLoad(options => {
  classId.value = (options && (options.id || options.classId)) || ''
  className.value = (options && options.name) ? decodeURIComponent(options.name) : ''
  load()
})

onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.attendance-page {
  min-height: 100vh;
  background: #f4efe9;
}
.attendance-shell {
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
.summary-title {
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: #2d1616;
}
.summary-desc {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: #a98a82;
}
.summary-grid {
  display: flex;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
}
.summary-item {
  flex: 1;
  text-align: center;
}
.summary-num {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #3b1d1d;
}
.summary-label {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: #a98a82;
}
.export-btn {
  margin-top: 14px;
  height: 38px;
  line-height: 38px;
  border: 1px solid rgba(165, 21, 21, 0.18);
  border-radius: 8px;
  background: transparent;
  color: #a51515;
  font-size: 11px;
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
  align-items: center;
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
.member-row__right {
  flex-shrink: 0;
  text-align: right;
}
.member-row__rate {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #a51515;
}
.member-row__detail {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: #a98a82;
}
.member-row__arrow {
  font-size: 17px;
  color: #c0aaa3;
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
