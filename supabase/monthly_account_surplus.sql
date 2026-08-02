-- Bill Record：按账户 × 自然月的流水结余表
-- 由用户在「结余」页手动重算写入；不在记账时自动刷新
-- 在 schema.sql / accounts.sql / transactions.sql 之后于 SQL Editor 执行

create table if not exists public.monthly_account_surplus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id text not null,
  year_month text not null,
  income numeric(18, 2) not null default 0,
  expense numeric(18, 2) not null default 0,
  net numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_account_surplus_user_account_month_unique
    unique (user_id, account_id, year_month),
  constraint monthly_account_surplus_year_month_check
    check (year_month ~ '^\d{4}-\d{2}$')
);

comment on table public.monthly_account_surplus is '账户月结余：按用户+账户+自然月存收入/支出/净额，手动重算写入';
comment on column public.monthly_account_surplus.id is '主键';
comment on column public.monthly_account_surplus.user_id is '所属用户，对应 public.users.id';
comment on column public.monthly_account_surplus.account_id is '账户 ID（与 accounts.id / transactions.account_id 一致）';
comment on column public.monthly_account_surplus.year_month is '自然月 YYYY-MM';
comment on column public.monthly_account_surplus.income is '该月该账户收入合计';
comment on column public.monthly_account_surplus.expense is '该月该账户支出合计';
comment on column public.monthly_account_surplus.net is '结余 = 收入 - 支出';
comment on column public.monthly_account_surplus.created_at is '首次创建时间';
comment on column public.monthly_account_surplus.updated_at is '最近一次重算时间';

create index if not exists monthly_account_surplus_user_account_month_idx
  on public.monthly_account_surplus (user_id, account_id, year_month desc);

alter table public.monthly_account_surplus disable row level security;
grant select, insert, update, delete on public.monthly_account_surplus to anon, authenticated;

-- 与 accounts 等表共用 set_updated_at（若尚未创建则补上）
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists monthly_account_surplus_set_updated_at
  on public.monthly_account_surplus;
create trigger monthly_account_surplus_set_updated_at
  before update on public.monthly_account_surplus
  for each row execute function public.set_updated_at();
