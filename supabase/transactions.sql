-- Bill Record：流水表（明文，即时写入）
-- 在已执行 schema.sql（users / vaults）之后，于 SQL Editor 单独执行本脚本

-- ========== 流水表 ==========
create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid not null,
  date date not null,
  amount numeric(18, 2) not null,
  type text not null,
  account_id text not null,
  to_account_id text,
  category text not null,
  note text not null default '',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_type_check check (type in ('expense', 'income', 'transfer'))
);

comment on table public.transactions is '流水明细表：明文存储，记账时立即写入；不放入 vaults 密文包';
comment on column public.transactions.id is '流水主键（与前端/本地 id 一致）';
comment on column public.transactions.user_id is '所属用户，对应 public.users.id';
comment on column public.transactions.date is '业务日期';
comment on column public.transactions.amount is '金额（元，保留两位小数）';
comment on column public.transactions.type is '类型：expense 支出 / income 收入 / transfer 转账';
comment on column public.transactions.account_id is '账户 ID（本地 accounts.id）';
comment on column public.transactions.to_account_id is '转账目标账户 ID，非转账为空';
comment on column public.transactions.category is '分类（餐饮、工资等）';
comment on column public.transactions.note is '备注';
comment on column public.transactions.source is '来源：manual / wechat / alipay';
comment on column public.transactions.created_at is '创建时间';
comment on column public.transactions.updated_at is '更新时间';

create index if not exists transactions_user_id_date_idx
  on public.transactions (user_id, date desc);

create index if not exists transactions_user_id_idx
  on public.transactions (user_id);

-- 按账户筛选（含转账目标）
create index if not exists transactions_user_account_date_idx
  on public.transactions (user_id, account_id, date desc);

create index if not exists transactions_user_to_account_date_idx
  on public.transactions (user_id, to_account_id, date desc)
  where to_account_id is not null;

alter table public.transactions disable row level security;
grant select, insert, update, delete on public.transactions to anon, authenticated;
