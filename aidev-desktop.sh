#!/usr/bin/env bash

# ==============================================================================
# Aidev Desktop Coding Agent - Linux Launcher (Web / App Mode)
# ==============================================================================

set -e

# Change directory to the repository folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Text Styling
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}"
echo "=========================================================="
echo "   🚀 Aidev Desktop Coding Agent - Linux Launcher"
echo "=========================================================="
echo -e "${NC}"

# ------------------------------------------------------------------------------
# 1. Check & Auto-Install Node.js & npm if missing
# ------------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  Node.js / npm belum terpasang di sistem Linux ini.${NC}"
  echo -e "${BLUE}ℹ️  Mencoba menginstall Node.js secara otomatis...${NC}"

  if command -v apt-get >/dev/null 2>&1; then
    echo -e "${GREEN}   Terdeteksi distro Debian/Ubuntu/Mint. Menjalankan apt...${NC}"
    sudo apt-get update
    sudo apt-get install -y curl
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    echo -e "${GREEN}   Terdeteksi distro Fedora/RHEL. Menjalankan dnf...${NC}"
    sudo dnf install -y nodejs npm
  elif command -v pacman >/dev/null 2>&1; then
    echo -e "${GREEN}   Terdeteksi distro Arch Linux. Menjalankan pacman...${NC}"
    sudo pacman -Sy --noconfirm nodejs npm
  elif command -v zypper >/dev/null 2>&1; then
    echo -e "${GREEN}   Terdeteksi distro openSUSE. Menjalankan zypper...${NC}"
    sudo zypper install -y nodejs npm
  else
    echo -e "${RED}❌ Gagal mendeteksi package manager. Silakan install Node.js (v20+) secara manual: https://nodejs.org${NC}"
    exit 1
  fi
fi

NODE_VER=$(node -v)
echo -e "${GREEN}✅ Node.js terdeteksi: ${NODE_VER}${NC}"

# ------------------------------------------------------------------------------
# 2. Check & Auto-Install Dependencies (node_modules)
# ------------------------------------------------------------------------------
if [ ! -d "node_modules" ]; then
  echo -e "\n${BLUE}📦 Folder node_modules belum ada. Menginstall dependencies (npm install)...${NC}"
  npm install
  echo -e "${GREEN}✅ Dependencies berhasil diinstall!${NC}"
fi

# ------------------------------------------------------------------------------
# 3. Check & Auto-Build Next.js Production Bundle (.next)
# ------------------------------------------------------------------------------
if [ ! -d ".next" ] || [ "$1" = "--rebuild" ]; then
  echo -e "\n${BLUE}🔨 Membangun Next.js production bundle (npm run build)...${NC}"
  npm run build
  echo -e "${GREEN}✅ Build selesai!${NC}"
fi

# ------------------------------------------------------------------------------
# 4. Set Environment & Launch
# ------------------------------------------------------------------------------
export APP_MODE=true
export NODE_ENV=production

echo -e "\n${GREEN}${BOLD}=========================================================="
echo "   ⚡ Menjalankan Aidev Agent..."
echo "   🌐 Browser akan otomatis terbuka dalam mode desktop window."
echo "   Tekan Ctrl + C di terminal ini untuk berhenti."
echo -e "==========================================================${NC}\n"

# Run server.mjs directly
node server.mjs
