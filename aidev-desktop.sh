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
# 1. Check Node.js & npm (Asumsi user sudah pasang dev tools)
# ------------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}❌ Error: 'node' tidak ditemukan.${NC}"
  echo -e "   Pastikan Node.js (v20+) sudah terpasang atau aktifkan nvm/fnm kamu."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo -e "${RED}❌ Error: 'npm' tidak ditemukan.${NC}"
  echo -e "   Pastikan npm sudah terpasang di environment kamu."
  exit 1
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
elif [ ! -d "node_modules/node-pty" ] || ! node -e "require('node-pty')" >/dev/null 2>&1; then
  echo -e "\n${BLUE}📦 Menginstall / memverifikasi node-pty untuk PTY terminal native di Linux...${NC}"
  npm install node-pty
  echo -e "${GREEN}✅ node-pty berhasil terpasang!${NC}"
fi

# ------------------------------------------------------------------------------
# 3. Check & Auto-Build Next.js Production Bundle (.next/BUILD_ID)
# ------------------------------------------------------------------------------
if [ "$1" != "--dev" ]; then
  if [ ! -f ".next/BUILD_ID" ] || [ "$1" = "--rebuild" ]; then
    echo -e "\n${BLUE}🔨 Membangun Next.js production bundle (npm run build)...${NC}"
    npm run build
    echo -e "${GREEN}✅ Build selesai!${NC}"
  fi
fi

# ------------------------------------------------------------------------------
# 4. Set Environment & Launch
# ------------------------------------------------------------------------------
export APP_MODE=true

if [ "$1" = "--dev" ]; then
  echo -e "\n${YELLOW}${BOLD}⚡ Menjalankan dalam DEVELOPMENT mode (npm run dev)...${NC}\n"
  export NODE_ENV=development
  node server.mjs
else
  export NODE_ENV=production
  echo -e "\n${GREEN}${BOLD}=========================================================="
  echo "   ⚡ Menjalankan Aidev Agent..."
  echo "   🌐 Browser akan otomatis terbuka dalam mode desktop window."
  echo "   Tekan Ctrl + C di terminal ini untuk berhenti."
  echo -e "==========================================================${NC}\n"
  node server.mjs
fi
