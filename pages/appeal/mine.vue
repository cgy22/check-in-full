<template>
  <view class="my-appeals-page">
    <AppHeader title="我申请的补签" subtitle="MY APPEALS" back />

    <view class="list-shell">
      <view class="filters">
        <view
          v-for="f in filters"
          :key="f.key"
          class="filter"
          :class="{ 'filter--active': activeFilter === f.key }"
          @click="selectFilter(f.key)"
        >
          {{ f.label }}
        </view>
      </view>

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

      <MicaCard v-else-if="items.length === 0" class="state-card">
        <view class="state">
          <view class="state__icon">✎</view>
          <text class="state__title">暂无补签申请</text>
          <text class="state__text">签到结束后未签到，可以在签到详情里申请补签。</text>
        </view>
      </MicaCard>

      <view v-else class="items">
        <view v-for="item in items" :key="item.id" class="appeal-card" @click="openDetail(item)">
          <view class="appeal-card__top">
            <view class="appeal-card__main">
              <text class="appeal-card__event">{{ item.event_title }}</text>
              <text class="appeal-card__class">{{ item.class_name }}</text>
            </view>
            <text class="appeal-card__status" :class="`appeal-card__status--${item.status}`">
              {{ statusLabel(item.status) }}
            </text>
          </view>

          <text class="appeal-card__reason">{{ item.reason }}</text>

          <view class="appeal-card__meta">
            <text>第 {{ item.attempt_no }} 次申请</text>
            <text>{{ formatTime(item.event_start_at) }}</text>
          </view>
        </view>
      </view>

      <text class="list-hint">下拉刷新获取最新申请</text>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import { useAuth } from '../../composables/useAuth'
import { rpc } from '../../utils/authApi'
import { formatDeviceDateTime } from '../../utils/time'

const auth = useAuth()

const filters = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待审批' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '未通过' }
]

const activeFilter = ref('all')
const items = ref([])
const loading = ref(true)
const errorText = ref('')

function statusLabel(status) {
  if (status === 'pending') return '待审批'
  if (status === 'approved') return '已通过'
  return '未通过'
}

function formatTime(value) {
  return formatDeviceDateTime(value)
}

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    if (!auth.ready.value) await auth.restore()
    if (!auth.session.value || !auth.profile.value) {
      uni.reLaunch({ url: '/pages/auth/login' })
      return
    }
    const token = await auth.ensureAccessToken()
    const data = await rpc('list_my_appeals', { p_status: activeFilter.value }, token)
    items.value = (data && data.items) || []
  } catch (e) {
    errorText.value = e.message || '网络请求失败'
  } finally {
    loading.value = false
  }
}

function selectFilter(key) {
  if (activeFilter.value === key) return
  activeFilter.value = key
  load()
}

function openDetail(item) {
  if (!item || !item.id) return
  uni.navigateTo({ url: `/pages/appeal/detail?id=${item.id}` })
}

onShow(() => {
  load()
})

onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.my-appeals-page {
  min-height: 100vh;
  background: #f4efe9;
}
.list-shell {
  max-width: 540px;
  margin: 0 auto;
  padding: 8px 18px 30px;
}
.filters {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.filter {
  flex: 1;
  padding: 7px 0;
  text-align: center;
  border-radius: 8px;
  font-size: 10px;
  color: #8f7570;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.65);
}
.filter--active {
  color: #a51515;
  background: rgba(165, 21, 21, 0.07);
  border-color: rgba(165, 21, 21, 0.16);
  font-weight: 600;
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
.appeal-card {
  margin-bottom: 10px;
  padding: 15px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 1.6px 3.6px rgba(0, 0, 0, 0.08), 0 0.3px 0.9px rgba(0, 0, 0, 0.08);
}
.appeal-card:active {
  background: rgba(255, 255, 255, 0.92);
}
.appeal-card__top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.appeal-card__main {
  min-width: 0;
}
.appeal-card__event {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #2d1616;
  line-height: 1.35;
}
.appeal-card__class {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: #a98a82;
}
.appeal-card__status {
  flex-shrink: 0;
  height: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 9px;
  color: #9b6d14;
  background: rgba(201, 154, 46, 0.1);
}
.appeal-card__status--approved {
  color: #1a8a69;
  background: rgba(26, 158, 122, 0.09);
}
.appeal-card__status--rejected {
  color: #b4432a;
  background: rgba(217, 72, 15, 0.07);
}
.appeal-card__reason {
  display: block;
  margin-top: 9px;
  font-size: 11px;
  line-height: 1.6;
  color: #6f4c45;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.appeal-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  padding-top: 7px;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
  font-size: 9px;
  color: #b09a94;
}
.list-hint {
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
