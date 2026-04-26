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
echo -e "[..] Checking pnpm Node.js packages..."
# Ensure pnpm is in your PATH
pnpm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}[OK] pnpm workspace packages are synchronized.${NC}"
else
    echo -e "${RED}[!] FAILED pnpm install. Ensure Node 24 is active.${NC}"
    exit 1
fi

# 5. Playwright Browser Check
echo -e "[..] Checking Chromium for Testing binaries..."
npx playwright install --with-deps chromium
if [ $? -eq 0 ]; then
    echo -e "${GREEN}[OK] Playwright is ready for auditing.${NC}"
else
    echo -e "${RED}[!] FAILED to install Playwright binaries.${NC}"
fi

echo -e "${BLUE}============================================${NC}"
echo -e "✅ ${GREEN}LUMINARA SETUP COMPLETE: Ready to code!${NC}"
echo -e "${BLUE}============================================${NC}"