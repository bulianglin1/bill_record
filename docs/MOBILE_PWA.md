# Mobile-First · 响应式 · PWA 指南

## 目录结构（关键）

```
bill_record/
├── index.html                 # viewport-fit / Apple PWA meta
├── public/
│   ├── favicon.svg
│   ├── pwa-192.svg            # 主屏幕图标
│   └── pwa-512.svg
├── supabase/schema.sql
├── vite.config.ts             # VitePWA + Tailwind
└── src/
    ├── App.tsx                # Tab + 快速记账弹层
    ├── main.tsx               # registerSW
    ├── components/
    │   ├── Layout.tsx         # 底栏 / 侧栏 / FAB
    │   ├── QuickAddDialog.tsx # Headless UI 快速记账
    │   ├── AssetPieChart.tsx
    │   └── TrendLineChart.tsx # iPad/PC 折线图
    ├── hooks/useSwipeTabs.ts  # 手机左右滑动切 Tab
    ├── lib/
    │   ├── crypto.ts          # AES-256-GCM（Web Crypto）
    │   ├── db.ts              # Dexie IndexedDB
    │   └── sync.ts            # Supabase 加密同步
    ├── pages/
    └── utils/import/          # 微信/支付宝 CSV 接口
```

## Tailwind 断点策略

| 断点 | 宽度 | 布局 |
|------|------|------|
| 默认 | `<768px` | 底部导航 + FAB + 左右滑动切页；图表以饼图为主 |
| `md:` | `≥768px` | 侧边栏导航；显示近 14 日折线图（iPad / 小笔电） |
| `lg:` / `xl:` | `≥1024px` | 更宽网格（账户 3 列等） |

实现要点：

- 底部导航：`md:hidden`；侧栏：`hidden md:flex`
- 触控目标：`min-h-12` / `.touch-target`（约 44px）
- 安全区：`env(safe-area-inset-bottom)`，适配 iPhone 横条
- 高度：`min-h-dvh`，避免移动端 100vh 被地址栏顶歪

## PWA Manifest（由 vite-plugin-pwa 生成）

构建后会产出 `manifest.webmanifest`，配置等价于：

```json
{
  "name": "Bill Record",
  "short_name": "BillRecord",
  "display": "standalone",
  "start_url": "/",
  "theme_color": "#0d9488",
  "background_color": "#f6f7f9",
  "icons": [
    { "src": "pwa-192.svg", "sizes": "192x192", "type": "image/svg+xml" },
    { "src": "pwa-512.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

Service Worker 预缓存静态资源；业务数据在 IndexedDB，**离线也可记账**。同步需联网。

## 加密与同步（摘要）

```ts
// 加密：Master Password → PBKDF2 → AES-256-GCM
await encryptPayload(vaultSnapshot, masterPassword, salt)

// 同步：仅上传密文
await pushToCloud(masterPassword)
await pullFromCloud(masterPassword)
```

> 使用浏览器原生 **Web Crypto API**（AES-256-GCM），比 Crypto-JS 的默认模式更安全，且无需额外依赖。

## 手机安装为 App

### 前置

1. 部署到 **HTTPS** 域名（Vercel / Cloudflare Pages）。
2. 用手机浏览器打开站点（勿用局域网 HTTP，除非本机调试）。

### iPhone / iPad（Safari）

1. 打开网站 → 点底部分享按钮。
2. 选择 **「添加到主屏幕」**。
3. 确认名称 → 添加。之后从主屏幕打开即为独立 App（无 Safari 地址栏）。

### Android（Chrome）

1. 打开网站 → 菜单 `⋮`。
2. 选择 **「安装应用」** 或 **「添加到主屏幕」**。
3. 确认安装。也可在地址栏右侧的安装图标点一次。

### 桌面（Chrome / Edge）

地址栏右侧「安装」图标 → 安装为桌面应用。

### 本地预览 PWA

```bash
npm run build
npm run preview
# 用手机与电脑同一 Wi-Fi，访问 https 或通过隧道；
# 或用 Chrome DevTools → Application → Manifest / Service Workers 检查
```

开发模式默认不启用 SW（`devOptions.enabled: false`），避免缓存干扰热更新。
