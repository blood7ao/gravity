<div align="center">

# 🪐 Antigravity Codex

**基于 Tauri 2.0 (Rust) 与 React 19 构建的超轻量、极速 AI 编程桌面客户端，直接集成官方 `agy` CLI。**

[![Tauri](https://img.shields.io/badge/Tauri-v2.0-blue.svg?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19.1-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen.svg)]()

[English](README.md) • [简体中文](README_zh.md)

</div>

---

## 📖 项目简介

**Antigravity Codex** 是一款专为 Google Antigravity 生态打造的现代化轻量级 AI 编程桌面客户端。

不同于占用大量资源的 Electron 包装壳，Antigravity Codex 采用 **Rust (Tauri 2.0)** 和 **React 19** 底层架构，实现毫秒级启动与 **低于 50MB 的基础内存占用**。它通过双向 NDJSON 流直接驱动 `agy` 命令行子进程，为开发者带来丝滑、可控、高响应度的智能辅助编程体验。

---

## ⚡ 核心前置依赖：`agy` CLI 说明

> [!IMPORTANT]
> **Antigravity Codex 依赖本机已安装的 Google Antigravity CLI (`agy`) 命令行工具。**
> 桌面客户端本质上是 `agy` 的图形化交互前端，通过 Rust 子进程异步管理、双向 NDJSON 管道与 `agy` 进行高效通信与状态驱动。

### 1. 验证 `agy` 安装
在运行或使用 Antigravity Codex 前，请确保您的终端中可以正常调用 `agy`：
```bash
agy --version
```

### 2. 自动探测与环境变量自愈
Antigravity Codex 内部集成了跨平台环境解析器（`env_resolver.rs`），桌面端启动时会自动扫描并识别以下标准路径中的 `agy` / `agy.exe`：
- **macOS**：`/opt/homebrew/bin`、`~/.local/bin`、`~/.gemini/antigravity/bin`、`~/.cargo/bin`、`/usr/local/bin`
- **Windows**：`%USERPROFILE%\.local\bin`、`%USERPROFILE%\.cargo\bin` 以及系统 `%PATH%`

如果您的 `agy` 安装在自定义路径，请确保将其所在目录添加到系统的 `PATH` 环境变量中。

---

## ✨ 核心特性

### ⚡ 极致性能与原生架构
- **极低内存占用**：闲置状态仅占用 ~50MB 内存，远低于传统 Electron 类 AI IDE（动辄 500MB+）。
- **原生双向流驱动**：基于 Tokio 异步 Rust 管道管理子进程通信，无冗余序列化损耗。
- **进程生命周期安全守护**：内置 Windows Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) 和 Unix PGID 进程组管理，应用退出或中断时 100% 杜绝孤儿/僵尸后台进程。

### 🧠 深度推理与实时流式输出
- **双向 NDJSON 实时流式传输**：字符级 Token 实时回显，伴随清晰的运行状态指示。
- **可折叠思维链 (Chain-of-Thought)**：清晰审视大模型的思考全过程，并带有耗时指标。
- **公式与图表原生渲染**：内置 KaTeX 数学公式与 Mermaid 流程图架构渲染能力。

### 🎯 双重执行模式
- **Plan 规划模式**：在修改任何代码前强制输出详尽的架构设计方案，自动同步并更新 `implementation_plan.md` 计划工件。
- **Act 执行模式**：自主执行模式，支持文件读取、精准代码编辑与终端命令执行。
- **思考预算动态调节**：随心切换推理深度（`低 (Low)`、`中 (Medium)`、`高 (High)`）。

### 🔍 Monaco Side-by-Side 差异对比检查器
- **可视化代码 Diff**：支持左右双栏或行内对比修改的文件变动。
- **一键采纳 / 撤销**：精准掌控每一处代码变更，避免意外覆盖。
- **实时工件监控**：通过 `notify` 文件监听机制实时追踪 `~/.gemini/` 下的工件更新。

### 💬 现代化悬浮提示词中心 (Prompt Hub)
- **悬浮输入枢纽**：极简无干扰的输入体验，支持多行自动扩高。
- **快捷斜杠指令 (Slash Commands)**：快速切换模式与功能（`/plan`、`/act`、`/sandbox`、`/effort`、`/goal`、`/clear`）。
- **`@` 工作区上下文引用**：支持对工程文件与目录的模糊搜索与快速引用。
- **图片与截图支持**：支持拖入或粘贴设计图、原型草图，直接作为上下文发送给模型。

### 🔑 多账号管理与配额监控
- **Google OAuth 原生登录**：支持系统浏览器授权与安全的 PKCE 本地回环回调。
- **系统级安全凭据存储**：无缝对接 macOS Keychain 与 Windows Credential Manager。
- **实时配额与重置时间监控**：即时查看 Gemini 和 Claude 模型的 5 小时与周配额余量及重置窗口。

### 🌐 现代 UI 与完整双语支持
- **macOS 毛玻璃美学设计**：无边框 Overlay 标题栏、精美暗黑主题与可折叠侧边栏。
- **完整双语支持**：内置英文与简体中文一键切换。

---

## 🏛️ 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│               前端 UI (React 19 + Vite)                     │
│  • LeftSidebar (项目管理、历史会话、多账号中心)             │
│  • TopHeader (macOS 悬浮标题栏、模式与思考预算调节)         │
│  • ChatCanvas (ThinkingBlock、ActionPills、Markdown/KaTeX)  │
│  • PromptHub (SlashMenu、@提及选择器、悬浮输入框)           │
│  • InspectorDrawer (Monaco Diff 检查器、Plan 计划评审器)    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Tauri 2.0 IPC 通信
┌──────────────────────────────▼──────────────────────────────┐
│                Rust 核心引擎 (src-tauri)                    │
│  • 进程管理器 (tokio::process 异步双向 NDJSON 管道)         │
│  • 生命周期守护 (JobObject / PGID 孤儿进程防御)             │
│  • 智能工件监听 (notify 监听 ~/.gemini/ 工件文件变动)       │
│  • 本地 SQLite 存储 (rusqlite 记录项目、会话与账号)         │
│  • OAuth 认证中心 (PKCE 本地回环监听 & 系统 Keyring 存储)   │
│  • 环境变量自愈 (macOS / Windows PATH 自动发现与修复)       │
└──────────────────────────────┬──────────────────────────────┘
                               │ 标准输入输出 UTF-8 NDJSON 流
┌──────────────────────────────▼──────────────────────────────┐
│                    agy CLI 命令行子进程                     │
│    `agy --input-format stream-json --output-format ...`     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 快速上手

### 环境要求

开始之前，请确保本地已安装以下环境：
- [Node.js](https://nodejs.org/)（v18 或更高版本）
- [Rust & Cargo](https://rustup.rs/)（v1.75 或更高版本）
- [`agy` CLI](https://antigravity.google/)（确保命令行中可通过 `agy --version` 正常调用）

### 克隆并安装依赖

```bash
git clone https://github.com/your-username/antigravity-codex.git
cd antigravity-codex

# 安装前端依赖
npm install
```

### 本地开发调试

启动带热重载（HMR）的本地桌面客户端：

```bash
npm run tauri dev
```

### 生产打包构建

构建当前操作系统适用的独立安装包：

```bash
npm run tauri build
```

打包生成的安装包文件（macOS 下为 `.dmg`，Windows 下为 `.msi` / `.exe`）将保存在：
```
src-tauri/target/release/bundle/
```

---

## ⌨️ 斜杠指令与快捷键

### 斜杠指令 (Slash Commands)

在输入框中输入 `/` 即可呼出快捷指令面板：

| 指令 | 动作 | 功能说明 |
| :--- | :--- | :--- |
| `/plan` | 切换至规划模式 | 在开始编码前强制生成完整的架构实施计划 |
| `/act` | 切换至执行模式 | 允许 Agent 自主执行代码修改与终端命令 |
| `/effort` | 调节推理预算 | 设置模型的思考深度（`low` / `medium` / `high`） |
| `/sandbox` | 沙盒安全模式 | 切换命令执行的沙盒安全策略 |
| `/goal` | 目标驱动模式 | 自主执行多步骤复杂长链路任务 |
| `/clear` | 清空对话 | 清理当前上下文并开启全新对话 |

### 常用快捷键

| 快捷键 | 功能说明 |
| :--- | :--- |
| `Enter` | 发送提示词给 Agent |
| `Shift + Enter` | 在输入框中换行 |
| `@` | 呼出工作区文件/目录上下文选择器 |
| `/` | 呼出快捷斜杠指令菜单 |
| `Esc` | 关闭下拉菜单 / 抽屉检查器 |

---

## 📂 项目结构

```
antigravity-client/
├── src/                          # React 19 前端工程
│   ├── components/
│   │   ├── canvas/               # 对话画布、思维链折叠、Markdown 与行动胶囊
│   │   ├── inspector/            # Monaco 代码对比、计划评审、原始日志
│   │   ├── layout/               # 左侧栏、顶部栏与基础布局
│   │   ├── prompt/               # 输入中心、斜杠菜单、@提及、模型选择器
│   │   └── ui/                   # 通用 UI 基础组件
│   ├── hooks/                    # 自定义 React Hooks（快捷键、拖拽调整）
│   ├── i18n/                     # 中英文多语言配置与词条
│   ├── stores/                   # Zustand 状态管理（会话、工作区、主题）
│   ├── styles/                   # Tailwind CSS 样式
│   └── types/                    # 全局 TypeScript 类型定义
├── src-tauri/                    # Rust 核心引擎 (Tauri 2.0)
│   ├── src/
│   │   ├── auth/                 # OAuth PKCE 授权与系统 Keyring 安全存储
│   │   ├── process/              # agy 进程管道管理与 JobObject/PGID 安全守护
│   │   ├── protocol/             # NDJSON 事件定义与流式解析
│   │   ├── storage/              # SQLite 数据库 (rusqlite) 与工件文件监听
│   │   ├── lib.rs                # Tauri 接口绑定与初始化
│   │   └── main.rs               # Rust 启动入口
│   ├── Cargo.toml                # Rust 依赖声明
│   └── tauri.conf.json           # Tauri 桌面应用配置
├── .github/workflows/            # CI/CD 自动跨平台打包工作流
└── package.json                  # 前端依赖与脚本声明
```

---

## 🛡️ 安全与稳定性设计

- **零孤儿进程**：应用退出或用户中断请求时，通过 Unix Process Groups (`libc::killpg`) 或 Windows Job Objects (`TerminateJobObject`) 级联回收所有子进程。
- **数据完全本地化**：所有对话历史、项目配置均存放在本地嵌入式 SQLite (`antigravity.db`) 中。
- **环境路径自愈**：自动检测并补全 macOS / Windows 下常见的开发路径（Homebrew、NVM、Cargo、本地 bin）。

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的修改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

---

## ⚠️ 免责与商标声明 (Disclaimer)

本项目为独立的开源社区桌面客户端，**与 Google LLC、Anthropic PBC 或其任何关联公司无任何官方隶属、赞助、认可或合作关系**。

- **Google**、**Antigravity**、**Gemini** 均为 Google LLC 的注册商标。
- **Claude** 为 Anthropic PBC 的注册商标。
- 项目中提及的所有品牌、产品名称与公司商标均归其各自的所有者所有。

---

## 📄 开源许可证与版权 (License & Copyright)

- 本项目代码与文档均基于 [MIT License](LICENSE) 开源。
- Copyright (c) 2026 Teddy & Contributors.
