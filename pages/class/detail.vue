<template>
  <view class="detail-page">
    <BridgeHost page-path="pages/class/detail" />
    <AppHeader
      :title="classInfo ? classInfo.name : '班级详情'"
      :subtitle="classInfo && classInfo.my_role === 'owner' ? 'OWNER VIEW' : 'CLASS VIEW'"
      back
      show-plus
      @plus="sheetVisible = true"
    />

    <view class="detail-shell">
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

      <template v-else-if="classInfo">
        <MicaCard class="info-card">
          <view class="info">
            <view class="info__top">
              <text class="info__name">{{ classInfo.name }}</text>
              <text class="info__role" :class="{ 'info__role--owner': isOwner }">
                {{ isOwner ? '创建者' : '成员' }}
              </text>
            </view>
            <text class="info__meta">
              创建者：{{ classInfo.owner_name }} · {{ classInfo.member_count }} 名成员
            </text>
            <text class="info__meta">创建于 {{ formatDateTime(classInfo.created_at) }}</text>

            <view v-if="isOwner && classInfo.invite_code" class="invite">
              <view class="invite__main">
                <text class="invite__label">邀请码</text>
                <text class="invite__code">{{ classInfo.invite_code }}</text>
                <text class="invite__expire">
                  有效期至 {{ formatDateTime(classInfo.invite_expires_at) }}
                </text>
              </view>
              <button class="invite__copy" @click="copyInvite">复制</button>
            </view>
          </view>
        </MicaCard>

        <view class="actions">
          <view v-if="isOwner" class="action" @click="goPublish">
            <text class="action__icon">＋</text>
            <text class="action__label">发布签到</text>
          </view>
          <view v-if="isOwner" class="action" @click="goAttendance">
            <text class="action__icon">▤</text>
            <text class="action__label">出勤统计</text>
          </view>
        </view>

        <MicaCard v-if="isOwner" class="members-card">
          <view class="members">
            <view class="members__head">
              <text class="members__title">成员</text>
              <text class="members__count">{{ members.length }} 人</text>
            </view>

            <view v-for="member in members" :key="member.user_id" class="member">
              <view class="member__avatar">{{ member.full_name.slice(0, 1) }}</view>
              <view class="member__main">
                <view class="member__name-row">
                  <text class="member__name">{{ member.full_name }}</text>
                  <text v-if="member.role === 'owner'" class="member__owner">创建者</text>
                </view>
                <text class="member__meta">
                  {{ member.student_id }} · {{ member.enrollment_year }} 级 · {{ member.major_name }}
                </text>
              </view>
              <button
                v-if="member.role !== 'owner'"
                class="member__kick"
                @click.stop="confirmKick(member)"
              >
                踢出
              </button>
            </view>
          </view>
        </MicaCard>

        <MicaCard v-else class="members-card">
          <view class="members">
            <view class="members__head">
              <text class="members__title">成员</text>
              <text class="members__count">{{ classInfo.member_count }} 人</text>
            </view>
            <text class="members__note">成员名单仅班级创建者可见。你可以在班级内正常参与签到。</text>
          </view>
        </MicaCard>

        <button v-if="isOwner" class="danger-btn" @click="confirmDeleteClass">删除班级</button>
        <button v-else class="danger-btn" @click="confirmLeave">退出班级</button>

        <text class="detail-foot">班级数据来自 Supabase · 成员变更即时生效</text>
      </template>
    </view>

    <ActionSheet
      :visible="sheetVisible"
      title="快捷操作"
      :items="sheetItems"
      @close="sheetVisible = false"
      @select="onSheetSelect"
    />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import ActionSheet from '../../components/ActionSheet.vue'
import { useAuth } from '../../composables/useAuth'
import { rpc } from '../../utils/authApi'
import { formatDateTime } from '../../utils/format'

const auth = useAuth()
const classId = ref('')
const classInfo = ref(null)
const loading = ref(true)
const errorText = ref('')
const sheetVisible = ref(false)

const isOwner = computed(() => classInfo.value && classInfo.value.my_role === 'owner')
const members = computed(() => (classInfo.value && classInfo.value.members) || [])

const sheetItems = [
  { key: 'publish', icon: '＋', label: '发布签到', desc: '发布一场新的签到活动' },
  { key: 'create', icon: '◈', label: '新建班级', desc: '再创建一个班级' },
  { key: 'join', icon: '⌘', label: '加入班级', desc: '输入邀请码' }
]

async function load() {
  if (!classId.value) return
  loading.value = true
  errorText.value = ''
  try {
    if (!auth.ready.value) await auth.restore()
    if (!auth.session.value) {
      uni.reLaunch({ url: '/pages/auth/login' })
      return
    }
    const accessToken = await auth.ensureAccessToken()
    const data = await rpc('get_class_detail', { p_class_id: classId.value }, accessToken)
    classInfo.value = data
  } catch (e) {
    errorText.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function copyInvite() {
  if (!classInfo.value || !classInfo.value.invite_code) return
  uni.setClipboardData({
    data: classInfo.value.invite_code,
    success: () => uni.showToast({ title: '邀请码已复制', icon: 'success' })
  })
}

function goPublish() {
  uni.navigateTo({ url: `/pages/checkin/create?classId=${classId.value}` })
}

function goAttendance() {
  if (!classInfo.value) return
  uni.navigateTo({
    url: `/pages/class/attendance?id=${classId.value}&name=${encodeURIComponent(classInfo.value.name)}`
  })
}

function confirmKick(member) {
  uni.showModal({
    title: '踢出成员',
    content: `确定将 ${member.full_name}（${member.student_id}）移出班级吗？\n\n会删除该成员在未来活动中的参与记录，历史记录保留。`,
    confirmText: '踢出',
    confirmColor: '#b4432a',
    success: async res => {
      if (!res.confirm) return
      try {
        const accessToken = await auth.ensureAccessToken()
        await rpc(
          'kick_class_member',
          { p_class_id: classId.value, p_user_id: member.user_id },
          accessToken
        )
        uni.showToast({ title: '已移出班级', icon: 'success' })
        await load()
      } catch (e) {
        uni.showToast({ title: e.message || '操作失败', icon: 'none' })
      }
    }
  })
}

function confirmLeave() {
  uni.showModal({
    title: '退出班级',
    content: '退出后你将不再看到该班级的签到，历史参与记录也不会出现在班级统计中。确定退出吗？',
    confirmText: '退出',
    confirmColor: '#b4432a',
    success: async res => {
      if (!res.confirm) return
      try {
        const accessToken = await auth.ensureAccessToken()
        await rpc('leave_class', { p_class_id: classId.value }, accessToken)
        uni.showToast({ title: '已退出班级', icon: 'success' })
        setTimeout(() => backAfterRemove(), 400)
      } catch (e) {
        uni.showToast({ title: e.message || '退出失败', icon: 'none' })
      }
    }
  })
}

function confirmDeleteClass() {
  if (!classInfo.value) return
  uni.showModal({
    title: '删除班级',
    content: `删除「${classInfo.value.name}」会同时删除班级成员、全部签到、签到记录和补签申请，且无法恢复。`,
    confirmText: '继续',
    confirmColor: '#b4432a',
    success: first => {
      if (!first.confirm) return
      uni.showModal({
        title: '最终确认',
        content: '这是不可逆操作。确定永久删除该班级吗？',
        confirmText: '永久删除',
        confirmColor: '#b4432a',
        success: async second => {
          if (!second.confirm) return
          try {
            const accessToken = await auth.ensureAccessToken()
            await rpc('delete_class', { p_class_id: classId.value }, accessToken)
            uni.showToast({ title: '班级已删除', icon: 'success' })
            setTimeout(() => backAfterRemove(), 400)
          } catch (e) {
            uni.showToast({ title: e.message || '删除失败', icon: 'none' })
          }
        }
      })
    }
  })
}

function backAfterRemove() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1 })
  } else {
    uni.switchTab({ url: '/pages/index/index' })
  }
}

function onSheetSelect(item) {
  sheetVisible.value = false
  if (item.key === 'publish') goPublish()
  if (item.key === 'create') uni.navigateTo({ url: '/pages/class/create' })
  if (item.key === 'join') uni.navigateTo({ url: '/pages/class/join' })
}

onLoad(options => {
  classId.value = (options && options.id) || ''
})

onShow(() => {
  load()
})

onPullDownRefresh(() => {
  load().finally(() => uni.stopPullDownRefresh())
})
</script>

<style scoped>
.detail-page {
  min-height: 100vh;
  background: #f4efe9;
}
.detail-shell {
  max-width: 520px;
  margin: 0 auto;
  padding: 16px 18px 30px;
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
.state__title {
  font-size: 15px;
  font-weight: 700;
  color: #3b2420;
}
.state__text {
  margin-top: 7px;
  font-size: 11px;
  line-height: 1.7;
  color: #a98a82;
}
.state__btn {
  margin-top: 14px;
  height: 38px;
  line-height: 38px;
  padding: 0 20px;
  border-radius: 9px;
  background: #a51515;
  color: #fff;
  font-size: 13px;
  border: none;
}
.info__top {
  padding: 18px 18px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.info__name {
  font-size: 20px;
  font-weight: 700;
  color: #2d1616;
  letter-spacing: 1px;
}
.info__role {
  flex-shrink: 0;
  font-size: 10px;
  color: #8f7570;
  background: rgba(143, 117, 112, 0.1);
  border-radius: 999px;
  padding: 3px 9px;
}
.info__role--owner {
  color: #a51515;
  background: rgba(165, 21, 21, 0.08);
}
.info__meta {
  display: block;
  padding: 0 18px;
  margin-top: 7px;
  font-size: 11px;
  color: #9b7a72;
}
.invite {
  margin: 14px 18px 18px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(165, 21, 21, 0.05);
  border: 1px dashed rgba(165, 21, 21, 0.18);
  display: flex;
  align-items: center;
  gap: 10px;
}
.invite__main {
  flex: 1;
}
.invite__label {
  display: block;
  font-size: 9px;
  color: #a98a82;
}
.invite__code {
  display: block;
  margin-top: 3px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #a51515;
}
.invite__expire {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  color: #b09a94;
}
.invite__copy {
  margin: 0;
  height: 32px;
  line-height: 32px;
  padding: 0 12px;
  border-radius: 7px;
  background: #fff;
  border: 1px solid rgba(165, 21, 21, 0.2);
  color: #a51515;
  font-size: 11px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.action {
  flex: 1;
  height: 58px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.action__icon {
  font-size: 16px;
  color: #a51515;
}
.action__label {
  font-size: 10px;
  color: #6b4a44;
}
.members-card {
  margin-top: 12px;
}
.members {
  padding: 16px 16px 8px;
}
.members__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.members__title {
  font-size: 14px;
  font-weight: 700;
  color: #3b2420;
}
.members__count {
  font-size: 10px;
  color: #a98a82;
}
.member {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
}
.member__avatar {
  width: 36px;
  height: 36px;
  line-height: 36px;
  border-radius: 12px;
  background: linear-gradient(145deg, #a51515, #6f0c0c);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  flex-shrink: 0;
}
.member__main {
  flex: 1;
  min-width: 0;
}
.member__name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.member__name {
  font-size: 13px;
  font-weight: 600;
  color: #3b2420;
}
.member__owner {
  font-size: 9px;
  color: #a51515;
  background: rgba(165, 21, 21, 0.08);
  border-radius: 999px;
  padding: 2px 6px;
}
.member__meta {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  color: #a98a82;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.member__kick {
  margin: 0;
  height: 28px;
  line-height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  background: transparent;
  border: 1px solid rgba(217, 72, 15, 0.3);
  color: #b4432a;
  font-size: 10px;
  flex-shrink: 0;
}
.members__note {
  display: block;
  padding: 8px 0 14px;
  font-size: 11px;
  line-height: 1.6;
  color: #a98a82;
}
.danger-btn {
  margin-top: 14px;
  height: 44px;
  line-height: 44px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(217, 72, 15, 0.28);
  color: #b4432a;
  font-size: 13px;
}
.detail-foot {
  display: block;
  margin-top: 16px;
  text-align: center;
  font-size: 9px;
  letter-spacing: 1px;
  color: #b6a39d;
}
</style>
