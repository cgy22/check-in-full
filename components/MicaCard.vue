<template>
  <view class="mica-card" :class="{ 'mica-card--dark': dark }">
    <view class="mica-card__sheen"></view>
    <view class="mica-card__content"><slot></slot></view>
  </view>
</template>

<script setup>
defineProps({
  dark: { type: Boolean, default: false }
})
</script>

<style scoped>
.mica-card {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.72);
  box-shadow:
    0 1.6px 3.6px rgba(0, 0, 0, 0.1),
    0 0.3px 0.9px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  transition: all 0.4s cubic-bezier(0.05, 0.7, 0.1, 1);
}
.mica-card__sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.32) 0%,
    rgba(255, 255, 255, 0.06) 48%,
    rgba(255, 255, 255, 0.18) 100%
  );
}
.mica-card__content {
  position: relative;
  z-index: 1;
}
.mica-card--dark {
  background: rgba(42, 42, 42, 0.72);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow:
    0 1.6px 3.6px rgba(0, 0, 0, 0.32),
    0 0.3px 0.9px rgba(0, 0, 0, 0.32);
}
.mica-card--dark .mica-card__sheen {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.02) 50%,
    rgba(255, 255, 255, 0.06) 100%
  );
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .mica-card {
    background: rgba(255, 255, 255, 0.97);
  }
  .mica-card--dark {
    background: rgba(42, 42, 42, 0.97);
  }
}
</style>
