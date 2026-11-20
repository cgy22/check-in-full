<template>
  <view class="detail-page">
    <BridgeHost page-path="pages/checkin/detail" />
    <AppHeader title="签到详情" subtitle="CHECK-IN DETAIL" back />

    <view class="detail-shell">
      <view v-if="loading" class="state">
        <view class="state__spinner"></view>
        <text class="state__text">正在加载签到…</text>
      </view>

      <MicaCard v-else-if="errorText" class="state-card">
        <view class="state">
          <view class="state__icon">!</view>
          <text class="state__title">加载失败</text>
          <text class="state__text">{{ errorText }}</text>
          <button class="state__btn" @click="load">重试</button>
        </view>
      </MicaCard>

      <template v-else-if="event">
        <MicaCard class="event-card">
          <view class="event-card__body">
            <view class="event-head">
              <view class="event-head__main">
                <text class="event-title">{{ event.title }}</text>
                <text class="event-class">{{ event.class_name }}</text>
              </view>
              <text class="event-status" :class="`event-status--${status}`">{{ statusLabel }}</text>
            </view>

            <text class="event-desc">{{ event.description }}</text>

            <view class="event-time">
              <view class="event-time__row">
                <text class="event-time__label">开始</text>
                <text class="event-time__value">{{ startText }}</text>
              </view>
              <view class="event-time__row">
                <text class="event-time__label">结束</text>
                <text class="event-time__value">{{ endText }}</text>
              </view>
              <text class="event-time__zone">本地时间</text>
            </view>

            <view class="event-badges">
              <text v-if="event.is_surprise" class="badge">突击签到</text>
              <text v-if="event.require_location" class="badge">1 km 范围</text>
              <text v-if="event.require_device" class="badge badge--warn">设备绑定</text>
              <text v-if="!event.require_location" class="badge badge--weak">弱签到</text>
              <text class="badge">{{ methodLabel }}</text>
            </view>

            <view class="countdown">
              <text class="countdown__label">{{ countdownLabel }}</text>
              <text class="countdown__value">{{ countdownText }}</text>
            </view>

            <view class="counts">
              <view class="counts__item">
                <text class="counts__num">{{ arrivedCount }}</text>
                <text class="counts__label">已签到</text>
              </view>
              <view class="counts__item">
                <text class="counts__num">{{ counts.absent || 0 }}</text>
                <text class="counts__label">未签到</text>
              </view>
              <view class="counts__item">
                <text class="counts__num">{{ counts.total || 0 }}</text>
                <text class="counts__label">总人数</text>
              </view>
            </view>
          </view>
        </MicaCard>

        <MicaCard v-if="isCreator" class="code-card">
          <view class="code-card__body">
            <view class="section-head">
              <view>
                <text class="section-title">动态签到码</text>
                <text class="section-desc">每 30 秒自动刷新，二维码内容就是六位数字。</text>
              </view>
              <text class="code-card__timer">{{ codeSecondsLeft }}s</text>
            </view>

            <view v-if="currentCode" class="code-display">
              <view class="code-digits">
                <text v-for="(d, i) in codeDigits" :key="i" class="code-digit">{{ d }}</text>
              </view>
              <image v-if="qrData" class="code-qr" :src="qrData" mode="widthFix" />
            </view>

            <view v-else class="code-empty">
              <text class="code-empty__text">{{ codeError || '签到开始前 5 分钟生成签到码。' }}</text>
            </view>

            <text v-if="currentCode && codeSecondsLeft <= 0" class="code-expired">
              签到码已过期，请下拉刷新。
            </text>

            <button class="ghost-btn" :disabled="codeLoading" @click="loadCode">
              {{ codeLoading ? '刷新中…' : '刷新签到码' }}
            </button>
          </view>
        </MicaCard>

        <MicaCard v-if="isCreator" class="manage-card">
          <view class="manage-card__body">
            <text class="manage-title">人员与签到控制</text>
            <text class="manage-desc">签到前查看应签到名单；开始后可手动调整成员状态。</text>
            <button class="manage-btn" @click="openParticipants">查看应签到人员</button>
            <button v-if="status === 'active'" class="manage-btn manage-btn--danger" :disabled="ending" @click="endEvent">
              {{ ending ? '结束中…' : '提前结束签到' }}
            </button>
          </view>
        </MicaCard>

        <MicaCard v-if="myRecord && (!isCreator || myRecord.status === 'present')" class="my-card">
          <view class="my-card__body">
            <view class="my-head">
              <text class="my-title">{{ myStatusLabel }}</text>
              <text v-if="myRecord.is_late_slice" class="late-badge">上一轮码</text>
            </view>

            <view v-if="myRecord.status === 'present'" class="my-info">
              <view class="my-info__row">
                <text class="my-info__label">签到时间</text>
                <text class="my-info__value">{{ checkedInText }}</text>
              </view>
              <view class="my-info__row">
                <text class="my-info__label">方式</text>
                <text class="my-info__value">{{ myMethodLabel }}</text>
              </view>
              <view v-if="myRecord.distance_m !== null && myRecord.distance_m !== undefined" class="my-info__row">
                <text class="my-info__label">距离</text>
                <text class="my-info__value">{{ Math.round(myRecord.distance_m) }} 米</text>
              </view>
            </view>
          </view>
        </MicaCard>

        <MicaCard v-if="isCreator && myRecord && myRecord.status === 'absent'" class="empty-card">
          <view class="my-state">
            <text class="my-state__title">发布者无需签到</text>
            <text class="my-state__desc">你可以查看动态签到码和实时签到人数，不需要提交签到。</text>
          </view>
        </MicaCard>

        <MicaCard v-if="!isCreator && (submitting || canSubmit)" class="submit-card">
          <view class="submit-card__body">
            <text class="section-title">签到</text>
            <text class="section-desc">
              {{ submitHint }}
            </text>

            <view v-if="event.require_location" class="location-check">
              <view class="location-check__main">
                <text class="location-check__title">本场要求 1 km 内</text>
                <text v-if="locationInfo" class="location-check__text">
                  距离约 {{ locationInfo.distance }} 米，定位精度约 ±{{ locationInfo.accuracy }} 米
                </text>
                <text v-if="locationError" class="location-check__error">{{ locationError }}</text>
              </view>
              <button class="location-check__btn" :disabled="locationChecking" @click="checkLocation">
                {{ locationChecking ? '定位中…' : '检查定位' }}
              </button>
            </view>

            <view v-if="canUseCode" class="code-input-wrap">
              <text class="field__label">六位签到码</text>
              <input
                v-model="codeInput"
                class="code-input"
                type="number"
                maxlength="6"
                placeholder="输入 6 位数字"
                placeholder-class="field__placeholder"
                @input="onCodeInput"
              />
              <text class="code-input__hint">
                {{ submitting ? '正在验证…' : '输入满 6 位后自动提交，无需点击按钮。' }}
              </text>
            </view>

            <button
              v-if="canUseQr"
              class="scan-btn"
              :disabled="submitting || locationOutOfRange"
              @click="scanCode"
            >
              {{ scanning ? '正在扫码…' : '扫描二维码签到' }}
            </button>

            <view v-if="event.require_location" class="rule-hint">
              <text class="rule-hint__dot"></text>
              <text class="rule-hint__text">本场需要定位，提交时会获取当前设备位置。</text>
            </view>
            <view v-if="event.require_device" class="rule-hint">
              <text class="rule-hint__dot"></text>
              <text class="rule-hint__text">本场绑定设备，请使用首次签到的手机。</text>
            </view>

            <view v-if="submitError" class="submit-error">
              <text class="submit-error__text">{{ submitError }}</text>
            </view>
          </view>
        </MicaCard>

        <MicaCard
          v-else-if="!isCreator && myRecord && myRecord.status === 'absent' && !submitting"
          class="empty-card"
        >
          <view class="my-state">
            <template v-if="status === 'ended'">
              <text class="my-state__title">本场未签到</text>
              <text class="my-state__desc">
                补签机会已用 {{ myAppeals.length }} / 3 次
              </text>

              <view v-if="latestAppeal" class="appeal-state" :class="`appeal-state--${latestAppeal.status}`">
                <text class="appeal-state__title">
                  第 {{ latestAppeal.attempt_no }} 次申请：{{ appealStatusLabel(latestAppeal.status) }}
                </text>
                <text v-if="latestAppeal.review_note" class="appeal-state__note">
                  审批备注：{{ latestAppeal.review_note }}
                </text>
              </view>

              <button
                v-if="latestAppeal && latestAppeal.status === 'pending'"
                class="appeal-action-btn"
                :disabled="withdrawingAppeal"
                @click="withdrawAppeal"
              >
                {{ withdrawingAppeal ? '撤回中…' : '撤回待审批申请' }}
              </button>
              <button v-else-if="canApplyAppeal" class="appeal-action-btn" @click="openAppealApply">
                申请补签
              </button>
              <text v-else-if="appealRemaining === 0" class="my-state__desc">
                3 次补签机会已用完，不能再申请。
              </text>
            </template>

            <template v-else-if="status === 'upcoming'">
              <text class="my-state__title">签到还未开始</text>
              <text class="my-state__desc">
                开始后回到这个页面，输入六位码或扫描二维码即可签到。
              </text>
            </template>

            <template v-else>
              <text class="my-state__title">暂不能签到</text>
              <text class="my-state__desc">你不在本场参与名单中，或当前无法提交。</text>
            </template>
          </view>
        </MicaCard>
      </template>

      <text class="refresh-hint">下拉刷新获取最新签到人数与签到码</text>
    </view>

    <view v-if="h5ScannerVisible" class="h5-scanner">
      <video id="vu-h5-scan-video" class="h5-scanner__video" autoplay muted playsinline></video>
      <view class="h5-scanner__frame"></view>
      <text class="h5-scanner__hint">将二维码放入框内</text>
      <button class="h5-scanner__cancel" @click="stopH5Scanner">取消</button>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import AppHeader from '../../components/AppHeader.vue'
import MicaCard from '../../components/MicaCard.vue'
import { useAuth } from '../../composables/useAuth'
import { rpc } from '../../utils/authApi'
import { sha256Hex } from '../../utils/crypto'
import { getDeviceInfo } from '../../utils/device'
import { getCurrentGcj02 } from '../../utils/location'
import { haversineMeters } from '../../utils/coord'
import { makeQrDataUrl } from '../../utils/qr'
import { patchHomeCacheEvent } from '../../utils/homeCache'
import { formatDeviceDateTime } from '../../utils/time'

const auth = useAuth()

const eventId = ref('')
const event = ref(null)
const myRecord = ref(null)
const counts = ref({})
const canManage = ref(false)
const myAppeals = ref([])
const withdrawingAppeal = ref(false)
const ending = ref(false)
const loading = ref(true)
const errorText = ref('')

const nowMs = ref(Date.now())
const serverOffset = ref(0)
const currentCode = ref('')
const qrData = ref('')
const codeExpiresAt = ref(0)
const codeSecondsLeft = ref(0)
const codeLoading = ref(false)
const codeError = ref('')
let clockTimer = null

const codeInput = ref('')
const submitting = ref(false)
const submitError = ref('')
const scanning = ref(false)
const scannedSource = ref('code')
const h5ScannerVisible = ref(false)
let h5ScannerStream = null
let h5ScannerTimer = null
const locationInfo = ref(null)
const locationChecking = ref(false)
const locationError = ref('')

const status = computed(() => {
  if (!event.value) return 'ended'
  const now = nowMs.value + serverOffset.value
  const start = new Date(event.value.start_at).getTime()
  const end = new Date(event.value.end_at).getTime()
  if (now < start) return 'upcoming'
  if (now <= end) return 'active'
  return 'ended'
})

const statusLabel = computed(() => {
  if (status.value === 'active') return '正在签到'
  if (status.value === 'upcoming') return '未开始'
  return '已结束'
})

const isCreator = computed(() => canManage.value)

const startText = computed(() => formatDeviceDateTime(event.value && event.value.start_at))
const endText = computed(() => formatDeviceDateTime(event.value && event.value.end_at))

const arrivedCount = computed(() => {
  return Number(counts.value.present || 0) + Number(counts.value.makeup || 0)
})

const countdownLabel = computed(() => {
  if (status.value === 'upcoming') return '距离开始'
  if (status.value === 'active') return '距离结束'
  return '活动状态'
})

const countdownText = computed(() => {
  if (!event.value) return '—'
  if (status.value === 'ended') return '已结束'
  const target = status.value === 'upcoming'
    ? new Date(event.value.start_at).getTime()
    : new Date(event.value.end_at).getTime()
  return formatDuration(target - (nowMs.value + serverOffset.value))
})

const codeDigits = computed(() => String(currentCode.value || '').split(''))

const methodLabel = computed(() => {
  if (!event.value) return ''
  if (event.value.method === 'code') return '六位数字'
  if (event.value.method === 'qr') return '二维码'
  return '数字 / 二维码'
})

const canUseCode = computed(() => {
  return event.value && event.value.method !== 'qr'
})
const canUseQr = computed(() => {
  return event.value && event.value.method !== 'code'
})

const locationOutOfRange = computed(() => {
  return !!(locationInfo.value && locationInfo.value.distance > 1000)
})

const canSubmit = computed(() => {
  return (
    event.value &&
    status.value === 'active' &&
    !isCreator.value &&
    myRecord.value &&
    myRecord.value.status === 'absent' &&
    !submitting.value &&
    !locationOutOfRange.value
  )
})

const submitHint = computed(() => {
  if (status.value !== 'active') return '签到开始后才能提交。'
  if (!myRecord.value) return '你不是本场签到的参与成员。'
  if (myRecord.value.status === 'present') return '你已签到。'
  if (event.value.method === 'code') return '输入六位数字后自动验证。'
  if (event.value.method === 'qr') return '扫描签到二维码后自动验证。'
  return '输入六位数字或扫描二维码，验证通过后自动提交。'
})

const latestAppeal = computed(() => myAppeals.value[myAppeals.value.length - 1] || null)
const appealRemaining = computed(() => Math.max(0, 3 - myAppeals.value.length))
const canApplyAppeal = computed(() => {
  return (
    status.value === 'ended' &&
    !isCreator.value &&
    myRecord.value &&
    myRecord.value.status === 'absent' &&
    appealRemaining.value > 0 &&
    (!latestAppeal.value || latestAppeal.value.status === 'rejected')
  )
})

const myStatusLabel = computed(() => {
  if (!myRecord.value) return ''
  if (myRecord.value.status === 'present') return '已签到'
  return status.value === 'ended' ? '未签到' : '待签到'
})

const checkedInText = computed(() => {
  if (!myRecord.value || !myRecord.value.checked_in_at) return '—'
  return formatDeviceDateTime(myRecord.value.checked_in_at)
})

const myMethodLabel = computed(() => {
  const m = myRecord.value && myRecord.value.method
  if (m === 'makeup') return '补签'
  if (m === 'qr') return '二维码'
  if (m === 'code') return '六位数字'
  return '—'
})

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

function updateClock() {
  nowMs.value = Date.now()
  if (codeExpiresAt.value) {
    codeSecondsLeft.value = Math.max(
      0,
      Math.ceil((codeExpiresAt.value - (nowMs.value + serverOffset.value)) / 1000)
    )
  }
}

async function refreshEvent(accessToken) {
  const token = accessToken || (await auth.ensureAccessToken())
  const data = await rpc('get_checkin_event', { p_event_id: eventId.value }, token)
  event.value = data.event
  myRecord.value = data.my_record || null
  counts.value = data.counts || {}
  canManage.value = !!data.can_manage
  myAppeals.value = data.my_appeals || []
  const ev = data.event || {}
  const serverNow = data.server_now ? new Date(data.server_now).getTime() : Date.now()
  let eventStatus = 'ended'
  if (serverNow < new Date(ev.start_at).getTime()) eventStatus = 'upcoming'
  else if (serverNow <= new Date(ev.end_at).getTime()) eventStatus = 'active'
  patchHomeCacheEvent(eventId.value, {
    title: ev.title,
    class_name: ev.class_name,
    start_at: ev.start_at,
    end_at: ev.end_at,
    timezone: ev.timezone,
    status: eventStatus,
    my_status: data.my_record ? data.my_record.status : null,
    my_method: data.my_record ? data.my_record.method : null,
    my_appeal_status: (data.my_appeals && data.my_appeals.length)
      ? data.my_appeals[data.my_appeals.length - 1].status
      : null,
    present_count: data.counts ? data.counts.present : 0,
    makeup_count: data.counts ? data.counts.makeup : 0,
    absent_count: data.counts ? data.counts.absent : 0
  })
  return data
}

function applyCodeData(payload) {
  if (!payload || payload.ok === false || !payload.data) {
    currentCode.value = ''
    qrData.value = ''
    codeExpiresAt.value = 0
    codeSecondsLeft.value = 0
    codeError.value = (payload && payload.message) || '签到码暂不可用'
    return
  }
  const data = payload.data
  currentCode.value = data.code || ''
  qrData.value = data.code ? makeQrDataUrl(data.code, 10) : ''
  codeExpiresAt.value = data.expires_at ? new Date(data.expires_at).getTime() : 0
  codeSecondsLeft.value = Number(data.seconds_left || 0)
  codeError.value = ''
  if (data.server_now) {
    const serverNow = new Date(data.server_now).getTime()
    if (Number.isFinite(serverNow)) {
      serverOffset.value = serverNow - Date.now()
      nowMs.value = Date.now()
    }
  }
}

async function load() {
  if (!eventId.value) return
  loading.value = true
  errorText.value = ''
  locationInfo.value = null
  locationError.value = ''
  try {
    if (!auth.ready.value) await auth.restore()
    if (!auth.session.value || !auth.profile.value) {
      uni.reLaunch({ url: '/pages/auth/login' })
      return
    }
    const token = await auth.ensureAccessToken()
    const data = await refreshEvent(token)
    if (data && data.server_now) {
      const serverNow = new Date(data.server_now).getTime()
      if (Number.isFinite(serverNow)) {
        serverOffset.value = serverNow - Date.now()
        nowMs.value = Date.now()
      }
    }
    if (isCreator.value) {
      applyCodeData(data && data.code_data)
    }
  } catch (e) {
    errorText.value = e.message || '网络请求失败'
  } finally {
    loading.value = false
  }
}

async function loadCode() {
  if (!isCreator.value || !event.value) return
  if (status.value === 'ended') {
    currentCode.value = ''
    qrData.value = ''
    codeExpiresAt.value = 0
    codeSecondsLeft.value = 0
    codeError.value = '签到已结束'
    return
  }
  if (status.value === 'upcoming') {
    const untilStart = new Date(event.value.start_at).getTime() - (nowMs.value + serverOffset.value)
    if (untilStart > 5 * 60 * 1000) {
      currentCode.value = ''
      qrData.value = ''
      codeExpiresAt.value = 0
      codeSecondsLeft.value = 0
      codeError.value = '签到开始前 5 分钟生成签到码。'
      return
    }
  }

  codeLoading.value = true
  codeError.value = ''
  try {
    const token = await auth.ensureAccessToken()
    const data = await rpc('get_checkin_code', { p_event_id: eventId.value }, token)
    currentCode.value = data.code || ''
    qrData.value = data.code ? makeQrDataUrl(data.code, 10) : ''
    codeExpiresAt.value = data.expires_at ? new Date(data.expires_at).getTime() : 0
    if (data.server_now) {
      const serverNow = new Date(data.server_now).getTime()
      if (Number.isFinite(serverNow)) {
        serverOffset.value = serverNow - Date.now()
        nowMs.value = Date.now()
      }
    }
    codeSecondsLeft.value = Number(data.seconds_left || 0)
  } catch (e) {
    currentCode.value = ''
    qrData.value = ''
    codeExpiresAt.value = 0
    codeSecondsLeft.value = 0
    codeError.value = e.message || '签到码加载失败'
  } finally {
    codeLoading.value = false
  }
}

function onCodeInput(e) {
  const value = String((e && e.detail && e.detail.value) || '')
    .replace(/\D/g, '')
    .slice(0, 6)
  codeInput.value = value
  submitError.value = ''
  if (value.length === 6 && canSubmit.value) {
    setTimeout(() => submitCode('code'), 30)
  }
}

async function checkLocation() {
  if (!event.value || !event.value.require_location || locationChecking.value) return
  locationChecking.value = true
  locationError.value = ''
  locationInfo.value = null
  try {
    const loc = await getCurrentGcj02()
    const distance = haversineMeters(
      event.value.location_lat,
      event.value.location_lng,
      loc.latitude,
      loc.longitude
    )
    locationInfo.value = {
      distance: Math.round(distance),
      accuracy: Math.round(Number(loc.accuracy || 0))
    }
    if (distance > 1000) {
      locationError.value = `距离签到点约 ${Math.round(distance)} 米，超出 1 km 范围。`
    }
  } catch (e) {
    locationError.value = `无法获取定位：${e.message || '请允许定位后重试'}`
  } finally {
    locationChecking.value = false
  }
}

async function submitCode(source) {
  if (!canSubmit.value) return
  const code = String(codeInput.value || '').trim()
  if (!/^\d{6}$/.test(code)) return
  if (!auth.profile.value || !auth.profile.value.id) {
    submitError.value = '登录状态异常，请重新登录'
    return
  }

  submitting.value = true
  submitError.value = ''
  try {
    const token = await auth.ensureAccessToken()
    let location = null
    if (event.value.require_location) {
      try {
        location = await getCurrentGcj02()
      } catch (e) {
        submitError.value = `无法获取定位：${e.message || '请允许定位后重试'}`
        uni.showModal({
          title: '无法获取定位',
          content: submitError.value,
          showCancel: false
        })
        return
      }
    }

    const device = event.value.require_device ? getDeviceInfo() : null
    const codeHash = sha256Hex(`${eventId.value}|${auth.profile.value.id}|${code}`)
    const data = await rpc(
      'submit_checkin',
      {
        p_event_id: eventId.value,
        p_code_hash: codeHash,
        p_method: source === 'qr' ? 'qr' : 'code',
        p_lat: location ? location.latitude : null,
        p_lng: location ? location.longitude : null,
        p_device_id: device ? device.id : null,
        p_device_label: device ? device.label : null
      },
      token
    )

    myRecord.value = {
      ...(myRecord.value || {}),
      status: 'present',
      method: source === 'qr' ? 'qr' : 'code',
      is_late_slice: !!(data && (data.is_late_slice || data.lateslice)),
      checked_in_at: (data && data.checked_in_at) || new Date().toISOString(),
      distance_m: data && data.distance_m
    }
    codeInput.value = ''
    uni.showToast({ title: data && (data.is_late_slice || data.lateslice) ? '签到成功（上一轮码）' : '签到成功', icon: 'success' })
    await refreshEvent(token)
  } catch (e) {
    submitError.value = e.message || '签到失败'
    uni.showToast({ title: submitError.value, icon: 'none', duration: 2800 })
    if (e.code === 'CODE_EXPIRED' || e.code === 'TOO_MANY_ATTEMPTS') {
      codeInput.value = ''
    }
    if (e.code === 'ALREADY_CHECKED_IN') {
      await load().catch(() => {})
    }
  } finally {
    submitting.value = false
  }
}

function openAppealApply() {
  if (!canApplyAppeal.value || !myRecord.value) return
  uni.navigateTo({
    url: `/pages/appeal/apply?recordId=${myRecord.value.id}&eventId=${eventId.value}`
  })
}

function withdrawAppeal() {
  if (!latestAppeal.value || latestAppeal.value.status !== 'pending' || withdrawingAppeal.value) return
  uni.showModal({
    title: '撤回补签申请',
    content: '撤回后这次申请记录会删除，你可以重新提交。',
    confirmText: '撤回',
    confirmColor: '#b4432a',
    success: async res => {
      if (!res.confirm) return
      withdrawingAppeal.value = true
      try {
        await rpc(
          'withdraw_appeal',
          { p_appeal_id: latestAppeal.value.id },
          await auth.ensureAccessToken()
        )
        uni.showToast({ title: '已撤回申请', icon: 'success' })
        await refreshEvent()
      } catch (e) {
        uni.showToast({ title: e.message || '撤回失败', icon: 'none', duration: 2600 })
      } finally {
        withdrawingAppeal.value = false
      }
    }
  })
}

function appealStatusLabel(status) {
  if (status === 'pending') return '待审批'
  if (status === 'approved') return '已通过'
  if (status === 'rejected') return '未通过'
  return ''
}

function openParticipants() {
  uni.navigateTo({ url: `/pages/checkin/participants?id=${eventId.value}` })
}

function endEvent() {
  if (ending.value) return
  uni.showModal({
    title: '提前结束签到',
    content: '结束后成员不能再签到，已签到记录会保留。确定结束吗？',
    confirmText: '结束签到',
    confirmColor: '#b4432a',
    success: async res => {
      if (!res.confirm) return
      ending.value = true
      try {
        await rpc('end_checkin_event', { p_event_id: eventId.value }, await auth.ensureAccessToken())
        uni.showToast({ title: '签到已结束', icon: 'success' })
        await load()
      } catch (e) {
        uni.showToast({ title: e.message || '结束失败', icon: 'none', duration: 2600 })
      } finally {
        ending.value = false
      }
    }
  })
}

function isAppPlatform() {
  try {
    return uni.getSystemInfoSync().uniPlatform === 'app'
  } catch (e) {
    return false
  }
}

function acceptScanValue(value) {
  const text = String(value || '').trim()
  if (!/^\d{6}$/.test(text)) {
    uni.showToast({ title: '二维码内容不是六位签到码', icon: 'none' })
    return
  }
  codeInput.value = text
  scannedSource.value = 'qr'
  setTimeout(() => submitCode('qr'), 30)
}

function stopH5Scanner() {
  if (h5ScannerTimer) {
    clearTimeout(h5ScannerTimer)
    h5ScannerTimer = null
  }
  if (h5ScannerStream) {
    try {
      h5ScannerStream.getTracks().forEach(track => track.stop())
    } catch (e) {}
    h5ScannerStream = null
  }
  if (typeof document !== 'undefined') {
    const video = document.getElementById('vu-h5-scan-video')
    if (video) video.srcObject = null
  }
  h5ScannerVisible.value = false
  scanning.value = false
}

async function scanH5() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    uni.showModal({
      title: '当前环境不支持摄像头',
      content: '请改用六位数字输入，或使用 Android App 原生扫码。',
      showCancel: false
    })
    return
  }
  if (typeof BarcodeDetector === 'undefined') {
    uni.showModal({
      title: '当前浏览器不支持扫码',
      content: '请改用六位数字输入；建议使用 Chrome/Edge 或 Android App 扫码。',
      showCancel: false
    })
    return
  }

  h5ScannerVisible.value = true
  await nextTick()

  const video = document.getElementById('vu-h5-scan-video')
  if (!video) {
    stopH5Scanner()
    return
  }

  try {
    h5ScannerStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    })
    video.srcObject = h5ScannerStream
    await video.play()

    const detector = new BarcodeDetector({ formats: ['qr_code'] })
    const detectFrame = async () => {
      if (!h5ScannerVisible.value) return
      try {
        const codes = await detector.detect(video)
        if (codes && codes.length) {
          const value = codes[0].rawValue
          stopH5Scanner()
          acceptScanValue(value)
          return
        }
      } catch (e) {}
      h5ScannerTimer = setTimeout(detectFrame, 260)
    }
    detectFrame()
  } catch (e) {
    stopH5Scanner()
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
    uni.showModal({
      title: '无法打开摄像头',
      content: denied
        ? '摄像头权限被拒绝，请允许后重试，或改用六位数字输入。'
        : '当前环境无法调用摄像头，请改用六位数字输入。',
      showCancel: false
    })
  }
}

async function scanCode() {
  if (scanning.value || submitting.value) return
  scanning.value = true
  if (!isAppPlatform()) {
    try {
      await scanH5()
    } finally {
      scanning.value = false
    }
    return
  }

  uni.scanCode({
    scanType: ['qrCode'],
    success: res => acceptScanValue(res && res.result),
    fail: err => {
      const msg = (err && err.errMsg) || ''
      if (msg.indexOf('cancel') === -1) {
        uni.showModal({
          title: '无法扫码',
          content: '当前环境无法调用相机扫码，请改用六位数字输入。',
          showCancel: false
        })
      }
    },
    complete: () => {
      scanning.value = false
    }
  })
}

onLoad(options => {
  eventId.value = (options && (options.id || options.eventId)) || ''
})

onShow(() => {
  if (!eventId.value) {
    errorText.value = '缺少签到活动参数'
    loading.value = false
    return
  }
  load()
  if (!clockTimer) {
    clockTimer = setInterval(updateClock, 1000)
  }
})

onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

onBeforeUnmount(() => {
  stopH5Scanner()
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<style scoped>
.detail-page {
  min-height: 100vh;
  background: #f4efe9;
}
.detail-shell {
  max-width: 540px;
  margin: 0 auto;
  padding: 8px 18px 30px;
}
.state-card,
.empty-card {
  margin-top: 8px;
}
.state {
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}
.state__spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(165, 21, 21, 0.14);
  border-top-color: #a51515;
  animation: spin 0.8s linear infinite;
}
.state__icon {
  width: 40px;
  height: 40px;
  line-height: 40px;
  border-radius: 14px;
  background: rgba(165, 21, 21, 0.07);
  color: #a51515;
  font-size: 20px;
}
.state__title {
  font-size: 15px;
  font-weight: 700;
  color: #4b2a2a;
}
.state__text {
  font-size: 11px;
  line-height: 1.6;
  color: #a98a82;
}
.state__btn {
  margin-top: 6px;
  height: 36px;
  line-height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 8px;
  background: #a51515;
  color: #fff;
  font-size: 12px;
}
.event-card__body,
.code-card__body,
.my-card__body,
.submit-card__body {
  padding: 18px;
}
.event-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.event-head__main {
  min-width: 0;
}
.event-title {
  display: block;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  color: #2d1616;
}
.event-class {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: #a98a82;
}
.event-status {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 9px;
  color: #a51515;
  background: rgba(165, 21, 21, 0.07);
}
.event-status--upcoming {
  color: #9b6d14;
  background: rgba(201, 154, 46, 0.1);
}
.event-status--ended {
  color: #8f7570;
  background: rgba(143, 117, 112, 0.08);
}
.event-desc {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
  color: #6f4c45;
  white-space: pre-wrap;
}
.event-time {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 9px;
  background: rgba(165, 21, 21, 0.035);
}
.event-time__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.event-time__row + .event-time__row {
  margin-top: 5px;
}
.event-time__label {
  font-size: 10px;
  color: #a98a82;
}
.event-time__value {
  font-size: 11px;
  color: #6f4c45;
  text-align: right;
}
.event-time__zone {
  display: block;
  margin-top: 5px;
  font-size: 9px;
  color: #b09a94;
  text-align: right;
}
.event-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.badge {
  padding: 3px 7px;
  border-radius: 6px;
  border: 1px solid rgba(143, 117, 112, 0.14);
  font-size: 9px;
  color: #8f7570;
}
.badge--warn {
  color: #b4432a;
  border-color: rgba(217, 72, 15, 0.2);
  background: rgba(217, 72, 15, 0.04);
}
.badge--weak {
  color: #9b6d14;
  border-color: rgba(201, 154, 46, 0.2);
}
.countdown {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 9px;
  background: linear-gradient(110deg, rgba(165, 21, 21, 0.07), rgba(165, 21, 21, 0.02));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.countdown__label {
  font-size: 10px;
  color: #a98a82;
}
.countdown__value {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #a51515;
  font-variant-numeric: tabular-nums;
}
.counts {
  display: flex;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(165, 21, 21, 0.06);
}
.counts__item {
  flex: 1;
  text-align: center;
}
.counts__num {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #3b1d1d;
}
.counts__label {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  color: #a98a82;
}
.code-card {
  margin-top: 10px;
}
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.section-title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #2d1616;
}
.section-desc {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  line-height: 1.5;
  color: #a98a82;
}
.code-card__timer {
  flex-shrink: 0;
  font-size: 20px;
  font-weight: 700;
  color: #a51515;
  font-variant-numeric: tabular-nums;
}
.code-display {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.code-digits {
  display: flex;
  gap: 6px;
}
.code-digit {
  width: 36px;
  height: 46px;
  line-height: 46px;
  text-align: center;
  border-radius: 8px;
  background: rgba(165, 21, 21, 0.07);
  border: 1px solid rgba(165, 21, 21, 0.14);
  color: #a51515;
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.code-qr {
  width: 180px;
  height: 180px;
  border-radius: 10px;
  background: #fff;
  padding: 6px;
}
.code-expired {
  display: block;
  margin-top: 8px;
  text-align: center;
  font-size: 9px;
  color: #b4432a;
}
.code-empty {
  padding: 22px 10px;
  text-align: center;
}
.code-empty__text {
  font-size: 11px;
  line-height: 1.6;
  color: #a98a82;
}
.ghost-btn {
  margin-top: 12px;
  height: 38px;
  line-height: 38px;
  border: 1px solid rgba(165, 21, 21, 0.2);
  border-radius: 8px;
  background: transparent;
  color: #a51515;
  font-size: 12px;
}
.manage-card {
  margin-top: 10px;
}
.manage-card__body {
  padding: 18px;
}
.manage-title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #2d1616;
}
.manage-desc {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  line-height: 1.5;
  color: #a98a82;
}
.manage-btn {
  margin-top: 10px;
  height: 38px;
  line-height: 38px;
  border: 1px solid rgba(165, 21, 21, 0.18);
  border-radius: 9px;
  background: transparent;
  color: #a51515;
  font-size: 11px;
}
.manage-btn--danger {
  color: #b4432a;
  border-color: rgba(217, 72, 15, 0.2);
  background: rgba(217, 72, 15, 0.04);
}
.manage-btn[disabled] {
  opacity: 0.5;
}
.my-card {
  margin-top: 10px;
}
.my-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.my-title {
  font-size: 16px;
  font-weight: 700;
  color: #2d1616;
}
.late-badge {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 9px;
  color: #9b6d14;
  background: rgba(201, 154, 46, 0.1);
}
.my-info {
  margin-top: 10px;
}
.my-info__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
}
.my-info__label {
  font-size: 10px;
  color: #a98a82;
}
.my-info__value {
  font-size: 11px;
  color: #6f4c45;
  text-align: right;
}
.submit-card {
  margin-top: 10px;
}
.location-check {
  margin-top: 12px;
  padding: 10px 11px;
  border-radius: 9px;
  background: rgba(201, 154, 46, 0.06);
  border: 1px solid rgba(201, 154, 46, 0.14);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.location-check__main {
  min-width: 0;
  flex: 1;
}
.location-check__title {
  display: block;
  font-size: 10px;
  color: #7b5b55;
}
.location-check__text {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  line-height: 1.5;
  color: #8f7570;
}
.location-check__error {
  display: block;
  margin-top: 3px;
  font-size: 9px;
  line-height: 1.5;
  color: #b4432a;
}
.location-check__btn {
  flex-shrink: 0;
  height: 30px;
  line-height: 30px;
  padding: 0 9px;
  border: 1px solid rgba(201, 154, 46, 0.25);
  border-radius: 6px;
  background: transparent;
  color: #9b6d14;
  font-size: 9px;
}
.code-input-wrap {
  margin-top: 14px;
}
.field__label {
  display: block;
  margin-bottom: 8px;
  font-size: 11px;
  color: #7b5b55;
}
.code-input {
  width: 100%;
  height: 52px;
  padding: 0 16px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(165, 21, 21, 0.16);
  background: rgba(255, 255, 255, 0.8);
  color: #2d1616;
  font-size: 24px;
  letter-spacing: 8px;
  text-align: center;
}
.field__placeholder {
  color: #c0aaa3;
  font-size: 13px;
  letter-spacing: 1px;
}
.code-input__hint {
  display: block;
  margin-top: 6px;
  font-size: 9px;
  color: #b09a94;
}
.scan-btn {
  margin-top: 12px;
  height: 44px;
  line-height: 44px;
  border: none;
  border-radius: 10px;
  background: #a51515;
  color: #fff;
  font-size: 13px;
}
.rule-hint {
  display: flex;
  gap: 7px;
  margin-top: 10px;
  align-items: flex-start;
}
.rule-hint__dot {
  width: 4px;
  height: 4px;
  margin-top: 6px;
  border-radius: 50%;
  background: #c99a2e;
  flex-shrink: 0;
}
.rule-hint__text {
  font-size: 9px;
  line-height: 1.5;
  color: #a98a82;
}
.submit-error {
  margin-top: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  background: rgba(217, 72, 15, 0.07);
}
.submit-error__text {
  font-size: 10px;
  line-height: 1.5;
  color: #b4432a;
}
.my-state {
  padding: 24px 18px;
  text-align: center;
}
.my-state__title {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: #4b2a2a;
}
.my-state__desc {
  display: block;
  margin-top: 7px;
  font-size: 10px;
  line-height: 1.6;
  color: #a98a82;
}
.appeal-state {
  margin-top: 12px;
  padding: 9px 11px;
  border-radius: 8px;
  background: rgba(201, 154, 46, 0.06);
}
.appeal-state--approved {
  background: rgba(26, 158, 122, 0.06);
}
.appeal-state--rejected {
  background: rgba(217, 72, 15, 0.05);
}
.appeal-state__title {
  display: block;
  font-size: 10px;
  color: #7b5b55;
}
.appeal-state__note {
  display: block;
  margin-top: 4px;
  font-size: 9px;
  line-height: 1.5;
  color: #a98a82;
}
.appeal-action-btn {
  margin-top: 12px;
  height: 40px;
  line-height: 40px;
  border: none;
  border-radius: 9px;
  background: #a51515;
  color: #fff;
  font-size: 12px;
}
.appeal-action-btn[disabled] {
  opacity: 0.5;
}
.h5-scanner {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.h5-scanner__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.h5-scanner__frame {
  position: relative;
  z-index: 1;
  width: 220px;
  height: 220px;
  border: 2px solid rgba(255, 248, 242, 0.95);
  border-radius: 18px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.42);
}
.h5-scanner__hint {
  position: absolute;
  z-index: 2;
  bottom: calc(112px + env(safe-area-inset-bottom));
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12px;
  color: #fff8f2;
}
.h5-scanner__cancel {
  position: absolute;
  z-index: 2;
  bottom: calc(42px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  height: 38px;
  line-height: 38px;
  border: 1px solid rgba(255, 248, 242, 0.5);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  color: #fff8f2;
  font-size: 12px;
}
.refresh-hint {
  display: block;
  margin-top: 10px;
  text-align: center;
  font-size: 9px;
  color: #b6a39d;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
