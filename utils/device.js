// utils/device.js
// 稳定的本机标识：用于可选设备绑定。
// 清数据/重装会生成新 ID，这是设备绑定的预期风险。
import { randomHex } from './crypto'

const KEY = 'vu_device_id'
let cached = null

export function getDeviceInfo() {
  if (cached) return cached

  let id = ''
  try {
    id = String(uni.getStorageSync(KEY) || '')
  } catch (e) {
    id = ''
  }
  if (!id) {
    id = `dev-${randomHex(16)}`
    try {
      uni.setStorageSync(KEY, id)
    } catch (e) {}
  }

  let label = '未知设备'
  try {
    const info = uni.getSystemInfoSync()
    const parts = [info.brand, info.model, info.system].filter(Boolean)
    label = parts.length ? parts.join(' ') : info.platform || '未知设备'
  } catch (e) {}

  cached = { id, label }
  return cached
}
