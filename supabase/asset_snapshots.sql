-- Bill Record：总资产日快照表
-- 登录或资产变动时更新「当天」一行；查看某月时取该月 snapshot_date 最晚的一条
-- 同时记录当时各账户余额分布（distribution jsonb）
-- 在 schema.sql / transactions.sql 之后于 SQL Editor 执行

create table if not exists public.asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  snapshot_date date not null,
  total_assets numeric(18, 2) not null,
  -- 当时资产分布，例如：
  -- [{"accountId":"...","name":"招商","type":"bank","balance":1000,"currency":"CNY","color":"#3b82f6"}]
  distribution jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_snapshots_user_date_unique unique (user_id, snapshot_date)
);

comment on table public.asset_snapshots is '总资产日快照：每天一行，含合计与当时各账户分布';
comment on column public.asset_snapshots.id is '快照主键';
comment on column public.asset_snapshots.user_id is '所属用户，对应 public.users.id';
comment on column public.asset_snapshots.snapshot_date is '快照日期（按自然日，每天最多一行）';
comment on column public.asset_snapshots.total_assets is '当日总资产（各账户余额合计）';
comment on column public.asset_snapshots.distribution is '当日资产分布（账户 id/名称/类型/余额/币种/颜色）';
comment on column public.asset_snapshots.created_at is '首次创建时间';
comment on column public.asset_snapshots.updated_at is '最近一次更新时间';

create index if not exists asset_snapshots_user_date_idx
  on public.asset_snapshots (user_id, snapshot_date desc);

-- 若表已先创建过（无 distribution），执行下面这行补列即可
alter table public.asset_snapshots
  add column if not exists distribution jsonb not null default '[]'::jsonb;

alter table public.asset_snapshots disable row level security;
grant select, insert, update, delete on public.asset_snapshots to anon, authenticated;
