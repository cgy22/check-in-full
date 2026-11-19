-- ============================================================
-- 瓦莱希雅大学签到系统 · M1 / 03_rls_grants_seed.sql
-- RLS + 最小授权 + 专业字典
-- 执行顺序：01_schema.sql -> 02_functions.sql -> 本文件 -> 04_verify.sql
-- ============================================================

-- ============================================================
-- A. 开启 RLS
-- ============================================================
alter table public.majors            enable row level security;
alter table public.profiles          enable row level security;
alter table public.auth_secrets      enable row level security;
alter table public.classes           enable row level security;
alter table public.class_members     enable row level security;
alter table public.class_invites     enable row level security;
alter table public.checkin_events    enable row level security;
alter table public.checkin_secrets   enable row level security;
alter table public.checkin_records   enable row level security;
alter table public.checkin_attempts  enable row level security;
alter table public.appeals           enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.captcha_tickets   enable row level security;

-- ============================================================
-- B. 读策略（写操作一律不建 policy，只走 RPC）
-- ============================================================

-- 专业字典：注册页/资料页可读
drop policy if exists majors_read on public.majors;
create policy majors_read on public.majors
for select to anon, authenticated
using (true);

-- 个人资料：只读自己
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select to authenticated
using (id = auth.uid());

-- 班级：创建者或成员可读
drop policy if exists classes_select_member on public.classes;
create policy classes_select_member on public.classes
for select to authenticated
using (
  owner_id = auth.uid()
  or public.is_class_member(id, auth.uid())
);

-- 班级成员：本人或班级创建者可读
drop policy if exists class_members_select_self_or_owner on public.class_members;
create policy class_members_select_self_or_owner on public.class_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_class_owner(class_id, auth.uid())
);

-- 邀请码：只有班级创建者可读
drop policy if exists class_invites_select_owner on public.class_invites;
create policy class_invites_select_owner on public.class_invites
for select to authenticated
using (public.is_class_owner(class_id, auth.uid()));

-- 签到活动：创建者始终可见；成员在非突击或已开始时可见
drop policy if exists checkin_events_select_visible on public.checkin_events;
create policy checkin_events_select_visible on public.checkin_events
for select to authenticated
using (
  creator_id = auth.uid()
  or (
    public.is_class_member(class_id, auth.uid())
    and (not is_surprise or now() >= start_at)
  )
);

-- 参与记录：本人或活动创建者，并且活动当前对本人可见
drop policy if exists checkin_records_select_own_or_creator on public.checkin_records;
create policy checkin_records_select_own_or_creator on public.checkin_records
for select to authenticated
using (
  public.can_view_event(event_id, auth.uid())
  and (
    user_id = auth.uid()
    or public.is_event_creator(event_id, auth.uid())
  )
);

-- 补签：本人或活动创建者，并且活动当前对本人可见
drop policy if exists appeals_select_own_or_creator on public.appeals;
create policy appeals_select_own_or_creator on public.appeals
for select to authenticated
using (
  public.can_view_event(event_id, auth.uid())
  and (
    user_id = auth.uid()
    or public.is_event_creator(event_id, auth.uid())
  )
);

-- 以下表故意不建 policy（全拒绝）：
--   auth_secrets, checkin_secrets, checkin_attempts, captcha_tickets, audit_logs
-- 只允许 SECURITY DEFINER 函数 / Edge Function（service_role）访问。

-- ============================================================
-- C. 表授权
-- ============================================================
revoke all on all tables in schema public from anon, authenticated;

grant select on public.majors to anon, authenticated;
grant select on public.profiles,
                 public.classes,
                 public.class_members,
                 public.class_invites,
                 public.checkin_events,
                 public.checkin_records,
                 public.appeals
  to authenticated;

-- 不 grant insert/update/delete：所有写操作只能通过 RPC。

-- ============================================================
-- D. 函数授权
-- ============================================================

-- 只撤销“本项目创建的函数”，不要用 ALL FUNCTIONS：
-- 同一个 Supabase 项目里可能还有 lost-found 的 publish_lostfound 等其他函数。
-- Supabase 默认权限会把新函数直接授给 anon/authenticated，只 REVOKE PUBLIC 不够。
do $$
declare
  r record;
  v_names text[] := array[
    'api_ok','api_error',
    'is_class_owner','is_class_member','is_event_creator','can_view_event',
    'consume_captcha_ticket','derive_checkin_code','checkin_code_hash','haversine_m',
    'get_login_salt','get_server_time','get_my_profile','update_profile','set_password_salt','verify_my_password','delete_my_account',
    'create_class','join_class','list_my_classes','get_class_detail',
    'get_class_attendance','get_class_member_attendance','kick_class_member',
    'delete_class','leave_class',
    'create_checkin_event','create_checkin_event_local','create_checkin_event_verified','create_checkin_event_local_verified','list_checkin_events','get_home_checkins','get_checkin_event',
    'get_checkin_code','consume_checkin_ticket','end_checkin_event','set_event_participant_status','delete_checkin_event','submit_checkin',
    'apply_makeup','list_my_appeals','list_received_appeals','get_appeal_detail','review_appeal','withdraw_appeal',
    'get_event_results','get_dashboard',
    'tg_set_updated_at','tg_profiles_prevent_student_id_change','tg_classes_prevent_owner_change',
    'tg_class_after_insert','tg_checkin_events_owner','tg_checkin_events_timezone',
    'handle_new_user'
  ];
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname = any(v_names)
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end
$$;

-- 登录前/匿名可用
grant execute on function public.get_login_salt(text) to anon, authenticated;
grant execute on function public.get_server_time() to anon, authenticated;

-- RLS policy 内部调用的 helper
grant execute on function public.is_class_owner(uuid, uuid) to authenticated;
grant execute on function public.is_class_member(uuid, uuid) to authenticated;
grant execute on function public.is_event_creator(uuid, uuid) to authenticated;
grant execute on function public.can_view_event(uuid, uuid) to authenticated;

-- 资料 / 密码
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_profile(text, integer, text, uuid) to authenticated;
grant execute on function public.set_password_salt(text, uuid) to authenticated;
grant execute on function public.verify_my_password(text) to authenticated;
grant execute on function public.delete_my_account(text, text) to authenticated;

-- 班级
grant execute on function public.create_class(text, integer, uuid) to authenticated;
grant execute on function public.join_class(text, uuid) to authenticated;
grant execute on function public.list_my_classes(text) to authenticated;
grant execute on function public.get_class_detail(uuid) to authenticated;
grant execute on function public.get_class_attendance(uuid) to authenticated;
grant execute on function public.get_class_member_attendance(uuid, uuid) to authenticated;
grant execute on function public.kick_class_member(uuid, uuid) to authenticated;
grant execute on function public.delete_class(uuid) to authenticated;
grant execute on function public.leave_class(uuid) to authenticated;

-- 签到活动
grant execute on function public.create_checkin_event_verified(
  uuid, uuid, text, text, text, timestamptz, timestamptz,
  text, text, double precision, double precision,
  text, boolean, boolean, boolean, text
) to authenticated;
grant execute on function public.create_checkin_event_local_verified(
  uuid, uuid, text, text, text, text, text,
  text, text, double precision, double precision,
  text, boolean, boolean, boolean, text
) to authenticated;
grant execute on function public.list_checkin_events(text, text) to authenticated;
grant execute on function public.get_home_checkins() to authenticated;
grant execute on function public.get_checkin_event(uuid) to authenticated;
grant execute on function public.get_checkin_code(uuid) to authenticated;
grant execute on function public.consume_checkin_ticket(uuid) to authenticated;
grant execute on function public.end_checkin_event(uuid) to authenticated;
grant execute on function public.set_event_participant_status(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.delete_checkin_event(uuid) to authenticated;

-- 签到提交
grant execute on function public.submit_checkin(
  uuid, text, text, double precision, double precision, text, text
) to authenticated;

-- 补签
grant execute on function public.apply_makeup(uuid, text, uuid) to authenticated;
grant execute on function public.list_my_appeals(text) to authenticated;
grant execute on function public.list_received_appeals(text) to authenticated;
grant execute on function public.get_appeal_detail(uuid) to authenticated;
grant execute on function public.review_appeal(uuid, boolean, text) to authenticated;
grant execute on function public.withdraw_appeal(uuid) to authenticated;

-- 结果 / 首页
grant execute on function public.get_event_results(uuid) to authenticated;
grant execute on function public.get_dashboard() to authenticated;

-- ============================================================
-- E. 专业字典
-- ============================================================
insert into public.majors(code, name, sort_order) values
  ('01', '语言学', 1),
  ('02', '𣿅语语言文学', 2),
  ('03', '外国语言文学', 3),
  ('04', '历史学', 4),
  ('05', '哲学', 5),
  ('06', '翻译学', 6),
  ('07', '新闻传播学', 7),
  ('08', '计算机科学与技术', 8),
  ('09', '经济学', 9),
  ('10', '法学', 10),
  ('11', '数学与应用数学', 11),
  ('12', '物理学', 12)
on conflict (code) do update
set name = excluded.name,
    sort_order = excluded.sort_order;
