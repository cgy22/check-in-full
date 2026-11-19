-- ============================================================
-- 修正 captcha_tickets 的 purpose 约束
-- 适用：已经执行过旧版 01_schema.sql 的数据库
-- 说明：Edge Function 的 create_checkin 用途需要落库
-- ============================================================

alter table public.captcha_tickets
  drop constraint if exists captcha_tickets_purpose_check;

alter table public.captcha_tickets
  add constraint captcha_tickets_purpose_check check (
    purpose in (
      'create_class',
      'join_class',
      'appeal',
      'create_checkin',
      'profile_update',
      'change_password'
    )
  );
