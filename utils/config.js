// utils/config.js
// 只放公开配置：publishable/anon key 可以出现在前端；service_role 永远不要放这里。
export const SUPABASE_URL = 'https://hisewqjyxadmezeiwnzc.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_yedDW1qzLL3nsZySIugLNw_-r4FRFU_'

// 手机端桥接地址：上传 deploy/ 下的 bridge.html/captcha.html/uni.webview.js 后生效。
export const BRIDGE_BASE = 'https://dornhub.eu.org/.private/check-in'

// Turnstile 生产 Site Key（与 Edge Function 的 Secret 必须属于同一对密钥）。
export const TURNSTILE_SITE_KEY = '0x4AAAAAAC2E9TsjP-02HPpE'
export const TURNSTILE_ENABLED = true

// 手机端 Turnstile 页面；与 bridge 同目录。
export const CAPTCHA_URL = 'https://dornhub.eu.org/.private/check-in/captcha.html'

export const STUDENT_EMAIL_DOMAIN = 'student.valencia.edu'
export const APP_NAME = '瓦莱希雅大学签到系统'
export const APP_VERSION = '1.0.0'
