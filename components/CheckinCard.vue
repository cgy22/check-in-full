<template>
  <view class="checkin-card" :class="[`checkin-card--${status}`]" @click="$emit('click', item)">
    <view class="checkin-card__top">
      <view class="checkin-card__title-wrap">
        <text class="checkin-card__title">{{ item.title }}</text>
        <text class="checkin-card__class">{{ item.class_name }}</text>
      </view>
      <text class="checkin-card__status">{{ statusLabel }}</text>
    </view>

    <view class="checkin-card__time">
      <text class="checkin-card__time-text">{{ startText }} → {{ endText }}</text>
      <text class="checkin-card__timezone">本地时间</text>
    </view>

    <view class="checkin-card__meta">
      <text v-if="myStatusLabel" class="checkin-card__mine" :class="`checkin-card__mine--${item.my_status}`">
        {{ myStatusLabel }}
      </text>
      <text v-if="item.is_surprise" class="checkin-card__badge">突击</text>
      <text v-if="item.require_location" class="checkin-card__badge">1 km</text>
      <text v-if="item.require_device" class="checkin-card__badge">设备绑定</text>
      <text v-if="item.my_appeal_status === 'pending'" class="checkin-card__badge checkin-card__badge--appeal">
        补签待审
      </text>
      <text v-else-if="item.my_appeal_status === 'rejected'" class="checkin-card__badge checkin-card__badge--reject">
        补签未通过
      </text>
      <text class="checkin-card__count">
        已签 {{ Number(item.present_count || 0) + Number(item.makeup_count || 0) }}
        <text v-if="item.absent_count !== undefined"> / {{ totalCount }}</text>
      </text>
    </view>

    <view class="checkin-card__foot">
      <text class="checkin-card__method">{{ methodLabel }}</text>
      <text class="checkin-card__arrow">›</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { formatDeviceDateTime } from '../utils/time'

const props = defineProps({
  item: { type: Object, required: true }
})

defineEmits(['click'])

const status = computed(() => props.item.status || 'ended')

const statusLabel = computed(() => {
  if (status.value === 'active') return '正在签到'
  if (status.value === 'upcoming') return '未开始'
  return '已结束'
})

const myStatusLabel = computed(() => {
  if (props.item.my_status === 'present') return '已签到'
  if (props.item.my_status === 'absent') {
    return status.value === 'ended' ? '未签到' : '待签到'
  }
  return ''
})

const startText = computed(() => formatDeviceDateTime(props.item.start_at))
const endText = computed(() => formatDeviceDateTime(props.item.end_at))

const totalCount = computed(() => {
  return (
    Number(props.item.present_count || 0) +
    Number(props.item.makeup_count || 0) +
    Number(props.item.absent_count || 0)
  )
})

const methodLabel = computed(() => {
  if (props.item.method === 'code') return '六位数字'
  if (props.item.method === 'qr') return '二维码'
  return '数字 / 二维码'
})
</script>

<style scoped>
.checkin-card {
  position: relative;
  margin-bottom: 10px;
  padding: 15px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 1.6px 3.6px rgba(0, 0, 0, 0.08), 0 0.3px 0.9px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  transition: all 0.3s cubic-bezier(0.05, 0.7, 0.1, 1);
}
.checkin-card:active {
  transform: translateY(-2px) scale(1.005);
  background: rgba(255, 255, 255, 0.92);
}
.checkin-card--active {
  border-left: 3px solid #a51515;
}
.checkin-card--upcoming {
  border-left: 3px solid #c99a2e;
}
.checkin-card--ended {
  border-left: 3px solid rgba(143, 117, 112, 0.35);
}
.checkin-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.checkin-card__title-wrap {
  min-width: 0;
}
.checkin-card__title {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: #2d1616;
  line-height: 1.35;
}
.checkin-card__class {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: #a98a82;
}
.checkin-card__status {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 9px;
  color: #a51515;
  background: rgba(165, 21, 21, 0.07);
}
.checkin-card--upcoming .checkin-card__status {
  color: #9b6d14;
  background: rgba(201, 154, 46, 0.1);
}
.checkin-card--ended .checkin-card__status {
  color: #8f7570;
  background: rgba(143, 117, 112, 0.08);
}
.checkin-card__time {
  margin-top: 10px;
  padding: 8px 9px;
  border-radius: 8px;
  background: rgba(165, 21, 21, 0.035);
}
.checkin-card__time-text {
  display: block;
  font-size: 11px;
  color: #6f4c45;
  line-height: 1.5;
}
.checkin-card__timezone {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: #b09a94;
}
.checkin-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}
.checkin-card__mine {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 9px;
  color: #8f7570;
  background: rgba(143, 117, 112, 0.08);
}
.checkin-card__mine--present {
  color: #1a8a69;
  background: rgba(26, 158, 122, 0.09);
}
.checkin-card__mine--absent {
  color: #b4432a;
  background: rgba(217, 72, 15, 0.07);
}
.checkin-card__badge--appeal {
  color: #9b6d14;
  border-color: rgba(201, 154, 46, 0.22);
  background: rgba(201, 154, 46, 0.07);
}
.checkin-card__badge--reject {
  color: #b4432a;
  border-color: rgba(217, 72, 15, 0.2);
  background: rgba(217, 72, 15, 0.05);
}
.checkin-card__badge {
  font-size: 9px;
  color: #8f7570;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid rgba(143, 117, 112, 0.14);
}
.checkin-card__count {
  margin-left: auto;
  font-size: 9px;
  color: #a98a82;
}
.checkin-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 9px;
  padding-top: 8px;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
}
.checkin-card__method {
  font-size: 9px;
  color: #b09a94;
}
.checkin-card__arrow {
  font-size: 17px;
  color: #c0aaa3;
  line-height: 1;
}
</style>
