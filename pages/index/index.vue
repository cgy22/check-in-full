<template>
  <view class="home-page">
    <BridgeHost page-path="pages/index/index" />
    <view class="home-orb"></view>

    <view class="home-shell">
      <view class="home-top">
        <view>
          <text class="home-eyebrow">VALENCIA UNIVERSITY</text>
          <text class="home-title">签到</text>
        </view>
        <view class="home-actions">
          <view class="home-plus" @click="sheetVisible = true">＋</view>
          <view class="home-avatar">
            {{ avatarText }}
          </view>
        </view>
      </view>

      <MicaCard v-if="profile" class="welcome-card">
        <view class="welcome-card__body">
          <view class="welcome-left">
            <text class="welcome-hello">你好，{{ profile.full_name }}</text>
            <text class="welcome-meta">
              {{ profile.student_id }} · {{ profile.enrollment_year }} 级 · {{ profile.major_name }}
            </text>
          </view>
          <view class="welcome-badge">已登录</view>
        </view>
      </MicaCard>

      <view class="tabs">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          class="tab"
          :class="{ 'tab--active': activeTab === tab.key }"
          @click="selectTab(tab.key)"
        >
          <text class="tab__text">{{ tab.label }}</text>
          <view v-if="activeTab === tab.key" class="tab__line"></view>
        </view>
      </view>

      <text class="refresh-hint">下拉刷新获取最新数据</text>

      <view v-if="activeTab === 'ended'" class="ended-filters">
        <view
          v-for="f in endedFilters"
          :key="f.key"
          class="ended-filter"
          :class="{ 'ended-filter--active': endedFilter === f.key }"
          @click="selectEndedFilter(f.key)"
        >
          {{ f.label }}
        </view>
      </view>

      <view v-if="loading" class="list-state">
        <view class="list-state__spinner"></view>
        <text class="list-state__text">正在加载签到…</text>
      </view>

      <MicaCard v-else-if="loadError" class="empty-card">
        <view class="empty">
          <view class="empty__icon">!</view>
          <text class="empty__title">加载失败</text>
          <text class="empty__desc">{{ loadError }}</text>
          <button class="retry-btn" @click="refreshAll">重试</button>
        </view>
      </MicaCard>

      <MicaCard v-else-if="events.length === 0" class="empty-card">
        <view class="empty">
          <view class="empty__icon">◷</view>
          <text class="empty__title">{{ emptyTitle }}</text>
          <text class="empty__desc">
            {{ activeTab === 'ended' && endedFilter !== 'all' ? '换一个筛选条件看看。' : '发布一场签到后，它会出现在这里。' }}
          </text>
        </view>
      </MicaCard>

      <view v-else class="event-list">
        <CheckinCard
          v-for="item in events"
          :key="item.id"
          :item="item"
          @click="openEvent"
        />
      </view>

      <text class="home-foot">VALENCIA UNIVERSITY · CHECK-IN</text>
    </view>

    <ActionSheet
      :visible="sheetVisible"
      title="快捷操作"
      :items="sheetItems"
      :tabbar="true"
      @close="sheetVisible = false"
      @select="onSheetSelect"
    />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import MicaCard from '../../components/MicaCard.vue'
import ActionSheet from '../../components/ActionSheet.vue'
import CheckinCard from '../../components/CheckinCard.vue'
import { useAuth } from '../../composables/useAuth'
import { CHECKIN_TABS, ENDED_FILTERS } from '../../utils/constants'
import { rpc } from '../../utils/authApi'
import { getHomeCache, hasHomeCache, setHomeCache } from '../../utils/homeCache'

const auth = useAuth()
const activeTab = ref('active')
const tabs = CHECKIN_TABS
const endedFilters = ENDED_FILTERS
const endedFilter = ref('all')
const sheetVisible = ref(false)
const loading = ref(!hasHomeCache())
const loadError = ref('')
const cacheVersion = ref(0)
let refreshPromise = null

const events = computed(() => {
  // 读取版本号，缓存更新后重新计算
  cacheVersion.value
  const cache = getHomeCache()
  if (activeTab.value === 'active') return cache.active
  if (activeTab.value === 'upcoming') return cache.upcoming
  if (endedFilter.value === 'present') {
    return cache.ended.filter(item => item.my_status === 'present')
  }
  if (endedFilter.value === 'absent') {
    return cache.ended.filter(item => item.my_status === 'absent')
  }
  return cache.ended
})

const sheetItems = [
  { key: 'publish', icon: '＋', label: '发布签到', desc: '发布一场新签到' },
  { key: 'create', icon: '◈', label: '新建班级', desc: '创建班级并生成邀请码' },
  { key: 'join', icon: '⌘', label: '加入班级', desc: '输入 8 位邀请码' }
]

const profile = computed(() => auth.profile.value)
const avatarText = computed(() => {
  const n = profile.value && profile.value.full_name ? profile.value.full_name : '瓦'
  return n.slice(0, 1)
})

const emptyTitle = computed(() => {
  const found = tabs.find(t => t.key === activeTab.value)
  return found ? `暂无${found.label}的签到` : '暂无签到'
})

function onSheetSelect(item) {
  sheetVisible.value = false
  if (item.key === 'publish') {
    uni.navigateTo({ url: '/pages/checkin/create' })
  }
  if (item.key === 'create') {
    uni.navigateTo({ url: '/pages/class/create' })
  }
  if (item.key === 'join') {
    uni.navigateTo({ url: '/pages/class/join' })
  }
}

async function refreshAll() {
  if (refreshPromise) return refreshPromise
  const firstLoad = !hasHomeCache()
  if (firstLoad) loading.value = true
  loadError.value = ''
  refreshPromise = (async () => {
    const accessToken = await auth.ensureAccessToken()
    const data = await rpc('get_home_checkins', {}, accessToken)
    setHomeCache({
      active: (data && data.active) || [],
      upcoming: (data && data.upcoming) || [],
      ended: (data && data.ended) || []
    })
    cacheVersion.value++
  })()
    .catch(e => {
      if (!hasHomeCache()) {
        loadError.value = e.message || '网络请求失败'
      } else {
        uni.showToast({ title: '刷新失败，继续使用本地数据', icon: 'none' })
      }
    })
    .finally(() => {
      loading.value = false
      refreshPromise = null
    })
  return refreshPromise
}

function selectTab(key) {
  if (activeTab.value === key) return
  activeTab.value = key
  if (key !== 'ended') endedFilter.value = 'all'
}

function selectEndedFilter(key) {
  if (endedFilter.value === key) return
  endedFilter.value = key
}

function openEvent(item) {
  if (!item || !item.id) return
  uni.navigateTo({ url: `/pages/checkin/detail?id=${item.id}` })
}

async function guard() {
  if (!auth.ready.value) await auth.restore()
  if (!auth.session.value || !auth.profile.value) {
    uni.reLaunch({ url: '/pages/auth/login' })
  }
}

onShow(async () => {
  await guard()
  if (!auth.session.value || !auth.profile.value) return
  if (!hasHomeCache()) {
    await refreshAll()
  } else {
    loading.value = false
    cacheVersion.value++
  }
})

onPullDownRefresh(async () => {
  try {
    if (auth.session.value) await auth.fetchProfile()
    await refreshAll()
  } catch (e) {}
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f4efe9;
  position: relative;
  overflow: hidden;
  padding: calc(var(--status-bar-height, 0px) + 18px) 18px 24px;
  box-sizing: border-box;
}
.home-orb {
  position: absolute;
  width: 300px;
  height: 300px;
  right: -120px;
  top: -120px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(165, 21, 21, 0.18), rgba(165, 21, 21, 0));
  filter: blur(8px);
}
.home-shell {
  position: relative;
  z-index: 1;
  max-width: 520px;
  margin: 0 auto;
  animation: pageIn 0.6s cubic-bezier(0.05, 0.7, 0.1, 1) both;
}
.home-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 4px 16px;
}
.home-eyebrow {
  display: block;
  font-size: 9px;
  letter-spacing: 2px;
  color: #a98a82;
}
.home-title {
  display: block;
  margin-top: 4px;
  font-family: 'Songti SC', 'Noto Serif SC', 'STSong', serif;
  font-size: 30px;
  font-weight: 700;
  color: #3b1d1d;
  letter-spacing: 3px;
}
.home-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.home-plus {
  width: 36px;
  height: 36px;
  line-height: 34px;
  border-radius: 12px;
  background: rgba(165, 21, 21, 0.08);
  border: 1px solid rgba(165, 21, 21, 0.12);
  color: #a51515;
  font-size: 22px;
  text-align: center;
}
.home-avatar {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: linear-gradient(145deg, #a51515, #6f0c0c);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  line-height: 42px;
  text-align: center;
  box-shadow: 0 8px 18px rgba(165, 21, 21, 0.24);
}
.welcome-card__body {
  padding: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.welcome-hello {
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: #2d1616;
}
.welcome-meta {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: #9b7a72;
}
.welcome-badge {
  flex-shrink: 0;
  font-size: 10px;
  color: #1a9e7a;
  background: rgba(26, 158, 122, 0.1);
  border: 1px solid rgba(26, 158, 122, 0.18);
  border-radius: 999px;
  padding: 4px 9px;
}
.tabs {
  display: flex;
  gap: 6px;
  margin: 18px 2px 12px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.6);
}
.tab {
  flex: 1;
  position: relative;
  text-align: center;
  padding: 9px 0;
  border-radius: 9px;
  transition: all 0.3s cubic-bezier(0.05, 0.7, 0.1, 1);
}
.tab--active {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 8px rgba(80, 40, 30, 0.08);
}
.tab__text {
  font-size: 12px;
  color: #8f7570;
}
.tab--active .tab__text {
  color: #a51515;
  font-weight: 700;
}
.tab__line {
  position: absolute;
  bottom: 4px;
  left: 50%;
  width: 14px;
  height: 2px;
  border-radius: 2px;
  background: #a51515;
  transform: translateX(-50%);
}
.refresh-hint {
  display: block;
  margin: 2px 2px 8px;
  font-size: 9px;
  color: #b09a94;
  text-align: right;
}
.ended-filters {
  display: flex;
  gap: 7px;
  margin: 0 2px 10px;
}
.ended-filter {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 10px;
  color: #8f7570;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.65);
}
.ended-filter--active {
  color: #a51515;
  background: rgba(165, 21, 21, 0.07);
  border-color: rgba(165, 21, 21, 0.16);
  font-weight: 600;
}
.list-state {
  padding: 38px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.list-state__spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(165, 21, 21, 0.15);
  border-top-color: #a51515;
  animation: spin 0.8s linear infinite;
}
.list-state__text {
  font-size: 11px;
  color: #a98a82;
}
.retry-btn {
  margin-top: 14px;
  height: 36px;
  line-height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 8px;
  background: #a51515;
  color: #fff;
  font-size: 12px;
}
.event-list {
  padding-bottom: 4px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.empty-card {
  margin-top: 2px;
}
.empty {
  padding: 36px 22px 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.empty__icon {
  width: 46px;
  height: 46px;
  line-height: 46px;
  border-radius: 16px;
  background: rgba(165, 21, 21, 0.07);
  color: #a51515;
  font-size: 22px;
  margin-bottom: 14px;
}
.empty__title {
  font-size: 15px;
  font-weight: 700;
  color: #4b2a2a;
}
.empty__desc {
  margin-top: 8px;
  max-width: 270px;
  font-size: 11px;
  line-height: 1.7;
  color: #a98a82;
}
.home-foot {
  display: block;
  text-align: center;
  margin-top: 20px;
  font-size: 9px;
  letter-spacing: 1.5px;
  color: #b6a39d;
}
@keyframes pageIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
