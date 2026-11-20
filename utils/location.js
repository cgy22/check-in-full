// utils/location.js
// 统一获取 GCJ-02 坐标：
// - H5：浏览器给了 WGS84，转 GCJ-02
// - App：优先 uni.getLocation({type:'wgs84'})，失败再走 plus.geolocation
// - 最终统一返回 GCJ-02，服务端只按 GCJ-02 算距离
import { wgs84ToGcj02 } from './coord'

function platform() {
  try {
    return uni.getSystemInfoSync().uniPlatform || 'h5'
  } catch (e) {
    return 'h5'
  }
}

function fromUni() {
  return new Promise((resolve, reject) => {
    uni.getLocation({
      type: 'wgs84',
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
      success(res) {
        const lat = Number(res.latitude)
        const lng = Number(res.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          reject(new Error('定位结果无效'))
          return
        }
        resolve({ latitude: lat, longitude: lng, accuracy: res.accuracy })
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || 'uni.getLocation 失败'))
      }
    })
  })
}

function fromPlus() {
  return new Promise((resolve, reject) => {
    if (typeof plus === 'undefined' || !plus.geolocation) {
      reject(new Error('当前环境不支持 plus.geolocation'))
      return
    }
    plus.geolocation.getCurrentPosition(
      pos => {
        const lat = Number(pos && pos.coords && pos.coords.latitude)
        const lng = Number(pos && pos.coords && pos.coords.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          reject(new Error('plus 定位结果无效'))
          return
        }
        resolve({ latitude: lat, longitude: lng, accuracy: pos.coords.accuracy })
      },
      err => {
        reject(new Error((err && err.message) || 'plus.geolocation 失败'))
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
        coordsType: 'wgs84'
      }
    )
  })
}

function readNativeLocation() {
  // #ifdef H5
  try {
    const params = new URLSearchParams(window.location.search)
    const lat = Number(params.get('native_lat'))
    const lng = Number(params.get('native_lng'))
    const accuracy = Number(params.get('native_accuracy') || 0)
    const ts = Number(params.get('native_ts') || 0)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (!ts || Date.now() - ts > 10 * 60 * 1000) return null
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return {
      latitude: lat,
      longitude: lng,
      accuracy: Number.isFinite(accuracy) ? accuracy : 0,
      source: 'native-bridge'
    }
  } catch (e) {
    return null
  }
  // #endif
  return null
}

export async function getCurrentGcj02() {
  const nativeLocation = readNativeLocation()
  if (nativeLocation) return nativeLocation

  let raw
  try {
    raw = await fromUni()
  } catch (e) {
    if (platform() === 'app') {
      raw = await fromPlus()
    } else {
      throw e
    }
  }
  const gcj = wgs84ToGcj02(raw.latitude, raw.longitude)
  return {
    latitude: gcj.latitude,
    longitude: gcj.longitude,
    accuracy: raw.accuracy,
    source: platform()
  }
}
