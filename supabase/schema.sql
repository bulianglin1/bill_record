-- Bill Record 表结构（Supabase 免费版）
-- 在 Supabase SQL Editor 中执行本文件即可完成初始化 / 升级
-- 流水表请另行执行：supabase/transactions.sql

create extension if not exists "pgcrypto";

-- ========== 自建用户表（不用 Supabase Auth / auth.users）==========
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  constraint users_email_unique unique (email)
);

comment on table public.users is '业务用户表：自建注册/登录，不使用 auth.users';
comment on column public.users.id is '用户主键，与 vaults.user_id 对应';
comment on column public.users.email is '登录邮箱，全局唯一';
comment on column public.users.password_hash is '登录密码 PBKDF2 哈希（Base64），不明文存储';
comment on column public.users.password_salt is '登录密码盐值（Base64）';
comment on column public.users.created_at is '账号创建时间';

-- 不开 RLS；anon key 直接读写（个人项目）
alter table public.users disable row level security;
grant select, insert, update on public.users to anon, authenticated;

-- ========== vaults：按 users.id 存加密快照 ==========
create table if not exists public.vaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  ciphertext text not null,
  iv text not null,
  salt text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint vaults_user_id_unique unique (user_id)
);

comment on table public.vaults is '加密保险库：每个用户一行完整账本快照（AES-GCM 密文）';
comment on column public.vaults.id is '保险库行主键';
comment on column public.vaults.user_id is '所属用户 ID，对应 public.users.id，每用户唯一一行';
comment on column public.vaults.ciphertext is 'AES-GCM 加密后的账本快照（Base64）';
comment on column public.vaults.iv is 'AES-GCM 初始化向量（Base64）';
comment on column public.vaults.salt is 'Master Password 派生密钥用的 PBKDF2 盐值（Base64）';
comment on column public.vaults.version is '乐观锁版本号，用于多端同步冲突检测';
comment on column public.vaults.updated_at is '最近一次同步/更新时间';
comment on column public.vaults.created_at is '保险库记录创建时间';

-- 若曾按旧版挂过 auth.users 外键，升级时移除
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vaults'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name = 'vaults_user_id_fkey'
  ) then
    alter table public.vaults drop constraint vaults_user_id_fkey;
  end if;
end $$;

create index if not exists vaults_user_id_idx on public.vaults (user_id);
create index if not exists vaults_updated_at_idx on public.vaults (updated_at desc);

-- 关闭 RLS（无 Auth 时 auth.uid() 不可用）
drop policy if exists "Users can select own vault" on public.vaults;
drop policy if exists "Users can insert own vault" on public.vaults;
drop policy if exists "Users can update own vault" on public.vaults;
drop policy if exists "Users can delete own vault" on public.vaults;
alter table public.vaults disable row level security;

grant select, insert, update, delete on public.vaults to anon, authenticated;

-- 更新时间自动刷新
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is '触发器函数：更新行时自动刷新 updated_at';

drop trigger if exists vaults_set_updated_at on public.vaults;
create trigger vaults_set_updated_at
  before update on public.vaults
  for each row
  execute function public.set_updated_at();
