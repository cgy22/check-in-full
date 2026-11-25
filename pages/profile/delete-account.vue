<template>
  <view class="delete-page">
    <view class="delete-shell">
      <view class="delete-nav">
        <text class="delete-nav__back" @click="goBack">‹ 返回</text>
        <text class="delete-nav__title">注销账号</text>
        <text class="delete-nav__placeholder"></text>
      </view>

      <MicaCard v-if="profile" class="delete-card">
        <view class="delete-card__body">
          <view class="danger-icon">!</view>
          <text class="delete-title">这是不可逆操作</text>
          <text class="delete-desc">
            注销后，你的个人资料、创建的班级、发布的签到、签到记录、补签申请都会被永久删除，无法恢复。
          </text>

          <view class="delete-warning">
            <text class="delete-warning__title">请确认你已备份需要的信息</text>
            <text class="delete-warning__text">
              如果你创建了班级，班级和班级内所有签到都会一起消失；其他成员也会失去这些记录。
            </text>
          </view>

          <view class="form">
            <text class="form__label">第 1 步：输入你的完整学号</text>
            <input
              v-model="studentIdConfirm"
              class="form__input"
              type="number"
              maxlength="12"
              placeholder="请输入 12 位学号"
              placeholder-class="form__placeholder"
            />
            <text class="form__hint">当前账号：{{ profile.student_id }}</text>

            <text class="form__label form__label--gap">第 2 步：输入“注销账号”四个字</text>
            <input
              v-model="confirmText"
              class="form__input"
              maxlength="4"
              placeholder="注销账号"
              placeholder-class="form__placeholder"
            />

            <view class="agree" @click="agreed = !agreed">
              <view class="agree__box" :class="{ 'agree__box--on': agreed }">✓</view>
              <text class="agree__text">
                我已知晓注销不可恢复，并确认删除上述全部数据
              </text>
            </view>
          </view>

          <button
            class="delete-btn"
            :class="{ 'delete-btn--disabled': !canDelete }"
            :disabled="!canDelete"
            :loading="auth.busy.value"
            @click="submit"
          >
            {{ auth.busy.value ? '注销中…' : '永久注销我的账号' }}
          </button>

          <text class="delete-cancel" @click="goBack">我再想想，返回个人主页</text>
        </view>
      </MicaCard>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import MicaCard from '../../components/MicaCard.vue'
import { useAuth } from '../../composables/useAuth'

const auth = useAuth()
const profile = computed(() => auth.profile.value)
const studentIdConfirm = ref('')
const confirmText = ref('')
const agreed = ref(false)

const canDelete = computed(() => {
  return (
    !!profile.value &&
    studentIdConfirm.value === profile.value.student_id &&
    confirmText.value === '注销账号' &&
    agreed.value &&
    !auth.busy.value
  )
})

async function guard() {
  if (!auth.ready.value) await auth.restore()
  if (!auth.session.value || !auth.profile.value) {
    uni.reLaunch({ url: '/pages/auth/login' })
  }
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1 })
  } else {
    uni.switchTab({ url: '/pages/profile/index' })
  }
}

function submit() {
  if (!canDelete.value) return
  uni.showModal({
    title: '最终确认',
    content: `即将永久注销学号 ${profile.value.student_id}。\n\n此操作不可恢复，确定继续吗？`,
    confirmText: '永久注销',
    confirmColor: '#b4432a',
    success: async res => {
      if (!res.confirm) return
      try {
        await auth.deleteAccount(studentIdConfirm.value, confirmText.value)
        uni.showToast({ title: '账号已注销', icon: 'success' })
      } catch (e) {
        uni.showToast({ title: e.message || '注销失败', icon: 'none', duration: 2600 })
      }
    }
  })
}

onShow(() => {
  guard()
})
</script>

<style scoped>
.delete-page {
  min-height: 100vh;
  background: #f4efe9;
  padding: calc(var(--status-bar-height, 0px) + 14px) 18px 30px;
  box-sizing: border-box;
}
.delete-shell {
  max-width: 520px;
  margin: 0 auto;
  animation: pageIn 0.6s cubic-bezier(0.05, 0.7, 0.1, 1) both;
}
.delete-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px 16px;
}
.delete-nav__back {
  font-size: 14px;
  color: #a51515;
  padding: 4px 8px 4px 0;
}
.delete-nav__title {
  font-size: 16px;
  font-weight: 700;
  color: #3b1d1d;
  letter-spacing: 1px;
}
.delete-nav__placeholder {
  width: 44px;
}
.delete-card__body {
  padding: 24px 20px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.danger-icon {
  width: 52px;
  height: 52px;
  line-height: 52px;
  border-radius: 18px;
  background: rgba(217, 72, 15, 0.1);
  border: 1px solid rgba(217, 72, 15, 0.2);
  color: #b4432a;
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 14px;
}
.delete-title {
  font-size: 21px;
  font-weight: 700;
  color: #3b1d1d;
  letter-spacing: 1px;
}
.delete-desc {
  margin-top: 8px;
  max-width: 340px;
  font-size: 12px;
  line-height: 1.7;
  color: #8f7570;
}
.delete-warning {
  width: 100%;
  margin-top: 16px;
  padding: 12px 13px;
  border-radius: 10px;
  background: rgba(217, 72, 15, 0.07);
  border: 1px solid rgba(217, 72, 15, 0.16);
  box-sizing: border-box;
  text-align: left;
}
.delete-warning__title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #b4432a;
}
.delete-warning__text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.6;
  color: #9a5b49;
}
.form {
  width: 100%;
  margin-top: 18px;
  text-align: left;
}
.form__label {
  display: block;
  font-size: 12px;
  color: #7b5b55;
  margin-bottom: 8px;
}
.form__label--gap {
  margin-top: 16px;
}
.form__input {
  width: 100%;
  height: 44px;
  line-height: 44px;
  padding: 0 13px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.72);
  font-size: 14px;
  color: #2d1616;
}
.form__placeholder {
  color: #b9a49f;
  font-size: 12px;
}
.form__hint {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  color: #a98a82;
}
.agree {
  margin-top: 16px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.agree__box {
  width: 18px;
  height: 18px;
  line-height: 18px;
  border-radius: 5px;
  border: 1px solid rgba(217, 72, 15, 0.35);
  background: #fff;
  color: transparent;
  font-size: 12px;
  text-align: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.agree__box--on {
  background: #b4432a;
  border-color: #b4432a;
  color: #fff;
}
.agree__text {
  font-size: 11px;
  line-height: 1.6;
  color: #7b5b55;
}
.delete-btn {
  width: 100%;
  margin-top: 20px;
  height: 48px;
  line-height: 48px;
  border-radius: 10px;
  background: #b4432a;
  color: #fff;
  font-size: 14px;
  letter-spacing: 1px;
  border: none;
  box-shadow: 0 8px 20px rgba(180, 67, 42, 0.22);
}
.delete-btn--disabled {
  background: #d8c6c2;
  box-shadow: none;
}
.delete-cancel {
  display: block;
  margin-top: 14px;
  font-size: 12px;
  color: #a51515;
  padding: 4px 8px;
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
