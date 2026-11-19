-- ============================================================
-- 瓦莱希雅大学签到系统 · M1 / 04_verify.sql
-- 在 01/02/03 全部执行成功后运行；只读检查，不修改数据。
-- ============================================================

-- 1) 表清单：应看到 13 张业务表
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

-- 2) 是否有表漏开 RLS：应返回 0 行
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by c.relname;

-- 3) RLS 策略清单：应有 majors/profiles/classes/class_members/class_invites/
--    checkin_events/checkin_records/appeals 共 8 张表有 policy
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 4) 专业字典：应为 12 行
select count(*) as major_count,
       min(code) as min_code,
       max(code) as max_code
from public.majors;

-- 5) RPC 清单：应能看到 create_class / join_class / submit_checkin /
--    apply_makeup / review_appeal / kick_class_member / delete_class 等
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
order by p.proname;

-- 6) 触发器清单
select event_object_table as table_name,
       trigger_name,
       event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
   or event_object_schema = 'auth'
order by event_object_table, trigger_name;

-- 7) 冒烟测试：未知学号应返回 ok=true + 确定性假盐，不应报错
select public.get_login_salt('000000000000') as fake_salt_result;

-- 8) 服务器时间：应返回 UTC 时间与 epoch_ms
select public.get_server_time() as server_time_result;

-- 9) 检查 anon 可执行的函数：应只有 get_login_salt / get_server_time
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee = 'anon'
order by routine_name;

-- 10) 检查 authenticated 是否至少能执行关键业务 RPC
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee = 'authenticated'
  and routine_name in (
    'get_my_profile','update_profile','verify_my_password','delete_my_account','create_class','join_class',
    'submit_checkin','get_home_checkins','apply_makeup','review_appeal','kick_class_member','delete_class'
  )
order by routine_name;
