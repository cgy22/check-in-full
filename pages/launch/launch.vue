<template>
  <view class="launch-page">
    <view class="launch-orb"></view>
    <view class="launch-content">
      <view class="launch-mark">Va</view>
      <text class="launch-title">瓦莱希雅大学</text>
      <text class="launch-sub">签到系统</text>

      <view v-if="!failed" class="launch-loading">
        <view class="dot"></view>
        <view class="dot dot--delay-1"></view>
        <view class="dot dot--delay-2"></view>
      </view>

      <view v-else class="launch-error">
        <text class="launch-error__text">{{ errorText }}</text>
        <button class="launch-btn" @click="boot">重试</button>
        <button class="launch-btn launch-btn--ghost" @click="goLogin">去登录</button>
      </view>
    </view>
    <text class="launch-footer">VALENCIA UNIVERSITY · CHECK-IN</text>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useAuth } from '../../composables/useAuth'

const auth = useAuth()
const failed = ref(false)
const errorText = ref('')

async function boot() {
  failed.value = false
  errorText.value = ''
  try {
    await auth.restore()
    if (auth.session.value && auth.profile.value) {
      uni.switchTab({ url: '/pages/index/index' })
    } else {
      uni.reLaunch({ url: '/pages/auth/login' })
    }
  } catch (e) {
    failed.value = true
    errorText.value = e.message || '初始化失败，请检查网络'
  }
}

function goLogin() {
  uni.reLaunch({ url: '/pages/auth/login' })
}

onLoad(() => {
  boot()
})
</script>

<style scoped>
.launch-page {
  min-height: 100vh;
  background: #f4efe9;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  box-sizing: border-box;
}
.launch-orb {
  position: absolute;
  width: 420px;
  height: 420px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(165, 21, 21, 0.16), rgba(165, 21, 21, 0));
  top: -160px;
  right: -160px;
  filter: blur(8px);
}
.launch-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: launchIn 0.8s cubic-bezier(0.05, 0.7, 0.1, 1) both;
}
.launch-mark {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(145deg, #a51515, #6f0c0c);
  color: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 26px;
  font-weight: 700;
  line-height: 64px;
  text-align: center;
  box-shadow: 0 14px 30px rgba(165, 21, 21, 0.28);
}
.launch-title {
  margin-top: 20px;
  font-family: 'Songti SC', 'Noto Serif SC', 'STSong', serif;
  font-size: 27px;
  letter-spacing: 5px;
  color: #3b1d1d;
  font-weight: 700;
}
.launch-sub {
  margin-top: 8px;
  font-size: 12px;
  letter-spacing: 3px;
  color: #9b7a72;
}
.launch-loading {
  display: flex;
  gap: 8px;
  margin-top: 38px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #a51515;
  opacity: 0.35;
  animation: dotPulse 1.2s cubic-bezier(0.05, 0.7, 0.1, 1) infinite;
}
.dot--delay-1 {
  animation-delay: 0.15s;
}
.dot--delay-2 {
  animation-delay: 0.3s;
}
.launch-error {
  margin-top: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 300px;
}
.launch-error__text {
  font-size: 13px;
  color: #b4432a;
  text-align: center;
  line-height: 1.6;
}
.launch-btn {
  margin: 0;
  padding: 0 22px;
  height: 38px;
  line-height: 38px;
  border-radius: 9px;
  background: #a51515;
  color: #fff;
  font-size: 13px;
  border: none;
}
.launch-btn--ghost {
  background: transparent;
  color: #a51515;
  border: 1px solid rgba(165, 21, 21, 0.3);
}
.launch-footer {
  position: absolute;
  bottom: 28px;
  font-size: 9px;
  letter-spacing: 2px;
  color: #b6a39d;
}
@keyframes dotPulse {
  0%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
@keyframes launchIn {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
