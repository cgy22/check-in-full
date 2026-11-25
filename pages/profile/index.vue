<template>
  <view class="profile-page">
    <view class="profile-orb"></view>
    <view class="profile-shell">
      <view class="profile-head">
        <view>
          <text class="profile-eyebrow">MY PROFILE</text>
          <text class="profile-title">个人主页</text>
        </view>
        <view class="profile-plus" @click="sheetVisible = true">＋</view>
      </view>

      <MicaCard v-if="profile" class="identity-card">
        <view class="identity">
          <view class="identity__avatar">{{ avatarText }}</view>
          <view class="identity__main">
            <text class="identity__name">{{ profile.full_name }}</text>
            <text class="identity__id">{{ profile.student_id }}</text>
            <text class="identity__meta">
              {{ profile.enrollment_year }} 级 · {{ profile.major_name }}
            </text>
          </view>
        </view>
        <view class="identity__stats">
          <view class="stat">
            <text class="stat__num">{{ profile.created_classes }}</text>
            <text class="stat__label">创建班级</text>
          </view>
          <view class="stat">
            <text class="stat__num">{{ profile.joined_classes }}</text>
            <text class="stat__label">加入班级</text>
          </view>
          <view class="stat">
            <text class="stat__num">{{ profile.published_events }}</text>
            <text class="stat__label">发布签到</text>
          </view>
        </view>
      </MicaCard>

      <MicaCard class="menu-card">
        <view class="menu">
          <view class="menu__item" @click="goManage">
            <text class="menu__icon">◷</text>
            <view class="menu__text">
              <text class="menu__title">我发布的签到</text>
              <text class="menu__desc">查看设置、签到结果与补签</text>
            </view>
            <text class="menu__arrow">›</text>
          </view>
          <view class="menu__divider"></view>
          <view class="menu__item" @click="goClassList('owner')">
            <text class="menu__icon">◈</text>
            <view class="menu__text">
              <text class="menu__title">我创建的班级</text>
              <text class="menu__desc">成员、出勤统计与 CSV 导出</text>
            </view>
            <text class="menu__arrow">›</text>
          </view>
          <view class="menu__divider"></view>
          <view class="menu__item" @click="goClassList('member')">
            <text class="menu__icon">◇</text>
            <view class="menu__text">
              <text class="menu__title">我加入的班级</text>
              <text class="menu__desc">查看班级与自己的出勤</text>
            </view>
            <text class="menu__arrow">›</text>
          </view>
          <view class="menu__divider"></view>
          <view class="menu__item" @click="goMyAppeals">
            <text class="menu__icon">✎</text>
            <view class="menu__text">
              <text class="menu__title">我申请的补签<text v-if="myPendingAppeals" class="menu__badge">{{ myPendingAppeals }}</text></text>
              <text class="menu__desc">查看申请进度与审批结果</text>
            </view>
            <text class="menu__arrow">›</text>
          </view>
          <view class="menu__divider"></view>
          <view class="menu__item" @click="goAppeals">
            <text class="menu__icon">✎</text>
            <view class="menu__text">
              <text class="menu__title">我收到的补签申请<text v-if="pendingAppeals" class="menu__badge">{{ pendingAppeals }}</text></text>
              <text class="menu__desc">批准或不予批准</text>
            </view>
            <text class="menu__arrow">›</text>
          </view>
          <view class="menu__divider"></view>
          <view class="menu__item" @click="goSettings">
            <text class="menu__icon">⚙</text>
            <view class="menu__text">
              <text class="menu__title">个人账号设置</text>
              <text class="menu__desc">修改姓名、年级、专业与密码</text>
            </view>
            <text class="menu__arrow">›</text>
          </view>
        </view>
      </MicaCard>

      <button class="logout-btn" @click="logout">退出登录</button>

      <view class="danger-zone">
        <text class="danger-zone__title">账号安全</text>
        <text class="danger-zone__desc">注销后账号、班级、签到与补签记录将被永久删除，无法恢复。</text>
        <button class="danger-btn" @click="goDeleteAccount">注销账号</button>
      </view>

      <text class="profile-foot">VALENCIA UNIVERSITY · CHECK-IN</text>
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
import { useAuth } from '../../composables/useAuth'

const auth = useAuth()
const profile = computed(() => auth.profile.value)
const sheetVisible = ref(false)
const sheetItems = [
  { key: 'publish', icon: '＋', label: '发布签到', desc: '发布一场新的签到活动' },
  { key: 'create', icon: '◈', label: '新建班级', desc: '创建班级并生成邀请码' },
  { key: 'join', icon: '⌘', label: '加入班级', desc: '输入 8 位邀请码' }
]
const pendingAppeals = computed(() => Number(profile.value && profile.value.pending_received_appeals) || 0)
const myPendingAppeals = computed(() => Number(profile.value && profile.value.my_pending_appeals) || 0)

const avatarText = computed(() => {
  const n = profile.value && profile.value.full_name ? profile.value.full_name : '瓦'
  return n.slice(0, 1)
})

async function guard() {
  if (!auth.ready.value) await auth.restore()
  if (!auth.session.value || !auth.profile.value) {
    uni.reLaunch({ url: '/pages/auth/login' })
  }
}

function goClassList(role) {
  uni.navigateTo({ url: `/pages/class/list?role=${role}` })
}

function goAppeals() {
  uni.navigateTo({ url: '/pages/appeal/list' })
}

function goMyAppeals() {
  uni.navigateTo({ url: '/pages/appeal/mine' })
}

function goManage() {
  uni.navigateTo({ url: '/pages/checkin/manage' })
}

function goSettings() {
  uni.navigateTo({ url: '/pages/profile/settings' })
}

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

function logout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前账号吗？',
    success: res => {
      if (res.confirm) auth.logout()
    }
  })
}

function goDeleteAccount() {
  uni.navigateTo({ url: '/pages/profile/delete-account' })
}

onShow(async () => {
  await guard()
  if (!auth.session.value) return
  if (!auth.profile.value || auth.profile.value.created_classes === undefined) {
    try {
      await auth.fetchProfile()
    } catch (e) {}
  }
})

onPullDownRefresh(async () => {
  try {
    if (auth.session.value) await auth.fetchProfile()
  } catch (e) {}
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: #f4efe9;
  position: relative;
  overflow: hidden;
  padding: calc(var(--status-bar-height, 0px) + 20px) 18px 28px;
  box-sizing: border-box;
}
.profile-orb {
  position: absolute;
  width: 300px;
  height: 300px;
  left: -130px;
  top: -130px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(165, 21, 21, 0.16), rgba(165, 21, 21, 0));
  filter: blur(8px);
}
.profile-shell {
  position: relative;
  z-index: 1;
  max-width: 520px;
  margin: 0 auto;
  animation: pageIn 0.6s cubic-bezier(0.05, 0.7, 0.1, 1) both;
}
.profile-plus {
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
.profile-head {
  padding: 4px 4px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.profile-eyebrow {
  display: block;
  font-size: 9px;
  letter-spacing: 2px;
  color: #a98a82;
}
.profile-title {
  display: block;
  margin-top: 4px;
  font-family: 'Songti SC', 'Noto Serif SC', 'STSong', serif;
  font-size: 28px;
  font-weight: 700;
  color: #3b1d1d;
  letter-spacing: 3px;
}
.identity-card {
  overflow: hidden;
}
.identity {
  padding: 20px 18px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.identity__avatar {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: linear-gradient(145deg, #a51515, #6f0c0c);
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  line-height: 56px;
  text-align: center;
  box-shadow: 0 8px 20px rgba(165, 21, 21, 0.22);
}
.identity__main {
  min-width: 0;
}
.identity__name {
  display: block;
  font-size: 19px;
  font-weight: 700;
  color: #2d1616;
}
.identity__id {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  letter-spacing: 1px;
  color: #8f7570;
}
.identity__meta {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #a98a82;
}
.identity__stats {
  display: flex;
  border-top: 1px solid rgba(165, 21, 21, 0.08);
}
.stat {
  flex: 1;
  padding: 12px 0;
  text-align: center;
}
.stat__num {
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: #a51515;
}
.stat__label {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: #a98a82;
}
.menu-card {
  margin-top: 14px;
}
.menu__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}
.menu__icon {
  width: 32px;
  height: 32px;
  line-height: 32px;
  text-align: center;
  border-radius: 10px;
  background: rgba(165, 21, 21, 0.06);
  color: #a51515;
  font-size: 15px;
  flex-shrink: 0;
}
.menu__text {
  flex: 1;
  min-width: 0;
}
.menu__badge {
  display: inline-block;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  margin-left: 5px;
  padding: 0 4px;
  border-radius: 999px;
  background: #a51515;
  color: #fff;
  font-size: 9px;
  text-align: center;
}
.menu__title {
  display: block;
  font-size: 14px;
  color: #3b2420;
  font-weight: 600;
}
.menu__desc {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: #a98a82;
}
.menu__arrow {
  font-size: 20px;
  color: #c4aaa2;
}
.menu__divider {
  height: 1px;
  margin-left: 60px;
  background: rgba(165, 21, 21, 0.07);
}
.logout-btn {
  margin-top: 18px;
  height: 46px;
  line-height: 46px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(165, 21, 21, 0.18);
  color: #a51515;
  font-size: 14px;
}
.profile-foot {
  display: block;
  margin-top: 18px;
  text-align: center;
  font-size: 9px;
  letter-spacing: 1.5px;
  color: #b6a39d;
}
.danger-zone {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(217, 72, 15, 0.06);
  border: 1px solid rgba(217, 72, 15, 0.16);
}
.danger-zone__title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #b4432a;
}
.danger-zone__desc {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  line-height: 1.6;
  color: #a06a5a;
}
.danger-btn {
  margin-top: 10px;
  height: 38px;
  line-height: 38px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid rgba(217, 72, 15, 0.35);
  color: #b4432a;
  font-size: 12px;
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
