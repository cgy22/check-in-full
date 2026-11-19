<template>
  <view class="app-header">
    <view class="app-header__bar">
      <view class="app-header__left" @click="onBack">
        <text v-if="back" class="app-header__back">‹</text>
        <view class="app-header__titles">
          <text class="app-header__title">{{ title }}</text>
          <text v-if="subtitle" class="app-header__sub">{{ subtitle }}</text>
        </view>
      </view>

      <view v-if="showPlus" class="app-header__plus" @click="$emit('plus')">＋</view>
      <view v-else class="app-header__placeholder"></view>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  back: { type: Boolean, default: false },
  showPlus: { type: Boolean, default: false }
})

const emit = defineEmits(['plus', 'back'])

function onBack() {
  if (!props.back) return
  emit('back')
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1 })
  } else {
    uni.switchTab({ url: '/pages/index/index' })
  }
}
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  padding-top: calc(var(--status-bar-height, 0px) + 10px);
  background: rgba(244, 239, 233, 0.82);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(165, 21, 21, 0.08);
}
.app-header__bar {
  height: 52px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.app-header__left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.app-header__back {
  font-size: 26px;
  line-height: 1;
  color: #a51515;
  padding: 2px 8px 4px 0;
}
.app-header__titles {
  min-width: 0;
}
.app-header__title {
  display: block;
  font-family: 'Songti SC', 'Noto Serif SC', 'STSong', serif;
  font-size: 20px;
  font-weight: 700;
  color: #3b1d1d;
  letter-spacing: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-header__sub {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  letter-spacing: 1px;
  color: #a98a82;
}
.app-header__plus {
  width: 36px;
  height: 36px;
  line-height: 34px;
  border-radius: 12px;
  background: rgba(165, 21, 21, 0.08);
  border: 1px solid rgba(165, 21, 21, 0.12);
  color: #a51515;
  font-size: 22px;
  text-align: center;
  flex-shrink: 0;
}
.app-header__placeholder {
  width: 36px;
  height: 36px;
}
</style>
