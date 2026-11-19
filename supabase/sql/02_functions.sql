-- ============================================================
-- 瓦莱希雅大学签到系统 · M1 / 02_functions.sql
-- 所有业务 RPC；统一返回 { ok, code?, message?, data? }
-- 所有写操作只通过本文件的 SECURITY DEFINER 函数。
-- 执行顺序：01_schema.sql -> 本文件 -> 03_rls_grants_seed.sql -> 04_verify.sql
-- ============================================================

-- ============================================================
-- A. 通用辅助
-- ============================================================
create or replace function public.api_ok(p_data jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('ok', true, 'data', coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public.api_error(p_code text, p_message text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('ok', false, 'code', p_code, 'message', p_message);
$$;

create or replace function public.is_class_owner(p_class_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.owner_id = p_user_id
  );
$$;

create or replace function public.is_class_member(p_class_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.class_members m
    where m.class_id = p_class_id and m.user_id = p_user_id
  );
$$;

create or replace function public.is_event_creator(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.checkin_events e
    where e.id = p_event_id and e.creator_id = p_user_id
  );
$$;

create or replace function public.can_view_event(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.checkin_events e
    where e.id = p_event_id
      and (
        e.creator_id = p_user_id
        or (
          public.is_class_member(e.class_id, p_user_id)
          and (not e.is_surprise or now() >= e.start_at)
        )
      )
  );
$$;

-- 单次消费人机验证票据；返回 true 表示消费成功
create or replace function public.consume_captcha_ticket(
  p_ticket uuid,
  p_purpose text,
  p_uid uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_ticket is null then
    return false;
  end if;

  update public.captcha_tickets
  set consumed_at = now()
  where id = p_ticket
    and purpose = p_purpose
    and consumed_at is null
    and expires_at > now()
    and (user_id is null or user_id = p_uid)
  returning id into v_id;

  return v_id is not null;
end;
$$;

-- 由服务端密钥 + 时间片派生 6 位码；secret 不出库
create or replace function public.derive_checkin_code(p_event_id uuid, p_slice bigint)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_secret text;
  v_mac bytea;
  v_num bigint;
begin
  select s.secret into v_secret
  from public.checkin_secrets s
  where s.event_id = p_event_id;

  if v_secret is null then
    return null;
  end if;

  v_mac := hmac(p_slice::text, v_secret, 'sha256');
  v_num := (
    get_byte(v_mac, 0)::bigint * 16777216
    + get_byte(v_mac, 1)::bigint * 65536
    + get_byte(v_mac, 2)::bigint * 256
    + get_byte(v_mac, 3)::bigint
  ) % 1000000;

  return lpad(v_num::text, 6, '0');
end;
$$;

-- 客户端与数据库使用同一个哈希规则：
-- SHA-256(event_id | user_id | 六位码)
create or replace function public.checkin_code_hash(
  p_event_id uuid,
  p_user_id uuid,
  p_code text
)
returns text
language sql
immutable
security definer
set search_path = public, extensions, pg_temp
as $$
  select encode(
    digest(p_event_id::text || '|' || p_user_id::text || '|' || p_code, 'sha256'),
    'hex'
  );
$$;

create or replace function public.haversine_m(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  ));
$$;

-- ============================================================
-- B. 登录 / 资料 / 密码
-- ============================================================

-- 登录前取密码盐；未知学号返回确定性假盐，避免账号枚举
create or replace function public.get_login_salt(p_student_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_student_id text := trim(coalesce(p_student_id, ''));
  v_salt text;
begin
  if v_student_id ~ '^[0-9]{12}$' then
    select s.password_salt into v_salt
    from public.profiles p
    join public.auth_secrets s on s.user_id = p.id
    where p.student_id = v_student_id;
  end if;

  if v_salt is null then
    v_salt := encode(
      hmac(coalesce(v_student_id, ''), 'vu-login-salt-v1', 'sha256'),
      'hex'
    );
  end if;

  return public.api_ok(jsonb_build_object('salt', v_salt));
end;
$$;

create or replace function public.get_server_time()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select public.api_ok(jsonb_build_object(
    'now', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'epoch_ms', floor(extract(epoch from now()) * 1000)::bigint,
    'timezone', 'UTC'
  ));
$$;

create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  select jsonb_build_object(
    'id', p.id,
    'student_id', p.student_id,
    'full_name', p.full_name,
    'enrollment_year', p.enrollment_year,
    'major_code', p.major_code,
    'major_name', m.name,
    'created_at', p.created_at,
    'created_classes', (
      select count(*) from public.classes c where c.owner_id = p.id
    ),
    'joined_classes', (
      select count(*) from public.class_members cm
      where cm.user_id = p.id and cm.role = 'member'
    ),
    'published_events', (
      select count(*) from public.checkin_events e where e.creator_id = p.id
    ),
    'pending_received_appeals', (
      select count(*)
      from public.appeals a
      join public.checkin_events e on e.id = a.event_id
      where e.creator_id = p.id and a.status = 'pending'
    ),
    'my_pending_appeals', (
      select count(*) from public.appeals a
      where a.user_id = p.id and a.status = 'pending'
    )
  )
  into v_profile
  from public.profiles p
  join public.majors m on m.code = p.major_code
  where p.id = v_uid;

  if v_profile is null then
    return public.api_error('PROFILE_NOT_FOUND', '用户资料不存在，请联系管理员');
  end if;

  return public.api_ok(v_profile);
end;
$$;

create or replace function public.update_profile(
  p_full_name text,
  p_enrollment_year integer,
  p_major_code text,
  p_captcha_ticket uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_full_name, ''));
  v_major text := trim(coalesce(p_major_code, ''));
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  if not public.consume_captcha_ticket(p_captcha_ticket, 'profile_update', v_uid) then
    return public.api_error('CAPTCHA_REQUIRED', '请先完成人机验证');
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 50 then
    return public.api_error('INVALID_NAME', '姓名需为 2-50 个字符');
  end if;
  if v_name ~ '[[:cntrl:]]' then
    return public.api_error('INVALID_NAME', '姓名包含非法字符');
  end if;
  if p_enrollment_year is null or p_enrollment_year < 2000 or p_enrollment_year > 2100 then
    return public.api_error('INVALID_YEAR', '入学年份不合法');
  end if;
  if not exists (select 1 from public.majors m where m.code = v_major) then
    return public.api_error('INVALID_MAJOR', '专业不合法');
  end if;

  update public.profiles
  set full_name = v_name,
      enrollment_year = p_enrollment_year,
      major_code = v_major
  where id = v_uid;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid,
    'update_profile',
    'profile',
    v_uid,
    jsonb_build_object('full_name', v_name, 'enrollment_year', p_enrollment_year, 'major_code', v_major)
  );

  return public.get_my_profile();
end;
$$;

-- 修改密码流程：
--   1) 客户端用旧密码 signInWithPassword 验证；
--   2) 客户端 updateUser({ password: 新 authHash })；
--   3) 客户端调用本函数写入新盐。
-- 本函数只负责保存盐，不接触明文密码。
create or replace function public.set_password_salt(
  p_new_salt text,
  p_captcha_ticket uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_salt text := lower(trim(coalesce(p_new_salt, '')));
  v_rows integer;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  if not public.consume_captcha_ticket(p_captcha_ticket, 'change_password', v_uid) then
    return public.api_error('CAPTCHA_REQUIRED', '请先完成人机验证');
  end if;

  if v_salt !~ '^[0-9a-f]{32,64}$' then
    return public.api_error('INVALID_SALT', '密码盐格式不合法');
  end if;

  update public.auth_secrets
  set password_salt = v_salt, updated_at = now()
  where user_id = v_uid;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return public.api_error('PROFILE_NOT_FOUND', '用户资料不存在');
  end if;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (v_uid, 'change_password_salt', 'auth_secret', v_uid, '{}'::jsonb);

  return public.api_ok(jsonb_build_object('updated', true));
end;
$$;

create or replace function public.verify_my_password(p_password_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text := lower(trim(coalesce(p_password_hash, '')));
  v_encrypted text;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    return public.api_error('INVALID_PASSWORD', '密码格式不正确');
  end if;

  select u.encrypted_password into v_encrypted
  from auth.users u
  where u.id = v_uid;

  if v_encrypted is null then
    return public.api_error('PROFILE_NOT_FOUND', '用户资料不存在');
  end if;
  if extensions.crypt(v_hash, v_encrypted) <> v_encrypted then
    return public.api_error('INVALID_PASSWORD', '旧密码不正确');
  end if;

  return public.api_ok(jsonb_build_object('valid', true));
end;
$$;

-- 注销账号：必须同时输入完整学号 + “注销账号”四个字
-- 会删除 auth.users 行，级联删除 profiles / classes / class_members /
-- checkin_events / checkin_records / appeals / secrets / captcha tickets。
create or replace function public.delete_my_account(
  p_student_id text,
  p_confirm_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_student_id text;
  v_confirm text := trim(coalesce(p_confirm_text, ''));
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  if v_confirm <> '注销账号' then
    return public.api_error('CONFIRM_REQUIRED', '请输入“注销账号”四个字以确认');
  end if;

  select p.student_id into v_student_id
  from public.profiles p
  where p.id = v_uid;

  if v_student_id is null then
    return public.api_error('PROFILE_NOT_FOUND', '用户资料不存在');
  end if;

  if trim(coalesce(p_student_id, '')) <> v_student_id then
    return public.api_error('STUDENT_ID_MISMATCH', '学号不匹配，请输入完整学号');
  end if;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid,
    'delete_account',
    'profile',
    v_uid,
    jsonb_build_object('student_id', v_student_id)
  );

  delete from auth.users where id = v_uid;

  return public.api_ok(jsonb_build_object('deleted', true));
end;
$$;

-- ============================================================
-- C. 班级
-- ============================================================
create or replace function public.create_class(
  p_name text,
  p_validity_seconds integer,
  p_captcha_ticket uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_class_id uuid;
  v_code text;
  v_expires timestamptz;
  v_i integer;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  if not public.consume_captcha_ticket(p_captcha_ticket, 'create_class', v_uid) then
    return public.api_error('CAPTCHA_REQUIRED', '请先完成人机验证');
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    return public.api_error('INVALID_NAME', '班级名称需为 1-50 个字符');
  end if;
  if p_validity_seconds is null or p_validity_seconds < 3600 or p_validity_seconds > 31536000 then
    return public.api_error('INVALID_VALIDITY', '邀请码有效期需在 1 小时到 365 天之间');
  end if;

  loop
    v_code := '';
    for v_i in 1..8 loop
      v_code := v_code || substr(
        v_alphabet,
        1 + (get_byte(gen_random_bytes(1), 0) % length(v_alphabet)),
        1
      );
    end loop;
    exit when not exists (select 1 from public.class_invites ci where ci.code = v_code);
  end loop;

  insert into public.classes(name, owner_id)
  values (v_name, v_uid)
  returning id into v_class_id;

  insert into public.class_invites(class_id, code, expires_at)
  values (v_class_id, v_code, now() + make_interval(secs => p_validity_seconds))
  returning expires_at into v_expires;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'create_class', 'class', v_class_id,
    jsonb_build_object('name', v_name, 'invite_code', v_code)
  );

  return public.api_ok(jsonb_build_object(
    'class_id', v_class_id,
    'name', v_name,
    'invite_code', v_code,
    'invite_expires_at', v_expires
  ));
end;
$$;

create or replace function public.join_class(
  p_code text,
  p_captcha_ticket uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_class_id uuid;
  v_expires timestamptz;
  v_class_name text;
  v_owner_id uuid;
  v_owner_name text;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  if not public.consume_captcha_ticket(p_captcha_ticket, 'join_class', v_uid) then
    return public.api_error('CAPTCHA_REQUIRED', '请先完成人机验证');
  end if;

  if v_code !~ '^[A-Z2-9]{8}$' then
    return public.api_error('INVALID_CODE', '邀请码格式不正确');
  end if;

  select ci.class_id, ci.expires_at, c.name, c.owner_id
  into v_class_id, v_expires, v_class_name, v_owner_id
  from public.class_invites ci
  join public.classes c on c.id = ci.class_id
  where ci.code = v_code
  for update of ci;

  if v_class_id is null then
    return public.api_error('INVALID_CODE', '邀请码不存在');
  end if;
  if v_expires <= now() then
    return public.api_error('INVITE_EXPIRED', '邀请码已过期，请联系班级创建者');
  end if;
  if exists (
    select 1 from public.class_members m
    where m.class_id = v_class_id and m.user_id = v_uid
  ) then
    return public.api_error('ALREADY_MEMBER', '你已经在该班级中，无需重复加入');
  end if;

  begin
    insert into public.class_members(class_id, user_id, role)
    values (v_class_id, v_uid, 'member');
  exception when unique_violation then
    return public.api_error('ALREADY_MEMBER', '你已经在该班级中，无需重复加入');
  end;

  -- 只为“未来未开始”的活动补参与记录；已开始/已结束不追溯
  insert into public.checkin_records(event_id, user_id, status)
  select e.id, v_uid, 'absent'
  from public.checkin_events e
  where e.class_id = v_class_id and e.start_at > now()
  on conflict (event_id, user_id) do nothing;

  select full_name into v_owner_name
  from public.profiles where id = v_owner_id;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'join_class', 'class', v_class_id,
    jsonb_build_object('invite_code', v_code, 'owner_id', v_owner_id)
  );

  return public.api_ok(jsonb_build_object(
    'class_id', v_class_id,
    'name', v_class_name,
    'owner_id', v_owner_id,
    'owner_name', v_owner_name
  ));
end;
$$;

create or replace function public.list_my_classes(p_role text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(coalesce(p_role, 'all'));
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if v_role not in ('all', 'owner', 'member') then
    return public.api_error('INVALID_ROLE', '查询角色不合法');
  end if;

  with mine as (
    select c.id, c.name, c.owner_id, c.created_at, cm.role as my_role
    from public.classes c
    join public.class_members cm on cm.class_id = c.id
    where cm.user_id = v_uid
      and (v_role = 'all' or cm.role = v_role)
  ),
  agg as (
    select m.id,
      (select count(*) from public.class_members x where x.class_id = m.id) as member_count,
      (select count(*) from public.checkin_events e
       where e.class_id = m.id and e.start_at > now()) as upcoming_count,
      (select count(*) from public.checkin_events e
       where e.class_id = m.id and e.end_at < now()) as ended_count
    from mine m
  )
  select public.api_ok(jsonb_build_object(
    'items',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'owner_id', m.owner_id,
        'owner_name', op.full_name,
        'my_role', m.my_role,
        'member_count', a.member_count,
        'upcoming_count', a.upcoming_count,
        'ended_count', a.ended_count,
        'created_at', m.created_at,
        'invite_code', case when m.my_role = 'owner' then ci.code else null end,
        'invite_expires_at', case when m.my_role = 'owner' then ci.expires_at else null end
      )
      order by m.created_at desc
    ), '[]'::jsonb)
  ))
  into v_result
  from mine m
  join agg a on a.id = m.id
  join public.profiles op on op.id = m.owner_id
  left join public.class_invites ci on ci.class_id = m.id;

  return v_result;
end;
$$;

create or replace function public.get_class_detail(p_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_class public.classes%rowtype;
  v_my_role text;
  v_owner_name text;
  v_member_count bigint;
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  select * into v_class from public.classes where id = p_class_id;
  if v_class.id is null then
    return public.api_error('NOT_FOUND', '班级不存在');
  end if;
  if not public.is_class_member(p_class_id, v_uid) and v_class.owner_id <> v_uid then
    return public.api_error('FORBIDDEN', '你不是该班级成员');
  end if;

  select m.role into v_my_role
  from public.class_members m
  where m.class_id = p_class_id and m.user_id = v_uid;

  v_my_role := coalesce(v_my_role, case when v_class.owner_id = v_uid then 'owner' else 'member' end);

  select full_name into v_owner_name
  from public.profiles where id = v_class.owner_id;

  select count(*) into v_member_count
  from public.class_members where class_id = p_class_id;

  select public.api_ok(jsonb_build_object(
    'id', v_class.id,
    'name', v_class.name,
    'owner_id', v_class.owner_id,
    'owner_name', v_owner_name,
    'my_role', coalesce(v_my_role, case when v_class.owner_id = v_uid then 'owner' else 'member' end),
    'member_count', v_member_count,
    'created_at', v_class.created_at,
    'invite_code', case when v_my_role = 'owner' then (
      select ci.code from public.class_invites ci where ci.class_id = p_class_id
    ) else null end,
    'invite_expires_at', case when v_my_role = 'owner' then (
      select ci.expires_at from public.class_invites ci where ci.class_id = p_class_id
    ) else null end,
    'members', case when v_my_role = 'owner' then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'student_id', p.student_id,
        'full_name', p.full_name,
        'enrollment_year', p.enrollment_year,
        'major_name', mj.name,
        'role', m.role,
        'joined_at', m.joined_at
      ) order by m.joined_at), '[]'::jsonb)
      from public.class_members m
      join public.profiles p on p.id = m.user_id
      join public.majors mj on mj.code = p.major_code
      where m.class_id = p_class_id
    ) else null end
  )) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_class_attendance(p_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.is_class_owner(p_class_id, v_uid) then
    return public.api_error('FORBIDDEN', '只有班级创建者可以查看全班出勤');
  end if;

  with member_rows as (
    select cm.user_id, cm.role, cm.joined_at,
           p.student_id, p.full_name, p.enrollment_year, mj.name as major_name
    from public.class_members cm
    join public.profiles p on p.id = cm.user_id
    join public.majors mj on mj.code = p.major_code
    where cm.class_id = p_class_id and cm.role = 'member'
  ),
  stats as (
    select r.user_id,
           count(*) as total,
           count(*) filter (where r.status = 'present' and r.method in ('code','qr')) as present,
           count(*) filter (where r.method = 'makeup') as makeup,
           count(*) filter (where r.status = 'absent') as absent
    from public.checkin_records r
    join public.checkin_events e on e.id = r.event_id
    where e.class_id = p_class_id and e.end_at < now()
    group by r.user_id
  )
  select public.api_ok(jsonb_build_object(
    'items',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'student_id', m.student_id,
        'full_name', m.full_name,
        'enrollment_year', m.enrollment_year,
        'major_name', m.major_name,
        'role', m.role,
        'joined_at', m.joined_at,
        'total', coalesce(s.total, 0),
        'present', coalesce(s.present, 0),
        'makeup', coalesce(s.makeup, 0),
        'absent', coalesce(s.absent, 0),
        'attendance_rate', case
          when coalesce(s.total, 0) = 0 then 0
          else round((coalesce(s.present, 0) + coalesce(s.makeup, 0))::numeric / s.total, 4)
        end
      )
      order by m.student_id
    ), '[]'::jsonb)
  )) into v_result
  from member_rows m
  left join stats s on s.user_id = m.user_id;

  return v_result;
end;
$$;

create or replace function public.get_class_member_attendance(
  p_class_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.is_class_owner(p_class_id, v_uid) then
    return public.api_error('FORBIDDEN', '只有班级创建者可以查看成员出勤');
  end if;
  if not exists (
    select 1 from public.class_members m
    where m.class_id = p_class_id and m.user_id = p_user_id
  ) then
    return public.api_error('NOT_MEMBER', '该用户不在班级中');
  end if;

  select public.api_ok(jsonb_build_object(
    'member', (
      select jsonb_build_object(
        'user_id', p.id,
        'student_id', p.student_id,
        'full_name', p.full_name,
        'enrollment_year', p.enrollment_year,
        'major_name', mj.name
      )
      from public.profiles p
      join public.majors mj on mj.code = p.major_code
      where p.id = p_user_id
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'event_id', e.id,
        'title', e.title,
        'start_at', e.start_at,
        'end_at', e.end_at,
        'timezone', e.timezone,
        'status', r.status,
        'method', r.method,
        'is_late_slice', r.is_late_slice,
        'checked_in_at', r.checked_in_at,
        'appeal_status', (
          select a.status from public.appeals a
          where a.record_id = r.id
          order by a.created_at desc limit 1
        )
      ) order by e.start_at desc), '[]'::jsonb)
      from public.checkin_events e
      join public.checkin_records r on r.event_id = e.id and r.user_id = p_user_id
      where e.class_id = p_class_id and e.end_at < now()
    )
  )) into v_result;

  return v_result;
end;
$$;

-- 踢人：只允许 owner 踢普通成员；保留历史记录，删除未来活动的参与记录
create or replace function public.kick_class_member(
  p_class_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_target_name text;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.is_class_owner(p_class_id, v_uid) then
    return public.api_error('FORBIDDEN', '只有班级创建者可以移除成员');
  end if;
  if p_user_id = v_uid then
    return public.api_error('CANNOT_KICK_OWNER', '不能移除班级创建者');
  end if;
  if not exists (
    select 1 from public.class_members m
    where m.class_id = p_class_id and m.user_id = p_user_id and m.role = 'member'
  ) then
    return public.api_error('NOT_MEMBER', '该用户不是班级普通成员');
  end if;

  select full_name into v_target_name from public.profiles where id = p_user_id;

  delete from public.checkin_records r
  using public.checkin_events e
  where r.event_id = e.id
    and r.user_id = p_user_id
    and e.class_id = p_class_id
    and e.start_at > now();

  delete from public.class_members m
  where m.class_id = p_class_id and m.user_id = p_user_id and m.role = 'member';

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'kick_class_member', 'class', p_class_id,
    jsonb_build_object('target_user_id', p_user_id, 'target_name', v_target_name)
  );

  return public.api_ok(jsonb_build_object('removed_user_id', p_user_id));
end;
$$;

create or replace function public.delete_class(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.is_class_owner(p_class_id, v_uid) then
    return public.api_error('FORBIDDEN', '只有班级创建者可以删除班级');
  end if;

  select name into v_name from public.classes where id = p_class_id;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'delete_class', 'class', p_class_id,
    jsonb_build_object('name', v_name)
  );

  delete from public.classes where id = p_class_id;

  return public.api_ok(jsonb_build_object('deleted', true));
end;
$$;

create or replace function public.leave_class(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  select m.role into v_role
  from public.class_members m
  where m.class_id = p_class_id and m.user_id = v_uid;

  if v_role is null then
    return public.api_error('NOT_MEMBER', '你不在该班级中');
  end if;
  if v_role = 'owner' then
    return public.api_error('OWNER_CANNOT_LEAVE', '班级创建者不能退出，请删除班级');
  end if;

  delete from public.checkin_records r
  using public.checkin_events e
  where r.event_id = e.id
    and r.user_id = v_uid
    and e.class_id = p_class_id
    and e.start_at > now();

  delete from public.class_members m
  where m.class_id = p_class_id and m.user_id = v_uid;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (v_uid, 'leave_class', 'class', p_class_id, '{}'::jsonb);

  return public.api_ok(jsonb_build_object('left', true));
end;
$$;

-- ============================================================
-- D. 签到活动
-- ============================================================
create or replace function public.create_checkin_event(
  p_class_id uuid,
  p_title text,
  p_description text,
  p_timezone text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_location_name text default null,
  p_location_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_coord_system text default 'gcj02',
  p_is_surprise boolean default false,
  p_require_location boolean default false,
  p_require_device boolean default false,
  p_method text default 'both'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_description text := trim(coalesce(p_description, ''));
  v_timezone text := trim(coalesce(p_timezone, ''));
  v_method text := lower(coalesce(p_method, 'both'));
  v_coord_system text := lower(coalesce(p_coord_system, 'gcj02'));
  v_event_id uuid;
  v_location_name text := nullif(trim(coalesce(p_location_name, '')), '');
  v_location_address text := nullif(trim(coalesce(p_location_address, '')), '');
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.is_class_owner(p_class_id, v_uid) then
    return public.api_error('FORBIDDEN', '只能给自己创建的班级发布签到');
  end if;

  if char_length(v_title) < 2 or char_length(v_title) > 60 then
    return public.api_error('INVALID_TITLE', '活动名称需为 2-60 个字符');
  end if;
  if char_length(v_description) < 2 or char_length(v_description) > 1000 then
    return public.api_error('INVALID_DESCRIPTION', '文字说明需为 2-1000 个字符');
  end if;
  if v_timezone = '' or not exists (
    select 1 from pg_timezone_names t where t.name = v_timezone
  ) then
    return public.api_error('INVALID_TIMEZONE', '时区不合法');
  end if;
  if p_start_at is null or p_end_at is null then
    return public.api_error('INVALID_TIME', '开始/结束时间不能为空');
  end if;
  if p_start_at < now() - interval '5 minutes' then
    return public.api_error('START_IN_PAST', '开始时间不能早于当前时间');
  end if;
  if p_end_at <= p_start_at then
    return public.api_error('INVALID_TIME', '结束时间必须晚于开始时间');
  end if;
  if p_end_at > p_start_at + interval '7 days' then
    return public.api_error('INVALID_TIME', '单次签到最长 7 天');
  end if;
  if v_method not in ('code', 'qr', 'both') then
    return public.api_error('INVALID_METHOD', '签到方式不合法');
  end if;
  if v_coord_system not in ('gcj02', 'wgs84') then
    return public.api_error('INVALID_COORD_SYSTEM', '坐标系统不合法');
  end if;
  if p_require_location and (p_lat is null or p_lng is null) then
    return public.api_error('LOCATION_REQUIRED', '启用位置校验时必须选择签到地点');
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then
    return public.api_error('INVALID_LOCATION', '纬度不合法');
  end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then
    return public.api_error('INVALID_LOCATION', '经度不合法');
  end if;

  insert into public.checkin_events(
    class_id, creator_id, title, description, timezone, start_at, end_at,
    location_name, location_address, location_lat, location_lng, coord_system,
    geofence_radius_m, is_surprise, require_location, require_device,
    method, slice_seconds, allow_previous_slice
  )
  values (
    p_class_id, v_uid, v_title, v_description, v_timezone, p_start_at, p_end_at,
    v_location_name, v_location_address, p_lat, p_lng, v_coord_system,
    1000, coalesce(p_is_surprise, false), coalesce(p_require_location, false),
    coalesce(p_require_device, false), v_method, 30, true
  )
  returning id into v_event_id;

  insert into public.checkin_secrets(event_id, secret)
  values (v_event_id, encode(gen_random_bytes(32), 'hex'));

  insert into public.checkin_records(event_id, user_id, status)
  select v_event_id, m.user_id, 'absent'
  from public.class_members m
  where m.class_id = p_class_id
    and m.user_id <> v_uid
  on conflict (event_id, user_id) do nothing;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'create_checkin_event', 'checkin_event', v_event_id,
    jsonb_build_object(
      'class_id', p_class_id,
      'title', v_title,
      'is_surprise', coalesce(p_is_surprise, false),
      'method', v_method
    )
  );

  return public.api_ok(jsonb_build_object('event_id', v_event_id));
end;
$$;

create or replace function public.create_checkin_event_local(
  p_class_id uuid,
  p_title text,
  p_description text,
  p_timezone text,
  p_start_local text,
  p_end_local text,
  p_location_name text default null,
  p_location_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_coord_system text default 'gcj02',
  p_is_surprise boolean default false,
  p_require_location boolean default false,
  p_require_device boolean default false,
  p_method text default 'both'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_timezone text := trim(coalesce(p_timezone, ''));
  v_start_text text := trim(coalesce(p_start_local, ''));
  v_end_text text := trim(coalesce(p_end_local, ''));
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if v_timezone = '' or not exists (
    select 1 from pg_timezone_names t where t.name = v_timezone
  ) then
    return public.api_error('INVALID_TIMEZONE', '时区不合法');
  end if;
  if v_start_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$'
     or v_end_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?$' then
    return public.api_error('INVALID_TIME', '开始/结束时间格式不正确');
  end if;

  begin
    v_start := v_start_text::timestamp at time zone v_timezone;
    v_end := v_end_text::timestamp at time zone v_timezone;
  exception when others then
    return public.api_error('INVALID_TIME', '开始/结束时间不合法');
  end;

  v_result := public.create_checkin_event(
    p_class_id, p_title, p_description, v_timezone, v_start, v_end,
    p_location_name, p_location_address, p_lat, p_lng, p_coord_system,
    p_is_surprise, p_require_location, p_require_device, p_method
  );

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

  return public.api_ok(jsonb_build_object(
    'event_id', v_result->'data'->>'event_id',
    'start_at', v_start,
    'end_at', v_end
  ));
end;
$$;

create or replace function public.list_checkin_events(
  p_scope text,
  p_status text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, ''));
  v_status text := lower(coalesce(p_status, 'all'));
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if v_scope not in ('active', 'upcoming', 'ended', 'participated', 'created') then
    return public.api_error('INVALID_SCOPE', '查询范围不合法');
  end if;
  if v_status not in ('all', 'present', 'absent') then
    return public.api_error('INVALID_STATUS', '筛选状态不合法');
  end if;

  with base as (
    select e.*, c.name as class_name,
           case when e.creator_id = v_uid then null else r.status end as my_status,
           r.method as my_method,
           r.is_late_slice as my_is_late_slice,
           r.checked_in_at as my_checked_in_at,
           (
             select a.status from public.appeals a
             where a.record_id = r.id
             order by a.created_at desc limit 1
           ) as my_appeal_status,
           (
             select count(*) from public.appeals a where a.record_id = r.id
           ) as my_appeal_count,
           (
             select count(*) from public.checkin_records x
             where x.event_id = e.id and x.user_id <> e.creator_id
               and x.status = 'present' and x.method in ('code','qr')
           ) as present_count,
           (
             select count(*) from public.checkin_records x
             where x.event_id = e.id and x.user_id <> e.creator_id
               and x.method = 'makeup'
           ) as makeup_count,
           (
             select count(*) from public.checkin_records x
             where x.event_id = e.id and x.user_id <> e.creator_id
               and x.status = 'absent'
           ) as absent_count,
           case
             when now() < e.start_at then 'upcoming'
             when now() <= e.end_at then 'active'
             else 'ended'
           end as status
    from public.checkin_events e
    join public.classes c on c.id = e.class_id
    left join public.checkin_records r
      on r.event_id = e.id and r.user_id = v_uid
    where (
      (v_scope = 'created' and e.creator_id = v_uid)
      or (v_scope = 'participated' and r.user_id is not null)
      or (
        v_scope = 'active'
        and e.start_at <= now() and e.end_at >= now()
        and (r.user_id is not null or e.creator_id = v_uid)
        and (not e.is_surprise or now() >= e.start_at or e.creator_id = v_uid)
      )
      or (
        v_scope = 'upcoming'
        and e.start_at > now() and not e.is_surprise
        and (r.user_id is not null or e.creator_id = v_uid)
      )
      or (
        v_scope = 'ended'
        and e.end_at < now()
        and (r.user_id is not null or e.creator_id = v_uid)
      )
    )
    and (
      v_scope <> 'ended'
      or v_status = 'all'
      or (v_status = 'present' and e.creator_id <> v_uid and r.status = 'present')
      or (v_status = 'absent' and e.creator_id <> v_uid and r.status = 'absent')
    )
  )
  select public.api_ok(jsonb_build_object(
    'items',
    coalesce(jsonb_agg(
      to_jsonb(b)
      order by
        case when v_scope = 'upcoming' then b.start_at end asc,
        case when v_scope = 'active' then b.end_at end asc,
        b.start_at desc
    ), '[]'::jsonb)
  ))
  into v_result
  from base b;

  return v_result;
end;
$$;

create or replace function public.get_home_checkins()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_active jsonb;
  v_upcoming jsonb;
  v_ended jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  select public.list_checkin_events('active', 'all') into v_active;
  select public.list_checkin_events('upcoming', 'all') into v_upcoming;
  select public.list_checkin_events('ended', 'all') into v_ended;

  return public.api_ok(jsonb_build_object(
    'active', coalesce(v_active->'data'->'items', '[]'::jsonb),
    'upcoming', coalesce(v_upcoming->'data'->'items', '[]'::jsonb),
    'ended', coalesce(v_ended->'data'->'items', '[]'::jsonb)
  ));
end;
$$;

create or replace function public.get_checkin_event(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.can_view_event(p_event_id, v_uid) then
    return public.api_error('FORBIDDEN', '活动不存在或暂不可见');
  end if;

  select public.api_ok(jsonb_build_object(
    'event', (
      select to_jsonb(e) || jsonb_build_object('class_name', c.name)
      from public.checkin_events e
      join public.classes c on c.id = e.class_id
      where e.id = p_event_id
    ),
    'my_record', (
      select to_jsonb(r)
      from public.checkin_records r
      where r.event_id = p_event_id and r.user_id = v_uid
    ),
    'my_appeal_status', (
      select a.status from public.appeals a
      where a.record_id = (
        select r.id from public.checkin_records r
        where r.event_id = p_event_id and r.user_id = v_uid
      )
      order by a.created_at desc limit 1
    ),
    'my_appeals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'attempt_no', a.attempt_no,
        'reason', a.reason,
        'created_at', a.created_at,
        'review_note', a.review_note,
        'reviewed_at', a.reviewed_at
      ) order by a.attempt_no), '[]'::jsonb)
      from public.appeals a
      where a.record_id = (
        select r.id from public.checkin_records r
        where r.event_id = p_event_id and r.user_id = v_uid
      )
    ),
    'can_manage', public.is_event_creator(p_event_id, v_uid),
    'server_now', now(),
    'code_data', case
      when public.is_event_creator(p_event_id, v_uid)
      then public.get_checkin_code(p_event_id)
      else null
    end,
    'counts', (
      select jsonb_build_object(
        'total', count(*),
        'present', count(*) filter (where r.status = 'present' and r.method in ('code','qr')),
        'makeup', count(*) filter (where r.method = 'makeup'),
        'absent', count(*) filter (where r.status = 'absent')
      )
      from public.checkin_records r
      join public.checkin_events e on e.id = r.event_id
      where r.event_id = p_event_id and r.user_id <> e.creator_id
    )
  )) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_checkin_code(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_end timestamptz;
  v_slice_seconds integer;
  v_now timestamptz := now();
  v_slice bigint;
  v_code text;
  v_expires timestamptz;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.is_event_creator(p_event_id, v_uid) then
    return public.api_error('FORBIDDEN', '只有活动创建者可以查看签到码');
  end if;

  select e.start_at, e.end_at, e.slice_seconds
  into v_start, v_end, v_slice_seconds
  from public.checkin_events e
  where e.id = p_event_id;

  if v_start is null then
    return public.api_error('NOT_FOUND', '活动不存在');
  end if;
  if v_now < v_start - interval '5 minutes' then
    return public.api_error('NOT_STARTED', '签到还未开始');
  end if;
  if v_now > v_end then
    return public.api_error('ENDED', '签到已结束');
  end if;

  v_slice := floor(extract(epoch from v_now) / v_slice_seconds)::bigint;
  v_code := public.derive_checkin_code(p_event_id, v_slice);

  if v_code is null then
    return public.api_error('INTERNAL_ERROR', '签到密钥不存在');
  end if;

  v_expires := to_timestamp((v_slice + 1) * v_slice_seconds);

  return public.api_ok(jsonb_build_object(
    'code', v_code,
    'slice_index', v_slice,
    'expires_at', v_expires,
    'seconds_left', greatest(0, floor(extract(epoch from (v_expires - v_now)))::integer),
    'server_now', v_now,
    'slice_seconds', v_slice_seconds
  ));
end;
$$;

create or replace function public.consume_checkin_ticket(p_captcha_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.consume_captcha_ticket(p_captcha_ticket, 'create_checkin', v_uid) then
    return public.api_error('CAPTCHA_REQUIRED', '请先完成人机验证');
  end if;
  return public.api_ok(jsonb_build_object('verified', true));
end;
$$;

create or replace function public.create_checkin_event_verified(
  p_captcha_ticket uuid,
  p_class_id uuid,
  p_title text,
  p_description text,
  p_timezone text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_location_name text default null,
  p_location_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_coord_system text default 'gcj02',
  p_is_surprise boolean default false,
  p_require_location boolean default false,
  p_require_device boolean default false,
  p_method text default 'both'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_event_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.consume_captcha_ticket(p_captcha_ticket, 'create_checkin', v_uid) then
    return public.api_error('CAPTCHA_REQUIRED', '请先完成人机验证');
  end if;

  v_result := public.create_checkin_event(
    p_class_id, p_title, p_description, p_timezone, p_start_at, p_end_at,
    p_location_name, p_location_address, p_lat, p_lng, p_coord_system,
    p_is_surprise, p_require_location, p_require_device, p_method
  );

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

  v_event_id := (v_result->'data'->>'event_id')::uuid;
  select start_at, end_at into v_start, v_end
  from public.checkin_events where id = v_event_id;

  return public.api_ok(jsonb_build_object(
    'event_id', v_event_id,
    'start_at', v_start,
    'end_at', v_end
  ));
end;
$$;

create or replace function public.create_checkin_event_local_verified(
  p_captcha_ticket uuid,
  p_class_id uuid,
  p_title text,
  p_description text,
  p_timezone text,
  p_start_local text,
  p_end_local text,
  p_location_name text default null,
  p_location_address text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_coord_system text default 'gcj02',
  p_is_surprise boolean default false,
  p_require_location boolean default false,
  p_require_device boolean default false,
  p_method text default 'both'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.consume_captcha_ticket(p_captcha_ticket, 'create_checkin', v_uid) then
    return public.api_error('CAPTCHA_REQUIRED', '请先完成人机验证');
  end if;

  v_result := public.create_checkin_event_local(
    p_class_id, p_title, p_description, p_timezone, p_start_local, p_end_local,
    p_location_name, p_location_address, p_lat, p_lng, p_coord_system,
    p_is_surprise, p_require_location, p_require_device, p_method
  );

  return v_result;
end;
$$;

create or replace function public.end_checkin_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_end timestamptz;
  v_title text;
  v_new_end timestamptz := now();
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.is_event_creator(p_event_id, v_uid) then
    return public.api_error('FORBIDDEN', '只有活动创建者可以结束签到');
  end if;

  select start_at, end_at, title into v_start, v_end, v_title
  from public.checkin_events
  where id = p_event_id
  for update;

  if v_start is null then
    return public.api_error('NOT_FOUND', '活动不存在');
  end if;
  if v_new_end <= v_start then
    return public.api_error('NOT_STARTED', '签到还未开始，不能提前结束');
  end if;
  if v_new_end >= v_end then
    return public.api_error('ALREADY_ENDED', '签到已经结束');
  end if;

  update public.checkin_events
  set end_at = v_new_end
  where id = p_event_id;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'end_checkin_event', 'checkin_event', p_event_id,
    jsonb_build_object('title', v_title, 'old_end_at', v_end, 'new_end_at', v_new_end)
  );

  return public.api_ok(jsonb_build_object(
    'event_id', p_event_id,
    'end_at', v_new_end,
    'status', 'ended'
  ));
end;
$$;

create or replace function public.set_event_participant_status(
  p_event_id uuid,
  p_user_id uuid,
  p_present boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_record_id uuid;
  v_record_status text;
  v_start timestamptz;
  v_end timestamptz;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_action text;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if p_present is null then
    return public.api_error('INVALID_STATUS', '签到状态不能为空');
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    return public.api_error('INVALID_NOTE', '备注不能超过 500 个字符');
  end if;
  if not public.is_event_creator(p_event_id, v_uid) then
    return public.api_error('FORBIDDEN', '只有活动创建者可以修改签到状态');
  end if;

  select r.id, r.status, e.start_at, e.end_at
  into v_record_id, v_record_status, v_start, v_end
  from public.checkin_records r
  join public.checkin_events e on e.id = r.event_id
  where r.event_id = p_event_id
    and r.user_id = p_user_id
    and r.user_id <> e.creator_id
  for update of r;

  if v_record_id is null then
    return public.api_error('NOT_FOUND', '该成员不在应签到名单中');
  end if;
  if now() < v_start then
    return public.api_error('NOT_STARTED', '签到还未开始，不能修改签到状态');
  end if;

  if p_present then
    update public.checkin_records
    set status = 'present',
        method = 'makeup',
        is_late_slice = false,
        slice_index = null,
        code_hash = null,
        checked_in_at = now(),
        device_id = null,
        device_label = null,
        latitude = null,
        longitude = null,
        distance_m = null
    where id = v_record_id;
    v_action := 'manual_set_present';
    v_record_status := 'present';
  else
    update public.checkin_records
    set status = 'absent',
        method = null,
        is_late_slice = false,
        slice_index = null,
        code_hash = null,
        checked_in_at = null,
        device_id = null,
        device_label = null,
        latitude = null,
        longitude = null,
        distance_m = null
    where id = v_record_id;
    v_action := 'manual_set_absent';
    v_record_status := 'absent';
  end if;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, v_action, 'checkin_record', v_record_id,
    jsonb_build_object(
      'event_id', p_event_id,
      'user_id', p_user_id,
      'present', p_present,
      'note', v_note
    )
  );

  return public.api_ok(jsonb_build_object(
    'record_id', v_record_id,
    'user_id', p_user_id,
    'status', v_record_status,
    'method', case when p_present then 'makeup' else null end
  ));
end;
$$;

create or replace function public.delete_checkin_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_title text;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.is_event_creator(p_event_id, v_uid) then
    return public.api_error('FORBIDDEN', '只有活动创建者可以删除签到');
  end if;

  select start_at, title into v_start, v_title
  from public.checkin_events where id = p_event_id;

  if v_start is null then
    return public.api_error('NOT_FOUND', '活动不存在');
  end if;
  if v_start <= now() then
    return public.api_error('EVENT_ALREADY_STARTED', '已开始的签到不能删除');
  end if;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'delete_checkin_event', 'checkin_event', p_event_id,
    jsonb_build_object('title', v_title)
  );

  delete from public.checkin_events where id = p_event_id;

  return public.api_ok(jsonb_build_object('deleted', true));
end;
$$;

-- ============================================================
-- E. 签到提交
-- ============================================================
create or replace function public.submit_checkin(
  p_event_id uuid,
  p_code_hash text,
  p_method text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_device_id text default null,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text := lower(trim(coalesce(p_code_hash, '')));
  v_method text := lower(coalesce(p_method, ''));
  v_record_id uuid;
  v_record_status text;
  v_bound_device text;
  v_start timestamptz;
  v_end timestamptz;
  v_require_device boolean;
  v_require_location boolean;
  v_event_lat double precision;
  v_event_lng double precision;
  v_radius integer;
  v_event_method text;
  v_allow_prev boolean;
  v_slice_seconds integer;
  v_now timestamptz := clock_timestamp();
  v_fail_count bigint;
  v_slice bigint;
  v_code_current text;
  v_code_prev text;
  v_hash_current text;
  v_hash_prev text;
  v_late boolean := false;
  v_used_slice bigint;
  v_distance double precision;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if v_method not in ('code', 'qr') then
    return public.api_error('INVALID_METHOD', '签到方式不合法');
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    return public.api_error('INVALID_CODE', '签到码格式不正确');
  end if;

  select r.id, r.status, r.device_id,
         e.start_at, e.end_at, e.require_device, e.require_location,
         e.location_lat, e.location_lng, e.geofence_radius_m,
         e.method, e.allow_previous_slice, e.slice_seconds
  into v_record_id, v_record_status, v_bound_device,
       v_start, v_end, v_require_device, v_require_location,
       v_event_lat, v_event_lng, v_radius,
       v_event_method, v_allow_prev, v_slice_seconds
  from public.checkin_records r
  join public.checkin_events e on e.id = r.event_id
  where r.event_id = p_event_id and r.user_id = v_uid
  for update of r;

  if v_record_id is null then
    return public.api_error('NOT_PARTICIPANT', '你不是该签到的参与成员');
  end if;
  if v_record_status = 'present' then
    return public.api_error('ALREADY_CHECKED_IN', '你已签到，无需重复提交');
  end if;
  if v_now < v_start then
    return public.api_error('NOT_STARTED', '签到还未开始');
  end if;
  if v_now > v_end then
    return public.api_error('ENDED', '签到已结束');
  end if;
  if v_event_method = 'code' and v_method <> 'code' then
    return public.api_error('METHOD_NOT_ALLOWED', '本场只允许输入六位数字签到');
  end if;
  if v_event_method = 'qr' and v_method <> 'qr' then
    return public.api_error('METHOD_NOT_ALLOWED', '本场只允许扫码签到');
  end if;

  if v_require_device then
    if p_device_id is null or length(trim(p_device_id)) = 0 then
      return public.api_error('DEVICE_REQUIRED', '本场签到要求绑定设备');
    end if;
    if v_bound_device is not null and v_bound_device <> trim(p_device_id) then
      return public.api_error('DEVICE_MISMATCH', '本场签到已绑定其他设备，不能换机签到');
    end if;
  end if;

  if v_require_location then
    if p_lat is null or p_lng is null then
      return public.api_error('LOCATION_REQUIRED', '本场签到要求获取设备位置');
    end if;
    v_distance := public.haversine_m(v_event_lat, v_event_lng, p_lat, p_lng);
    if v_distance > v_radius then
      return public.api_error(
        'OUT_OF_RANGE',
        format('你距离签到点约 %s 米，需在 %s 米内', round(v_distance), v_radius)
      );
    end if;
  end if;

  v_slice := floor(extract(epoch from v_now) / v_slice_seconds)::bigint;

  select count(*) into v_fail_count
  from public.checkin_attempts a
  where a.event_id = p_event_id
    and a.user_id = v_uid
    and a.slice_index = v_slice
    and a.success = false;

  if v_fail_count >= 5 then
    return public.api_error('TOO_MANY_ATTEMPTS', '尝试次数过多，请等待下一轮验证码');
  end if;

  v_code_current := public.derive_checkin_code(p_event_id, v_slice);
  v_code_prev := public.derive_checkin_code(p_event_id, v_slice - 1);

  if v_code_current is null then
    return public.api_error('INTERNAL_ERROR', '签到密钥不存在');
  end if;

  v_hash_current := public.checkin_code_hash(p_event_id, v_uid, v_code_current);
  v_hash_prev := case
    when v_code_prev is null then null
    else public.checkin_code_hash(p_event_id, v_uid, v_code_prev)
  end;

  if v_hash = v_hash_current then
    v_late := false;
    v_used_slice := v_slice;
  elsif v_allow_prev and v_hash_prev is not null and v_hash = v_hash_prev then
    v_late := true;
    v_used_slice := v_slice - 1;
  else
    insert into public.checkin_attempts(event_id, user_id, slice_index, success)
    values (p_event_id, v_uid, v_slice, false);
    return public.api_error('CODE_EXPIRED', '验证码错误或已过期，请重新输入');
  end if;

  update public.checkin_records
  set status = 'present',
      method = v_method,
      is_late_slice = v_late,
      slice_index = v_used_slice,
      code_hash = v_hash,
      checked_in_at = v_now,
      device_id = coalesce(device_id, nullif(trim(coalesce(p_device_id, '')), '')),
      device_label = coalesce(device_label, nullif(trim(coalesce(p_device_label, '')), '')),
      latitude = coalesce(p_lat, latitude),
      longitude = coalesce(p_lng, longitude),
      distance_m = v_distance
  where id = v_record_id;

  insert into public.checkin_attempts(event_id, user_id, slice_index, success)
  values (p_event_id, v_uid, v_slice, true);

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'submit_checkin', 'checkin_record', v_record_id,
    jsonb_build_object(
      'event_id', p_event_id,
      'method', v_method,
      'is_late_slice', v_late,
      'slice_index', v_used_slice,
      'distance_m', v_distance
    )
  );

  return public.api_ok(jsonb_build_object(
    'record_id', v_record_id,
    'status', 'present',
    'method', v_method,
    'is_late_slice', v_late,
    'lateslice', v_late,
    'checked_in_at', v_now,
    'distance_m', v_distance,
    'server_now', v_now
  ));
end;
$$;

-- ============================================================
-- F. 补签
-- ============================================================
create or replace function public.apply_makeup(
  p_record_id uuid,
  p_reason text,
  p_captcha_ticket uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := trim(coalesce(p_reason, ''));
  v_record_status text;
  v_event_id uuid;
  v_creator uuid;
  v_end timestamptz;
  v_count integer;
  v_pending boolean;
  v_approved boolean;
  v_appeal_id uuid;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.consume_captcha_ticket(p_captcha_ticket, 'appeal', v_uid) then
    return public.api_error('CAPTCHA_REQUIRED', '请先完成人机验证');
  end if;

  select r.status, r.event_id, e.creator_id, e.end_at
  into v_record_status, v_event_id, v_creator, v_end
  from public.checkin_records r
  join public.checkin_events e on e.id = r.event_id
  where r.id = p_record_id and r.user_id = v_uid
  for update of r;

  if v_record_status is null then
    return public.api_error('NOT_FOUND', '签到记录不存在');
  end if;
  if v_creator = v_uid then
    return public.api_error('CANNOT_APPEAL_OWN_EVENT', '不能给自己的活动申请补签');
  end if;
  if v_end > now() then
    return public.api_error('EVENT_NOT_ENDED', '签到还未结束，不能申请补签');
  end if;
  if v_record_status = 'present' then
    return public.api_error('ALREADY_PRESENT', '你已签到，无需补签');
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 500 then
    return public.api_error('INVALID_REASON', '申请理由需为 10-500 个字符');
  end if;

  select count(*),
         coalesce(bool_or(a.status = 'pending'), false),
         coalesce(bool_or(a.status = 'approved'), false)
  into v_count, v_pending, v_approved
  from public.appeals a
  where a.record_id = p_record_id;

  if v_pending then
    return public.api_error('PENDING_EXISTS', '已有待审批的补签申请');
  end if;
  if v_approved then
    return public.api_error('ALREADY_APPROVED', '补签已通过');
  end if;
  if v_count >= 3 then
    return public.api_error('LIMIT_REACHED', '补签机会已用完');
  end if;

  insert into public.appeals(record_id, event_id, user_id, attempt_no, reason)
  values (p_record_id, v_event_id, v_uid, v_count + 1, v_reason)
  returning id into v_appeal_id;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'apply_makeup', 'appeal', v_appeal_id,
    jsonb_build_object('record_id', p_record_id, 'attempt_no', v_count + 1)
  );

  return public.api_ok(jsonb_build_object(
    'appeal_id', v_appeal_id,
    'attempt_no', v_count + 1,
    'status', 'pending'
  ));
end;
$$;

create or replace function public.list_received_appeals(p_status text default 'pending')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(coalesce(p_status, 'pending'));
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if v_status not in ('all', 'pending', 'approved', 'rejected') then
    return public.api_error('INVALID_STATUS', '筛选状态不合法');
  end if;

  select public.api_ok(jsonb_build_object(
    'items',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'attempt_no', a.attempt_no,
        'reason', a.reason,
        'created_at', a.created_at,
        'event_id', e.id,
        'event_title', e.title,
        'event_start_at', e.start_at,
        'event_end_at', e.end_at,
        'event_timezone', e.timezone,
        'user_id', p.id,
        'student_id', p.student_id,
        'full_name', p.full_name,
        'record_status', r.status,
        'record_method', r.method
      )
      order by (a.status = 'pending') desc, a.created_at asc
    ), '[]'::jsonb)
  )) into v_result
  from public.appeals a
  join public.checkin_events e on e.id = a.event_id
  join public.profiles p on p.id = a.user_id
  join public.checkin_records r on r.id = a.record_id
  where e.creator_id = v_uid
    and (v_status = 'all' or a.status = v_status);

  return v_result;
end;
$$;

create or replace function public.list_my_appeals(p_status text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(coalesce(p_status, 'all'));
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if v_status not in ('all', 'pending', 'approved', 'rejected') then
    return public.api_error('INVALID_STATUS', '筛选状态不合法');
  end if;

  select public.api_ok(jsonb_build_object(
    'items',
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'attempt_no', a.attempt_no,
        'reason', a.reason,
        'created_at', a.created_at,
        'review_note', a.review_note,
        'reviewed_at', a.reviewed_at,
        'event_id', e.id,
        'event_title', e.title,
        'event_start_at', e.start_at,
        'event_end_at', e.end_at,
        'event_timezone', e.timezone,
        'class_name', c.name,
        'record_id', r.id,
        'record_status', r.status,
        'record_method', r.method
      )
      order by a.created_at desc
    ), '[]'::jsonb)
  )) into v_result
  from public.appeals a
  join public.checkin_events e on e.id = a.event_id
  join public.classes c on c.id = e.class_id
  join public.checkin_records r on r.id = a.record_id
  where a.user_id = v_uid
    and (v_status = 'all' or a.status = v_status);

  return v_result;
end;
$$;

create or replace function public.get_appeal_detail(p_appeal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  select public.api_ok(jsonb_build_object(
    'appeal', (
      select to_jsonb(a)
      from public.appeals a
      where a.id = p_appeal_id
    ),
    'event', (
      select to_jsonb(e) || jsonb_build_object('class_name', c.name)
      from public.appeals a
      join public.checkin_events e on e.id = a.event_id
      join public.classes c on c.id = e.class_id
      where a.id = p_appeal_id
    ),
    'applicant', (
      select jsonb_build_object(
        'user_id', p.id,
        'student_id', p.student_id,
        'full_name', p.full_name,
        'enrollment_year', p.enrollment_year,
        'major_name', mj.name
      )
      from public.appeals a
      join public.profiles p on p.id = a.user_id
      join public.majors mj on mj.code = p.major_code
      where a.id = p_appeal_id
    ),
    'record', (
      select to_jsonb(r)
      from public.appeals a
      join public.checkin_records r on r.id = a.record_id
      where a.id = p_appeal_id
    ),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'attempt_no', x.attempt_no,
        'status', x.status,
        'reason', x.reason,
        'created_at', x.created_at,
        'review_note', x.review_note,
        'reviewed_at', x.reviewed_at
      ) order by x.attempt_no), '[]'::jsonb)
      from public.appeals x
      where x.record_id = (
        select a.record_id from public.appeals a where a.id = p_appeal_id
      )
    )
  )) into v_result
  where exists (
    select 1
    from public.appeals a
    join public.checkin_events e on e.id = a.event_id
    where a.id = p_appeal_id
      and (a.user_id = v_uid or e.creator_id = v_uid)
  );

  if v_result is null then
    return public.api_error('FORBIDDEN', '无权查看该补签申请');
  end if;

  return v_result;
end;
$$;

create or replace function public.review_appeal(
  p_appeal_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_applicant uuid;
  v_record_id uuid;
  v_status text;
  v_creator uuid;
  v_record_status text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_total integer;
  v_rejected integer;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    return public.api_error('INVALID_NOTE', '审批备注不能超过 500 个字符');
  end if;

  select a.user_id, a.record_id, a.status, e.creator_id, r.status
  into v_applicant, v_record_id, v_status, v_creator, v_record_status
  from public.appeals a
  join public.checkin_events e on e.id = a.event_id
  join public.checkin_records r on r.id = a.record_id
  where a.id = p_appeal_id
  for update of a, r;

  if v_applicant is null then
    return public.api_error('NOT_FOUND', '补签申请不存在');
  end if;
  if v_creator <> v_uid then
    return public.api_error('FORBIDDEN', '只有活动创建者可以审批');
  end if;
  if v_applicant = v_uid then
    return public.api_error('CANNOT_REVIEW_SELF', '不能审批自己的补签申请');
  end if;
  if v_status <> 'pending' then
    return public.api_error('ALREADY_REVIEWED', '该申请已处理');
  end if;

  if p_approve then
    update public.appeals
    set status = 'approved',
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_note = v_note
    where id = p_appeal_id;

    update public.checkin_records
    set status = 'present',
        method = 'makeup',
        is_late_slice = false,
        slice_index = null,
        code_hash = null,
        checked_in_at = now(),
        device_id = null,
        device_label = null,
        latitude = null,
        longitude = null,
        distance_m = null
    where id = v_record_id;
  else
    update public.appeals
    set status = 'rejected',
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_note = v_note
    where id = p_appeal_id;
  end if;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid,
    case when p_approve then 'approve_appeal' else 'reject_appeal' end,
    'appeal',
    p_appeal_id,
    jsonb_build_object('record_id', v_record_id, 'approve', p_approve, 'note', v_note)
  );

  select count(*), count(*) filter (where a.status = 'rejected')
  into v_total, v_rejected
  from public.appeals a
  where a.record_id = v_record_id;

  return public.api_ok(jsonb_build_object(
    'appeal_id', p_appeal_id,
    'status', case when p_approve then 'approved' else 'rejected' end,
    'record_status', case when p_approve then 'present' else v_record_status end,
    'attempts_used', v_total,
    'attempts_remaining', greatest(0, 3 - v_total),
    'rejected_count', v_rejected
  ));
end;
$$;

create or replace function public.withdraw_appeal(p_appeal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_record_id uuid;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  delete from public.appeals
  where id = p_appeal_id and user_id = v_uid and status = 'pending'
  returning record_id into v_record_id;

  if v_record_id is null then
    return public.api_error('NOT_FOUND', '没有可撤回的待审批申请');
  end if;

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    v_uid, 'withdraw_appeal', 'appeal', p_appeal_id,
    jsonb_build_object('record_id', v_record_id)
  );

  return public.api_ok(jsonb_build_object('withdrawn', true));
end;
$$;

-- ============================================================
-- G. 结果 / 统计 / 首页
-- ============================================================
create or replace function public.get_event_results(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;
  if not public.is_event_creator(p_event_id, v_uid) then
    return public.api_error('FORBIDDEN', '只有活动创建者可以查看结果');
  end if;
  if not exists (select 1 from public.checkin_events e where e.id = p_event_id) then
    return public.api_error('NOT_FOUND', '活动不存在');
  end if;

  select public.api_ok(jsonb_build_object(
    'event', (
      select to_jsonb(e) || jsonb_build_object('class_name', c.name)
      from public.checkin_events e
      join public.classes c on c.id = e.class_id
      where e.id = p_event_id
    ),
    'counts', (
      select jsonb_build_object(
        'total', count(*),
        'present', count(*) filter (where r.status = 'present' and r.method in ('code','qr')),
        'makeup', count(*) filter (where r.method = 'makeup'),
        'absent', count(*) filter (where r.status = 'absent')
      )
      from public.checkin_records r
      join public.checkin_events e on e.id = r.event_id
      where r.event_id = p_event_id and r.user_id <> e.creator_id
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'record_id', r.id,
        'user_id', r.user_id,
        'student_id', p.student_id,
        'full_name', p.full_name,
        'enrollment_year', p.enrollment_year,
        'major_name', mj.name,
        'status', r.status,
        'method', r.method,
        'is_late_slice', r.is_late_slice,
        'checked_in_at', r.checked_in_at,
        'distance_m', r.distance_m,
        'device_label', r.device_label,
        'appeal_status', (
          select a.status from public.appeals a
          where a.record_id = r.id
          order by a.created_at desc limit 1
        ),
        'appeal_count', (
          select count(*) from public.appeals a where a.record_id = r.id
        )
      ) order by p.student_id), '[]'::jsonb)
      from public.checkin_records r
      join public.profiles p on p.id = r.user_id
      join public.majors mj on mj.code = p.major_code
      join public.checkin_events e on e.id = r.event_id
      where r.event_id = p_event_id and r.user_id <> e.creator_id
    )
  )) into v_result;

  if v_result is null then
    return public.api_error('NOT_FOUND', '活动不存在');
  end if;

  return v_result;
end;
$$;

create or replace function public.get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return public.api_error('UNAUTHENTICATED', '请先登录');
  end if;

  select public.api_ok(jsonb_build_object(
    'created_classes', (
      select count(*) from public.classes c where c.owner_id = v_uid
    ),
    'joined_classes', (
      select count(*) from public.class_members m
      where m.user_id = v_uid and m.role = 'member'
    ),
    'published_events', (
      select count(*) from public.checkin_events e where e.creator_id = v_uid
    ),
    'pending_received_appeals', (
      select count(*)
      from public.appeals a
      join public.checkin_events e on e.id = a.event_id
      where e.creator_id = v_uid and a.status = 'pending'
    ),
    'my_pending_appeals', (
      select count(*) from public.appeals a
      where a.user_id = v_uid and a.status = 'pending'
    )
  )) into v_result;

  return v_result;
end;
$$;
