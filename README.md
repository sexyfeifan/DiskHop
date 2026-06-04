# MediaFlow Backup

macOS 媒体素材备份助手 — 全流程自动化备份与数据存证系统

## 功能特性

- **严格只读源访问** — 代码层面禁止写入源盘
- **实时拷贝看板** — 进度条、写入速度、已传输量、ETA、5行滚动日志
- **字节级比对验证** — 文件数 + 总字节数双重校验，不一致立即中断
- **三路报告分发** — 自动存档至备份目录 + 拷贝至 ~/Downloads + 手动另存为
- **目录树报告** — TXT / PNG / PDF 三种格式，含文件夹大小标注
- **路径预设管理** — 设置页增删改目的地别名
- **备份历史** — 持久化记录每次任务状态

## 快速开始

```bash
# 1. 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. 运行
cd src
python main.py
```

## 打包为 macOS 应用

```bash
bash build.sh
```

产出：
- `dist/MediaFlow Backup.app` — Universal 2 通用应用（支持 M 芯片 + Intel）
- `dist/dmg/MediaFlow Backup.dmg` — 安装包（需先 `brew install create-dmg`）

## 数据存储

所有数据存于 `~/.mediaflow_backup/`：
- `config.json` — 目的地预设
- `history.json` — 备份历史记录

## 技术栈

- Python 3.11+
- PyQt6 — UI 框架
- Pillow — PNG 报告渲染
- ReportLab — PDF 报告生成
- PyInstaller — 打包为 Universal 2 .app
