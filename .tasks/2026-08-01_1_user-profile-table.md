# 背景
文件名：2026-08-01_1
创建于：2026-08-01_15:29:14
创建者：concare
主分支：main
任务分支：main
Yolo模式：Off

# 任务描述
人人都可以注册，做一个用户表，记录用户，Supabase用我的就行。

# 项目概览
Bill Record：React + Dexie + Supabase 个人记账应用。

⚠️ 警告：永远不要修改此部分 ⚠️
RIPER-5：必须声明模式；未经明确信号不得切换模式；RESEARCH 禁止建议/实施/规划；EXECUTE 仅在 ENTER EXECUTE MODE 后且严格按计划；REVIEW 必须标记偏差。
⚠️ 警告：永远不要修改此部分 ⚠️

# 分析
见历史研究结论。

# 提议的解决方案
见已批准 PLAN（app_users + ensureAppUser + Auth 挂钩）。

# 当前执行步骤："清单 1-7 已实施，待用户确认"

# 任务进度
## 2026-08-01_15:35:00
- 已修改：supabase/schema.sql, src/types/index.ts, src/services/userService.ts, src/context/AuthContext.tsx, .env.example, README.md
- 更改：新增 public.app_users；注册/登录后 upsert；email 唯一；无 RLS/无 FK；build 通过
- 原因：落实人人可注册并记录业务用户
- 阻碍因素：需用户在 Supabase SQL Editor 执行 schema（环境侧）
- 状态：未确认

# 最终审查
暂无
# 任务进度追加
## 2026-08-01_15:50:00
- 已修改：schema.sql, password.ts, authSession.ts, userService.ts, AuthContext.tsx, sync.ts, AuthPage.tsx, SettingsPage.tsx, types, README, .env.example
- 更改：废弃 Supabase Auth；public.users 自建注册登录；vaults 去 FK/关 RLS；build 通过
- 原因：用户要求不用 Auth 邮箱注册，自行维护 public 用户表
- 阻碍因素：用户需在 SQL Editor 重新执行 schema.sql
- 状态：未确认
