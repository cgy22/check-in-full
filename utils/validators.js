// utils/validators.js
import { MAJORS, ENROLLMENT_YEARS } from './constants'

export function normalizeStudentId(value) {
  return String(value || '').replace(/\s+/g, '')
}

export function isValidStudentId(value) {
  return /^\d{12}$/.test(normalizeStudentId(value))
}

export function isValidName(value) {
  const name = String(value || '').trim()
  if (name.length < 2 || name.length > 50) return false
  // 控制字符不允许；其余交给数据库长度约束（支持中文、拉丁、空格、·、-）
  return !/[\u0000-\u001f\u007f]/.test(name)
}

export function isValidPassword(value) {
  const pwd = String(value || '')
  if (pwd.length < 8 || pwd.length > 64) return false
  if (/\s/.test(pwd)) return false
  return /[A-Za-z]/.test(pwd) && /\d/.test(pwd)
}

export function passwordRuleText() {
  return '至少 8 位，必须同时包含字母和数字，不能有空格'
}

export function isValidEnrollmentYear(value) {
  return ENROLLMENT_YEARS.includes(Number(value))
}

export function isValidMajorCode(value) {
  return MAJORS.some(m => m.code === value)
}

export function validateRegisterForm(form) {
  if (!isValidName(form.fullName)) {
    return { ok: false, message: '姓名需为 2-50 个字符，不能包含控制字符' }
  }
  if (!isValidEnrollmentYear(form.enrollmentYear)) {
    return { ok: false, message: '请选择入学年份' }
  }
  if (!isValidMajorCode(form.majorCode)) {
    return { ok: false, message: '请选择专业' }
  }
  if (!isValidPassword(form.password)) {
    return { ok: false, message: passwordRuleText() }
  }
  if (form.password !== form.confirmPassword) {
    return { ok: false, message: '两次输入的密码不一致' }
  }
  return { ok: true }
}
