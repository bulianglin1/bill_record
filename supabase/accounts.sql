-- Bill Record：账户表（明文，即时读写）
-- 在 schema.sql 之后于 SQL Editor 执行；业务数据不再经 vaults 密文同步

create table if not exists public.accounts (
  id uuid primary key,
  user_id uuid not null,
  name text not null,
  type text not null,
  balance numeric(18, 2) not null default 0,
  currency text not null default 'CNY',
  color text not null,
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_type_check check (type in ('bank', 'payment', 'cash', 'other'))
);

comment on table public.accounts is '账户表：明文存储，记账时直接读写；不再放入 vaults 密文包';
comment on column public.accounts.id is '账户主键（与前端 id 一致）';
comment on column public.accounts.user_id is '所属用户，对应 public.users.id';
comment on column public.accounts.name is '账户名称';
comment on column public.accounts.type is '类型：bank / payment / cash / other';
comment on column public.accounts.balance is '当前余额（元）';
comment on column public.accounts.currency is '币种';
comment on column public.accounts.color is '展示颜色';
comment on column public.accounts.icon is '可选图标';
comment on column public.accounts.sort_order is '排序序号';
comment on column public.accounts.created_at is '创建时间';
comment on column public.accounts.updated_at is '更新时间';

create index if not exists accounts_user_id_sort_idx
  on public.accounts (user_id, sort_order);

alter table public.accounts disable row level security;
grant select, insert, update, delete on public.accounts to anon, authenticated;

-- 与 vaults 共用 set_updated_at（若尚未创建则补上）
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row
  execute function public.set_updated_at();
