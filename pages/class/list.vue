<template>
  <view class="class-list-page">
    <BridgeHost page-path="pages/class/list" />
    <AppHeader :title="title" :subtitle="subtitle" back show-plus @plus="sheetVisible = true" />

    <view class="class-list-shell">
      <view v-if="loading" class="state">
        <text class="state__text">加载中…</text>
      </view>

      <MicaCard v-else-if="errorText" class="state-card">
        <view class="state">
          <text class="state__title">加载失败</text>
          <text class="state__text">{{ errorText }}</text>
          <button class="state__btn" @click="load">重试</button>
        </view>
      </MicaCard>

      <MicaCard v-else-if="items.length === 0" class="state-card">
        <view class="state">
          <view class="state__icon">{{ role === 'owner' ? '◈' : '◇' }}</view>
          <text class="state__title">{{ role === 'owner' ? '还没有创建班级' : '还没有加入班级' }}</text>
          <text class="state__text">
            {{ role === 'owner' ? '创建班级后可以发布签到、管理成员。' : '向同学索取邀请码后加入班级。' }}
          </text>
          <button class="state__btn" @click="role === 'owner' ? goCreate() : goJoin()">
            {{ role === 'owner' ? '新建班级' : '加入班级' }}
          </button>
        </view>
      </MicaCard>

      <view v-else class="list">
        <ClassCard
          v-for="item in items"
          :key="item.id"
          :item="item"
          @click="goDetail(item)"
        />
      </view>
    </view>

    <ActionSheet
      :visible="sheetVisible"
      title="班级操作"
      :items="sheetItems"
      @close="sheetVisible = false"
      @select="onSheetSelect"
    />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import ClassCard from '../../components/ClassCard.vue'
import ActionSheet from '../../components/ActionSheet.vue'
import { useAuth } from '../../composables/useAuth'
import { rpc } from '../../utils/authApi'

const auth = useAuth()
const role = ref('owner')
const title = ref('我创建的班级')
const subtitle = ref('OWNED CLASSES')
const items = ref([])
const loading = ref(true)
const errorText = ref('')
const sheetVisible = ref(false)

const sheetItems = [
  { key: 'publish', icon: '＋', label: '发布签到', desc: '选择你创建的班级发布' },
  { key: 'create', icon: '◈', label: '新建班级', desc: '设置名称与邀请码有效期' },
  { key: 'join', icon: '⌘', label: '加入班级', desc: '输入 8 位邀请码' }
]

function applyRole(value) {
  role.value = value === 'member' ? 'member' : 'owner'
  title.value = role.value === 'owner' ? '我创建的班级' : '我加入的班级'
  subtitle.value = role.value === 'owner' ? 'OWNED CLASSES' : 'JOINED CLASSES'
}

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    if (!auth.ready.value) await auth.restore()
    if (!auth.session.value) {
      uni.reLaunch({ url: '/pages/auth/login' })
      return
    }
    const accessToken = await auth.ensureAccessToken()
    const data = await rpc('list_my_classes', { p_role: role.value }, accessToken)
    items.value = (data && data.items) || []
  } catch (e) {
    errorText.value = e.message || '网络请求失败'
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

function goDetail(item) {
  uni.navigateTo({ url: `/pages/class/detail?id=${item.id}` })
}

function goCreate() {
  uni.navigateTo({ url: '/pages/class/create' })
}

function goJoin() {
  uni.navigateTo({ url: '/pages/class/join' })
}

function onSheetSelect(item) {
  sheetVisible.value = false
  if (item.key === 'publish') uni.navigateTo({ url: '/pages/checkin/create' })
  if (item.key === 'create') goCreate()
  if (item.key === 'join') goJoin()
}

onLoad(options => {
  applyRole(options && options.role)
})

onShow(() => {
  load()
})

onPullDownRefresh(() => {
  load()
})
</script>

<style scoped>
.class-list-page {
  min-height: 100vh;
  background: #f4efe9;
}
.class-list-shell {
  max-width: 520px;
  margin: 0 auto;
  padding: 16px 18px 30px;
}
.list {
  display: flex;
  flex-direction: column;
}
.state-card {
  margin-top: 4px;
}
.state {
  padding: 38px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.state__icon {
  width: 48px;
  height: 48px;
  line-height: 48px;
  border-radius: 16px;
  background: rgba(165, 21, 21, 0.07);
  color: #a51515;
  font-size: 22px;
  margin-bottom: 14px;
}
.state__title {
  font-size: 15px;
  font-weight: 700;
  color: #3b2420;
}
.state__text {
  margin-top: 7px;
  max-width: 280px;
  font-size: 11px;
  line-height: 1.7;
  color: #a98a82;
}
.state__btn {
  margin-top: 16px;
  height: 40px;
  line-height: 40px;
  padding: 0 22px;
  border-radius: 9px;
  background: #a51515;
  color: #fff;
  font-size: 13px;
  border: none;
}
</style>
