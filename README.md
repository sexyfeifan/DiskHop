# DiskHop

macOS 媒体素材备份助手 — 基于 rsync 的多目标并行备份、SHA-256 验证与 PDF 报告生成工具

---

### screenshots/

<!-- TODO: 添加应用截图 -->
<!-- dashboard.png / progress.png / history.png / settings.png -->

---

## Features 功能特性

- **多源 → 多目标并行备份** — 选择多个源目录，同时备份至多个外置硬盘，rsync `--partial` 支持断点续传
- **SHA-256 文件级哈希验证** — 备份完成后逐文件比对源与目标的哈希值，不一致立即报告
- **PDF 归档报告** — 自动生成含文件清单、校验结果、时间戳的 PDF 报告（基于 jsPDF）
- **项目与设备槽位管理** — 以项目维度管理备份任务，设备槽位快速绑定目标磁盘
- **备份历史与热力图** — 持久化记录每次任务，日历热力图直观展示备份频率
- **Webhook 通知** — 备份完成后推送至钉钉、飞书、企业微信、Slack、Discord 或自定义 Webhook
- **双语界面** — 中文 / English 一键切换
- **深色主题** — macOS 原生毛玻璃质感（vibrancy），长时间使用不疲劳
- **严格只读源访问** — 代码层面保证不会写入源盘

## Tech Stack 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron 28 |
| 前端 | React 18 + TypeScript |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS 3 |
| 构建 | electron-vite (Vite 5) + electron-builder |
| 图标 | Lucide React |
| PDF | jsPDF + jspdf-autotable |
| 备份引擎 | rsync (系统自带 / Homebrew) |

## Quick Start 快速开始

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 打包为 macOS 应用（arm64 + x64 Universal）
npm run dist
```

产出目录 `release/`，包含 `.dmg` 安装包和 `.zip` 便携包。

> **前置条件**: macOS 12+，Node.js 18+，系统已安装 rsync（`/usr/bin/rsync` 或 Homebrew 版本）

## Project Structure 项目结构

```
DiskHop/
├── electron.vite.config.ts      # electron-vite 构建配置
├── package.json
├── resources/                   # 应用图标等静态资源
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 窗口管理、IPC 通信、Webhook 推送
│   │   ├── preload.ts           # 预加载脚本（contextBridge）
│   │   ├── types.ts             # 共享类型定义
│   │   ├── utils.ts             # 工具函数
│   │   └── backup/
│   │       ├── BackupEngine.ts  # rsync 调度、扫描、哈希验证
│   │       └── ReportGenerator.ts # PDF 报告生成
│   └── renderer/                # React 渲染进程
│       ├── index.html
│       └── src/
│           ├── main.tsx         # 入口
│           ├── App.tsx          # 路由与布局
│           ├── components/      # Header、Sidebar、ErrorBoundary
│           ├── pages/           # Dashboard、Progress、History、Settings
│           ├── store/           # Zustand 状态管理
│           ├── i18n/            # 国际化（zh / en）
│           └── utils.ts         # 前端工具函数
└── tailwind.config.js
```

## Security & Data Integrity 安全与数据完整性

| 特性 | 说明 |
|---|---|
| **SHA-256 哈希验证** | 每个文件备份后计算源与目标的 SHA-256，不一致即标记失败并写入报告 |
| **rsync `--partial`** | 中断后自动从断点续传，避免重新拷贝已完成部分 |
| **原子写入** | PDF 报告先写入临时文件再 rename，防止写入中途崩溃产生损坏文件 |
| **只读源保护** | rsync 参数与代码逻辑双重保证不对源目录执行任何写操作 |
| **重试机制** | Webhook 推送自动重试 3 次，网络抖动不影响通知送达 |

## License

MIT © DiskHop
