<div align="center">

# 🪐 Antigravity Codex

**An ultra-fast, minimalist, modern AI coding desktop client built with Tauri 2.0 (Rust) and React 19, powered directly by the official `agy` CLI.**

[![Tauri](https://img.shields.io/badge/Tauri-v2.0-blue.svg?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19.1-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-brightgreen.svg)]()

[English](README.md) • [简体中文](README_zh.md)

</div>

---

## 📖 Introduction

**Antigravity Codex** is a lightweight, responsive, and robust desktop companion designed for developers using the Google Antigravity ecosystem. 

Unlike heavy Electron wrappers, Antigravity Codex is engineered from the ground up using **Rust (Tauri 2.0)** and **React 19**, achieving instant application startup with a baseline memory footprint of under **50MB RAM**. It communicates natively with the `agy` CLI via bi-directional NDJSON streaming to deliver a silky-smooth, deterministic coding and reasoning experience.

---

## ⚡ Core Prerequisite: `agy` CLI

> [!IMPORTANT]
> **Antigravity Codex requires the Google Antigravity CLI (`agy`) installed on your system.**
> The desktop client acts as an intelligent GUI frontend that directly spawns, controls, and streams from the `agy` subprocess.

### 1. Verify `agy` Installation
Before launching Antigravity Codex, check that `agy` is installed and accessible:
```bash
agy --version
```

### 2. Auto-Discovery & Path Resolution
Antigravity Codex features a built-in cross-platform environment resolver (`env_resolver.rs`) that automatically scans the following locations:
- **macOS**: `/opt/homebrew/bin`, `~/.local/bin`, `~/.gemini/antigravity/bin`, `~/.cargo/bin`, `/usr/local/bin`
- **Windows**: `%USERPROFILE%\.local\bin`, `%USERPROFILE%\.cargo\bin`, system `%PATH%`

If `agy` is located in a custom directory, ensure that directory is exported to your system `PATH`.

---

## ✨ Key Features

### ⚡ Blazing Performance & Native Architecture
- **Ultra-Low Memory Footprint**: Uses ~50MB RAM at idle compared to 500MB+ in typical Electron-based AI IDEs.
- **Native Process Streaming**: Subprocess communication managed by Tokio asynchronous Rust streams with zero serialization bottlenecks.
- **Enterprise-Grade Process Guard**: Built-in Windows Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) and Unix PGID process groups guarantee zero orphan background processes when closing or interrupting turns.

### 🧠 Deep Reasoning & Streaming Experience
- **Real-Time NDJSON Streaming**: Instant token-by-token response rendering with live status indicators.
- **Collapsible Thinking (Chain-of-Thought)**: Inspect step-by-step model reasoning with elapsed execution time indicators.
- **LaTeX & Diagram Rendering**: Native support for mathematical expressions (KaTeX) and architectural workflows (Mermaid).

### 🎯 Dual Execution Paradigms
- **Plan Mode**: Enforces strict architectural planning before touching code. Automatically drafts and syncs an `implementation_plan.md` artifact.
- **Act Mode**: Autonomous agent execution with direct file reading, writing, and terminal command execution.
- **Reasoning Effort Control**: Fine-tune thinking budget on the fly (`Low`, `Medium`, `High`).

### 🔍 Monaco Side-by-Side Diff Inspector
- **Interactive File Diff**: Inspect workspace modifications with side-by-side or inline Monaco editor diff views.
- **1-Click Accept & Revert**: Granular control over file changes before committing them to your workspace.
- **Live Brain Watcher**: Detects and displays real-time artifact updates (`notify` filesystem watcher).

### 💬 Codex-Style Prompt Hub
- **Floating Command Hub**: Clean, distraction-free floating command hub with auto-resizing input.
- **Slash Commands**: Quick mode switching and operations (`/plan`, `/act`, `/sandbox`, `/effort`, `/goal`, `/clear`).
- **`@` Workspace Mentions**: Fast fuzzy-matched file and directory symbol mentions.
- **Image & Screenshot Support**: Paste or upload reference mockups and diagrams directly into prompt turns.

### 🔑 Multi-Account & Quota Tracker
- **Google OAuth Flow**: Native browser authentication with secure PKCE loopback listener.
- **OS Keyring Integration**: Tokens stored securely using native macOS Keychain and Windows Credential Manager.
- **Real-Time Quota Monitor**: Track remaining Gemini and Claude 5-hour and weekly quota percentages and reset windows at a glance.

### 🌐 Modern UI & Internationalization
- **macOS Glassmorphism Aesthetic**: Frameless overlay titlebar, customizable themes, and collapsible sidebars.
- **Full Bilingual Support**: First-class support for English and 简体中文 (Simplified Chinese).

---

## 🏛️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│               Frontend UI (React 19 + Vite)                 │
│  • LeftSidebar (Projects, Session History, Multi-Account)   │
│  • TopHeader (macOS overlay titlebar, Mode & Effort Switch) │
│  • ChatCanvas (ThinkingBlock, ActionPills, Markdown/KaTeX)  │
│  • PromptHub (SlashMenu, @MentionPicker, Floating Input)    │
│  • InspectorDrawer (Monaco Diff Viewer, Plan Reviewer)      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Tauri 2.0 IPC
┌──────────────────────────────▼──────────────────────────────┐
│                Rust Core Engine (src-tauri)                 │
│  • Process Manager (tokio::process bidirectional NDJSON)    │
│  • Lifecycle Guard (JobObject / PGID orphan protection)     │
│  • Brain Watcher (notify crate tracking ~/.gemini/ artifacts│
│  • Local SQLite Store (rusqlite for projects/sessions)      │
│  • OAuth Manager (PKCE loopback & system keyring storage)   │
│  • Env Resolver (macOS / Windows PATH auto-repair)          │
└──────────────────────────────┬──────────────────────────────┘
                               │ Stdio UTF-8 NDJSON Stream
┌──────────────────────────────▼──────────────────────────────┐
│                    agy CLI Subprocess                       │
│    `agy --input-format stream-json --output-format ...`     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Rust & Cargo](https://rustup.rs/) (v1.75 or higher)
- [`agy` CLI](https://antigravity.google/) (Ensure `agy` is installed and verified via `agy --version`)

### Clone & Install

```bash
git clone https://github.com/your-username/antigravity-codex.git
cd antigravity-codex

# Install node dependencies
npm install
```

### Development Mode

Run the app in live development mode with Hot Module Replacement (HMR):

```bash
npm run tauri dev
```

### Building for Production

Compile a fully optimized standalone release package:

```bash
# Build desktop package for current OS
npm run tauri build
```

Generated installer packages (`.dmg` on macOS, `.msi` / `.exe` on Windows) will be located in:
```
src-tauri/target/release/bundle/
```

---

## ⌨️ Slash Commands & Shortcuts

### Slash Commands

Type `/` in the prompt input to bring up the command menu:

| Command | Action | Description |
| :--- | :--- | :--- |
| `/plan` | Switch to Plan Mode | Draft detailed architecture plans before taking action |
| `/act` | Switch to Act Mode | Enable autonomous file editing and command execution |
| `/effort` | Adjust Reasoning Budget | Configure reasoning budget (`low`, `medium`, `high`) |
| `/sandbox` | Sandbox Mode | Toggle sandbox command execution safety policies |
| `/goal` | Goal-Oriented Mode | Execute long-horizon multi-step tasks autonomously |
| `/clear` | Clear Conversation | Reset conversation state and start fresh session |

### Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Enter` | Send prompt to agent |
| `Shift + Enter` | Insert newline in prompt textarea |
| `@` | Trigger file / directory mention picker |
| `/` | Trigger slash command menu |
| `Esc` | Close dropdowns / inspector drawer |

---

## 📂 Project Structure

```
antigravity-client/
├── src/                          # React 19 Frontend
│   ├── components/
│   │   ├── canvas/               # Chat canvas, ThinkingBlock, Markdown, Action pills
│   │   ├── inspector/            # Monaco Diff viewer, Plan reviewer, Raw logs
│   │   ├── layout/               # Left sidebar, Top header, Main layout
│   │   ├── prompt/               # PromptHub, SlashMenu, MentionPicker, Model selector
│   │   └── ui/                   # Reusable UI primitives
│   ├── hooks/                    # Custom React hooks (shortcuts, resizing)
│   ├── i18n/                     # Bilingual translations (en / zh)
│   ├── stores/                   # Zustand stores (session, workspace, theme)
│   ├── styles/                   # Tailwind CSS styles
│   └── types/                    # TypeScript type definitions
├── src-tauri/                    # Rust Core Engine (Tauri 2.0)
│   ├── src/
│   │   ├── auth/                 # OAuth PKCE & system keyring management
│   │   ├── process/              # agy subprocess spawning & JobObject/PGID guard
│   │   ├── protocol/             # NDJSON event definitions & parser
│   │   ├── storage/              # SQLite database (rusqlite) & Brain file watcher
│   │   ├── lib.rs                # Tauri command exports & setup
│   │   └── main.rs               # Rust entry point
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri app configuration
├── .github/workflows/            # CI/CD Release workflows
└── package.json                  # Frontend dependencies and scripts
```

---

## 🛡️ Process Safety & Stability

Antigravity Codex puts developer safety first:
- **No Orphan CLI Processes**: When you close the app or press stop, child processes are instantly cleaned up via Unix Process Groups (`libc::killpg`) or Windows Job Objects (`TerminateJobObject`).
- **Local SQLite Persistence**: All sessions, conversation histories, and preferences are saved locally on your machine.
- **Environment Auto-Discovery**: Automatically repairs missing shell PATH environments (detects Homebrew, NVM, Rustup, and local bins).

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or file an Issue.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## ⚠️ Disclaimer

This project is an independent, community-driven open-source desktop client and is **not** officially affiliated with, endorsed by, or sponsored by Google LLC, Anthropic PBC, or any of their affiliates. 

- **Google**, **Antigravity**, and **Gemini** are trademarks of Google LLC.
- **Claude** is a trademark of Anthropic PBC.
- All product and company names, logos, and brands are property of their respective holders.

---

## 📄 License & Copyright

- This project is open-source under the [MIT License](LICENSE).
- Copyright (c) 2026 Teddy & Contributors.
