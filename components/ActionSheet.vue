<template>
  <view v-if="visible" class="sheet-mask" @click="close">
    <view class="sheet" :class="{ 'sheet--tabbar': tabbar }" @click.stop>
      <view class="sheet__handle"></view>
      <text class="sheet__title">{{ title }}</text>

      <view
        v-for="item in items"
        :key="item.key"
        class="sheet__item"
        @click="select(item)"
      >
        <view class="sheet__icon">{{ item.icon }}</view>
        <view class="sheet__text">
          <text class="sheet__label">{{ item.label }}</text>
          <text v-if="item.desc" class="sheet__desc">{{ item.desc }}</text>
        </view>
        <text class="sheet__arrow">›</text>
      </view>

      <button class="sheet__cancel" @click="close">取消</button>
    </view>
  </view>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '快捷操作' },
  items: { type: Array, default: () => [] },
  tabbar: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'close'])

function close() {
  emit('close')
}

function select(item) {
  emit('select', item)
}
</script>

<style scoped>
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(36, 20, 18, 0.38);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: maskIn 0.25s cubic-bezier(0.05, 0.7, 0.1, 1) both;
}
.sheet {
  width: 100%;
  max-width: 520px;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: 18px 18px 0 0;
  background: #fbf8f4;
  box-shadow: 0 -12px 40px rgba(60, 30, 24, 0.18);
  animation: sheetIn 0.35s cubic-bezier(0.05, 0.7, 0.1, 1) both;
  box-sizing: border-box;
}
.sheet--tabbar {
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}
.sheet__handle {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgba(165, 21, 21, 0.18);
  margin: 0 auto 12px;
}
.sheet__title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #3b1d1d;
  padding: 0 4px 10px;
  letter-spacing: 1px;
}
.sheet__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(165, 21, 21, 0.07);
  margin-bottom: 8px;
}
.sheet__icon {
  width: 36px;
  height: 36px;
  line-height: 36px;
  text-align: center;
  border-radius: 11px;
  background: rgba(165, 21, 21, 0.08);
  color: #a51515;
  font-size: 17px;
  flex-shrink: 0;
}
.sheet__text {
  flex: 1;
  min-width: 0;
}
.sheet__label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #3b2420;
}
.sheet__desc {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: #a98a82;
}
.sheet__arrow {
  font-size: 20px;
  color: #c4aaa2;
}
.sheet__cancel {
  margin-top: 4px;
  height: 44px;
  line-height: 44px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid rgba(165, 21, 21, 0.14);
  color: #7b5b55;
  font-size: 13px;
}
@keyframes maskIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes sheetIn {
  from { opacity: 0; transform: translateY(22px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
