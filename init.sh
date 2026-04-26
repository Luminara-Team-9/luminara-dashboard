#!/bin/bash

# --- LUMINARA SRE: Environment Setup (April 2026 Standard) ---
# Usage: chmod +x init.sh && ./init.sh

# Color codes for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "🚦 ${BLUE}LUMINARA SRE: Environment Check Start (Linux)${NC}"
echo -e "${BLUE}============================================${NC}"


# Force-deactivate any active Conda environments to prevent version conflicts
if command -v conda >/dev/null 2>&1; then
    echo -e "[..] Neutralizing active Conda environments for safety..."
    # Running it twice handles nested environments (e.g., base -> decathlon)
    conda deactivate > /dev/null 2>&1
    conda deactivate > /dev/null 2>&1 
fi

# 1. Check/Create Virtual Environment
if [ ! -d ".venv" ]; then
    echo -e "[..] .venv not found. Creating Python 3.12 environment..."
    # On KNU ABRM02, we use python3.12 directly
    /abr/coss41/miniconda3/envs/luminara_v12/bin/python -m venv .venv --copies
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[OK] .venv created successfully.${NC}"
    else
        echo -e "${RED}[!] FAILED to create .venv. Ensure python3.12 is installed.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}[OK] Existing .venv detected.${NC}"
fi

# 2. Activate Environment
echo -e "[..] Activating environment..."
# Linux uses bin/activate, not Scripts/activate
source .venv/bin/activate
if [ $? -eq 0 ]; then
    echo -e "${GREEN}[OK] Environment activated.${NC}"
    python --version
else
    echo -e "${RED}[!] FAILED to activate environment.${NC}"
    exit 1
fi

# 3. Python Dependencies
echo -e "[..] Upgrading pip..."
pip install --upgrade pip > /dev/null

echo -e "[..] Installing Core AI Engine (PyTorch 2.6.0 for CUDA 12.4)..."
pip install torch>=2.6.0 --index-url https://download.pytorch.org/whl/cu124
if [ $? -eq 0 ]; then
    echo -e "${GREEN}[OK] PyTorch 2.6.0 Engine installed.${NC}"
else
    echo -e "${RED}[!] FAILED to install Torch.${NC}"
    exit 1
fi

echo -e "[..] Installing requirements.txt dependencies..."
pip install -r requirements.txt
if [ $? -eq 0 ]; then
    echo -e "${GREEN}[OK] All Python dependencies synchronized.${NC}"
else
    echo -e "${RED}[!] Installation failed. Check requirements.txt syntax.${NC}"
    exit 1
fi

# 4. Node.js Packages (pnpm)
echo -e "[..] Bridging Node 24 and pnpm from the Toolbox..."

# This ensures the script sees the Node 24 we installed in Conda
TOOLBOX_PATH="/home/coss41/miniconda3/envs/luminara_v12/bin"
export PATH="$TOOLBOX_PATH:$PATH"

# Verify Node Version (Safety Check)
CURRENT_NODE=$(node -v | cut -d'.' -f1)
if [ "$CURRENT_NODE" != "v24" ]; then
    echo -e "${RED}[!] WRONG NODE: Found $CURRENT_NODE, need v24. Check luminara_v12 env.${NC}"
    exit 1
fi

# Check and run pnpm
if command -v pnpm &> /dev/null; then
    echo -e "${GREEN}[OK] Using Node 24. Synchronizing packages...${NC}"
    pnpm install
else
    echo -e "${BLUE}[..] pnpm missing. Trying to enable via Corepack...${NC}"
    corepack enable && pnpm install
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}[OK] pnpm workspace packages are synchronized.${NC}"
else
    echo -e "${RED}[!] FAILED: pnpm install failed. Check network or package.json.${NC}"
    exit 1
fi

# 5. Playwright Browser Check
echo -e "[..] Checking Chromium for Testing binaries..."
npx playwright install chromium
if [ $? -eq 0 ]; then
    echo -e "${GREEN}[OK] Playwright is ready for auditing.${NC}"
else
    echo -e "${RED}[!] FAILED to install Playwright binaries.${NC}"
fi

echo -e "${BLUE}============================================${NC}"
echo -e "✅ ${GREEN}LUMINARA SETUP COMPLETE: Ready to code!${NC}"
echo -e "${BLUE}============================================${NC}"