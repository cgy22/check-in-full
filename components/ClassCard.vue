<template>
  <view class="class-card" @click="$emit('click', item)">
    <view class="class-card__top">
      <text class="class-card__name">{{ item.name }}</text>
      <text class="class-card__role" :class="{ 'class-card__role--owner': item.my_role === 'owner' }">
        {{ item.my_role === 'owner' ? '创建者' : '成员' }}
      </text>
    </view>

    <text class="class-card__meta">
      {{ item.member_count }} 名成员 · {{ item.upcoming_count }} 场未开始 · {{ item.ended_count }} 场已结束
    </text>

    <view v-if="item.my_role === 'owner' && item.invite_code" class="class-card__invite">
      <view>
        <text class="class-card__invite-label">邀请码</text>
        <text class="class-card__invite-code">{{ item.invite_code }}</text>
      </view>
      <text class="class-card__expire">有效期至 {{ formatDate(item.invite_expires_at) }}</text>
    </view>

    <view class="class-card__foot">
      <text class="class-card__owner">{{ item.owner_name }}</text>
      <text class="class-card__arrow">›</text>
    </view>
  </view>
</template>

<script setup>
defineProps({
  item: { type: Object, required: true }
})

defineEmits(['click'])

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.class-card {
  position: relative;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 1.6px 3.6px rgba(0, 0, 0, 0.08), 0 0.3px 0.9px rgba(0, 0, 0, 0.08);
  margin-bottom: 10px;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  transition: all 0.3s cubic-bezier(0.05, 0.7, 0.1, 1);
  overflow: hidden;
}
.class-card:active {
  transform: translateY(-2px) scale(1.005);
  background: rgba(255, 255, 255, 0.9);
}
.class-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.class-card__name {
  font-size: 16px;
  font-weight: 700;
  color: #2d1616;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.class-card__role {
  flex-shrink: 0;
  font-size: 10px;
  color: #8f7570;
  background: rgba(143, 117, 112, 0.1);
  border-radius: 999px;
  padding: 3px 8px;
}
.class-card__role--owner {
  color: #a51515;
  background: rgba(165, 21, 21, 0.08);
}
.class-card__meta {
  display: block;
  margin-top: 7px;
  font-size: 11px;
  color: #9b7a72;
}
.class-card__invite {
  margin-top: 11px;
  padding: 9px 10px;
  border-radius: 9px;
  background: rgba(165, 21, 21, 0.05);
  border: 1px dashed rgba(165, 21, 21, 0.18);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.class-card__invite-label {
  font-size: 9px;
  color: #a98a82;
  margin-right: 6px;
}
.class-card__invite-code {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #a51515;
}
.class-card__expire {
  font-size: 9px;
  color: #b09a94;
  flex-shrink: 0;
}
.class-card__foot {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.class-card__owner {
  font-size: 10px;
  color: #a98a82;
}
.class-card__arrow {
  font-size: 18px;
  color: #c4aaa2;
}
</style>
