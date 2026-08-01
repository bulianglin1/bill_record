# Bill Record

本地优先、端到端加密的个人记账应用（**Mobile-First PWA**）。数据默认存浏览器 IndexedDB，可选同步到 Supabase 免费版（仅上传 AES 密文）。前端可部署到 Cloudflare Pages / Vercel / Netlify，**全程零服务器费用**。

> 手机 / iPad / PC 适配、PWA 安装说明见 **[docs/MOBILE_PWA.md](./docs/MOBILE_PWA.md)**。

## 1. 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│  React UI（看板 / 流水 / 账户 / 设置）                        │
│  Tailwind + Lucide + Recharts                                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Service 层                                                   │
│  accountService / transactionService（余额联动、批量导入）     │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌────────────────┐  ┌────────────────────┐
│ Dexie.js      │  │ Web Crypto API │  │ Sync / Backup      │
│ IndexedDB     │  │ AES-GCM +      │  │ Supabase vaults    │
│ 明文本地库    │  │ PBKDF2         │  │ GitHub / WebDAV    │
└───────────────┘  └────────────────┘  └────────────────────┘
```

### 设计要点

| 层 | 职责 |
|---|---|
| **本地存储** | Dexie 管理 `accounts` / `transactions` / `meta`，解锁后读写明文，离线可用 |
| **加密** | Master Password → PBKDF2(310k) → AES-GCM；密码只存在内存，不落盘 |
| **云同步** | 整库快照加密后写入 Supabase `vaults`；RLS 保证用户隔离 |
| **导入** | `BillImporter` 接口 + 微信/支付宝 CSV 解析器 |
| **备份扩展** | `src/lib/backup/github.ts`、`webdav.ts` 适配器骨架 |

### 启动门禁

1. **自建账号登录 / 注册**（`AuthPage` → `public.users`）  
2. 登录密码同时用于 AES 加密 `vaults`，**不再二次解锁**  
3. 进入应用；流水即时写入 `transactions`（需联网）  

### 安全模型

1. 登录密码哈希存于 `public.users`（PBKDF2），**不使用** Supabase Auth / 邮箱确认。  
2. 同一登录密码在内存中用于加密 `vaults`（账户+汇总）；刷新页面需重新登录。  
3. 流水明文存 `transactions`；账户汇总加密存 `vaults`。  

---

## 2. 数据库 Schema

### 2.1 本地 IndexedDB（Dexie）

```
accounts: id, name, type, balance, currency, color, sortOrder, createdAt, updatedAt
transactions: id, date, amount, type, accountId, toAccountId?, category, note, source?, createdAt, updatedAt
meta: id='app', localVersion, remoteVersion, lastSyncedAt?, salt?
```

### 2.2 Supabase（`supabase/schema.sql`）

```sql
-- 自建用户（不用 auth.users）
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now()
);

-- 加密保险库：账户 + 汇总（总收入等），不含流水明细
create table public.vaults ( ... );

-- 流水明文表（另文件 supabase/transactions.sql）
create table public.transactions (
  id, user_id, date, amount, type, account_id, ...
);
```

SQL Editor 依次执行：`supabase/schema.sql`，再执行 `supabase/transactions.sql`。

---

## 3. 快速开始

```bash
# 安装依赖
npm install

# 可选：配置 Supabase
cp .env.example .env
# 编辑 .env 填入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY

# 开发
npm run dev

# 构建
npm run build
```

不配置 `.env` 也可以纯本地使用（无云同步）。

---

## 4. 核心代码位置

| 能力 | 文件 |
|---|---|
| AES 加密 / 密钥派生 | `src/lib/crypto.ts` |
| IndexedDB | `src/lib/db.ts` |
| Supabase 同步 | `src/lib/sync.ts` |
| 解锁与密码会话 | `src/context/VaultContext.tsx` |
| 微信/支付宝导入 | `src/utils/import/` |
| GitHub / WebDAV 备份 | `src/lib/backup/` |

### 加密示例（摘要）

```ts
// PBKDF2 → AES-GCM
const key = await deriveKey(masterPassword, salt)
const encrypted = await encryptPayload(vaultSnapshot, masterPassword, salt)
const snapshot = await decryptPayload<VaultSnapshot>(encrypted, masterPassword)
```

### 同步示例（摘要）

```ts
await pushToCloud(masterPassword)  // 加密后 upsert vaults
await pullFromCloud(masterPassword) // 解密后覆盖本地
await autoSync(masterPassword)      // 按版本号自动选择方向
```

---

## 5. 零成本部署指南

### 步骤 A：Supabase（免费）

1. 打开 [supabase.com](https://supabase.com) 注册并创建项目（Free tier）。
2. Project Settings → API：复制 **Project URL** 与 **anon public** key。
3. SQL Editor 依次执行 `supabase/schema.sql`、`supabase/transactions.sql`。
4. **无需**配置 Authentication 邮箱注册（账号由应用写入 `public.users`）。
流水记账需联网，立即写入 `transactions`；`vaults` 仅同步账户与总收入等汇总。

### 步骤 B：前端静态托管（三选一，均免费）

#### Cloudflare Pages（推荐）

```bash
npm run build
# 将 dist/ 连接到 Cloudflare Pages
# 构建设置：npm run build，输出目录 dist
# 环境变量：VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY
```

#### Vercel

```bash
npx vercel
# 或 GitHub 导入后自动部署
# Environment Variables 填入同上两个 VITE_ 变量
```

#### Netlify

```bash
npm run build
# Publish directory: dist
# 或使用 netlify.toml / Git 持续部署
```

### 步骤 C：使用流程

1. 打开部署后的站点 → 设置 Master Password → 自动创建默认账户（光大/浦发/工行/招行/支付宝/微信）。
2. 设置页用邮箱注册/登录 Supabase。
3. 点击「推送到云端」完成首次加密备份。
4. 换设备：登录 → 输入同一 Master Password →「从云端拉取」。

### 费用说明

| 资源 | 免费额度（量级） | 本应用占用 |
|---|---|---|
| Supabase Free | 500MB DB / 5GB 带宽等 | 每人通常一行加密 JSON，极小 |
| Cloudflare/Vercel/Netlify | 静态站免费 | 纯前端 SPA |
| IndexedDB | 浏览器本地 | 主存储 |

---

## 6. 功能清单

- [x] 多账户管理与余额看板 / 账户汇总
- [x] 资产饼图 + 宽屏折线图
- [x] 流水（收入/支出/转账）与余额联动
- [x] 快速记账（FAB / 侧栏，自动填今日）
- [x] Mobile-First：底栏导航、滑动切 Tab、大触控按钮
- [x] iPad/PC：侧边栏 + 详细图表
- [x] PWA（Manifest + Service Worker，可加到主屏幕、离线记账）
- [x] 深色模式
- [x] Master Password + AES-256-GCM（Web Crypto）
- [x] IndexedDB + Supabase 加密同步
- [x] 微信/支付宝 CSV 导入解析接口
- [x] GitHub / WebDAV 备份适配器骨架
- [ ] GitHub / WebDAV 设置页 UI（可按需继续接）
- [ ] 多端实时冲突自动合并（当前为版本号乐观锁 + 手动选择）

---

## 7. 重要提醒

- **务必记住 Master Password**，丢失无法解密云端数据。
- 不要把 `.env`、GitHub Token、WebDAV 密码提交到公开仓库。
- 微信/支付宝 CSV 编码可能是 GBK；若乱码，请先用编辑器转为 UTF-8 再导入。
