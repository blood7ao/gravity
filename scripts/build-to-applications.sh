#!/usr/bin/env bash
# ==============================================================================
# Gravity - Build & Install to /Applications Script
# ==============================================================================

set -e

# ANSI Color Codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Ensure standard tool paths are present in PATH
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# Resolve project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

APP_NAME="Gravity.app"
SOURCE_APP="$PROJECT_ROOT/src-tauri/target/release/bundle/macos/$APP_NAME"
TARGET_DIR="/Applications"
TARGET_APP="$TARGET_DIR/$APP_NAME"

OPEN_AFTER_BUILD=false
CLEAN_BUILD=false

# Parse command line flags
for arg in "$@"; do
  case $arg in
    --open|-o)
      OPEN_AFTER_BUILD=true
      shift
      ;;
    --clean|-c)
      CLEAN_BUILD=true
      shift
      ;;
    --help|-h)
      echo -e "${BOLD}Usage:${NC} ./scripts/build-to-applications.sh [options]"
      echo ""
      echo "Options:"
      echo "  -o, --open    Launch Gravity.app automatically after installation"
      echo "  -c, --clean   Clean previous release build artifacts before building"
      echo "  -h, --help    Show this help message"
      exit 0
      ;;
  esac
done

echo -e "${BLUE}${BOLD}========================================${NC}"
echo -e "${BLUE}${BOLD}   🪐 Gravity App 打包并安装到 /Applications   ${NC}"
echo -e "${BLUE}${BOLD}========================================${NC}"
echo ""

# 1. 检查必要环境
echo -e "${BLUE}[1/5] 检查编译环境...${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ 错误: 未找到 Node.js，请先安装 Node.js${NC}"
  exit 1
fi

if ! command -v cargo &> /dev/null; then
  echo -e "${RED}❌ 错误: 未找到 Rust / Cargo 环境，请确认已安装 rustup 并配置了环境变量${NC}"
  exit 1
fi
echo -e "${GREEN}✓ 环境检查通过 (Node: $(node -v), Cargo: $(cargo --version | cut -d' ' -f2))${NC}"
echo ""

# 2. 如果指定了 --clean，清理旧的构建产物
if [ "$CLEAN_BUILD" = true ]; then
  echo -e "${YELLOW}[2/5] 清理旧的编译缓存...${NC}"
  rm -rf "$PROJECT_ROOT/dist"
  rm -rf "$PROJECT_ROOT/src-tauri/target/release/bundle"
  echo -e "${GREEN}✓ 清理完成${NC}"
else
  echo -e "${BLUE}[2/5] 准备增量编译...${NC}"
fi
echo ""

# 3. 执行 Tauri 打包
echo -e "${BLUE}[3/5] 开始打包应用程序 (编译前端资源 + Rust 核心)...${NC}"
START_TIME=$(date +%s)

# 调用 tauri build
npx tauri build

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
echo -e "${GREEN}✓ 打包成功！耗时: ${ELAPSED} 秒${NC}"
echo ""

# 4. 验证打包产物并复制到 /Applications
echo -e "${BLUE}[4/5] 安装应用到 ${TARGET_APP}...${NC}"

if [ ! -d "$SOURCE_APP" ]; then
  echo -e "${RED}❌ 错误: 未能在预期路径找到构建的 App: ${SOURCE_APP}${NC}"
  exit 1
fi

# 如果旧应用正在运行，提示或者关闭
if pgrep -x "Gravity" > /dev/null; then
  echo -e "${YELLOW}⚠️ 检测到 Gravity 正在运行，正在关闭以完成覆盖更新...${NC}"
  pkill -x "Gravity" || true
  sleep 1
fi

# 删除旧版本应用
if [ -d "$TARGET_APP" ]; then
  echo -e "正在移除 /Applications 中的旧版本..."
  rm -rf "$TARGET_APP"
fi

# 拷贝新版本应用
cp -R "$SOURCE_APP" "$TARGET_DIR/"

# 移除 macOS 隔离属性，避免未签名应用被 Gatekeeper 拦截
xattr -cr "$TARGET_APP" 2>/dev/null || true

echo -e "${GREEN}✓ 成功安装到 ${TARGET_APP}${NC}"
echo ""

# 5. 提示完成与可选启动
echo -e "${GREEN}${BOLD}🎉 全部完成！Gravity 已就绪。${NC}"
echo -e "📍 应用程序位置: ${BOLD}${TARGET_APP}${NC}"
echo ""

if [ "$OPEN_AFTER_BUILD" = true ]; then
  echo -e "${BLUE}🚀 正在启动 Gravity...${NC}"
  open "$TARGET_APP"
fi
