-- ============================================================
-- 瓦莱希雅大学签到系统 · M1 / 01_schema.sql
-- 在 Supabase SQL Editor 中执行；不使用 migration 工具。
-- 执行顺序：01_schema.sql -> 02_functions.sql -> 03_rls_grants_seed.sql -> 04_verify.sql
-- 说明：
--   1) 所有时间列使用 timestamptz，数据库内部按 UTC 比较。
--   2) 所有业务写操作只允许通过 02_functions.sql 中的 SECURITY DEFINER RPC。
--   3) 本文件只负责“表 + 索引 + 触发器”，RLS/授权在 03 中。
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- 0. 专业字典
-- ============================================================
create table if not exists public.majors (
  code        text primary key check (code ~ '^[0-9]{2}$'),
  name        text not null unique,
  sort_order  integer not null default 0
);

comment on table public.majors is '专业字典；code 为两位数字，学号第 5-6 位使用该 code';

-- ============================================================
-- 1. 用户资料与密码盐
-- ============================================================
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  student_id       text not null unique check (student_id ~ '^[0-9]{12}$'),
  full_name        text not null check (char_length(full_name) between 2 and 50),
  enrollment_year  integer not null check (enrollment_year between 2000 and 2100),
  major_code       text not null references public.majors(code),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.profiles is '用户资料；id 与 auth.users.id 一致；学号 12 位：YYYY+专业2位+6位随机';
comment on column public.profiles.student_id is '登录账号；注册后不可修改';

create table if not exists public.auth_secrets (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  password_salt  text not null check (password_salt ~ '^[0-9a-f]{32,64}$'),
  updated_at     timestamptz not null default now()
);

comment on table public.auth_secrets is '客户端密码预哈希使用的随机盐；RLS 全拒绝，只允许 get_login_salt 读取';

-- ============================================================
-- 2. 班级 / 成员 / 邀请码
-- ============================================================
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 50),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists classes_owner_idx on public.classes(owner_id);

create table if not exists public.class_members (
  class_id   uuid not null references public.classes(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  joined_at  timestamptz not null default now(),
  primary key (class_id, user_id)
);

create index if not exists class_members_user_idx on public.class_members(user_id);

create table if not exists public.class_invites (
  class_id    uuid primary key references public.classes(id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z2-9]{8}$'),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

comment on table public.class_invites is '8 位邀请码；只有班级创建者能 SELECT，加入班级走 join_class RPC';

-- ============================================================
-- 3. 签到活动 / 动态码密钥
-- ============================================================
create table if not exists public.checkin_events (
  id                    uuid primary key default gen_random_uuid(),
  class_id              uuid not null references public.classes(id) on delete cascade,
  creator_id            uuid not null references public.profiles(id) on delete cascade,
  title                 text not null check (char_length(title) between 2 and 60),
  description           text not null default '' check (char_length(description) <= 1000),
  timezone              text not null,
  start_at              timestamptz not null,
  end_at                timestamptz not null,
  location_name         text,
  location_address      text,
  location_lat          double precision check (location_lat is null or location_lat between -90 and 90),
  location_lng          double precision check (location_lng is null or location_lng between -180 and 180),
  coord_system          text not null default 'gcj02' check (coord_system in ('gcj02','wgs84')),
  geofence_radius_m     integer not null default 1000 check (geofence_radius_m between 50 and 5000),
  is_surprise           boolean not null default false,
  require_location      boolean not null default false,
  require_device        boolean not null default false,
  method                text not null default 'both' check (method in ('code','qr','both')),
  slice_seconds         integer not null default 30 check (slice_seconds = 30),
  allow_previous_slice  boolean not null default true,
  created_at            timestamptz not null default now(),
  constraint checkin_events_time_check check (end_at > start_at),
  constraint checkin_events_max_duration check (end_at <= start_at + interval '7 days'),
  constraint checkin_events_location_check check (
    (not require_location) or (location_lat is not null and location_lng is not null)
  ),
  constraint checkin_events_latlng_pair check (
    (location_lat is null and location_lng is null)
    or (location_lat is not null and location_lng is not null)
  )
);

create index if not exists checkin_events_class_start_idx
  on public.checkin_events(class_id, start_at desc);
create index if not exists checkin_events_creator_start_idx
  on public.checkin_events(creator_id, start_at desc);

comment on table public.checkin_events is '签到活动；start_at/end_at 存 UTC；状态由 now() 推导，不需要 cron';
comment on column public.checkin_events.is_surprise is '突击签到：开始前对参与者完全隐藏，开始瞬间进入正在签到';
comment on column public.checkin_events.require_device is '可选设备绑定；默认关闭，启用前前端必须警告换机风险';

create table if not exists public.checkin_secrets (
  event_id    uuid primary key references public.checkin_events(id) on delete cascade,
  secret      text not null check (char_length(secret) >= 32),
  created_at  timestamptz not null default now()
);

comment on table public.checkin_secrets is '动态码 HMAC 密钥；RLS 全拒绝，只有 SECURITY DEFINER 函数能读';

-- ============================================================
-- 4. 参与记录 / 尝试限流
-- ============================================================
create table if not exists public.checkin_records (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.checkin_events(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  status         text not null default 'absent' check (status in ('absent','present')),
  method         text check (method in ('code','qr','makeup')),
  is_late_slice  boolean not null default false,
  slice_index    bigint,
  code_hash      text check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$'),
  checked_in_at  timestamptz,
  device_id      text,
  device_label   text,
  latitude       double precision check (latitude is null or latitude between -90 and 90),
  longitude      double precision check (longitude is null or longitude between -180 and 180),
  distance_m     double precision check (distance_m is null or distance_m >= 0),
  created_at     timestamptz not null default now(),
  constraint checkin_records_event_user_key unique (event_id, user_id),
  constraint checkin_records_present_method check ((status = 'present') = (method is not null)),
  constraint checkin_records_checked_at check (status = 'absent' or checked_in_at is not null)
);

create index if not exists checkin_records_event_status_idx
  on public.checkin_records(event_id, status);
create index if not exists checkin_records_user_event_idx
  on public.checkin_records(user_id, event_id);

comment on table public.checkin_records is '创建活动时给全班预生成 absent；签到成功改 present；数据库只存 code_hash，不存明文码';

create table if not exists public.checkin_attempts (
  id            bigserial primary key,
  event_id      uuid not null references public.checkin_events(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  slice_index   bigint not null,
  success       boolean not null default false,
  attempted_at  timestamptz not null default now()
);

create index if not exists checkin_attempts_lookup_idx
  on public.checkin_attempts(event_id, user_id, slice_index);

comment on table public.checkin_attempts is '同一时间片失败 5 次即限流；不需要 cron，读时统计';

-- ============================================================
-- 5. 补签申请 / 审计
-- ============================================================
create table if not exists public.appeals (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.checkin_records(id) on delete cascade,
  event_id     uuid not null references public.checkin_events(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  attempt_no   integer not null check (attempt_no between 1 and 3),
  reason       text not null check (char_length(reason) between 10 and 500),
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text check (review_note is null or char_length(review_note) <= 500),
  created_at   timestamptz not null default now(),
  constraint appeals_record_attempt_key unique (record_id, attempt_no)
);

create index if not exists appeals_event_status_idx on public.appeals(event_id, status);
create index if not exists appeals_user_status_idx on public.appeals(user_id, status);
create unique index if not exists appeals_one_pending_idx
  on public.appeals(record_id) where status = 'pending';

create table if not exists public.audit_logs (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

-- ============================================================
-- 6. 业务人机验证票据
-- ============================================================
create table if not exists public.captcha_tickets (
  id           uuid primary key default gen_random_uuid(),
  purpose      text not null check (
    purpose in ('create_class','join_class','appeal','create_checkin','profile_update','change_password')
  ),
  user_id      uuid references public.profiles(id) on delete cascade,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists captcha_tickets_expires_idx on public.captcha_tickets(expires_at);

comment on table public.captcha_tickets is 'captcha-verify Edge Function 写入；RPC 单次消费；RLS 全拒绝';

-- ============================================================
-- 7. 触发器函数
-- ============================================================

-- 7.1 profiles.updated_at 自动更新
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.tg_set_updated_at();

-- 7.2 学号不可修改
create or replace function public.tg_profiles_prevent_student_id_change()
returns trigger
language plpgsql
as $$
begin
  if new.student_id is distinct from old.student_id then
    raise exception 'STUDENT_ID_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_student_id_change on public.profiles;
create trigger profiles_prevent_student_id_change
before update on public.profiles
for each row execute function public.tg_profiles_prevent_student_id_change();

-- 7.3 班级创建者不可变
create or replace function public.tg_classes_prevent_owner_change()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'CLASS_OWNER_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists classes_prevent_owner_change on public.classes;
create trigger classes_prevent_owner_change
before update on public.classes
for each row execute function public.tg_classes_prevent_owner_change();

-- 7.4 创建班级后自动把 owner 加入 class_members
create or replace function public.tg_class_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.class_members(class_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (class_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists classes_owner_membership on public.classes;
create trigger classes_owner_membership
after insert on public.classes
for each row execute function public.tg_class_after_insert();

-- 7.5 只有班级创建者能发布该班签到
create or replace function public.tg_checkin_events_owner()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not exists (
    select 1 from public.classes c
    where c.id = new.class_id and c.owner_id = new.creator_id
  ) then
    raise exception 'NOT_CLASS_OWNER';
  end if;
  return new;
end;
$$;

drop trigger if exists checkin_events_enforce_owner on public.checkin_events;
create trigger checkin_events_enforce_owner
before insert or update of class_id, creator_id on public.checkin_events
for each row execute function public.tg_checkin_events_owner();

-- 7.6 时区必须是合法的 IANA 时区
create or replace function public.tg_checkin_events_timezone()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from pg_timezone_names t where t.name = new.timezone
  ) then
    raise exception 'INVALID_TIMEZONE';
  end if;
  return new;
end;
$$;

drop trigger if exists checkin_events_validate_timezone on public.checkin_events;
create trigger checkin_events_validate_timezone
before insert or update of timezone on public.checkin_events
for each row execute function public.tg_checkin_events_timezone();

-- 7.7 注册：auth.users 插入后创建 profiles + auth_secrets
-- 说明：客户端通过 signUp 的 options.data 传入下列字段：
--   student_id, full_name, enrollment_year, major_code, password_salt
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_student_id text := trim(coalesce(new.raw_user_meta_data->>'student_id', ''));
  v_full_name  text := trim(coalesce(new.raw_user_meta_data->>'full_name', ''));
  v_year_text  text := new.raw_user_meta_data->>'enrollment_year';
  v_year       integer;
  v_major      text := trim(coalesce(new.raw_user_meta_data->>'major_code', ''));
  v_salt       text := trim(coalesce(new.raw_user_meta_data->>'password_salt', ''));
begin
  -- 允许管理员/后台创建的无 metadata 用户存在，但这类用户没有 profiles，不能进入业务
  if v_student_id = '' then
    return new;
  end if;

  begin
    v_year := v_year_text::integer;
  exception when others then
    raise exception 'INVALID_ENROLLMENT_YEAR';
  end;

  if v_student_id !~ '^[0-9]{12}$' then
    raise exception 'INVALID_STUDENT_ID';
  end if;
  if left(v_student_id, 4) <> v_year::text then
    raise exception 'STUDENT_ID_YEAR_MISMATCH';
  end if;
  if v_major !~ '^[0-9]{2}$' or substr(v_student_id, 5, 2) <> v_major then
    raise exception 'STUDENT_ID_MAJOR_MISMATCH';
  end if;
  if lower(coalesce(new.email, '')) <> (v_student_id || '@student.valencia.edu') then
    raise exception 'INVALID_EMAIL';
  end if;
  if char_length(v_full_name) < 2 or char_length(v_full_name) > 50 then
    raise exception 'INVALID_NAME';
  end if;
  if v_full_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_NAME';
  end if;
  if v_year < 2000 or v_year > 2100 then
    raise exception 'INVALID_ENROLLMENT_YEAR';
  end if;
  if not exists (select 1 from public.majors m where m.code = v_major) then
    raise exception 'INVALID_MAJOR';
  end if;
  if v_salt !~ '^[0-9a-f]{32,64}$' then
    raise exception 'INVALID_SALT';
  end if;

  begin
    insert into public.profiles(id, student_id, full_name, enrollment_year, major_code)
    values (new.id, v_student_id, v_full_name, v_year, v_major);
  exception when unique_violation then
    raise exception 'STUDENT_ID_TAKEN';
  end;

  insert into public.auth_secrets(user_id, password_salt)
  values (new.id, v_salt);

  insert into public.audit_logs(actor_id, action, entity, entity_id, metadata)
  values (
    new.id,
    'register',
    'profile',
    new.id,
    jsonb_build_object('student_id', v_student_id, 'major_code', v_major)
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
