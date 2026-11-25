<template>
  <view class="create-page">
    <AppHeader title="发布签到" subtitle="CREATE CHECK-IN" back />

    <view class="create-shell">
      <view v-if="loadingClasses" class="state">
        <text class="state__text">加载班级中…</text>
      </view>

      <MicaCard v-else-if="classesError" class="state-card">
        <view class="state">
          <text class="state__title">加载失败</text>
          <text class="state__text">{{ classesError }}</text>
          <button class="state__btn" @click="loadClasses">重试</button>
        </view>
      </MicaCard>

      <MicaCard v-else-if="classes.length === 0" class="state-card">
        <view class="state">
          <view class="state__icon">◈</view>
          <text class="state__title">还没有创建的班级</text>
          <text class="state__text">发布签到只能选择你创建的班级。先新建一个班级，再回来发布。</text>
          <button class="state__btn" @click="goCreateClass">新建班级</button>
        </view>
      </MicaCard>

      <MicaCard v-else-if="successInfo" class="state-card">
        <view class="success">
          <view class="success__ring">✓</view>
          <text class="success__title">签到已发布</text>
          <text class="success__sub">{{ successInfo.title }}</text>

          <view class="summary">
            <view class="summary__row">
              <text class="summary__label">班级</text>
              <text class="summary__value">{{ successInfo.className }}</text>
            </view>
            <view class="summary__row">
              <text class="summary__label">开始</text>
              <text class="summary__value">{{ successInfo.startText }}</text>
            </view>
            <view class="summary__row">
              <text class="summary__label">结束</text>
              <text class="summary__value">{{ successInfo.endText }}</text>
            </view>
            <view class="summary__row">
              <text class="summary__label">方式</text>
              <text class="summary__value">{{ successInfo.methodLabel }}</text>
            </view>
          </view>

          <view class="badges">
            <text v-if="successInfo.isSurprise" class="badge">突击签到</text>
            <text v-if="successInfo.requireLocation" class="badge">1 km 范围</text>
            <text v-if="successInfo.requireDevice" class="badge badge--warn">设备绑定</text>
            <text v-if="!successInfo.requireLocation" class="badge badge--weak">弱签到</text>
          </view>

          <text class="success__note">
            {{
              successInfo.timeMode === 'duration'
                ? `签到已立即开始，持续 ${successInfo.durationMinutes} 分钟，班级成员现在即可签到。`
                : (successInfo.isSurprise
                    ? '突击签到在开始前对参与者不可见，开始瞬间进入正在签到。'
                    : '签到已进入未开始列表，开始后自动进入正在签到。')
            }}
          </text>

          <button class="primary-btn" @click="goHome">返回首页</button>
          <button class="ghost-btn" @click="createAnother">再发一场</button>
        </view>
      </MicaCard>

      <MicaCard v-else class="form-card">
        <view class="form-card__body">
          <text class="section-title">基本信息</text>

          <view class="field">
            <text class="field__label">活动名称</text>
            <input
              v-model="title"
              class="field__input"
              maxlength="60"
              placeholder="例如：周五班会签到"
              placeholder-class="field__placeholder"
            />
          </view>

          <view class="field">
            <text class="field__label">文字说明（可选）</text>
            <textarea
              v-model="description"
              class="field__textarea"
              maxlength="1000"
              placeholder="可选：说明签到要求、注意事项等"
              placeholder-class="field__placeholder"
            />
            <text class="field__count">{{ description.length }}/1000</text>
          </view>

          <text class="section-title section-title--gap">时间与班级</text>

          <view class="field">
            <text class="field__label">时区</text>
            <picker
              mode="selector"
              :range="timezones"
              :value="timezoneIndex"
              @change="onTimezoneChange"
            >
              <view class="picker-box">{{ timezone }}</view>
            </picker>
            <text class="field__hint">默认检测设备时区；数据库统一存 UTC。</text>
          </view>

          <view class="time-tabs">
            <view
              class="time-tab"
              :class="{ 'time-tab--active': timeMode === 'duration' }"
              @click="timeMode = 'duration'"
            >
              从发布起
            </view>
            <view
              class="time-tab"
              :class="{ 'time-tab--active': timeMode === 'absolute' }"
              @click="timeMode = 'absolute'"
            >
              指定时间
            </view>
          </view>

          <view v-if="timeMode === 'duration'" class="field">
            <text class="field__label">持续时长</text>
            <view class="duration-row">
              <input
                v-model.number="durationMinutes"
                class="field__input duration-input"
                type="number"
                maxlength="5"
                placeholder="60"
                placeholder-class="field__placeholder"
              />
              <text class="duration-unit">分钟</text>
            </view>
            <view class="quick-durations">
              <view
                v-for="m in quickDurations"
                :key="m"
                class="quick-duration"
                :class="{ 'quick-duration--active': Number(durationMinutes) === m }"
                @click="durationMinutes = m"
              >
                {{ m }} 分钟
              </view>
            </view>
            <text class="field__hint">发布成功后立即开始，按服务器时间持续 X 分钟。</text>
          </view>

          <template v-else>
            <view class="field-row">
              <view class="field field--half">
                <text class="field__label">开始日期</text>
                <picker mode="date" :value="startDate" @change="onStartDate">
                  <view class="picker-box">{{ startDate }}</view>
                </picker>
              </view>
              <view class="field field--half">
                <text class="field__label">开始时间</text>
                <picker mode="time" :value="startTime" @change="onStartTime">
                  <view class="picker-box">{{ startTime }}</view>
                </picker>
              </view>
            </view>

            <view class="field-row">
              <view class="field field--half">
                <text class="field__label">结束日期</text>
                <picker mode="date" :value="endDate" @change="onEndDate">
                  <view class="picker-box">{{ endDate }}</view>
                </picker>
              </view>
              <view class="field field--half">
                <text class="field__label">结束时间</text>
                <picker mode="time" :value="endTime" @change="onEndTime">
                  <view class="picker-box">{{ endTime }}</view>
                </picker>
              </view>
            </view>
          </template>

          <view class="preview">
            <text class="preview__label">{{ timeMode === 'duration' ? '本地预览' : '活动时区时间' }}</text>
            <text v-if="timeMode === 'duration'" class="preview__value">
              发布后立即开始 · 持续 {{ durationMinutes || 0 }} 分钟
            </text>
            <text v-else class="preview__value">{{ startDate }} {{ startTime }} → {{ endDate }} {{ endTime }}（{{ timezone }}）</text>
          </view>
          <text class="field__hint">发布后首页和详情按你的设备本地时区显示时间。</text>

          <view class="field">
            <text class="field__label">签到班级</text>
            <picker
              mode="selector"
              :range="classes"
              range-key="name"
              :value="selectedClassIndex"
              @change="onClassChange"
            >
              <view class="picker-box">{{ selectedClass ? selectedClass.name : '请选择班级' }}</view>
            </picker>
            <text class="field__hint">只能选择你创建的班级。</text>
          </view>

          <text class="section-title section-title--gap">签到规则</text>

          <view class="toggle-row">
            <view class="toggle-row__text">
              <text class="toggle-row__title">启用 1 km 位置校验</text>
              <text class="toggle-row__desc">圆心取发布时的设备定位；关闭后为仅验证码的弱签到。</text>
            </view>
            <switch
              :checked="requireLocation"
              color="#a51515"
              @change="onLocationToggle"
            />
          </view>

          <view class="toggle-row">
            <view class="toggle-row__text">
              <text class="toggle-row__title">突击签到</text>
              <text class="toggle-row__desc">开始前对参与者完全隐藏，开始瞬间进入正在签到。</text>
            </view>
            <switch :checked="isSurprise" color="#a51515" @change="onSurpriseToggle" />
          </view>

          <view class="toggle-row">
            <view class="toggle-row__text">
              <text class="toggle-row__title">设备绑定（可选加强）</text>
              <text class="toggle-row__desc">
                启用后换手机、清数据或重装可能无法签到；普通场景不建议开启。
              </text>
            </view>
            <switch :key="deviceSwitchKey" :checked="requireDevice" color="#a51515" @change="onDeviceToggle" />
          </view>

          <view class="field">
            <text class="field__label">签到方式</text>
            <view class="method-row">
              <view
                v-for="m in methods"
                :key="m.key"
                class="method"
                :class="{ 'method--active': method === m.key }"
                @click="method = m.key"
              >
                <text class="method__label">{{ m.label }}</text>
              </view>
            </view>
            <text class="field__hint">二维码内容就是 6 位动态数字；选“两者”时手输和扫码都可用。</text>
          </view>

          <view v-if="!requireLocation" class="weak-warning">
            <text class="weak-warning__title">当前为弱签到</text>
            <text class="weak-warning__text">
              仅验证 6 位码，无法防止截图转发或远程代签。需要更强约束时请启用 1 km 位置校验。
            </text>
          </view>

          <view v-if="!isApp" class="captcha">
            <text v-if="!isApp" class="field__label">人机验证</text>
            <CaptchaGate
              ref="gateRef"
              action="create_checkin"
              @success="captchaToken = $event"
              @error="captchaToken = ''"
              @expired="captchaToken = ''"
            />
          </view>

          <button class="primary-btn" :disabled="submitting || !canSubmit" @click="submit">
            {{ submitting ? '发布中…' : '发布签到' }}
          </button>
          <text class="form-note">发布后签到记录会立即为班级成员生成，未签到者活动结束后进入“未签到”。</text>
        </view>
      </MicaCard>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import CaptchaGate from '../../components/CaptchaGate.vue'
import { useAuth } from '../../composables/useAuth'
import { getServerTime, rpc } from '../../utils/authApi'
import { resetHomeCache } from '../../utils/homeCache'
import { getCurrentGcj02 } from '../../utils/location'
import {
  getDeviceTimeZone,
  getTimeZoneOptions,
  formatDeviceDateTime,
  dateInputInZone,
  timeInputInZone,
  addMinutes
} from '../../utils/time'

const auth = useAuth()
const gateRef = ref(null)
const captchaToken = ref('')

const classes = ref([])
const loadingClasses = ref(true)
const classesError = ref('')
const selectedClassIndex = ref(0)
const classIdFromQuery = ref('')

const timezones = getTimeZoneOptions()
const timezoneIndex = ref(0)
const timezone = computed(() => timezones[timezoneIndex.value] || getDeviceTimeZone())

const timeMode = ref('duration')
const durationMinutes = ref(60)
const quickDurations = [30, 60, 90, 120]

const now = new Date()
const defaultStart = addMinutes(now, 10)
const defaultEnd = addMinutes(now, 70)
const deviceZone = getDeviceTimeZone()
const startDate = ref(dateInputInZone(defaultStart, deviceZone))
const startTime = ref(timeInputInZone(defaultStart, deviceZone))
const endDate = ref(dateInputInZone(defaultEnd, deviceZone))
const endTime = ref(timeInputInZone(defaultEnd, deviceZone))

const title = ref('')
let autoTitle = ''
const description = ref('')
const requireLocation = ref(true)
const isSurprise = ref(false)
const requireDevice = ref(false)
const deviceSwitchKey = ref(0)
const method = ref('both')

const submitting = ref(false)
const successInfo = ref(null)

const isApp = (() => {
  try {
    return uni.getSystemInfoSync().uniPlatform === 'app'
  } catch (e) {
    return false
  }
})()

const canSubmit = computed(() => {
  return !submitting.value && (isApp || !!captchaToken.value)
})

const methods = [
  { key: 'code', label: '六位数字' },
  { key: 'qr', label: '二维码' },
  { key: 'both', label: '两者都允许' }
]

const selectedClass = computed(() => classes.value[selectedClassIndex.value] || null)

function defaultTitleForClass(cls) {
  const name = String((cls && cls.name) || '').trim()
  if (!name) return ''
  return name.endsWith('班') ? `${name}签到` : `${name}班签到`
}

function applyAutoTitle(force = false) {
  const next = defaultTitleForClass(selectedClass.value)
  if (!next) return
  if (force || !title.value.trim() || title.value === autoTitle) {
    title.value = next
    autoTitle = next
  }
}

function applyClassFromQuery() {
  if (!classIdFromQuery.value) return
  const idx = classes.value.findIndex(c => c.id === classIdFromQuery.value)
  if (idx >= 0) selectedClassIndex.value = idx
}

async function loadClasses() {
  loadingClasses.value = true
  classesError.value = ''
  try {
    if (!auth.ready.value) await auth.restore()
    if (!auth.session.value) {
      uni.reLaunch({ url: '/pages/auth/login' })
      return
    }
    const accessToken = await auth.ensureAccessToken()
    const data = await rpc('list_my_classes', { p_role: 'owner' }, accessToken)
    classes.value = (data && data.items) || []
    if (selectedClassIndex.value >= classes.value.length) selectedClassIndex.value = 0
    applyClassFromQuery()
    applyAutoTitle()
  } catch (e) {
    classesError.value = e.message || '网络请求失败'
  } finally {
    loadingClasses.value = false
  }
}

function onTimezoneChange(e) {
  timezoneIndex.value = Number(e.detail.value)
}

function onStartDate(e) {
  startDate.value = e.detail.value
}
function onStartTime(e) {
  startTime.value = e.detail.value
}
function onEndDate(e) {
  endDate.value = e.detail.value
}
function onEndTime(e) {
  endTime.value = e.detail.value
}

function onClassChange(e) {
  selectedClassIndex.value = Number(e.detail.value)
  applyAutoTitle()
}

function onLocationToggle(e) {
  requireLocation.value = !!e.detail.value
}

function onSurpriseToggle(e) {
  isSurprise.value = !!e.detail.value
}

function onDeviceToggle(e) {
  const next = !!e.detail.value
  if (!next) {
    requireDevice.value = false
    return
  }

  // 开关会先自行切到“开”，这里立即恢复为“关”，只有确认后才真正启用。
  requireDevice.value = false
  deviceSwitchKey.value += 1

  uni.showModal({
    title: '启用设备绑定？',
    content:
      '启用后，首次成功签到会绑定当前设备；换手机、清数据、重装 App 或换浏览器都可能无法签到。\n\n普通签到不建议开启，确定要启用吗？',
    confirmText: '仍然启用',
    confirmColor: '#b4432a',
    success: res => {
      if (res.confirm) {
        requireDevice.value = true
      } else {
        requireDevice.value = false
        deviceSwitchKey.value += 1
      }
    },
    fail: () => {
      requireDevice.value = false
      deviceSwitchKey.value += 1
    }
  })
}

function resetCaptcha() {
  captchaToken.value = ''
  if (gateRef.value && gateRef.value.reset) gateRef.value.reset()
}

async function submit() {
  if (!selectedClass.value) {
    uni.showToast({ title: '请选择班级', icon: 'none' })
    return
  }
  const t = title.value.trim() || defaultTitleForClass(selectedClass.value)
  const desc = description.value.trim()
  if (t.length < 2 || t.length > 60) {
    uni.showToast({ title: '活动名称需为 2-60 个字符', icon: 'none' })
    return
  }

  let startAt = null
  let endAt = null
  if (timeMode.value === 'absolute') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.value) || !/^\d{2}:\d{2}$/.test(startTime.value)
      || !/^\d{4}-\d{2}-\d{2}$/.test(endDate.value) || !/^\d{2}:\d{2}$/.test(endTime.value)) {
      uni.showToast({ title: '开始/结束时间不合法', icon: 'none' })
      return
    }
  } else {
    const minutes = Number(durationMinutes.value)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
      uni.showToast({ title: '持续时长需为 1-10080 分钟', icon: 'none' })
      return
    }
  }

  submitting.value = true
  try {
    let location = null
    if (requireLocation.value) {
      try {
        location = await getCurrentGcj02()
      } catch (e) {
        uni.showModal({
          title: '无法获取定位',
          content:
            `当前开启了 1 km 位置校验，需要发布者设备定位作为圆心。\n\n错误：${e.message || '定位失败'}\n\n请允许定位后重试，或关闭位置校验改为弱签到。`,
          showCancel: false
        })
        return
      }
    }

    const accessToken = await auth.ensureAccessToken()

    let captchaTicket = null
    if (!isApp) {
      captchaTicket = captchaToken.value
    }

    if (timeMode.value === 'duration') {
      const server = await getServerTime(accessToken)
      const epochMs = Number(server && server.epoch_ms)
      if (!Number.isFinite(epochMs)) {
        throw new Error('无法获取服务器时间，请稍后重试')
      }
      startAt = new Date(epochMs)
      endAt = addMinutes(startAt, Number(durationMinutes.value))
    }

    const commonParams = {
      p_captcha_ticket: captchaTicket,
      p_class_id: selectedClass.value.id,
      p_title: t,
      p_description: desc,
      p_timezone: timezone.value,
      p_location_name: location ? '发布者设备定位' : null,
      p_location_address: null,
      p_lat: location ? location.latitude : null,
      p_lng: location ? location.longitude : null,
      p_coord_system: 'gcj02',
      p_is_surprise: isSurprise.value,
      p_require_location: requireLocation.value,
      p_require_device: requireDevice.value,
      p_method: method.value
    }
    const data = await rpc(
      timeMode.value === 'absolute' ? 'create_checkin_event_local_verified' : 'create_checkin_event_verified',
      timeMode.value === 'absolute'
        ? {
            ...commonParams,
            p_start_local: `${startDate.value}T${startTime.value}`,
            p_end_local: `${endDate.value}T${endTime.value}`
          }
        : {
            ...commonParams,
            p_start_at: startAt.toISOString(),
            p_end_at: endAt.toISOString()
          },
      accessToken
    )

    resetHomeCache()
    const methodLabel = methods.find(m => m.key === method.value)?.label || method.value
    const actualStart = data.start_at ? new Date(data.start_at) : startAt
    const actualEnd = data.end_at ? new Date(data.end_at) : endAt
    successInfo.value = {
      ...data,
      title: t,
      className: selectedClass.value.name,
      startText: formatDeviceDateTime(actualStart),
      endText: formatDeviceDateTime(actualEnd),
      methodLabel,
      timeMode: timeMode.value,
      durationMinutes: Number(durationMinutes.value),
      isSurprise: isSurprise.value,
      requireLocation: requireLocation.value,
      requireDevice: requireDevice.value
    }

    // 从发布起模式：活动立即开始，直接进入带动态码/二维码的详情页。
    if (timeMode.value === 'duration' && data && data.event_id) {
      uni.redirectTo({
        url: `/pages/checkin/detail?id=${data.event_id}`,
        fail: () => {
          uni.showToast({ title: '已发布，请从首页进入详情', icon: 'none' })
        }
      })
    }
  } catch (e) {
    uni.showToast({ title: e.message || '发布失败', icon: 'none', duration: 2800 })
    resetCaptcha()
  } finally {
    submitting.value = false
  }
}

function goHome() {
  uni.switchTab({ url: '/pages/index/index' })
}

function goCreateClass() {
  uni.navigateTo({ url: '/pages/class/create' })
}

function createAnother() {
  successInfo.value = null
  title.value = defaultTitleForClass(selectedClass.value)
  autoTitle = title.value
  description.value = ''
  timeMode.value = 'duration'
  durationMinutes.value = 60
  const nextStart = addMinutes(new Date(), 10)
  const nextEnd = addMinutes(new Date(), 70)
  startDate.value = dateInputInZone(nextStart, timezone.value)
  startTime.value = timeInputInZone(nextStart, timezone.value)
  endDate.value = dateInputInZone(nextEnd, timezone.value)
  endTime.value = timeInputInZone(nextEnd, timezone.value)
}

async function guard() {
  if (!auth.ready.value) await auth.restore()
  if (!auth.session.value || !auth.profile.value) {
    uni.reLaunch({ url: '/pages/auth/login' })
  }
}

onLoad(options => {
  classIdFromQuery.value = (options && (options.classId || options.id)) || ''
  if (timezones.length > 1) timezoneIndex.value = 0
})

onShow(async () => {
  await guard()
  if (!successInfo.value) loadClasses()
})
</script>

<style scoped>
.create-page {
  min-height: 100vh;
  background: #f4efe9;
}
.create-shell {
  max-width: 540px;
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
.state__text {
  margin-top: 7px;
  font-size: 11px;
  line-height: 1.7;
  color: #a98a82;
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
.form-card__body {
  padding: 22px 20px 22px;
}
.section-title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #2d1616;
  letter-spacing: 1px;
}
.section-title--gap {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid rgba(165, 21, 21, 0.07);
}
.field {
  margin-top: 16px;
}
.time-tabs {
  display: flex;
  gap: 3px;
  margin-top: 16px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(165, 21, 21, 0.06);
}
.time-tab {
  flex: 1;
  padding: 8px 0;
  text-align: center;
  border-radius: 8px;
  font-size: 12px;
  color: #7b5b55;
}
.time-tab--active {
  background: #a51515;
  color: #fff;
  font-weight: 600;
}
.duration-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.duration-input {
  flex: 1;
}
.duration-unit {
  font-size: 12px;
  color: #7b5b55;
}
.quick-durations {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 9px;
}
.quick-duration {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  color: #7b5b55;
}
.quick-duration--active {
  border-color: rgba(165, 21, 21, 0.4);
  background: rgba(165, 21, 21, 0.08);
  color: #a51515;
}
.field-row {
  display: flex;
  gap: 12px;
}
.field--half {
  flex: 1;
  min-width: 0;
}
.field__label {
  display: block;
  font-size: 12px;
  color: #7b5b55;
  margin-bottom: 8px;
}
.field__input {
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
.field__textarea {
  width: 100%;
  min-height: 92px;
  padding: 11px 13px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  line-height: 1.6;
  color: #2d1616;
}
.field__placeholder {
  color: #b9a49f;
  font-size: 12px;
}
.field__count {
  display: block;
  margin-top: 4px;
  text-align: right;
  font-size: 9px;
  color: #b09a94;
}
.field__hint {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  line-height: 1.5;
  color: #b09a94;
}
.picker-box {
  height: 44px;
  line-height: 44px;
  padding: 0 13px;
  border-radius: 10px;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  color: #2d1616;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.preview {
  margin-top: 10px;
  padding: 9px 11px;
  border-radius: 9px;
  background: rgba(165, 21, 21, 0.05);
  border: 1px dashed rgba(165, 21, 21, 0.14);
}
.preview__label {
  font-size: 9px;
  color: #a98a82;
  margin-right: 7px;
}
.preview__value {
  font-size: 11px;
  color: #7b4b43;
}
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(165, 21, 21, 0.06);
}
.toggle-row__text {
  flex: 1;
  min-width: 0;
}
.toggle-row__title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #3b2420;
}
.toggle-row__desc {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  line-height: 1.55;
  color: #a98a82;
}
.method-row {
  display: flex;
  gap: 8px;
}
.method {
  flex: 1;
  height: 40px;
  line-height: 40px;
  border-radius: 9px;
  text-align: center;
  border: 1px solid rgba(165, 21, 21, 0.14);
  background: rgba(255, 255, 255, 0.6);
  transition: all 0.25s cubic-bezier(0.05, 0.7, 0.1, 1);
}
.method--active {
  background: rgba(165, 21, 21, 0.08);
  border-color: rgba(165, 21, 21, 0.4);
}
.method__label {
  font-size: 11px;
  color: #7b5b55;
}
.method--active .method__label {
  color: #a51515;
  font-weight: 700;
}
.weak-warning {
  margin-top: 14px;
  padding: 11px 12px;
  border-radius: 9px;
  background: rgba(255, 181, 0, 0.08);
  border: 1px solid rgba(255, 181, 0, 0.2);
}
.weak-warning__title {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #9a6b00;
}
.weak-warning__text {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.6;
  color: #9a7a3a;
}
.captcha {
  margin-top: 16px;
}
.captcha--auto {
  margin-top: 0;
}
.primary-btn {
  margin-top: 20px;
  height: 48px;
  line-height: 48px;
  border-radius: 10px;
  background: linear-gradient(135deg, #a51515, #7e0d0d);
  color: #fff;
  font-size: 15px;
  letter-spacing: 1.5px;
  border: none;
  box-shadow: 0 8px 20px rgba(165, 21, 21, 0.22);
}
.primary-btn[disabled] {
  background: #d8c6c2;
  box-shadow: none;
}
.ghost-btn {
  margin-top: 12px;
  height: 44px;
  line-height: 44px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid rgba(165, 21, 21, 0.18);
  color: #a51515;
  font-size: 13px;
}
.form-note {
  display: block;
  margin-top: 10px;
  text-align: center;
  font-size: 10px;
  line-height: 1.5;
  color: #b09a94;
}
.success {
  padding: 26px 20px 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.success__ring {
  width: 60px;
  height: 60px;
  line-height: 60px;
  border-radius: 999px;
  background: #1a9e7a;
  color: #fff;
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 14px;
}
.success__title {
  font-size: 21px;
  font-weight: 700;
  color: #2d1616;
  letter-spacing: 1px;
}
.success__sub {
  margin-top: 6px;
  font-size: 13px;
  color: #7b5b55;
}
.summary {
  width: 100%;
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(165, 21, 21, 0.05);
  border: 1px solid rgba(165, 21, 21, 0.08);
  box-sizing: border-box;
}
.summary__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
}
.summary__label {
  font-size: 10px;
  color: #a98a82;
}
.summary__value {
  font-size: 11px;
  color: #4b2a2a;
  text-align: right;
}
.badges {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}
.badge {
  font-size: 9px;
  color: #a51515;
  background: rgba(165, 21, 21, 0.08);
  border-radius: 999px;
  padding: 3px 8px;
}
.badge--warn {
  color: #b4432a;
  background: rgba(217, 72, 15, 0.08);
}
.badge--weak {
  color: #9a6b00;
  background: rgba(255, 181, 0, 0.12);
}
.success__note {
  margin-top: 12px;
  max-width: 330px;
  font-size: 10px;
  line-height: 1.7;
  color: #a98a82;
}
</style>
